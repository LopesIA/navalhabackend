// server.js

// Carrega as variáveis de ambiente do arquivo .env localmente, se existir
// No Render, as variáveis já são carregadas automaticamente
require('dotenv').config();

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios'); // Adicione esta linha para fazer requisições HTTP

// Certifique-se de que a variável de ambiente está configurada no Render.com
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

app.use(cors());
app.use(express.json());

// Pega as credenciais de ambiente do PagSeguro
const pagseguroToken = process.env.PAGSEGURO_TOKEN;

// ROTA PARA ENVIAR NOTIFICAÇÃO PARA UM USUÁRIO ESPECÍFICO
app.post('/enviar-notificacao', async (req, res) => {
  const { uid, title, body } = req.body;
  if (!uid || !title || !body) {
    return res.status(400).send({ success: false, message: 'uid, title e body são obrigatórios' });
  }
  try {
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();
    if (!userDoc.exists) {
      return res.status(404).send({ success: false, message: 'Usuário não encontrado.' });
    }
    const { fcmTokens } = userDoc.data();
    if (!fcmTokens || fcmTokens.length === 0) {
      return res.status(200).send({ success: true, message: 'Usuário não possui token de notificação.' });
    }
    await admin.messaging().sendEachForMulticast({
      notification: { title, body },
      tokens: fcmTokens
    });
    return res.status(200).send({ success: true, message: 'Notificação enviada com sucesso!' });
  } catch (error) {
    console.error('Erro ao enviar notificação:', error);
    return res.status(500).send({ success: false, message: 'Erro interno ao enviar notificação.' });
  }
});

// ROTA PARA INICIAR UM PAGAMENTO VIA API DO PAGBANK
app.post('/criar-pagamento', async (req, res) => {
    const { agendamentoId, valor, metodoPagamento, tokenCartao, dadosCliente, barbeiroUid } = req.body;

    // Verificação básica de dados
    if (!agendamentoId || !valor || !metodoPagamento || !tokenCartao || !dadosCliente || !barbeiroUid) {
        return res.status(400).send({ success: false, message: 'Dados de pagamento incompletos.' });
    }

    try {
        const payloadPagamento = {
            reference_id: agendamentoId,
            customer: {
                name: dadosCliente.nome,
                email: dadosCliente.email,
                tax_id: dadosCliente.cpf, // O CPF é um campo crucial para o PagBank
                phone: {
                    country: '55', // Código do país para o Brasil
                    area: dadosCliente.ddd,
                    number: dadosCliente.telefone
                }
            },
            items: [
                {
                    name: 'Agendamento de Serviço',
                    quantity: 1,
                    unit_amount: valor * 100 // O PagBank usa centavos
                }
            ],
            charges: [{
                payment_method: {
                    type: metodoPagamento, // Ex: 'CREDIT_CARD'
                    installments: 1, // Número de parcelas
                    capture: true,
                    card: {
                        token: tokenCartao
                    }
                }
            }],
            // URL de notificação que você cadastrou no painel do PagBank
            notification_urls: [`https://navalhabackend.onrender.com/pagseguro-notificacao`]
        };

        const response = await axios.post('https://api.pagseguro.com/charges', payloadPagamento, {
            headers: {
                'Authorization': `Bearer ${pagseguroToken}`,
                'Content-Type': 'application/json'
            }
        });

        const statusTransacao = response.data.charges[0].status;

        if (statusTransacao === 'PAID') {
            const agendamentoRef = db.collection('agendamentos').doc(agendamentoId);
            await agendamentoRef.update({
                status: 'confirmado',
                pagamento: { status: 'pago', data: new Date() }
            });
            return res.status(200).send({ success: true, message: 'Pagamento aprovado e agendamento confirmado!' });
        } else {
            return res.status(200).send({ success: false, message: 'Pagamento pendente ou recusado.', status: statusTransacao });
        }
    } catch (error) {
        console.error('Erro ao processar pagamento:', error.response ? error.response.data : error.message);
        return res.status(500).send({ success: false, message: 'Erro interno ao processar pagamento.' });
    }
});

