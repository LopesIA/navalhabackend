// server.js

// Carrega as variáveis de ambiente do arquivo .env
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');
const { firestore } = require('firebase-admin');

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
const pagbankAppToken = process.env.PAGBANK_APP_TOKEN;

// ======================================================================
// --- ROTA PARA CRIAR O DEPÓSITO VIA PIX (CHAMADA PELO FRONT-END) ---
// ======================================================================

app.post('/criar-deposito', async (req, res) => {
    try {
        const { clienteUid, valor, clienteNome, clienteEmail, clienteTelefone, clienteCpf } = req.body;

        if (!clienteUid || !valor || !clienteNome || !clienteEmail || !clienteCpf) {
            return res.status(400).json({ success: false, message: "Dados do cliente ou valor ausentes." });
        }

        const payload = {
            reference_id: `deposito_${clienteUid}_${Date.now()}`,
            customer: {
                name: clienteNome,
                email: clienteEmail,
                tax_id: clienteCpf,
                phones: [{ country: "55", area: clienteTelefone.substring(0, 2), number: clienteTelefone.substring(2) }]
            },
            items: [{
                reference_id: "item-deposito-creditos",
                name: "Depósito de Créditos Navalha de Ouro",
                quantity: 1,
                unit_amount: valor // Já chega em centavos do front-end
            }],
            charges: [{
                reference_id: `charge_${clienteUid}_${Date.now()}`,
                description: `Depósito de R$ ${(valor / 100).toFixed(2)}`,
                amount: {
                    value: valor
                },
                payment_method: {
                    type: "PIX",
                    boleto: {
                        holder: {
                          name: clienteNome,
                          tax_id: clienteCpf
                        }
                    }
                }
            }],
            qr_codes: [{
                amount: { value: valor }
            }],
            notification_urls: [`https://navalhabackend.onrender.com/webhook-pagbank`]
        };

        const response = await axios.post(
            'https://sandbox.api.pagbank.com.br/orders',
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${pagbankAppToken}`
                }
            }
        );

        const charge = response.data.charges[0];
        const pix = charge.payment_method.pix;

        res.status(200).json({
            success: true,
            qrCodeUrl: pix.qr_codes[0].links[0].href,
            pixCode: pix.qr_codes[0].text
        });

    } catch (error) {
        console.error('Erro na integração do PagBank:', error.response ? error.response.data : error.message);
        res.status(500).json({
            success: false,
            message: "Erro ao criar o Pix. Tente novamente mais tarde.",
            details: error.response ? error.response.data : error.message
        });
    }
});

// ======================================================================
// --- ROTA DE NOTIFICAÇÃO DO PAGBANK (WEBHOOK) ---
// ======================================================================

app.post('/webhook-pagbank', async (req, res) => {
    try {
        const body = req.body;
        const eventType = body.event_type;
        const resourceId = body.resource_id;

        if (eventType === 'charge.paid') {
            console.log(`Webhook: Pagamento do PagBank recebido para o ID: ${resourceId}`);
            
            const chargeResponse = await axios.get(
                `https://sandbox.api.pagbank.com.br/charges/${resourceId}`,
                {
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${pagbankAppToken}`
                    }
                }
            );

            const orderId = chargeResponse.data.reference_id;
            const status = chargeResponse.data.status;
            const amount = chargeResponse.data.amount.value;

            console.log(`Webhook: Transação com o status: ${status}`);

            if (status === 'PAID') {
                const parts = orderId.split('_');
                if (parts.length === 3) {
                    const clienteUid = parts[1];
                    const valorEmReais = (amount / 100).toFixed(2);
                    console.log(`Webhook: Depósito de R$ ${valorEmReais} confirmado para o cliente UID: ${clienteUid}`);

                    // 1. Atualizar o saldo do usuário no Firestore
                    const userRef = db.collection('perfil').doc(clienteUid);
                    await db.runTransaction(async (transaction) => {
                        const doc = await transaction.get(userRef);
                        const novoSaldo = doc.data().saldo + (amount / 100);
                        transaction.update(userRef, { saldo: novoSaldo });
                    });

                    // 2. Opcional: Registrar a transação para histórico
                    await db.collection('transacoes').add({
                        clienteUid,
                        valor: amount / 100,
                        tipo: 'deposito',
                        metodo: 'pix',
                        status: 'concluido',
                        data: admin.firestore.FieldValue.serverTimestamp()
                    });

                    // 3. Enviar notificação push para o usuário (se você tiver essa funcionalidade)
                    // (código opcional para notificação)

                } else {
                    console.error("Webhook: ID de referência inválido. Não foi possível extrair o UID do cliente.");
                }
            }
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
