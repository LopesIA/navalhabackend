const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

app.use(cors());
app.use(express.json());

// Função para buscar tokens de todos os admins
async function getAdminTokens() {
    const tokens = [];
    try {
        const adminQuery = await db.collection("usuarios").where("tipo", "==", "admin").get();
        if (!adminQuery.empty) {
            adminQuery.forEach(adminDoc => {
                const adminData = adminDoc.data();
                if (adminData.fcmTokens && adminData.fcmTokens.length > 0) {
                    tokens.push(...adminData.fcmTokens);
                }
            });
        }
    } catch (error) {
        console.error("Erro ao buscar tokens de admin:", error);
    }
    return [...new Set(tokens)]; // Retorna tokens únicos
}

// Rota principal para enviar notificações (usada pelo frontend)
app.post('/enviar-notificacao', async (req, res) => {
  const { token, title, body } = req.body;
  if (!token || !title || !body) {
    return res.status(400).send({ success: false, message: 'Token, title e body são obrigatórios' });
  }

  const message = { token: token, notification: { title: title, body: body } };

  try {
    const response = await admin.messaging().send(message);
    res.status(200).send({ success: true, messageId: response });
  } catch (error) {
    res.status(500).send({ success: false, error: error.message });
  }
});

// NOVO: Lógica para notificar admins sobre solicitações pendentes a cada minuto
setInterval(async () => {
    try {
        const solicitacoesPendentes = await db.collection("solicitacoes").where("status", "==", "pendente").get();
        
        if (solicitacoesPendentes.empty) {
            // Nenhuma solicitação pendente, não faz nada.
            return;
        }

        const adminTokens = await getAdminTokens();
        if (adminTokens.length === 0) {
            console.log("Nenhum token de admin encontrado para enviar lembretes.");
            return;
        }

        console.log(`Encontradas ${solicitacoesPendentes.size} solicitações pendentes. Enviando lembretes...`);

        const title = "⚠️ Solicitação Pendente!";
        const body = `Você possui ${solicitacoesPendentes.size} solicitações financeiras aguardando sua aprovação no app.`;

        const message = {
            notification: { title, body },
            tokens: adminTokens, // Envia para todos os admins de uma vez
        };

        await admin.messaging().sendMulticast(message);

    } catch (error) {
        console.error("Erro no job de verificação de solicitações pendentes:", error);
    }
}, 60000); // 60000 ms = 1 minuto

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
<<<<<<< HEAD
});
=======
});
>>>>>>> 200f99b7f17f294e4cf4d78c32053c7f2b44dcb0
