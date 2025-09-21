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
app.use(cors());
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
    const { valor, uid } = req.body;

    if (!valor || !uid) {
        return res.status(400).json({ error: "Valor e UID do usuário são obrigatórios." });
    }
    
    // O valor deve ser em centavos e um número inteiro
    const valorEmCentavos = Math.round(parseFloat(valor) * 100);
    if (isNaN(valorEmCentavos) || valorEmCentavos <= 0) {
        return res.status(400).json({ error: "Valor inválido." });
    }

    // Criamos um ID de referência único que contém as informações que precisaremos no webhook
    const referenceId = `deposito-${uid}-${valorEmCentavos}-${uuidv4()}`;
    const notificationUrl = `${BASE_URL}/pagbank-webhook`;

    const payload = {
        reference_id: referenceId,
        customer: {
            name: "Cliente Navalha de Ouro", // Pode ser genérico
            email: "cliente@email.com", // Pode ser genérico
            tax_id: "12345678909" // Pode ser genérico
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
        console.log("Enviando para PagBank:", JSON.stringify(payload, null, 2));
        const response = await pagbankAPI.post('/orders', payload);
        console.log("Resposta do PagBank:", response.data);
        
        const qrCodeData = response.data.qr_codes[0];

        res.status(200).json({
            qrCodeUrl: qrCodeData.links.find(link => link.rel === 'QRCODE.PNG').href,
            pixCopyPaste: qrCodeData.text
        });

    } catch (error) {
        console.error('Erro ao criar cobrança no PagBank:');
        if (error.response) {
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
            console.error('Status:', error.response.status);
            return res.status(error.response.status).json(error.response.data);
        }
        console.error('Erro Geral:', error.message);
        res.status(500).json({ error: "Erro interno ao se comunicar com o PagBank." });
    }
});


// ======================================================================
// --- ROTA DE WEBHOOK DO PAGBANK (MODIFICADA) ---
// ======================================================================
app.post('/pagbank-webhook', async (req, res) => {
    console.log('--- Webhook PagBank Recebido ---');
    console.log('Body:', JSON.stringify(req.body, null, 2));

    try {
        const { charges } = req.body;
        if (!charges || !charges.length) {
            console.log("Webhook sem 'charges'. Ignorando.");
            return res.status(200).send("OK - No charges");
        }

        const charge = charges[0];
        const { reference_id, status, amount } = charge;

        if (status === 'PAID') {
            console.log(`Pagamento APROVADO para reference_id: ${reference_id}`);
            
            const parts = reference_id.split('-');
            if (parts[0] !== 'deposito' || parts.length < 3) {
                console.error(`reference_id inválido: ${reference_id}`);
                return res.status(400).send("Invalid reference_id");
            }

            const uid = parts[1];
            const valorEmCentavos = parseInt(parts[2], 10);
            const valorDepositado = valorEmCentavos / 100;

            const userRef = db.collection('usuarios').doc(uid);

            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw new Error(`Usuário ${uid} não encontrado!`);
                }
                const userData = userDoc.data();

                // Calcula pontos de fidelidade (dobro para VIP)
                const pontosGanhos = userData.vip ? 8 : 4;

                transaction.update(userRef, {
                    saldo: admin.firestore.FieldValue.increment(valorDepositado),
                    pontosFidelidade: admin.firestore.FieldValue.increment(pontosGanhos)
                });
                
                // Registra a transação para o admin
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

            console.log(`Saldo de R$${valorDepositado.toFixed(2)} adicionado para o usuário ${uid}.`);

            // Notifica o usuário sobre o depósito bem-sucedido
            await sendNotification(
                uid,
                '💰 Depósito Aprovado!',
                `Seu depósito de R$ ${valorDepositado.toFixed(2)} foi confirmado com sucesso.`,
                { link: `/?action=open_wallet` } // Exemplo de deep link
            );

        } else {
            console.log(`Status recebido: ${status} para reference_id: ${reference_id}. Ignorando.`);
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
