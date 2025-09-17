// Importa as bibliotecas
const express = require('express');
const admin = require('firebase-admin');

// Inicializa o Express
const app = express();
const port = process.env.PORT || 3000;

// Configura o Express para usar JSON
app.use(express.json());

// Inicializa o Firebase Admin SDK
// IMPORTANTE: O Render vai injetar essa credencial pela variável de ambiente
const serviceAccountKey = process.env.GOOGLE_APPLICATION_CREDENTIALS;

// Verifica se a variável de ambiente existe
if (!serviceAccountKey) {
    console.error('A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS não está definida. O Firebase Admin não pode ser inicializado.');
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(serviceAccountKey);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('Firebase Admin SDK inicializado com sucesso.');
} catch (error) {
    console.error('Erro ao inicializar o Firebase Admin SDK:', error);
    process.exit(1);
}

// Rota de teste
app.get('/', (req, res) => {
    res.send('Servidor de notificação em tempo real está funcionando!');
});

// Rota para enviar notificações
app.post('/sendNotification', async (req, res) => {
    const { token, title, body } = req.body;

    if (!token || !title || !body) {
        return res.status(400).json({ error: 'Token, título e corpo da mensagem são obrigatórios.' });
    }

    const message = {
        notification: {
            title: title,
            body: body
        },
        token: token,
    };

    try {
        const response = await admin.messaging().send(message);
        console.log('Notificação enviada com sucesso:', response);
        res.status(200).json({ success: true, messageId: response });
    } catch (error) {
        console.error('Erro ao enviar a notificação:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Inicia o servidor
app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
});