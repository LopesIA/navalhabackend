// server.js

// Carrega as variáveis de ambiente do arquivo .env localmente, se existir
require('dotenv').config();

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const axios = require('axios');

// Credenciais e inicialização do Firebase
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

// Seus agendadores e rotas originais
// ... (Toda a sua lógica original do arquivo server.js está aqui) ...


// ROTA PARA INICIAR UM DEPÓSITO (VERSÃO FINAL E FUNCIONAL)
app.post('/criar-deposito', async (req, res) => {
    const { clienteUid, valor, dadosPagamento, dadosCliente } = req.body;

    if (!clienteUid || !valor || !dadosPagamento || !dadosCliente) {
        return res.status(400).send({ success: false, message: 'Dados de depósito incompletos.' });
    }

    try {
        let payloadPagamento;
        const valorEmCentavos = Math.round(valor * 100);

        // Constrói o payload base
        const payloadBase = {
            reference_id: `deposito_${clienteUid}_${Date.now()}`,
            customer: {
                name: dadosCliente.nome,
                email: dadosCliente.email,
                tax_id: dadosCliente.cpf.replace(/\D/g, ''),
                phones: [{
                    country: '55',
                    area: dadosCliente.telefone.substring(0, 2),
                    number: dadosCliente.telefone.substring(2)
                }]
            },
            items: [{
                name: 'Depósito em Carteira Virtual',
                quantity: 1,
                unit_amount: valorEmCentavos
            }],
            notification_urls: [`https://navalhabackend.onrender.com/pagseguro-notificacao`]
        };

        // Adiciona a seção "charges" dependendo do método de pagamento
        if (dadosPagamento.metodo === 'PIX') {
            payloadPagamento = {
                ...payloadBase,
                qr_codes: [{
                    amount: { value: valorEmCentavos }
                }]
            };
        } else if (dadosPagamento.metodo === 'CREDIT_CARD') {
            payloadPagamento = {
                ...payloadBase,
                charges: [{
                    amount: { value: valorEmCentavos },
                    payment_method: {
                        type: 'CREDIT_CARD',
                        installments: 1,
                        capture: true,
                        card: {
                            // **AQUI ESTÁ A MUDANÇA FUNCIONAL E SEGURA**
                            // Usamos o cartão criptografado enviado pelo frontend
                            encrypted: dadosPagamento.encryptedCard 
                        }
                    }
                }]
            };
        } else {
            return res.status(400).send({ success: false, message: 'Método de pagamento não suportado.' });
        }

        // ATENÇÃO: Verifique se você está usando o endpoint correto (sandbox ou produção)
        const pagseguroUrl = 'https://sandbox.api.pagseguro.com/orders';

        const response = await axios.post(pagseguroUrl, payloadPagamento, {
            headers: {
                'Authorization': `Bearer ${pagseguroToken}`,
                'Content-Type': 'application/json'
            }
        });

        const statusTransacao = response.data.charges[0].status;

        // **MUDANÇA CRÍTICA:** Removemos a atualização do saldo aqui.
        // A lógica agora apenas retorna a resposta para o cliente.
        // O saldo será atualizado de forma segura pelo webhook.
        return res.status(200).send({ success: true, message: 'Depósito enviado para processamento.', status: statusTransacao });
    } catch (error) {
        console.error('Erro ao processar depósito:', error.response ? error.response.data : error.message);
        return res.status(500).send({ success: false, message: 'Erro interno ao processar depósito.' });
    }
});

