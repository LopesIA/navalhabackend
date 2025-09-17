// server.js
const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// IMPORTANTE: Configure a sua chave de serviço
// Vamos obter isso de uma variável de ambiente no Render por segurança
// O Render armazena a sua chave privada aqui, não no código!
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

// Endpoint para enviar uma notificação
app.post('/send-notification', async (req, res) => {
    try {
        const { fcmToken, title, body } = req.body;

        if (!fcmToken || !title || !body) {
            return res.status(400).send('Dados de notificação incompletos.');
        }

        const message = {
            notification: {
                title: title,
                body: body,
            },
            token: fcmToken,
        };

        const response = await admin.messaging().send(message);
        console.log('Notificação enviada com sucesso:', response);
        res.status(200).send('Notificação enviada!');
    } catch (error) {
        console.error('Erro ao enviar notificação:', error);
        res.status(500).send('Erro ao enviar notificação.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});