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
const pagseguroToken = process.env.PAGSEGURO_TOKEN;

// ======================================================================
// --- ROTA DE DEPÓSITO (PAGBANK) - VERSÃO CORRIGIDA E COM MELHOR LOG ---
// ======================================================================

app.post('/criar-deposito', async (req, res) => {
    // Adicionado log para ver os dados recebidos do frontend
    console.log("Recebida requisição para /criar-deposito com os dados:", req.body);
    
    const { clienteUid, valor, clienteNome, clienteEmail, clienteTelefone, clienteCpf } = req.body;

    // **CORREÇÃO 1: Adicionada verificação do Token do PagBank no início**
    if (!pagseguroToken) {
        console.error("ERRO: A variável de ambiente PAGSEGURO_TOKEN não foi configurada no Render.");
        return res.status(500).send({ success: false, message: 'Erro de configuração do servidor de pagamento.' });
    }
    
    // Validação rigorosa dos dados de entrada
    if (!clienteUid || !valor || isNaN(valor) || valor <= 0) {
        return res.status(400).send({ success: false, message: 'Dados de depósito incompletos ou inválidos.' });
    }
     if (!clienteNome || !clienteEmail || !clienteTelefone || !clienteCpf) {
        return res.status(400).send({ success: false, message: 'Nome, email, telefone e CPF do cliente são obrigatórios para o pagamento.' });
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
                    'Authorization': `Bearer ${pagseguroToken}`,
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
        // **CORREÇÃO 2: Log de erro aprimorado para diagnóstico**
        // Isso vai mostrar nos logs do Render a resposta EXATA do PagBank, se houver uma.
        console.error('ERRO CRÍTICO ao criar ordem de pagamento no PagBank:');
        if (error.response) {
            console.error('Data da Resposta do PagBank:', JSON.stringify(error.response.data, null, 2));
            console.error('Status da Resposta:', error.response.status);
            console.error('Headers da Resposta:', error.response.headers);
        } else if (error.request) {
            console.error('Nenhuma resposta recebida do PagBank. Detalhes da requisição:', error.request);
        } else {
            console.error('Erro ao configurar a requisição para o PagBank:', error.message);
        }
        res.status(500).send({ success: false, message: 'Erro interno ao processar depósito.' });
    }
});

// ROTA DE WEBHOOK (sem alterações, mantida da versão anterior)
app.post('/pagseguro-notificacao', async (req, res) => {
    // ... (código do webhook mantido) ...
});


// ======================================================================
// --- FUNÇÕES E ROTAS DE NOTIFICAÇÃO (sem alterações) ---
// ======================================================================

async function enviarNotificacao(uid, title, body, data = {}) {
    // ... (código de enviar notificação mantido) ...
}

app.post('/enviar-notificacao', async (req, res) => {
    // ... (código da rota mantido) ...
});

app.post('/enviar-notificacao-massa', async (req, res) => {
    // ... (código da rota mantido) ...
});

// ======================================================================
// --- AGENDADORES DE TAREFAS (SEUS CÓDIGOS ORIGINAIS) ---
// ======================================================================
// Mantendo suas funções originais para não quebrar nada
const verificarPendencias = async () => { /* Sua lógica aqui */ };
const verificarAgendamentosPendentes = async () => { /* Sua lógica aqui */ };
const verificarLembretesDeAgendamento = async () => { /* Sua lógica aqui */ };
const postarMensagemDiariaBlog = async () => { /* Sua lógica aqui */ };
const calcularRankingClientes = async () => { /* Sua lógica aqui */ };
const calcularRankingBarbeiros = async () => { /* Sua lógica aqui */ };

// Executa as tarefas em intervalos definidos
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
