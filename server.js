// server.js (ATUALIZADO E MELHORADO)

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
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
const corsOptions = {
    origin: 'https://navalha-de-ouro-v11.web.app',
    optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
app.use(express.json());


// --- FUNÇÃO CENTRAL DE NOTIFICAÇÃO (MELHORADA PARA DEEP LINKING) ---
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
            data,
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

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

app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    const result = await sendNotification(uid, title, body, data);
    if (result.success) {
        res.status(200).json({ message: "Notificação enviada." });
    } else {
        res.status(500).json({ message: "Falha ao enviar notificação.", error: result.message });
    }
});

// [NOVO] Rota para notificar admin sobre cópia de chave PIX
app.post('/notificar-copia-pix', async (req, res) => {
    const { userName } = req.body;
    const adminQuery = await db.collection('usuarios').where('tipo', '==', 'admin').get();
    if (adminQuery.empty) return res.status(404).send();

    adminQuery.forEach(doc => {
        sendNotification(
            doc.id,
            '✅ Possível Depósito PIX',
            `${userName} copiou o código PIX e pode estar realizando um depósito.`,
            { link: '/#solicitacoes', color: '#2ecc71' } // Exemplo de deep link e cor
        );
    });
    res.status(200).send();
});

// [NOVO] Rota para notificar admin sobre intenção de pagamento com cartão
app.post('/notificar-intencao-cartao', async (req, res) => {
    const { userName } = req.body;
    const adminQuery = await db.collection('usuarios').where('tipo', '==', 'admin').get();
    if (adminQuery.empty) return res.status(404).send();

    adminQuery.forEach(doc => {
        sendNotification(
            doc.id,
            '💳 Intenção de Compra (Cartão)',
            `${userName} está sendo redirecionado para a plataforma de pagamento.`,
            { link: '/#solicitacoes', color: '#2ecc71' }
        );
    });
    res.status(200).send();
});

// [CORRIGIDO] Rota para notificação em massa com tratamento de erro robusto
app.post('/enviar-notificacao-massa', async (req, res) => {
    try {
        const { title, body, adminUid } = req.body;

        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado." });
        }

        if (!title || !body) {
            return res.status(400).json({ message: "Título e corpo são obrigatórios." });
        }

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
            return res.status(200).json({ message: "Nenhum dispositivo registrado.", successCount: 0, failureCount: 0});
        }

        const uniqueTokens = [...new Set(allTokens)];
        const message = {
            notification: { title, body },
            data: { link: '/' }
        };

        const response = await admin.messaging().sendToDevice(uniqueTokens, message);

        res.status(200).json({
            message: "Operação de envio em massa concluída.",
            successCount: response.successCount,
            failureCount: response.failureCount
        });

    } catch (error) {
        console.error("Erro CRÍTICO no envio em massa:", error);
        res.status(500).json({
            message: "Erro interno no servidor ao enviar notificações em massa.",
            error: error.message
        });
    }
});

// [NOVO] Rota para o CRON JOB publicar o blog diário
app.post('/trigger-daily-blog', async (req, res) => {
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).send('Acesso não autorizado.');
    }

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
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

        const palavrasChave = ["fade", "moicano", "americano", "social", "tesoura", "degradê", "risquinho", "jaca", "corte infantil", "barba", "platinado", "luzes"];
        const barbeirosSnap = await db.collection('usuarios').where('tipo', '==', 'barbeiro').get();
        barbeirosSnap.forEach(doc => palavrasChave.push(doc.data().nome));

        const palavraSorteada = palavrasChave[Math.floor(Math.random() * palavrasChave.length)];
        const codigo = `(${palavraSorteada.toLowerCase().replace(/\s/g, '-')})`;
        
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

// Rota de saúde
app.get('/', (req, res) => {
    res.send('Backend Navalha de Ouro está no ar!');
});


// --- TAREFAS AGENDADAS (PENDÊNCIAS) ---
async function checkPendingRequestsAndNotify() {
    try {
        const pendentesSnap = await db.collection('solicitacoes').where('status', '==', 'pendente').get();
        if (pendentesSnap.empty) return;

        const adminQuery = await db.collection('usuarios').where('tipo', '==', 'admin').get();
        if (adminQuery.empty) return;
        
        const adminIds = adminQuery.docs.map(doc => doc.id);

        for (const solicitacaoDoc of pendentesSnap.docs) {
            const solicitacao = solicitacaoDoc.data();
            const title = `⚠️ Solicitação Pendente: ${solicitacao.tipo.toUpperCase()}`;
            const body = `${solicitacao.usuarioNome} ainda aguarda sua aprovação.`;
            
            // Notifica todos os admins
            for (const adminId of adminIds) {
                await sendNotification(adminId, title, body, { link: '/#solicitacoes' });
            }
            // Notifica o usuário
            await sendNotification(solicitacao.usuarioUid, "⏳ Sua Solicitação", "Sua solicitação ainda está pendente. O administrador já foi notificado.", { link: '/' });
        }
    } catch(error) {
        console.error("Erro ao verificar pendências:", error);
    }
}

// Roda a verificação de pendências a cada 60 segundos
setInterval(checkPendingRequestsAndNotify, 60000);

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
