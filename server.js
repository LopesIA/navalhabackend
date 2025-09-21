// server.js

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid'); // Para gerar IDs únicos

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("ERRO CRÍTICO: A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS não foi definida.");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inicializado com sucesso.");
} catch (e) {
    console.error("Erro fatal ao inicializar o Firebase Admin.", e);
    process.exit(1);
}

const app = express();
const db = admin.firestore();

// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
const corsOptions = {
    origin: 'https://navalha-de-ouro-v11.web.app',
    optionsSuccessStatus: 200 // Para navegadores mais antigos
};
app.use(cors(corsOptions));
app.use(express.json());

// --- CONSTANTES E VARIÁVEIS DE AMBIENTE ---
const PAGBANK_TOKEN = process.env.PAGBANK_APP_KEY; // SEU TOKEN GERADO NO PAGBANK
const BASE_URL = process.env.BASE_URL; // URL do seu backend (ex: https://navalhabackend.onrender.com)

// Configuração do Axios para a API do PagBank (Ambiente de Produção)
// Para usar o sandbox, troque para: 'https://sandbox.api.pagseguro.com'
const pagbankAPI = axios.create({
    baseURL: 'https://api.pagseguro.com',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAGBANK_TOKEN}`
    }
});

// ======================================================================
// --- ROTA PARA ENVIAR NOTIFICAÇÕES (MODIFICADA) ---
// ======================================================================
// Função auxiliar para enviar notificações
async function sendNotification(uid, title, body, data = {}) {
    if (!uid) {
        console.error("UID do usuário não fornecido para notificação.");
        return { success: false, message: "UID não fornecido." };
    }
    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (!userDoc.exists) {
            return { success: false, message: `Usuário ${uid} não encontrado.` };
        }
        const tokens = userDoc.data().fcmTokens;
        if (!tokens || tokens.length === 0) {
            return { success: false, message: `Usuário ${uid} não possui tokens de notificação.` };
        }

        const message = {
            notification: { title, body },
            data, // Adiciona o payload de dados para deep linking
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);
        console.log('Notificação enviada com sucesso:', response);
        return { success: true, response };
    } catch (error) {
        console.error('Erro ao enviar notificação para UID:', uid, error);
        return { success: false, message: error.message };
    }
}

app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    const result = await sendNotification(uid, title, body, data);
    if (result.success) {
        res.status(200).json({ message: "Notificação enviada com sucesso.", details: result.response });
    } else {
        res.status(500).json({ message: "Falha ao enviar notificação.", error: result.message });
    }
});


// ======================================================================
// --- NOVA ROTA PARA CRIAR COBRANÇA DE DEPÓSITO (PAGBANK) ---
// ======================================================================
app.post('/criar-deposito', async (req, res) => {
    // Altera a desestruturação para receber o userType
    const { valor, uid, userType } = req.body; 

    // Validação que agora inclui o tipo de usuário
    if (!valor || !uid || !userType) {
        return res.status(400).json({ error: "Valor, UID e tipo de usuário são obrigatórios." });
    }
    
    const valorEmCentavos = Math.round(parseFloat(valor) * 100);
    if (isNaN(valorEmCentavos) || valorEmCentavos <= 0) {
        return res.status(400).json({ error: "Valor inválido." });
    }

    // A referência agora inclui o tipo de usuário para o webhook
    const referenceId = `deposito-${userType}-${uid}-${valorEmCentavos}-${uuidv4()}`;
    const notificationUrl = `${BASE_URL}/pagbank-webhook`;

    const payload = {
        reference_id: referenceId,
        // ... (o restante do payload para o PagBank é o mesmo)
        customer: {
            name: "Usuário Navalha de Ouro",
            email: "usuario@email.com",
            tax_id: "12345678909"
        },
        items: [{
            name: "Crédito Navalha de Ouro",
            quantity: 1,
            unit_amount: valorEmCentavos
        }],
        qr_codes: [{
            amount: {
                value: valorEmCentavos
            }
        }],
        notification_urls: [notificationUrl]
    };

    try {
        const response = await pagbankAPI.post('/orders', payload);
        const qrCodeData = response.data.qr_codes[0];

        res.status(200).json({
            success: true,
            qrCodeUrl: qrCodeData.links.find(link => link.rel === 'QRCODE.PNG').href,
            pixCopyPaste: qrCodeData.text
        });

    } catch (error) {
        console.error('Erro ao criar cobrança no PagBank:', error.response?.data);
        res.status(error.response?.status || 500).json({ error: error.response?.data?.message || "Erro interno ao se comunicar com o PagBank." });
    }
});


// ======================================================================
// --- ROTA DE WEBHOOK DO PAGBANK (MODIFICADA) ---
// ======================================================================
app.post('/pagbank-webhook', async (req, res) => {
    try {
        const { charges } = req.body;
        if (!charges || !charges.length) return res.status(200).send("OK - No charges");

        const charge = charges[0];
        const { reference_id, status } = charge;

        if (status === 'PAID') {
            const parts = reference_id.split('-');
            // Verifica o novo formato: deposito-userType-uid-...
            if (parts[0] !== 'deposito' || parts.length < 4) {
                console.error(`reference_id inválido: ${reference_id}`);
                return res.status(400).send("Invalid reference_id");
            }

            const userType = parts[1]; // 'cliente' ou 'barbeiro'
            const uid = parts[2];
            const valorEmCentavos = parseInt(parts[3], 10);
            const valorDepositado = valorEmCentavos / 100;

            // Usa o userType para escolher a coleção correta
            const collectionName = userType === 'barbeiro' ? 'barbeiros' : 'usuarios';
            const userRef = db.collection(collectionName).doc(uid);

            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw new Error(`Usuário (${userType}) ${uid} não encontrado!`);
                }
                const userData = userDoc.data();

                // Calcula pontos de fidelidade (dobro para VIP)
                const pontosGanhos = userData.vip ? 8 : 4;
                const saldoAtualizado = admin.firestore.FieldValue.increment(valorDepositado);

                transaction.update(userRef, {
                    saldo: saldoAtualizado,
                    pontosFidelidade: admin.firestore.FieldValue.increment(pontosGanhos)
                });
                
                const transacaoRef = db.collection('transacoes').doc();
                transaction.set(transacaoRef, {
                    tipo: 'deposito_pagbank',
                    uid: uid,
                    nome: userData.nome,
                    valor: valorDepositado,
                    status: 'concluido',
                    chargeId: charge.id,
                    ts: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            await sendNotification(
                uid,
                '💰 Depósito Aprovado!',
                `Seu depósito de R$ ${valorDepositado.toFixed(2)} foi confirmado com sucesso.`,
                { link: `/?action=open_wallet` }
            );
        }
        res.status(200).send("OK");
    } catch (error) {
        console.error('Erro no processamento do webhook do PagBank:', error);
        res.status(500).send("Erro interno no servidor");
    }
});


// Suas outras rotas e agendadores de tarefas...
// ======================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
