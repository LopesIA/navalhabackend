// server.js (ATUALIZADO E MELHORADO)

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
try {
    // A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS deve conter o JSON da chave de serviço
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inicializado com sucesso.");
} catch (e) {
    console.error("Erro fatal ao inicializar o Firebase Admin. Verifique a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS.", e);
    process.exit(1); // Encerra o processo se o Firebase não puder ser inicializado
}

const app = express();
const db = admin.firestore();

// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
// Permite requisições apenas do seu frontend
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
            data, // O campo 'data' é usado para deep linking
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

// Rota genérica para enviar notificação para um usuário
app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    const result = await sendNotification(uid, title, body, data);
    if (result.success) {
        res.status(200).json({ message: "Notificação enviada." });
    } else {
        res.status(500).json({ message: "Falha ao enviar notificação.", error: result.message });
    }
});


// [ATUALIZADO/CORRIGIDO] Rota para notificação em massa
app.post('/enviar-notificacao-massa', async (req, res) => {
    try {
        const { title, body, adminUid } = req.body;

        // Validação de segurança
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado. Apenas administradores podem enviar notificações em massa." });
        }

        if (!title || !body) {
            return res.status(400).json({ message: "Título e corpo da notificação são obrigatórios." });
        }

        const allUsersSnap = await db.collection('usuarios').get();
        if (allUsersSnap.empty) {
            return res.status(404).json({ message: "Nenhum usuário encontrado no banco de dados." });
        }

        const allTokens = allUsersSnap.docs.reduce((acc, doc) => {
            const tokens = doc.data().fcmTokens;
            if (tokens && Array.isArray(tokens) && tokens.length > 0) {
                acc.push(...tokens);
            }
            return acc;
        }, []);

        if (allTokens.length === 0) {
            return res.status(200).json({ message: "Nenhum dispositivo registrado para receber notificações.", successCount: 0, failureCount: 0});
        }

        // Remove tokens duplicados para evitar envios repetidos
        const uniqueTokens = [...new Set(allTokens)];
        const message = {
            notification: { title, body },
            data: { deepLink: 'home' } // Link genérico para a home
        };
        
        // Envia para até 500 tokens por vez (limite do sendMulticast)
        const chunkSize = 500;
        let successCount = 0;
        let failureCount = 0;

        for (let i = 0; i < uniqueTokens.length; i += chunkSize) {
            const chunk = uniqueTokens.slice(i, i + chunkSize);
            const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
            successCount += response.successCount;
            failureCount += response.failureCount;
        }

        res.status(200).json({
            message: "Operação de envio em massa concluída.",
            successCount: successCount,
            failureCount: failureCount
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
    // Proteção com uma chave secreta
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
        return res.status(401).send('Acesso não autorizado.');
    }

    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);
        
        // Verifica se já postou hoje para evitar duplicatas
        const blogHojeSnap = await db.collection("blog")
            .where('ts', '>=', hoje)
            .where('ts', '<', amanha)
            .where('autorUid', '==', 'sistema')
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


// Rota de "saúde" para verificar se o servidor está online
app.get('/', (req, res) => {
    res.send('Backend Navalha de Ouro está no ar!');
});


// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
