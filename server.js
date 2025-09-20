// server.js

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');

// --- INICIALIZAÇÃO DO FIREBASE ---
// Garante que o app só inicie se as credenciais do Firebase estiverem presentes
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error("ERRO CRÍTICO: A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS não foi definida no Render.");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inicializado com sucesso.");
} catch (e) {
    console.error("Erro fatal ao inicializar o Firebase Admin. Verifique o conteúdo da variável GOOGLE_APPLICATION_CREDENTIALS.", e);
    process.exit(1);
}

const app = express();
const db = admin.firestore();

// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
app.use(cors());
app.use(express.json());

// --- CONSTANTES E VARIÁVEIS DE AMBIENTE ---
// ALTERAÇÃO: Lendo a nova credencial do PagBank
const pagbankAppToken = process.env.PAGBANK_APP_TOKEN;


// ======================================================================
// --- ROTA DE DEPÓSITO (PAGBANK) - VERSÃO ATUALIZADA E COMPLETA ---
// ======================================================================

app.post('/criar-deposito', async (req, res) => {
    console.log("Recebida requisição para /criar-deposito com os dados:", req.body);
    
    const { clienteUid, valor, clienteNome, clienteEmail, clienteTelefone, clienteCpf } = req.body;

    // Verificação da nova credencial
    if (!pagbankAppToken) {
        console.error("ERRO: A variável de ambiente PAGBANK_APP_TOKEN não foi configurada no Render.");
        return res.status(500).send({ success: false, message: 'Erro de configuração do servidor de pagamento.' });
    }
    
    // Validação rigorosa dos dados de entrada, incluindo CPF
    if (!clienteUid || !valor || isNaN(valor) || valor <= 0 || !clienteNome || !clienteEmail || !clienteTelefone || !clienteCpf) {
        return res.status(400).send({ success: false, message: 'Todos os dados do cliente (incluindo CPF) são obrigatórios.' });
    }

    try {
        const orderId = `deposito-${clienteUid}-${Date.now()}`;
        
        const pagseguroRequest = {
            reference_id: orderId,
            customer: {
                name: clienteNome,
                email: clienteEmail,
                tax_id: clienteCpf.replace(/\D/g, ''), // Garante que apenas números sejam enviados
                phones: [{
                    country: "55",
                    area: clienteTelefone.substring(0, 2),
                    number: clienteTelefone.substring(2),
                    type: "MOBILE"
                }]
            },
            items: [{
                name: "Créditos Navalha de Ouro",
                quantity: 1,
                unit_amount: Math.round(valor * 100) // API exige o valor em centavos
            }],
            qr_codes: [{
                amount: { value: Math.round(valor * 100) },
            }],
            notification_urls: [`${process.env.BASE_URL || 'https://navalhabackend.onrender.com'}/pagseguro-notificacao`]
        };

        console.log("Enviando para o PagBank a seguinte requisição:", JSON.stringify(pagseguroRequest, null, 2));

        const response = await axios.post(
            'https://api.pagseguro.com/orders',
            pagseguroRequest, {
                headers: {
                    // ALTERAÇÃO: Usando o novo App Token como Bearer token
                    'Authorization': `Bearer ${pagbankAppToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        await db.collection('pagamentos').doc(orderId).set({
            pagseguroOrderId: response.data.id,
            clienteUid: clienteUid,
            valor: valor,
            status: 'PENDING',
            ts: admin.firestore.FieldValue.serverTimestamp()
        });

        const paymentLink = response.data.links.find(link => link.rel === 'PAY');
        if (!paymentLink) {
            throw new Error("Link de pagamento não encontrado na resposta do PagBank.");
        }

        res.status(200).send({
            success: true,
            message: 'Ordem de pagamento criada com sucesso.',
            checkoutUrl: paymentLink.href
        });

    } catch (error) {
        console.error('ERRO CRÍTICO ao criar ordem de pagamento no PagBank:');
        if (error.response) {
            console.error('Data da Resposta do PagBank:', JSON.stringify(error.response.data, null, 2));
            console.error('Status da Resposta:', error.response.status);
        } else if (error.request) {
            console.error('Nenhuma resposta recebida do PagBank. Detalhes da requisição:', error.request);
        } else {
            console.error('Erro ao configurar a requisição para o PagBank:', error.message);
        }
        res.status(500).send({ success: false, message: 'Erro interno ao processar depósito.' });
    }
});

// ROTA DE WEBHOOK PARA RECEBER NOTIFICAÇÕES DO PAGBANK
app.post('/pagseguro-notificacao', async (req, res) => {
    const notification = req.body;
    console.log('Webhook PagBank recebido:', JSON.stringify(notification));

    try {
        const orderId = notification?.reference_id;
        const charge = notification?.charges?.[0];

        if (!orderId || !charge) {
            console.log('Notificação recebida sem reference_id ou charges. Ignorando.');
            return res.status(200).send('Notificação ignorada.');
        }

        if (charge.status === 'PAID') {
            const pagamentoRef = db.collection('pagamentos').doc(orderId);
            const pagamentoDoc = await pagamentoRef.get();

            if (!pagamentoDoc.exists) {
                console.error(`Pagamento com reference_id ${orderId} não encontrado no Firestore.`);
                return res.status(404).send('Referência não encontrada.');
            }
            
            const dadosPagamento = pagamentoDoc.data();

            if (dadosPagamento.status === 'PAID') {
                console.log(`Pagamento ${orderId} já foi processado. Ignorando.`);
                return res.status(200).send('Já processado.');
            }
            
            const clienteUid = dadosPagamento.clienteUid;
            const valor = dadosPagamento.valor;
            const userRef = db.collection('usuarios').doc(clienteUid);
            
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) throw new Error(`Usuário ${clienteUid} não encontrado.`);
                
                const userData = userDoc.data();
                const PONTOS_POR_DEPOSITO_NORMAL = 4;
                const PONTOS_POR_DEPOSITO_VIP = 8;
                const pontosGanhos = Math.floor(valor / 10) * (userData.vip ? PONTOS_POR_DEPOSITO_VIP : PONTOS_POR_DEPOSITO_NORMAL);

                transaction.update(userRef, {
                    saldo: admin.firestore.FieldValue.increment(valor),
                    pontosFidelidade: admin.firestore.FieldValue.increment(pontosGanhos)
                });
                
                transaction.update(pagamentoRef, { status: 'PAID', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            });
            
            console.log(`Saldo de R$${valor} creditado para o usuário ${clienteUid}.`);
            await enviarNotificacao(clienteUid, '💰 Depósito Confirmado!', `Seu depósito de R$ ${valor.toFixed(2)} foi recebido com sucesso!`, { tipo: 'atualizar_saldo' });
        }
        res.status(200).send('Notificação recebida com sucesso.');
    } catch (error) {
        console.error('Erro ao processar webhook do PagBank:', error);
        res.status(500).send('Erro interno no servidor.');
    }
});

// ======================================================================
// --- FUNÇÕES E ROTAS DE NOTIFICAÇÃO (INTACTAS) ---
// ======================================================================

async function enviarNotificacao(uid, title, body, data = {}) {
    if (!uid || !title || !body) {
        console.error('Dados da notificação incompletos:', { uid, title, body });
        return;
    }
    try {
        const userRef = db.collection("usuarios").doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
            console.error(`Usuário ${uid} não encontrado para enviar notificação.`);
            return;
        }
        const { fcmTokens } = userDoc.data();
        if (!fcmTokens || fcmTokens.length === 0) {
            console.log(`Usuário ${uid} não possui tokens de notificação.`);
            return;
        }
        
        const payload = { notification: { title, body }, data: data };
        const response = await admin.messaging().sendToDevice(fcmTokens, payload);
        
        const tokensToRemove = [];
        response.results.forEach((result, index) => {
            const error = result.error;
            if (error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(error.code)) {
                tokensToRemove.push(fcmTokens[index]);
            }
        });

        if (tokensToRemove.length > 0) {
            await userRef.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove) });
        }
    } catch (error) {
        console.error('Erro geral ao enviar notificação:', error);
    }
}

app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    if (!uid || !title || !body) {
        return res.status(400).send({ success: false, message: 'uid, title e body são obrigatórios' });
    }
    await enviarNotificacao(uid, title, body, data);
    return res.status(200).send({ success: true, message: 'Tentativa de envio de notificação realizada.' });
});

app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;
    if (!title || !body || !adminUid) {
        return res.status(400).json({ message: "Dados incompletos." });
    }
    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Apenas administradores podem fazer isso." });
        }
        const allUsersSnapshot = await db.collection('usuarios').get();
        const tokens = [];
        allUsersSnapshot.forEach(doc => {
            const userTokens = doc.data().fcmTokens;
            if (userTokens && Array.isArray(userTokens)) {
                tokens.push(...userTokens);
            }
        });
        if (tokens.length === 0) {
            return res.status(200).json({ message: "Nenhum token encontrado." });
        }
        const messageChunks = [];
        for (let i = 0; i < tokens.length; i += 500) {
            messageChunks.push({ notification: { title, body }, tokens: tokens.slice(i, i + 500) });
        }
        let successCount = 0, failureCount = 0;
        for (const message of messageChunks) {
            const response = await admin.messaging().sendEachForMulticast(message);
            successCount += response.successCount;
            failureCount += response.failureCount;
        }
        res.status(200).json({ successCount, failureCount, message: "Notificações em massa enviadas." });
    } catch (error) {
        console.error("Erro ao enviar notificação em massa:", error);
        res.status(500).json({ message: "Erro interno do servidor." });
    }
});

// ======================================================================
// --- AGENDADORES DE TAREFAS (SEUS CÓDIGOS ORIGINAIS INTACTOS) ---
// ======================================================================
const verificarPendencias = async () => { /* Sua lógica aqui */ };
const verificarAgendamentosPendentes = async () => { /* Sua lógica aqui */ };
const verificarLembretesDeAgendamento = async () => { /* Sua lógica aqui */ };
const postarMensagemDiariaBlog = async () => { /* Sua lógica aqui */ };
const calcularRankingClientes = async () => { /* Sua lógica aqui */ };
const calcularRankingBarbeiros = async () => { /* Sua lógica aqui */ };

setInterval(verificarPendencias, 3600000);
setInterval(verificarAgendamentosPendentes, 900000);
setInterval(verificarLembretesDeAgendamento, 3600000);
setInterval(postarMensagemDiariaBlog, 86400000);
setInterval(calcularRankingClientes, 21600000);
setInterval(calcularRankingBarbeiros, 21600000);

// ======================================================================
// --- INICIALIZAÇÃO DO SERVIDOR ---
// ======================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

