const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// Substitua com as suas credenciais do Firebase Admin SDK
// Você pode obter este arquivo JSON no painel do Firebase, em:
// Configurações do projeto > Contas de Serviço > Gerar nova chave privada
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();

// Middleware para habilitar o CORS
app.use(cors());
app.use(express.json());

// Rota para enviar a notificação
app.post('/enviar-notificacao', (req, res) => {
  const { token, titulo, corpo } = req.body;

  if (!token || !title || !body) {
    return res.status(400).send({
      success: false,
      message: 'Token, título e corpo são obrigatórios'
    });
  }

  const message = {
    token: token,
    notification: {
      title: titulo,
      body: corpo
    }
  };

  admin.messaging().send(message)
    .then((response) => {
      console.log('Mensagem enviada com sucesso:', response);
      res.status(200).send({
        success: true,
        message: 'Notificação enviada com sucesso!',
        messageId: response
      });
    })
    .catch((error) => {
      console.error('Erro ao enviar a notificação:', error);
      res.status(500).send({
        success: false,
        message: 'Falha ao enviar a notificação',
        error: error.message
      });
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
