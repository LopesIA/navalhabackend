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
  const { token, title, body } = req.body;
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
      body: body
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
    console.error('Erro ao enviar a mensagem:', error);
    res.status(500).send({
      success: false,
      message: 'Erro ao enviar a notificação.',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
