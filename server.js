// server.js (CORRIGIDO E PRONTO PARA PRODUÇÃO)

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

// Rota para notificação em massa (CORRIGIDA)
app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;

    // Validação de segurança simples
    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado." });
        }
    } catch(e) {
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
            if (tokens && tokens.length > 0) {
                acc.push(...tokens);
            }
            return acc;
        }, []);
        
        if (allTokens.length === 0) {
            return res.status(200).json({ message: "Nenhum dispositivo registrado para receber notificações.", successCount: 0, failureCount: 0});
        }
        
        // Remove duplicados para otimizar
        const uniqueTokens = [...new Set(allTokens)];

        // O FCM envia em lotes de 500
        const message = {
            notification: { title, body },
            data: { link: '/' } // Notificações em massa levam para a home
        };
        
        const response = await admin.messaging().sendToDevice(uniqueTokens, message);

        res.status(200).json({
            message: "Operação de envio em massa concluída.",
            successCount: response.successCount,
            failureCount: response.failureCount
        });
    } catch (error) {
        console.error("Erro CRÍTICO no envio em massa:", error);
        // Garante que a resposta sempre seja JSON
        res.status(500).json({
            message: "Erro interno no servidor ao enviar notificações em massa.",
            error: error.message
        });
    }
});

// Rota para o CRON JOB publicar o blog diário
app.post('/trigger-daily-blog', async (req, res) => {
    // Verificação de segurança simples com uma chave secreta
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).send('Acesso não autorizado.');
    }

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas o dia
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        const blogHojeSnap = await db.collection("blog")
            .where('ts', '>=', hoje)
            .where('ts', '<', amanha)
            .where('autor', '==', 'Sistema Navalha de Ouro')
            .get();

        if (!blogHojeSnap.empty) {
            return res.status(200).send('O blog de hoje já foi postado.');
        }

        const palavrasChave = ["fade", "moicano", "americano", "social", "tesoura", "degradê", "risquinho", "jaca", "corte infantil", "barba", "navalhado", "platinado", "luzes"];
        const barbeirosSnap = await db.collection('usuarios').where('tipo', '==', 'barbeiro').get();
        barbeirosSnap.forEach(doc => palavrasChave.push(doc.data().nome));

        const palavraSorteada = palavrasChave[Math.floor(Math.random() * palavrasChave.length)];
        const codigo = `(${palavraSorteada.toLowerCase().replace(/\s/g, '-')})`; // ex: (corte-infantil)
        
        await db.collection("blog").add({
            titulo: "🎁 Código de Resgate Diário!",
            conteudo: `Encontrou! Resgate o código ${codigo} no seu painel para ganhar 5 pontos de fidelidade. Válido por 24 horas!`,
            autor: "Sistema Navalha de Ouro",
            autorUid: "sistema",
            ts: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Blog diário postado com o código: ${codigo}`);
        res.status(200).send(`Blog postado com sucesso com o código: ${codigo}`);
    } catch (error) {
        console.error('Erro ao executar o CRON do blog:', error);
        res.status(500).send('Erro interno no servidor ao postar blog.');
    }
});

// Rota de saúde para o Render saber que o app está no ar
app.get('/', (req, res) => {
    res.send('Backend Navalha de Ouro está no ar!');
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
