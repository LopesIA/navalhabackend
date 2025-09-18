// server.js

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// IMPORTANTE: Use a variável de ambiente que você configurou no Render
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

app.use(cors());
app.use(express.json());

// --- ROTA PARA ENVIAR NOTIFICAÇÃO PARA UM USUÁRIO ESPECÍFICO ---
app.post('/enviar-notificacao', async (req, res) => {
  const { uid, title, body } = req.body;
  if (!uid || !title || !body) {
    return res.status(400).send({
      success: false,
      message: 'uid, title e body são obrigatórios'
    });
  }

  try {
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).send({ success: false, message: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    const fcmTokens = userData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      return res.status(200).send({ success: true, message: 'Usuário não possui tokens para notificar.', successCount: 0, failureCount: 0 });
    }

    const message = {
      notification: { title, body },
      tokens: fcmTokens,
      webpush: { notification: { icon: '/icone.png' } }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('Resposta do FCM recebida:', response);

    // ALTERAÇÃO INICIADA: Lógica de limpeza de tokens inválidos
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          console.error(`Falha no envio para o token: ${fcmTokens[idx]}`, error);
          // Verifica se o erro indica que o token é inválido/desregistrado
          if (error.code === 'messaging/registration-token-not-registered' ||
              error.code === 'messaging/invalid-registration-token') {
            tokensToRemove.push(fcmTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log('Removendo tokens inválidos do perfil do usuário:', tokensToRemove);
        await userRef.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
        });
        console.log('Tokens inválidos removidos com sucesso.');
      }
    }
    // ALTERAÇÃO FINALIZADA

    res.status(200).send({
      success: true,
      message: 'Notificações enviadas!',
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens: response.responses
        .filter(r => !r.success)
        .map((r, i) => ({ token: fcmTokens[i], error: r.error.code }))
    });
  } catch (error) {
    console.error('Erro grave ao enviar notificação:', error);
    res.status(500).send({ success: false, message: 'Erro interno ao enviar notificação.' });
  }
});


// --- FUNÇÃO PARA VERIFICAR PENDÊNCIAS (SEGUNDO PLANO) ---
async function verificarPendencias() {
    try {
        const depositosPendentes = await db.collection('depositos')
            .where('status', '==', 'pendente')
            .get();

        const saquesPendentes = await db.collection('saques')
            .where('status', '==', 'pendente')
            .get();

        const numDepositos = depositosPendentes.size;
        const numSaques = saquesPendentes.size;

        if (numDepositos > 0 || numSaques > 0) {
            const title = "Alerta de Transações Pendentes!";
            let body = "";

            if (numDepositos > 0) {
                body += `Há ${numDepositos} depósito(s) pendente(s). `;
            }
            if (numSaques > 0) {
                body += `Há ${numSaques} saque(s) pendente(s).`;
            }

            const adminUsersSnapshot = await db.collection('usuarios').where('tipo', '==', 'admin').get();
            if (adminUsersSnapshot.empty) {
                console.log('Nenhum administrador encontrado para notificar.');
                return;
            }

            const adminTokens = [];
            adminUsersSnapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.fcmTokens && userData.fcmTokens.length > 0) {
                    adminTokens.push(...userData.fcmTokens);
                }
            });

            if (adminTokens.length > 0) {
                const message = {
                    notification: { title, body },
                    tokens: adminTokens,
                    webpush: { notification: { icon: '/icone.png' } }
                };

                await admin.messaging().sendEachForMulticast(message);
                console.log('Notificação de pendências enviada para todos os admins.');
            } else {
                console.log('Administradores encontrados, mas sem tokens de notificação válidos.');
            }
        } else {
            console.log('Nenhuma transação pendente encontrada.');
        }
    } catch (error) {
        console.error('Erro ao verificar e enviar notificações de pendências:', error);
    }
}

setInterval(verificarPendencias, 60000);

// --- INICIAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