// ROTA PARA RECEBER E PROCESSAR NOTIFICAÇÕES (WEBHOOKS) DO PAGBANK
app.post('/pagseguro-notificacao', async (req, res) => {
    const notificationCode = req.body.notificationCode;
    if (!notificationCode) {
        return res.status(400).send('Código de notificação ausente.');
    }

    try {
        const response = await axios.get(`https://ws.pagseguro.uol.com.br/v2/transactions/notifications/${notificationCode}?email=${process.env.PAGSEGURO_EMAIL}&token=${pagseguroToken}`);
        
        const transactionId = response.data.transaction.reference;
        const newStatus = response.data.transaction.status; // 1 = Aguardando, 3 = Paga
        const transactionCode = response.data.transaction.code;

        // Note: O PagBank pode usar diferentes APIs para webhooks, o ideal é usar a mais recente
        // Mas esta rota serve como exemplo
        
        if (newStatus === 3) {
            // Se o pagamento foi aprovado, atualize o agendamento
            const agendamentoRef = db.collection('agendamentos').doc(transactionId);
            await agendamentoRef.update({ 
                status: 'confirmado', 
                'pagamento.status': 'aprovado',
                'pagamento.transactionCode': transactionCode
            });
            console.log(`Notificação recebida. Agendamento ${transactionId} confirmado.`);
        } else {
            console.log(`Notificação recebida. Status da transação: ${newStatus}`);
        }
        
        res.status(200).send('Notificação processada com sucesso.');
    } catch (error) {
        console.error('Erro ao processar notificação:', error.response ? error.response.data : error.message);
        res.status(500).send('Erro no servidor ao processar notificação.');
    }
});


// FUNÇÕES E AGENDADORES ORIGINAIS DO SEU CÓDIGO (mantidos intactos)
// ... (Todo o seu código original permanece aqui)

// FUNÇÕES QUE VERIFICAM PENDÊNCIAS E ENVIAM NOTIFICAÇÕES
const verificarPendencias = async () => {
  try {
    const agora = admin.firestore.Timestamp.now();
    const seteDiasAtras = new admin.firestore.Timestamp(agora.seconds - (7 * 24 * 60 * 60), agora.nanoseconds);
    const agendamentosRef = db.collection('agendamentos');
    const pendentes = await agendamentosRef
      .where('status', '==', 'pendente')
      .where('dataHora', '<', seteDiasAtras)
      .get();
    const batch = db.batch();
    pendentes.docs.forEach(doc => {
      batch.update(doc.ref, { status: 'expirado' });
    });
    if (!pendentes.empty) {
      await batch.commit();
      console.log(`Expirados: ${pendentes.size} agendamentos.`);
    }
  } catch (error) {
    console.error('Erro ao verificar pendências:', error);
  }
};

const verificarAgendamentosPendentes = async () => {
    try {
        const agendamentosRef = db.collection('agendamentos');
        const agendamentosPendentes = await agendamentosRef.where('status', '==', 'pendente').get();
        const barbeirosParaNotificar = {};
        agendamentosPendentes.docs.forEach(doc => {
            const barbeiroUid = doc.data().barbeiroUid;
            barbeirosParaNotificar[barbeiroUid] = (barbeirosParaNotificar[barbeiroUid] || 0) + 1;
        });
        for (const uid in barbeirosParaNotificar) {
            const userDoc = await db.collection('usuarios').doc(uid).get();
            if (userDoc.exists && userDoc.data().fcmTokens?.length > 0) {
                const count = barbeirosParaNotificar[uid];
                await admin.messaging().sendEachForMulticast({
                    notification: { title: "⏰ Agendamentos Pendentes!", body: `Você tem ${count} agendamento(s) aguardando aprovação.` },
                    tokens: userDoc.data().fcmTokens
                });
            }
        }
    } catch (error) { console.error('Erro ao notificar agendamentos pendentes:', error); }
};

// AGENDADORES DE TAREFAS (SCHEDULERS)
setInterval(verificarPendencias, 60000); // A cada 1 minuto
setInterval(verificarAgendamentosPendentes, 60000); // A cada 1 minuto
setInterval(verificarLembretesDeAgendamento, 15 * 60 * 1000); // A cada 15 minutos
setInterval(postarMensagemDiariaBlog, 24 * 60 * 60 * 1000); // A cada 24 horas
setInterval(calcularRankingClientes, 60 * 60 * 1000); // A cada hora
setInterval(calcularRankingBarbeiros, 60 * 60 * 1000); // A cada hora


