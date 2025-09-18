const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// É fundamental que a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS
// esteja configurada no seu ambiente do Render com o conteúdo do seu arquivo serviceAccount.json.
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

app.use(cors());
app.use(express.json());

// Rota principal para enviar notificações
app.post('/enviar-notificacao', async (req, res) => {
  const { token, title, body, icon } = req.body;
  if (!token || !title || !body) {
    return res.status(400).send({
      success: false,
      message: 'Token, title e body são obrigatórios'
    });
  }

  const message = {
    token: token,
    notification: {
      title: title,
      body: body,
      icon: icon || '/icone.png' // Use o ícone padrão se não for fornecido
    }
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('Mensagem enviada com sucesso:', response);
    res.status(200).send({
      success: true,
      message: 'Notificação enviada com sucesso!',
      messageId: response
    });
  } catch (error) {
    console.error('Erro ao enviar a notificação:', error);
    res.status(500).send({
      success: false,
      message: 'Erro ao enviar a notificação.',
      error: error.message
    });
  }
});

// Função para checar e enviar notificações de pendências para o admin
async function verificarPendencias() {
    try {
        // Obtenha o token do admin do Firestore
        const adminDoc = await db.collection('tokens_admin').doc('tokenUnico').get();
        const adminToken = adminDoc.data()?.token;

        if (!adminToken) {
            console.log('Token do admin não encontrado. Não foi possível enviar a notificação.');
            return;
        }

        // Checa por depósitos pendentes
        const depositosPendentes = await db.collection('transacoes')
            .where('tipo', '==', 'deposito')
            .where('status', '==', 'pendente')
            .get();

        // Checa por saques pendentes
        const saquesPendentes = await db.collection('transacoes')
            .where('tipo', '==', 'saque')
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

            const message = {
                token: adminToken,
                notification: {
                    title: title,
                    body: body,
                    icon: '/icone.png'
                }
            };

            await admin.messaging().send(message);
            console.log('Notificação de pendências enviada para o admin.');
        } else {
            console.log('Nenhuma transação pendente encontrada.');
        }
    } catch (error) {
        console.error('Erro ao verificar e enviar notificações de pendências:', error);
    }
}

// Agende a função para rodar a cada 60 segundos (60000 milissegundos)
setInterval(verificarPendencias, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
