// server.js (CORRIGIDO E PRONTO PARA PRODUÇÃO com chave de segurança no CRON)

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
// A inicialização agora é mais robusta para ambientes de produção como o Render.
try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inicializado com sucesso.");
} catch (e) {
    console.error("Erro fatal ao inicializar o Firebase Admin. Verifique a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS.", e);
    process.exit(1);
}

const app = express();
const db = admin.firestore();

// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
// Permite que apenas seu app web se comunique com este backend.
const corsOptions = {
    origin: 'https://navalha-de-ouro-v11.web.app',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());


// --- FUNÇÃO CENTRAL DE NOTIFICAÇÃO (MELHORADA) ---
/**
 * Envia uma notificação para um usuário específico.
 * @param {string} uid - O ID do usuário no Firebase.
 * @param {string} title - O título da notificação.
 * @param {string} body - O corpo da mensagem da notificação.
 * @param {object} data - Dados adicionais, como um link para deep linking.
 * @returns {object} - Um objeto indicando o sucesso ou falha da operação.
 */
async function sendNotification(uid, title, body, data = {}) {
    if (!uid) {
        return { success: false, message: "UID não fornecido." };
    }
    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (!userDoc.exists) {
            return { success: false, message: `Usuário ${uid} não encontrado.` };
        }
        const tokens = userDoc.data().fcmTokens;
        if (!tokens || tokens.length === 0) {
            return { success: false, message: `Usuário ${uid} não possui tokens.` };
        }

        const message = {
            notification: { title, body },
            data, // Inclui o link aqui
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        // Limpeza de tokens inválidos
        const tokensToRemove = [];
        response.responses.forEach((result, index) => {
            if (!result.success) {
                const error = result.error.code;
                if (error === 'messaging/invalid-registration-token' || error === 'messaging/registration-token-not-registered') {
                    tokensToRemove.push(tokens[index]);
                }
            }
        });

        if (tokensToRemove.length > 0) {
            await userDoc.ref.update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
            });
        }

        return { success: true, response };
    } catch (error) {
        console.error(`Erro ao enviar notificação para ${uid}:`, error);
        return { success: false, message: error.message };
    }
}


// --- ROTAS DA API ---

// Rota para notificação individual (usada em todo o app)
app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    const result = await sendNotification(uid, title, body, data);
    if (result.success) {
        res.status(200).json({ message: "Notificação enviada." });
    } else {
        res.status(500).json({ message: "Falha ao enviar notificação.", error: result.message });
    }
});

// Rota para notificação em massa
app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;

    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado." });
        }
    } catch (e) {
        return res.status(500).json({ message: "Erro de autenticação do admin." });
    }

    if (!title || !body) {
        return res.status(400).json({ message: "Título e corpo são obrigatórios." });
    }

    try {
        const allUsersSnap = await db.collection('usuarios').get();
        if (allUsersSnap.empty) {
            return res.status(404).json({ message: "Nenhum usuário encontrado." });
        }

        const allTokens = allUsersSnap.docs.reduce((acc, doc) => {
            const tokens = doc.data().fcmTokens;
            if (tokens && Array.isArray(tokens) && tokens.length > 0) {
                acc.push(...tokens);
            }
            return acc;
        }, []);

        const uniqueTokens = [...new Set(allTokens)];

        if (uniqueTokens.length === 0) {
            return res.status(200).json({ message: "Nenhum dispositivo registrado.", successCount: 0, failureCount: 0 });
        }

        const message = {
            notification: { title, body },
            data: { link: '/' }
        };

        const tokenChunks = [];
        for (let i = 0; i < uniqueTokens.length; i += 500) {
            tokenChunks.push(uniqueTokens.slice(i, i + 500));
        }

        let totalSuccessCount = 0;
        let totalFailureCount = 0;

        for (const chunk of tokenChunks) {
            const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
            totalSuccessCount += response.successCount;
            totalFailureCount += response.failureCount;

            const tokensToRemove = [];
            response.responses.forEach((result, index) => {
                const error = result.error?.code;
                if (error === 'messaging/invalid-registration-token' || error === 'messaging/registration-token-not-registered') {
                    tokensToRemove.push(chunk[index]);
                }
            });

            if (tokensToRemove.length > 0) {
                console.log(`Limpando ${tokensToRemove.length} tokens inválidos.`);
                const usersToUpdate = await db.collection('usuarios').where('fcmTokens', 'array-contains-any', tokensToRemove).get();
                const batch = db.batch();
                usersToUpdate.forEach(userDoc => {
                    const ref = userDoc.ref;
                    batch.update(ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove) });
                });
                await batch.commit();
            }
        }

        res.status(200).json({
            message: "Operação de envio em massa concluída.",
            successCount: totalSuccessCount,
            failureCount: totalFailureCount,
        });

    } catch (error) {
        console.error("Erro CRÍTICO no envio em massa:", error);
        res.status(500).json({
            message: "Erro interno no servidor ao enviar notificações em massa.",
            error: error.message
        });
    }
});

