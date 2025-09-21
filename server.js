// server.js

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
const { firestore } = require('firebase-admin');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
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
const pagbankSellerId = process.env.PAGBANK_SELLER_ID;
const pagbankAppKey = process.env.PAGBANK_APP_KEY;
const baseUrl = process.env.BASE_URL;

const pagbankAPI = axios.create({
    baseURL: 'https://sandbox.api.pagbank.com/charges/v1',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${pagbankAppKey}`,
        'x-seller-id': pagbankSellerId
    }
});

// ======================================================================
// --- NOVA ROTA PARA CRIAR DEPÓSITOS ---
// ======================================================================
app.post('/criar-deposito', async (req, res) => {
    try {
        const { valor, descricao } = req.body;
        
        if (!valor || !descricao) {
            return res.status(400).send("Valor e descrição do depósito são obrigatórios.");
        }

        const payload = {
            reference_id: `deposito-${Date.now()}`,
            description: descricao,
            amount: {
                value: Math.round(valor * 100) // PagBank usa centavos
            },
            payment_method: {
                type: 'PIX'
            },
            notification_urls: [`${baseUrl}/webhook/pagbank`]
        };
        
        console.log("Enviando solicitação para o PagBank:", payload);

        const response = await pagbankAPI.post('/', payload);
        
        console.log("Resposta do PagBank:", response.data);
        
        // Retorna os dados do Pix para o front-end
        res.json({
            status: 'ok',
            qrcode: response.data.charges[0].payment_method.pix.qr_codes[0].links[0].href,
            text_qr_code: response.data.charges[0].payment_method.pix.qr_codes[0].text
        });

    } catch (error) {
        console.error('Erro ao criar depósito com o PagBank:', error.response ? error.response.data : error.message);
        res.status(500).send("Erro interno ao processar o depósito.");
    }
});

// ======================================================================
// --- ROTA EXISTENTE PARA WEBHOOK DO PAGBANK ---
// ======================================================================
app.post('/webhook/pagbank', async (req, res) => {
    try {
        console.log('Webhook do PagBank recebido:', req.body);
        const { id, reference_id, status } = req.body.charges[0];
        
        if (status === 'PAID') {
            console.log(`Pagamento do pedido ${reference_id} aprovado. ID da transação: ${id}`);
            // Seu código original para atualizar o Firestore (mantido)
            if (reference_id) {
                const uid = reference_id.split('-')[1]; 
                if (uid) {
                    await db.collection('clientes').doc(uid).update({
                        ultimotoken: status, // Exemplo de atualização
                    });
                    console.log(`Status do cliente ${uid} atualizado para 'PAID' no Firestore.`);
                } else {
                    console.error("ID de referência inválido. Não foi possível extrair o UID do cliente.");
                }
            }
        } else if (status === 'CANCELED') {
            console.log(`Pagamento do pedido ${reference_id} foi cancelado.`);
        }

        res.status(200).send("OK");
    } catch (error) {
        console.error('Erro no webhook do PagBank:', error.response ? error.response.data : error.message);
        res.status(500).send("Erro interno.");
    }
});

// ======================================================================
// --- AGENDADORES DE TAREFAS E INICIALIZAÇÃO DO SERVIDOR ---
// ======================================================================
const verificarPendencias = async () => { /* Sua lógica aqui */ };
const verificarAgendamentosPendentes = async () => { /* Sua lógica aqui */ };
const verificarLembretesDeAgendamento = async () => { /* Sua lógica aqui */ };
const postarMensagemDiariaBlog = async () => { /* Sua lógica aqui */ };
const calcularRankingClientes = async () => { /* Sua lógica aqui */ };
const calcularRankingBarbeiros = async () => { /* Sua lógica aqui */ };

setInterval(verificarPendencias, 60 * 60 * 1000);
setInterval(verificarAgendamentosPendentes, 15 * 60 * 1000);
setInterval(verificarLembretesDeAgendamento, 60 * 60 * 1000);
setInterval(postarMensagemDiariaBlog, 24 * 60 * 60 * 1000);
setInterval(calcularRankingClientes, 6 * 60 * 60 * 1000);
setInterval(calcularRankingBarbeiros, 6 * 60 * 60 * 1000);

// ======================================================================
// --- INICIALIZAÇÃO DO SERVIDOR ---
// ======================================================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