const verificarLembretesDeAgendamento = async () => {
    try {
        const agora = admin.firestore.Timestamp.now();
        const umDiaDepois = new admin.firestore.Timestamp(agora.seconds + (24 * 60 * 60), agora.nanoseconds);
        const agendamentosRef = db.collection('agendamentos');
        const agendamentosParaLembrar = await agendamentosRef
            .where('status', '==', 'confirmado')
            .where('dataHora', '>=', agora)
            .where('dataHora', '<=', umDiaDepois)
            .get();
        for (const doc of agendamentosParaLembrar.docs) {
            const agendamento = doc.data();
            if (!agendamento.lembreteEnviado) {
                const clienteUid = agendamento.clienteUid;
                const userDoc = await db.collection('usuarios').doc(clienteUid).get();
                if (userDoc.exists && userDoc.data().fcmTokens?.length > 0) {
                    const dataHoraFormatada = new Date(agendamento.dataHora.seconds * 1000).toLocaleString('pt-BR');
                    await admin.messaging().sendEachForMulticast({
                        notification: { title: "Lembrete de Agendamento", body: `Seu agendamento para ${dataHoraFormatada} está chegando!` },
                        tokens: userDoc.data().fcmTokens
                    });
                    await doc.ref.update({ lembreteEnviado: true });
                }
            }
        }
    } catch (error) {
        console.error('Erro ao verificar lembretes de agendamento:', error);
    }
};

const postarMensagemDiariaBlog = async () => {
    try {
        const dataAtual = new Date();
        const dataFormatada = dataAtual.toLocaleDateString('pt-BR');
        const novaPostagem = {
            titulo: `Post do dia ${dataFormatada}`,
            conteudo: "Este é um post de teste diário para o blog.",
            data: admin.firestore.Timestamp.now()
        };
        const blogRef = db.collection('blog');
        await blogRef.add(novaPostagem);
    } catch (error) {
        console.error('Erro ao postar mensagem diária no blog:', error);
    }
};

const calcularRankingClientes = async () => {
    try {
        const clientesRef = db.collection('usuarios').where('papel', '==', 'cliente');
        const clientesDocs = await clientesRef.get();
        const batch = db.batch();
        for (const doc of clientesDocs.docs) {
            const clienteUid = doc.id;
            const agendamentosConcluidos = await db.collection('agendamentos')
                .where('clienteUid', '==', clienteUid)
                .where('status', '==', 'concluido')
                .get();
            batch.update(doc.ref, { totalAgendamentosConcluidos: agendamentosConcluidos.size });
        }
        await batch.commit();
    } catch (error) {
        console.error('Erro ao calcular ranking de clientes:', error);
    }
};

const calcularRankingBarbeiros = async () => {
    try {
        const barbeirosRef = db.collection('usuarios').where('papel', '==', 'barbeiro');
        const barbeirosDocs = await barbeirosRef.get();
        const batch = db.batch();
        for (const doc of barbeirosDocs.docs) {
            const barbeiroUid = doc.id;
            const agendamentosConcluidos = await db.collection('agendamentos')
                .where('barbeiroUid', '==', barbeiroUid)
                .where('status', '==', 'concluido')
                .get();
            const avaliacoes = await db.collection('avaliacoes')
                .where('barbeiroUid', '==', barbeiroUid)
                .get();
            let somaEstrelas = 0;
            avaliacoes.docs.forEach(avaliacaoDoc => {
                somaEstrelas += avaliacaoDoc.data().estrelas;
            });
            const mediaEstrelas = avaliacoes.size > 0 ? somaEstrelas / avaliacoes.size : 0;
            batch.update(doc.ref, {
                totalAgendamentosConcluidos: agendamentosConcluidos.size,
                mediaAvaliacao: mediaEstrelas
            });
        }
        await batch.commit();
    } catch (error) {
        console.error('Erro ao calcular ranking de barbeiros:', error);
    }
};

// ... (Resto do seu código)

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
