// server.js (CORRIGIDO E PRONTO PARA HOMOLOGAÇÃO)

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
// ATENÇÃO: Verifique se esta é sua CHAVE SANDBOX para a homologação!
const PAGBANK_TOKEN = process.env.PAGBANK_APP_KEY;
const BASE_URL = process.env.BASE_URL || 'https://navalhabackend.onrender.com';
const PAGBANK_API_URL = 'https://sandbox.api.pagseguro.com'; // Fixo para homologação

// Adiciona uma verificação para a chave do PagBank
if (!PAGBANK_TOKEN) {
    console.error("ERRO CRÍTICO: A variável de ambiente PAGBANK_APP_KEY não foi definida!");
    process.exit(1);
}

// Configuração do Axios para a API do PagBank (Ambiente de SANDBOX)
const pagbankAPI = axios.create({
    baseURL: PAGBANK_API_URL,
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAGBANK_TOKEN}`
    }
});

// ======================================================================
// --- ROTA PARA ENVIAR NOTIFICAÇÕES (Mantida como está) ---
// ======================================================================
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
            data,
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
// --- ROTA DE CRIAÇÃO DE COBRANÇA PIX (COM LOGS PARA HOMOLOGAÇÃO) ---
// ======================================================================
app.post('/criar-cobranca-pix', async (req, res) => {
    const { valor, uid, dadosCliente } = req.body;
    const idempotencyKey = uuidv4();
    const valorCentavos = Math.round(valor * 100);

    const payload = {
        reference_id: `homolog_pix_${uid}_${uuidv4()}`,
        description: 'HOMOLOGAÇÃO - Depósito Navalha de Ouro',
        amount: { value: valorCentavos, currency: 'BRL' },
        payment_method: {
            type: 'PIX',
            pix: {
                expires_in: 3600, // Tempo de expiração de 1 hora
            }
        },
        
        customer: {
            name: dadosCliente.nome,
            email: dadosCliente.email,
            tax_id: dadosCliente.cpf.replace(/\D/g, ''),
            phones: [{
                country: '55',
                area: dadosCliente.telefone.substring(0, 2),
                number: dadosCliente.telefone.substring(2)
            }]
        }
    };
    
    // --- LOG DA REQUISIÇÃO ---
    console.log("--- INICIANDO CRIAÇÃO DE COBRANÇA PIX (HOMOLOGAÇÃO) ---");
    console.log("ENDPOINT: POST /charges");
    console.log("REQUEST PAYLOAD ENVIADO:");
    console.log(JSON.stringify(payload, null, 2));
    // --- FIM DO LOG ---

    try {
        const response = await pagbankAPI.post('/charges', payload, {
            headers: { 'x-idempotency-key': idempotencyKey }
        });
        
        // --- LOG DA RESPOSTA DE SUCESSO ---
        console.log("SUCCESS RESPONSE RECEBIDO DE /charges:");
        console.log("STATUS CODE:", response.status);
        console.log(JSON.stringify(response.data, null, 2));
        console.log("--- FIM CRIAÇÃO DE COBRANÇA PIX ---");
        // --- FIM DO LOG ---

        const pix = response.data.payment_method.pix;
        res.json({
            qrCodeImageUrl: pix.qr_codes[0].links[0].href,
            qrCodeText: pix.qr_codes[0].text
        });
    } catch (error) {
        // --- LOG DA RESPOSTA DE ERRO ---
        console.error("ERROR RESPONSE RECEBIDO DE /charges:");
        if (error.response) {
            console.error("STATUS CODE:", error.response.status);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error Message:", error.message);
        }
        console.error("--- FIM CRIAÇÃO DE COBRANÇA PIX (ERRO) ---");
        // --- FIM DO LOG ---
        res.status(500).json({ error: "Erro interno ao criar cobrança PIX." });
    }
});


// ====================================================================================
// --- ROTA DE PAGAMENTO COM CARTÃO (COM LOGS PARA HOMOLOGAÇÃO) ---
// ====================================================================================
app.post('/criar-e-pagar-com-cartao', async (req, res) => {
    const { valor, encryptedCard, dadosCliente, uid } = req.body;
    const valorCentavos = Math.round(valor * 100);
    const idempotencyKey = uuidv4();

    const payload = {
        reference_id: `homolog_card_${uid}_${Date.now()}`,
        description: "HOMOLOGAÇÃO - Depósito Cartão",
        amount: {
            value: valorCentavos,
            currency: "BRL"
        },
        payment_method: {
            type: "CREDIT_CARD",
            installments: 1,
            capture: true,
            card: {
                encrypted: encryptedCard,
                holder: {
                    name: dadosCliente.nome // O nome do titular já está nos dados do cliente
                }
            }
        },
        customer: {
            name: dadosCliente.nome,
            email: dadosCliente.email,
            tax_id: dadosCliente.cpf,
            phones: [{
                country: '55',
                area: dadosCliente.telefone.substring(0, 2),
                number: dadosCliente.telefone.substring(2)
            }]
        },
        notification_urls: [`${BASE_URL}/pagbank-webhook`],
    };

    // --- LOG DA REQUISIÇÃO ---
    console.log("--- INICIANDO PAGAMENTO COM CARTÃO (HOMOLOGAÇÃO) ---");
    console.log("ENDPOINT: POST /charges");
    console.log("REQUEST PAYLOAD ENVIADO:");
    console.log(JSON.stringify(payload, null, 2));
    // --- FIM DO LOG ---

    try {
        const response = await pagbankAPI.post('/charges', payload, {
            headers: { 'x-idempotency-key': idempotencyKey }
        });

        // --- LOG DA RESPOSTA DE SUCESSO ---
        console.log("SUCCESS RESPONSE RECEBIDO DE /charges:");
        console.log("STATUS CODE:", response.status);
        console.log(JSON.stringify(response.data, null, 2));
        console.log("--- FIM PAGAMENTO COM CARTÃO ---");
        // --- FIM DO LOG ---
        
        // Lógica para creditar o saldo em caso de sucesso IMEDIATO
        if (response.data.status === 'PAID' || response.data.status === 'AUTHORIZED') {
             // Você pode adicionar a lógica de creditar o saldo aqui se desejar,
             // mas o ideal é esperar a confirmação do webhook para garantir.
        }
        
        res.status(200).json(response.data);

    } catch (error) {
        // --- LOG DA RESPOSTA DE ERRO ---
        console.error("ERROR RESPONSE RECEBIDO DE /charges:");
        if (error.response) {
            console.error("STATUS CODE:", error.response.status);
            console.error(JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error Message:", error.message);
        }
        console.error("--- FIM PAGAMENTO COM CARTÃO (ERRO) ---");
        // --- FIM DO LOG ---
        res.status(500).json({ error: "Erro interno ao processar pagamento." });
    }
});


// ======================================================================
// --- ROTA DE WEBHOOK DO PAGBANK (COM LOGS PARA HOMOLOGAÇÃO) ---
// ======================================================================
app.post('/pagbank-webhook', async (req, res) => {
    // --- LOG DA REQUISIÇÃO DO WEBHOOK ---
    console.log("--- WEBHOOK PAGBANK RECEBIDO ---");
    console.log("TIMESTAMP:", new Date().toISOString());
    console.log("HEADERS:", JSON.stringify(req.headers, null, 2));
    console.log("BODY:", JSON.stringify(req.body, null, 2));
    // --- FIM DO LOG ---
    try {
        const { charges } = req.body;
        if (!charges || !charges.length) {
            console.log("Webhook recebido, mas sem 'charges'. Finalizando.");
            console.log("--- FIM DO LOG DO WEBHOOK (NO CHARGES) ---");
            return res.status(200).send("OK - No charges");
        }

        const charge = charges[0];
        const { reference_id, status, amount } = charge;

        if (status === 'PAID') {
            console.log(`Webhook: Cobrança ${reference_id} foi PAGA. Iniciando processamento do saldo.`);
            const parts = reference_id.split('_'); // Usando _ como separador
            const type = parts[1]; // 'pix' ou 'card'
            
            if ((type === 'pix' || type === 'card') && parts.length >= 3) {
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
                console.log(`Webhook: Saldo do usuário ${uid} atualizado com sucesso.`);

            } else {
                 console.warn(`Webhook: reference_id com formato desconhecido: ${reference_id}`);
            }
        } else {
             console.log(`Webhook: Cobrança ${reference_id} com status ${status}. Nenhuma ação de saldo necessária.`);
        }
        console.log("--- FIM DO LOG DO WEBHOOK (PROCESSADO) ---");
        res.status(200).send("OK");
    } catch (error) {
        console.error('Erro no processamento do webhook do PagBank:', error);
        console.log("--- FIM DO LOG DO WEBHOOK (ERRO) ---");
        res.status(500).send("Erro interno no servidor");
    }
});


// --- OUTRAS ROTAS (mantidas como estavam) ---

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

        await db.collection('solicitacoes').add({
            tipo: 'saque',
            usuarioUid: barbeiroUid,
            usuarioNome: userData.nome,
            valor: parseFloat(valorSaque),
            chavePixTipo: dadosPix.tipoChave,
            chavePix: dadosPix.chave,
            nomeRecebedor: userData.nome,
            status: 'pendente',
            ts: admin.firestore.FieldValue.serverTimestamp()
        });
        
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
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
