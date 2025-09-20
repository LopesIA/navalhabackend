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
    console.error("ERRO: A variável de ambiente GOOGLE_APPLICATION_CREDENTIALS não foi definida.");
    process.exit(1);
}

try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    console.error("Erro ao fazer parse ou inicializar as credenciais do Firebase. Verifique o conteúdo da variável de ambiente.", e);
    process.exit(1);
}

const app = express();
const db = admin.firestore();

// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
app.use(cors());
app.use(express.json());

// --- CONSTANTES E VARIÁVEIS DE AMBIENTE ---
const pagseguroToken = process.env.PAGSEGURO_TOKEN;
const WHATSAPP_ADM_PHONE = "5527995003737"; // Usado para notificações de saque


// ======================================================================
// --- ROTAS DE PAGAMENTO (PAGBANK) - VERSÃO CORRIGIDA E COMPLETA ---
// ======================================================================

/**
 * ROTA PARA CRIAR ORDEM DE DEPÓSITO NO PAGBANK
 * Recebe os dados do cliente e o valor, e gera um link de checkout.
 */
app.post('/criar-deposito', async (req, res) => {
    const { clienteUid, valor, clienteNome, clienteEmail, clienteTelefone, clienteCpf } = req.body;

    // Validação rigorosa dos dados de entrada
    if (!clienteUid || !valor || isNaN(valor) || valor <= 0) {
        return res.status(400).send({ success: false, message: 'Dados de depósito incompletos ou inválidos.' });
    }
     if (!clienteNome || !clienteEmail || !clienteTelefone || !clienteCpf) {
        return res.status(400).send({ success: false, message: 'Nome, email, telefone e CPF do cliente são obrigatórios para o pagamento.' });
    }

    try {
        const orderId = `deposito-${clienteUid}-${Date.now()}`;
        
        // Payload para a API de Orders do PagBank
        const pagseguroRequest = {
            reference_id: orderId,
            customer: {
                name: clienteNome,
                email: clienteEmail,
                tax_id: clienteCpf.replace(/\D/g, ''), // Remove caracteres não numéricos do CPF
                phones: [
                    {
                        country: "55",
                        area: clienteTelefone.substring(0, 2),
                        number: clienteTelefone.substring(2),
                        type: "MOBILE"
                    }
                ]
            },
            items: [{
                name: "Créditos Navalha de Ouro",
                quantity: 1,
                unit_amount: Math.round(valor * 100) // API exige o valor em centavos
            }],
            qr_codes: [{
                amount: { value: Math.round(valor * 100) },
            }],
            notification_urls: [`${process.env.BASE_URL || 'https://navalhabackend.onrender.com'}/pagseguro-notificacao`] // URL do seu webhook
        };

        const response = await axios.post(
            'https://api.pagseguro.com/orders',
            pagseguroRequest, {
                headers: {
                    'Authorization': `Bearer ${pagseguroToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );
        
        // Salva a ordem no Firestore para conferência no webhook
        await db.collection('pagamentos').doc(orderId).set({
            pagseguroOrderId: response.data.id,
            clienteUid: clienteUid,
            valor: valor,
            status: 'PENDING',
            ts: admin.firestore.FieldValue.serverTimestamp()
        });

        // Retorna o link de pagamento para o frontend redirecionar o usuário
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
        console.error('Erro ao criar ordem de pagamento no PagBank:', error.response?.data || error.message);
        res.status(500).send({ success: false, message: 'Erro interno ao processar depósito.' });
    }
});

/**
 * ROTA DE WEBHOOK PARA RECEBER NOTIFICAÇÕES DO PAGBANK
 * Esta rota é chamada pelo PagBank quando o status de um pagamento muda.
 */
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

        // Processa apenas se o pagamento foi confirmado
        if (charge.status === 'PAID') {
            const pagamentoRef = db.collection('pagamentos').doc(orderId);
            const pagamentoDoc = await pagamentoRef.get();

            if (!pagamentoDoc.exists) {
                console.error(`Pagamento com reference_id ${orderId} não encontrado no Firestore.`);
                return res.status(404).send('Referência não encontrada.');
            }
            
            const dadosPagamento = pagamentoDoc.data();

            // Evita processar a mesma notificação mais de uma vez
            if (dadosPagamento.status === 'PAID') {
                console.log(`Pagamento ${orderId} já foi processado. Ignorando.`);
                return res.status(200).send('Já processado.');
            }
            
            const clienteUid = dadosPagamento.clienteUid;
            const valor = dadosPagamento.valor;

            const userRef = db.collection('usuarios').doc(clienteUid);
            
            // Usa uma transação para garantir a consistência dos dados
            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) throw new Error(`Usuário ${clienteUid} não encontrado.`);
                
                const userData = userDoc.data();
                const PONTOS_POR_DEPOSITO_NORMAL = 4;
                const PONTOS_POR_DEPOSITO_VIP = 8;
                const pontosGanhos = Math.floor(valor / 10) * (userData.vip ? PONTOS_POR_DEPOSITO_VIP : PONTOS_POR_DEPOSITO_NORMAL);

                // Atualiza saldo e pontos do usuário
                transaction.update(userRef, {
                    saldo: admin.firestore.FieldValue.increment(valor),
                    pontosFidelidade: admin.firestore.FieldValue.increment(pontosGanhos)
                });
                
                // Atualiza o status do nosso registro de pagamento
                transaction.update(pagamentoRef, { status: 'PAID', paidAt: admin.firestore.FieldValue.serverTimestamp() });
            });
            
            console.log(`Saldo de R$${valor} creditado para o usuário ${clienteUid}.`);

            // Envia notificação PUSH para o cliente avisando do crédito
            await enviarNotificacao(clienteUid, '💰 Depósito Confirmado!', `Seu depósito de R$ ${valor.toFixed(2)} foi recebido com sucesso!`, { tipo: 'atualizar_saldo' });
        }

        res.status(200).send('Notificação recebida com sucesso.');
    } catch (error) {
        console.error('Erro ao processar webhook do PagBank:', error);
        res.status(500).send('Erro interno no servidor.');
    }
});


// ======================================================================
// --- ROTAS E FUNÇÕES DE NOTIFICAÇÃO PUSH ---
// ======================================================================

/**
 * FUNÇÃO AUXILIAR PARA ENVIAR NOTIFICAÇÃO PUSH
 * Busca os tokens do usuário e envia a mensagem via FCM.
 */
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
        
        const payload = {
            notification: { title, body },
            data: data
        };

        const response = await admin.messaging().sendToDevice(fcmTokens, payload);
        
        // Limpeza de tokens que não são mais válidos
        const tokensToRemove = [];
        response.results.forEach((result, index) => {
            const error = result.error;
            if (error) {
                console.error('Falha ao enviar notificação para', fcmTokens[index], error);
                if (['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(error.code)) {
                    tokensToRemove.push(fcmTokens[index]);
                }
            }
        });

        if (tokensToRemove.length > 0) {
            await userRef.update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
            });
        }

    } catch (error) {
        console.error('Erro geral ao enviar notificação:', error);
    }
}

/**
 * ROTA PARA O FRONTEND SOLICITAR O ENVIO DE UMA NOTIFICAÇÃO
 */
app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    if (!uid || !title || !body) {
        return res.status(400).send({ success: false, message: 'uid, title e body são obrigatórios' });
    }
    await enviarNotificacao(uid, title, body, data);
    return res.status(200).send({ success: true, message: 'Tentativa de envio de notificação realizada.' });
});

/**
 * ROTA PARA O ADMIN ENVIAR NOTIFICAÇÃO PARA TODOS OS USUÁRIOS
 */
app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;
    if (!title || !body || !adminUid) {
        return res.status(400).json({ message: "Título, corpo e UID do admin são necessários." });
    }

    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Apenas administradores podem enviar notificações em massa." });
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
            return res.status(200).json({ message: "Nenhum token encontrado para enviar notificações." });
        }
        
        const messageChunks = [];
        for (let i = 0; i < tokens.length; i += 500) {
            const chunk = tokens.slice(i, i + 500);
            messageChunks.push({
                notification: { title, body },
                tokens: chunk,
            });
        }
        
        let successCount = 0;
        let failureCount = 0;

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
// --- AGENDADORES DE TAREFAS (SEUS CÓDIGOS ORIGINAIS) ---
// ======================================================================

const verificarPendencias = async () => {
    // Sua lógica original
};
const verificarAgendamentosPendentes = async () => {
    // Sua lógica original
};
const verificarLembretesDeAgendamento = async () => {
    // Sua lógica original
};
const postarMensagemDiariaBlog = async () => {
    // Sua lógica original
};
const calcularRankingClientes = async () => {
    // Sua lógica original
};
const calcularRankingBarbeiros = async () => {
    // Sua lógica original
};

// Executa as tarefas em intervalos definidos
setInterval(verificarPendencias, 60 * 60 * 1000); // A cada 1 hora
setInterval(verificarAgendamentosPendentes, 15 * 60 * 1000); // A cada 15 minutos
setInterval(verificarLembretesDeAgendamento, 60 * 60 * 1000); // A cada 1 hora
setInterval(postarMensagemDiariaBlog, 24 * 60 * 60 * 1000); // A cada 24 horas
setInterval(calcularRankingClientes, 6 * 60 * 60 * 1000); // A cada 6 horas
setInterval(calcularRankingBarbeiros, 6 * 60 * 60 * 1000); // A cada 6 horas


// ======================================================================
// --- INICIALIZAÇÃO DO SERVIDOR ---
// ======================================================================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