// --- ROTA DO CRON JOB ATUALIZADA ---
app.get('/cron/postar-codigo-blog', async (req, res) => {
    // -----> INÍCIO DA IMPLEMENTAÇÃO DE SEGURANÇA <-----
    const { key } = req.query;

    if (key !== process.env.CRON_SECRET_KEY) {
        console.warn(`Tentativa de acesso não autorizado ao CRON JOB do blog. Chave recebida: ${key}`);
        return res.status(401).send('ERRO: Chave inválida.');
    }
    // -----> FIM DA IMPLEMENTAÇÃO DE SEGURANÇA <-----

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        const blogHojeSnap = await db.collection("blog")
            .where('ts', '>=', hoje)
            .where('ts', '<', amanha)
            .where('autor', '==', 'Sistema VersãoPro')
            .get();

        if (!blogHojeSnap.empty) {
            // Resposta curta para "saída não muito grande"
            return res.status(200).send('OK: Blog já postado hoje.');
        }

        const palavrasChave = [
            "fade", "moicano", "americano", "social", "tesoura", "degradê", "risquinho", "jaca", "corte infantil", "barba", "navalhado", "platinado", "luzes",
            "designer de cilios", "manicure e pedicure", "corte de cabelo", "gratidão", "paz", "amor", "beleza", "versãopro"
        ];
        const barbeirosSnap = await db.collection('usuarios').where('tipo', '==', 'barbeiro').get();
        barbeirosSnap.forEach(doc => {
            if (doc.data().nome) {
               palavrasChave.push(doc.data().nome);
            }
        });

        if (palavrasChave.length === 0) {
            console.error("CRON JOB: Nenhuma palavra-chave disponível para gerar o código do blog.");
            return res.status(500).send("ERRO: Nenhuma palavra-chave encontrada.");
        }

        const palavraSorteada = palavrasChave[Math.floor(Math.random() * palavrasChave.length)];
        const codigo = `(${palavraSorteada.toLowerCase().replace(/\s/g, '-')})`;

        await db.collection("blog").add({
            titulo: "🎁 Presente Diário Disponível!",
            conteudo: `O código de resgate de hoje está aqui! Use-o no app para ganhar 5 pontos de fidelidade. Lembre-se: use o código exatamente como está, incluindo os parênteses, para o resgate funcionar com sucesso! Código: ${codigo}`,
            autor: "Sistema VersãoPro",
            autorUid: "sistema",
            ts: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Blog diário postado com o código: ${codigo}`);
        // Resposta curta para "saída não muito grande"
        res.status(200).send('OK: Novo blog postado.');
    } catch (error) {
        console.error('Erro ao executar o CRON do blog:', error);
        // Resposta curta para "saída não muito grande"
        res.status(500).send('ERRO: Falha ao executar a tarefa do blog.');
    }
});


// Rota de saúde para o Render saber que o app está no ar
app.get('/', (req, res) => {
    res.send('Backend VersãoPro está no ar!');
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