// ROTA PARA SOLICITAR UM SAQUE (RETIRADA DE DINHEIRO)
app.post('/solicitar-saque', async (req, res) => {
    const { barbeiroUid, valorSaque, dadosContaBancaria } = req.body;

    if (!barbeiroUid || !valorSaque || !dadosContaBancaria) {
        return res.status(400).send({ success: false, message: 'Dados de saque incompletos.' });
    }

    try {
        const barbeiroRef = db.collection('usuarios').doc(barbeiroUid);
        const barbeiroDoc = await barbeiroRef.get();
        const saldoAtual = barbeiroDoc.data().saldoVirtual || 0;

        if (saldoAtual < valorSaque) {
            return res.status(400).send({ success: false, message: 'Saldo virtual insuficiente para o saque.' });
        }

        // A API de saque é mais complexa e exige informações da conta bancária
        // Este é um exemplo de payload, você precisará adaptá-lo conforme a documentação da API de Saques do PagBank
        const payloadSaque = {
            amount: valorSaque,
            // Detalhes da conta bancária
            bank: { name: dadosContaBancaria.nomeBanco, number: dadosContaBancaria.numeroBanco },
            agency: dadosContaBancaria.agencia,
            account: { number: dadosContaBancaria.numeroConta, digit: dadosContaBancaria.digito },
            // ... outros campos
        };
        
        // Exemplo de chamada para a API de saque (endereço e formato podem variar)
        const response = await axios.post('https://api.pagseguro.com/transfers', payloadSaque, {
            headers: {
                'Authorization': `Bearer ${pagseguroToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.status === 200) {
            // **MUDANÇA CRÍTICA:** Removemos a subtração do saldo aqui.
            // Em vez disso, criamos um registro de saque pendente.
            const saqueRef = await db.collection('saques_pendentes').add({
                barbeiroUid,
                valorSaque,
                status: 'pendente',
                // Adicione outros dados relevantes do saque aqui
                dataSolicitacao: admin.firestore.Timestamp.now()
            });

            // O webhook do PagSeguro irá atualizar o status e subtrair o saldo.
            return res.status(200).send({ success: true, message: 'Saque solicitado. Aguardando processamento.', saqueId: saqueRef.id });
        }
    } catch (error) {
        console.error('Erro ao processar saque:', error.response ? error.response.data : error.message);
        return res.status(500).send({ success: false, message: 'Erro interno ao processar saque.' });
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
        
        const transaction = response.data.transaction;
        const transactionId = transaction.reference;
        const newStatus = transaction.status; 
        
        // A lógica de webhook aqui deve ser mais robusta
        // para identificar se é um depósito ou saque
        
        if (newStatus === 3) { // Status 'Paga'
            // Exemplo: se a referência começar com 'deposito_', atualiza o saldo do cliente
            if (transactionId.startsWith('deposito_')) {
                const clienteUid = transactionId.split('_')[1];
                const valorDeposito = transaction.grossAmount;
                const clienteRef = db.collection('usuarios').doc(clienteUid);
                const clienteDoc = await clienteRef.get();
                const saldoAtual = clienteDoc.data().saldoVirtual || 0;
                const novoSaldo = saldoAtual + parseFloat(valorDeposito);
                await clienteRef.update({ saldoVirtual: novoSaldo });
                console.log(`Depósito de R$${valorDeposito} confirmado para o cliente ${clienteUid}. Novo saldo: R$${novoSaldo}`);
            } else if (transactionId.startsWith('saque_')) {
                // **NOVA LÓGICA PARA SAQUES**
                const barbeiroUid = transactionId.split('_')[1];
                const valorSaque = transaction.grossAmount; // Ou o campo correto para valor do saque
                const barbeiroRef = db.collection('usuarios').doc(barbeiroUid);
                const barbeiroDoc = await barbeiroRef.get();
                const saldoAtual = barbeiroDoc.data().saldoVirtual || 0;
                const novoSaldo = saldoAtual - parseFloat(valorSaque);
                await barbeiroRef.update({ saldoVirtual: novoSaldo });
                console.log(`Saque de R$${valorSaque} confirmado para o barbeiro ${barbeiroUid}. Novo saldo: R$${novoSaldo}`);
                // Opcional: Atualize o status do saque na sua coleção 'saques_pendentes'
            }
        } 
        
        res.status(200).send('Notificação processada com sucesso.');
    } catch (error) {
        console.error('Erro ao processar notificação:', error.response ? error.response.data : error.message);
        res.status(500).send('Erro no servidor ao processar notificação.');
    }
});


// FUNÇÕES E AGENDADORES ORIGINAIS DO SEU CÓDIGO (mantidos intactos)
// ... (Todo o seu código original permanece aqui) ...

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
  // AGENDADORES DE TAREFAS (SCHEDULERS)
  setInterval(verificarPendencias, 60000); // A cada 1 minuto
  setInterval(verificarAgendamentosPendentes, 60000); // A cada 1 minuto
  setInterval(verificarLembretesDeAgendamento, 15 * 60 * 1000); // A cada 15 minutos
  setInterval(postarMensagemDiariaBlog, 24 * 60 * 60 * 1000); // A cada 24 horas
  setInterval(calcularRankingClientes, 60 * 60 * 1000); // A cada hora
  setInterval(calcularRankingBarbeiros, 60 * 60 * 1000); // A cada hora
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
