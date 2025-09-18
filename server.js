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
// Agora você envia o UID do usuário e o backend encontra os tokens dele.
app.post('/enviar-notificacao', async (req, res) => {
  const { uid, title, body } = req.body;
  if (!uid || !title || !body) {
    return res.status(400).send({
      success: false,
      message: 'uid, title e body são obrigatórios'
    });
  }

  try {
    // 1. Busca o documento do usuário no Firestore
    const userDoc = await db.collection("usuarios").doc(uid).get();
    if (!userDoc.exists) {
      return res.status(404).send({
        success: false,
        message: 'Usuário não encontrado.'
      });
    }

    const userData = userDoc.data();
    const fcmTokens = userData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      return res.status(404).send({
        success: false,
        message: 'Nenhum token encontrado para este usuário.'
      });
    }

    // 2. Cria a mensagem de notificação
    const message = {
      notification: {
        title: title,
        body: body,
      },
      tokens: fcmTokens, // Envia para todos os tokens do array
      webpush: {
        notification: {
          icon: '/icone.png'
        }
      }
    };

    // 3. Envia a mensagem
    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('Mensagens enviadas com sucesso:', response);

    // O sendEachForMulticast retorna um objeto com resultados.
    // Vamos checar por falhas
    const failedTokens = [];
    response.responses.forEach((res, index) => {
      if (!res.success) {
        failedTokens.push(fcmTokens[index]);
        console.error(`Falha no envio para o token: ${fcmTokens[index]}`, res.error);
      }
    });

    res.status(200).send({
      success: true,
      message: 'Notificações enviadas!',
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens: failedTokens
    });
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    res.status(500).send({
      success: false,
      message: 'Erro interno ao enviar notificação.'
    });
  }
});

// --- FUNÇÃO PARA VERIFICAR PENDÊNCIAS (SEGUNDO PLANO) ---
// ALTERAÇÃO INICIADA: Lógica aprimorada para notificar todos os admins
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

            // Busca todos os usuários administradores
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
                    notification: {
                        title: title,
                        body: body
                    },
                    tokens: adminTokens,
                    webpush: {
                        notification: {
                            icon: '/icone.png'
                        }
                    }
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
// ALTERAÇÃO FINALIZADA

// Agende a função para rodar a cada 60 segundos (60000 milissegundos)
setInterval(verificarPendencias, 60000);

// --- INICIAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
