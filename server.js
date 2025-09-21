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
const PAGBANK_TOKEN = process.env.PAGBANK_APP_KEY || 'e0b09080-b4c4-415c-a4c9-69c81a8633555752595d44139297a6e7ab7b0771f43e2004-7414-417c-bda6-d77eecdc5292';
const BASE_URL = process.env.BASE_URL || 'https://navalhabackend.onrender.com';

// Adiciona uma verificação para a chave do PagBank
if (!PAGBANK_TOKEN) {
    console.error("ERRO CRÍTICO: A variável de ambiente PAGBANK_APP_KEY não foi definida!");
    process.exit(1);
}

// Configuração do Axios para a API do PagBank (Ambiente de Produção)
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
// --- ROTA ANTIGA PARA CRIAR COBRANÇA DE DEPÓSITO ---
// ======================================================================
app.post('/criar-deposito', async (req, res) => {
    const { valor, uid, userType, dadosCliente } = req.body;
    if (!valor || !uid || !userType || !dadosCliente || !dadosCliente.cpf) {
        return res.status(400).json({ error: "Dados de valor, UID, tipo de usuário e cliente (com CPF) são obrigatórios." });
    }
    const valorEmCentavos = Math.round(parseFloat(valor) * 100);
    if (isNaN(valorEmCentavos) || valorEmCentavos <= 0) {
        return res.status(400).json({ error: "Valor inválido." });
    }
    const referenceId = `deposito-${userType}-${uid}-${valorEmCentavos}-${uuidv4()}`;
    const notificationUrl = `${BASE_URL}/pagbank-webhook`;
    const payload = {
        reference_id: referenceId,
        customer: { name: dadosCliente.nome, email: dadosCliente.email, tax_id: dadosCliente.cpf },
        items: [{ name: "Crédito Navalha de Ouro", quantity: 1, unit_amount: valorEmCentavos }],
        qr_codes: [{ amount: { value: valorEmCentavos } }],
        notification_urls: [notificationUrl]
    };
    try {
        const response = await pagbankAPI.post('/orders', payload);
        const qrCodeData = response.data.qr_codes[0];
        res.status(200).json({
            qrCodeUrl: qrCodeData.links.find(link => link.rel === 'QRCODE.PNG').href,
            pixCopyPaste: qrCodeData.text
        });
    } catch (error) {
        console.error('Erro ao criar cobrança no PagBank (orders):', error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Erro interno ao se comunicar com o PagBank." });
    }
});


// ======================================================================
// --- NOVAS ROTAS PARA PAGAMENTO COM CARTÃO E PIX (API DE CHARGES) ---
// ======================================================================

// ROTA 1: Criar uma cobrança genérica para obter o ID
app.post('/criar-sessao-pagamento', async (req, res) => {
    const { valor, uid } = req.body;
    if (!valor || !uid) {
        return res.status(400).json({ error: "Valor e UID são obrigatórios." });
    }
    const valorEmCentavos = Math.round(parseFloat(valor) * 100);
    const referenceId = `charge-card-${uid}-${valorEmCentavos}-${uuidv4()}`;

    const payload = {
        reference_id: referenceId,
        amount: {
            value: valorEmCentavos,
            currency: "BRL"
        },
        notification_urls: [`${BASE_URL}/pagbank-webhook`],
    };

    try {
        const response = await pagbankAPI.post('/charges', payload);
        res.status(200).json({
            chargeId: response.data.id,
            // O SDK do PagBank não precisa de um "session_id" separado neste fluxo
        });
    } catch (error) {
        console.error("Erro ao criar charge no PagBank:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: "Não foi possível iniciar a sessão de pagamento." });
    }
});

// ROTA 2: Finalizar o pagamento com cartão usando o card criptografado
app.post('/finalizar-pagamento-cartao', async (req, res) => {
    const { chargeId, encryptedCard, holderData, valor } = req.body;

    if (!chargeId || !encryptedCard || !holderData || !valor) {
        return res.status(400).json({ error: "Dados da cobrança, do cartão e do titular são obrigatórios." });
    }
    
    const valorEmCentavos = Math.round(parseFloat(valor) * 100);

    const payload = {
        payment_method: {
            type: "CREDIT_CARD",
            installments: 1,
            capture: true,
            card: {
                encrypted: encryptedCard,
                holder: {
                    name: holderData.name,
                    tax_id: holderData.tax_id, // CPF
                }
            }
        },
        amount: {
            value: valorEmCentavos,
            currency: 'BRL'
        }
    };

    try {
        const response = await pagbankAPI.post(`/charges/${chargeId}/pay`, payload);
        if (response.data.status === 'PAID') {
            res.status(200).json({ success: true, message: "Pagamento aprovado!" });
        } else {
            res.status(400).json({ success: false, message: "Pagamento não aprovado pelo PagBank." });
        }
    } catch (error) {
        const errorMessage = error.response ? error.response.data.error_messages[0].description : "Erro desconhecido";
        console.error("Erro ao finalizar pagamento com cartão:", errorMessage);
        res.status(500).json({ success: false, message: errorMessage });
    }
});

// ROTA 3: Criar uma cobrança PIX
app.post('/criar-cobranca-pix', async (req, res) => {
    const { valor, uid } = req.body;
    if (!valor || !uid) {
        return res.status(400).json({ error: "Valor e UID são obrigatórios." });
    }
    const valorEmCentavos = Math.round(parseFloat(valor) * 100);
    const referenceId = `charge-pix-${uid}-${valorEmCentavos}-${uuidv4()}`;

    const payload = {
        reference_id: referenceId,
        amount: {
            value: valorEmCentavos,
            currency: "BRL"
        },
        payment_method: {
            type: "PIX"
        },
        notification_urls: [`${BASE_URL}/pagbank-webhook`],
    };

    try {
        const response = await pagbankAPI.post('/charges', payload);
        const pixData = response.data.payment_method;
        res.status(200).json({
            qrCodeText: pixData.pix.qr_code_text,
            qrCodeImageUrl: pixData.pix.qr_code
        });
    } catch (error) {
        console.error("Erro ao criar cobrança PIX no PagBank:", error.response ? JSON.stringify(error.response.data, null, 2) : error.message);
        res.status(500).json({ error: "Não foi possível gerar o PIX." });
    }
});


// ======================================================================
// --- [NOVO] ROTA PARA SOLICITAÇÃO DE SAQUE ---
// ======================================================================
app.post('/solicitar-saque', async (req, res) => {
    const { barbeiroUid, valorSaque, dadosPix } = req.body;

    if (!barbeiroUid || !valorSaque || !dadosPix || !dadosPix.tipoChave || !dadosPix.chave) {
        return res.status(400).json({ message: "Todos os campos são obrigatórios." });
    }

    try {
        const userRef = db.collection('usuarios').doc(barbeiroUid);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
            return res.status(404).json({ message: "Usuário não encontrado." });
        }

        const userData = userDoc.data();
        if (userData.saldo < valorSaque) {
            return res.status(400).json({ message: "Saldo insuficiente para o saque." });
        }

        // Cria a solicitação no Firestore para aprovação manual do admin
        await db.collection('solicitacoes').add({
            tipo: 'saque',
            usuarioUid: barbeiroUid,
            usuarioNome: userData.nome,
            valor: parseFloat(valorSaque),
            chavePixTipo: dadosPix.tipoChave,
            chavePix: dadosPix.chave,
            nomeRecebedor: userData.nome, // Adiciona o nome do recebedor para facilitar
            status: 'pendente',
            ts: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Notifica o admin sobre a nova solicitação
        const adminQuery = await db.collection("usuarios").where("tipo", "==", "admin").get();
        if (!adminQuery.empty) {
            adminQuery.forEach(adminDoc => {
                sendNotification(adminDoc.id, "📥 Nova Solicitação de Saque", `O usuário ${userData.nome} solicitou um saque de R$ ${parseFloat(valorSaque).toFixed(2)}.`);
            });
        }

        res.status(200).json({ message: "Solicitação de saque enviada com sucesso e aguardando aprovação." });

    } catch (error) {
        console.error("Erro ao processar solicitação de saque:", error);
        res.status(500).json({ message: "Erro interno no servidor ao processar sua solicitação." });
    }
});

// ======================================================================
// --- ROTA DE WEBHOOK DO PAGBANK (ATUALIZADA) ---
// ======================================================================
app.post('/pagbank-webhook', async (req, res) => {
    try {
        const { charges } = req.body;
        if (!charges || !charges.length) return res.status(200).send("OK - No charges");

        const charge = charges[0];
        const { reference_id, status, amount } = charge;

        if (status === 'PAID') {
            const parts = reference_id.split('-');
            const type = parts[0]; // 'deposito', 'charge'
            
            // Lógica unificada para qualquer tipo de cobrança paga
            if ((type === 'deposito' || type === 'charge') && parts.length >= 4) {
                const userType = 'cliente'; // Assumindo que apenas clientes depositam
                const uid = parts[2];
                const valorDepositado = amount.value / 100;

                const userRef = db.collection('usuarios').doc(uid);

                await db.runTransaction(async (transaction) => {
                    const userDoc = await transaction.get(userRef);
                    if (!userDoc.exists) throw new Error(`Usuário ${uid} não encontrado!`);
                    
                    const userData = userDoc.data();
                    const pontosGanhos = userData.vip ? 8 : 4;
                    
                    transaction.update(userRef, {
                        saldo: admin.firestore.FieldValue.increment(valorDepositado),
                        pontosFidelidade: admin.firestore.FieldValue.increment(pontosGanhos)
                    });
                    
                    const transacaoRef = db.collection('transacoes').doc();
                    transaction.set(transacaoRef, {
                        tipo: `deposito_pagbank_${type}`,
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
                    { tipo: 'atualizar_saldo' }
                );

            } else {
                 console.warn(`Webhook: reference_id com formato desconhecido: ${reference_id}`);
            }
        }
        res.status(200).send("OK");
    } catch (error) {
        console.error('Erro no processamento do webhook do PagBank:', error);
        res.status(500).send("Erro interno no servidor");
    }
});

// ======================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
