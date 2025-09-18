// server.js

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// Certifique-se de que a variável de ambiente está configurada no Render.com
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

app.use(cors());
app.use(express.json());

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
      return res.status(200).send({ success: true, message: 'Usuário não possui tokens para notificar.' });
    }
    const message = {
      notification: { title, body },
      tokens: fcmTokens,
      webpush: { notification: { icon: '/icone.png' } }
    };
    const response = await admin.messaging().sendEachForMulticast(message);
    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const { code } = resp.error;
          if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
            tokensToRemove.push(fcmTokens[idx]);
          }
        }
      });
      if (tokensToRemove.length > 0) {
        await userRef.update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove) });
      }
    }
    res.status(200).send({ success: true, message: 'Notificações enviadas!', ...response });
  } catch (error) {
    console.error("Erro em /enviar-notificacao:", error);
    res.status(500).send({ success: false, message: 'Erro interno ao enviar notificação.' });
  }
});

// ROTA PARA ENVIAR NOTIFICAÇÃO DE MARKETING EM MASSA (ADMIN)
app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;
    if (!title || !body || !adminUid) {
        return res.status(400).send({ success: false, message: 'Faltam parâmetros obrigatórios' });
    }
    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).send({ success: false, message: 'Acesso negado.' });
        }
        const allUsersSnapshot = await db.collection('usuarios').get();
        let allTokens = [];
        allUsersSnapshot.forEach(doc => {
            const { fcmTokens } = doc.data();
            if (fcmTokens && fcmTokens.length > 0) {
                allTokens.push(...fcmTokens);
            }
        });
        if (allTokens.length === 0) {
            return res.status(200).send({ success: true, message: 'Nenhum usuário com token encontrado.' });
        }
        const uniqueTokens = [...new Set(allTokens)];
        const message = { notification: { title, body }, webpush: { notification: { icon: '/icone.png' } } };
        const tokenChunks = [];
        for (let i = 0; i < uniqueTokens.length; i += 500) {
            tokenChunks.push(uniqueTokens.slice(i, i + 500));
        }
        let successCount = 0, failureCount = 0;
        for (const chunk of tokenChunks) {
            const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
            successCount += response.successCount;
            failureCount += response.failureCount;
        }
        res.status(200).send({ success: true, message: 'Notificações de marketing enviadas!', totalTokens: uniqueTokens.length, successCount, failureCount });
    } catch (error) {
        console.error("Erro em /enviar-notificacao-massa:", error);
        res.status(500).send({ success: false, message: 'Erro interno ao enviar notificação em massa.' });
    }
});

// FUNÇÃO PARA VERIFICAR LEMBRETES DE AGENDAMENTO
async function verificarLembretesDeAgendamento() {
    try {
        const agora = new Date();
        const umaHoraFrente = new Date(agora.getTime() + 60 * 60 * 1000);
        const agendamentosSnapshot = await db.collection('agendamentos').where('status', '==', 'conclusão pendente').where('lembreteEnviado', '==', false).get();
        if (agendamentosSnapshot.empty) return;
        agendamentosSnapshot.forEach(async doc => {
            const agendamento = doc.data();
            if (!agendamento.horario || !agendamento.confirmadoEm) return;
            const [horas, minutos] = agendamento.horario.split(':');
            const dataAgendamento = new Date(agendamento.confirmadoEm.toDate());
            dataAgendamento.setHours(horas, minutos, 0, 0);
            if (dataAgendamento > agora && dataAgendamento <= umaHoraFrente) {
                const title = "⏰ Lembrete de Agendamento!";
                const body = `Seu horário com ${agendamento.barbeiroNome} para "${agendamento.servico}" é às ${agendamento.horario}. Não se atrase!`;
                const userDoc = await db.collection('usuarios').doc(agendamento.clienteUid).get();
                if (userDoc.exists && userDoc.data().fcmTokens?.length > 0) {
                    await admin.messaging().sendEachForMulticast({ notification: { title, body }, tokens: userDoc.data().fcmTokens });
                    await doc.ref.update({ lembreteEnviado: true });
                }
            }
        });
    } catch (error) { console.error('Erro ao verificar lembretes:', error); }
}

// FUNÇÃO PARA POSTAR MENSAGEM DIÁRIA NO BLOG
function gerarCodigoAleatorio(tamanho = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = '';
    for (let i = 0; i < tamanho; i++) { codigo += chars.charAt(Math.floor(Math.random() * chars.length)); }
    return codigo;
}
async function postarMensagemDiariaBlog() {
    try {
        const codigo = gerarCodigoAleatorio();
        await db.collection("blog").add({
            titulo: "🎁 Código de Resgate Diário!",
            conteudo: `Resgate o código (${codigo}) e receba 5 pontos de fidelidade! Lembre-se de usar os parênteses para resgatar.`,
            autor: "Sistema Navalha de Ouro",
            autorUid: "sistema",
            ts: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) { console.error('Erro ao postar no blog:', error); }
}

// ATUALIZADO: Funções de Ranking mais robustas e com logs detalhados
async function calcularRankingClientes() {
    try {
        console.log('[Ranking Clientes] Iniciando cálculo...');
        const usuariosSnapshot = await db.collection('usuarios').where('tipo', '==', 'cliente').get();

        if (usuariosSnapshot.empty) {
            console.log('[Ranking Clientes] Nenhum usuário do tipo "cliente" encontrado.');
            await db.collection('config').doc('rankingClientes').set({
                ranking: [],
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
            return;
        }

        console.log(`[Ranking Clientes] ${usuariosSnapshot.size} clientes encontrados.`);
        const users = [];
        usuariosSnapshot.forEach(doc => {
            const data = doc.data();
            if (data && data.nome) { // Garante que o usuário tem os dados mínimos
                users.push({
                    uid: doc.id,
                    nome: data.nome,
                    contagem: data.cortesRealizados || 0
                });
            } else {
                 console.warn(`[Ranking Clientes] Documento ${doc.id} ignorado por falta de dados (nome).`);
            }
        });

        const ranking = users
            .sort((a, b) => b.contagem - a.contagem)
            .slice(0, 100);

        console.log(`[Ranking Clientes] Ranking final com ${ranking.length} usuários calculado.`);

        await db.collection('config').doc('rankingClientes').set({
            ranking,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Ranking Clientes] Ranking de clientes (Top 100) salvo com sucesso.');
    } catch (error) {
        console.error('[Ranking Clientes] Erro CRÍTICO ao calcular ranking de clientes:', error);
    }
}

async function calcularRankingBarbeiros() {
    try {
        console.log('[Ranking Barbeiros] Iniciando cálculo...');
        const barbeirosSnapshot = await db.collection('usuarios').where('tipo', '==', 'barbeiro').get();
        
        if (barbeirosSnapshot.empty) {
            console.log('[Ranking Barbeiros] Nenhum usuário do tipo "barbeiro" encontrado.');
             await db.collection('config').doc('rankingBarbeiros').set({
                ranking: [],
                atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
            });
            return;
        }

        console.log(`[Ranking Barbeiros] ${barbeirosSnapshot.size} barbeiros encontrados.`);
        const users = [];
        barbeirosSnapshot.forEach(doc => {
            const data = doc.data();
             if (data && data.nome) { // Garante que o usuário tem os dados mínimos
                users.push({
                    uid: doc.id,
                    nome: data.nome,
                    contagem: data.clientesAtendidos || 0
                });
            } else {
                 console.warn(`[Ranking Barbeiros] Documento ${doc.id} ignorado por falta de dados (nome).`);
            }
        });

       const ranking = users
            .sort((a, b) => b.contagem - a.contagem)
            .slice(0, 100);
            
        console.log(`[Ranking Barbeiros] Ranking final com ${ranking.length} usuários calculado.`);

        await db.collection('config').doc('rankingBarbeiros').set({
            ranking,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('[Ranking Barbeiros] Ranking de barbeiros (Top 100) salvo com sucesso.');
    } catch (error) {
        console.error('[Ranking Barbeiros] Erro CRÍTICO ao calcular ranking de barbeiros:', error);
    }
}


// FUNÇÃO PARA VERIFICAR PENDÊNCIAS (ADMIN)
async function verificarPendencias() {
    try {
        const pendentes = await db.collection('solicitacoes').where('status', '==', 'pendente').get();
        if (pendentes.size > 0) {
            const title = "Alerta de Transações Pendentes!";
            const body = `Há ${pendentes.size} solicitação(ões) pendente(s) de aprovação.`;
            const adminUsers = await db.collection('usuarios').where('tipo', '==', 'admin').get();
            const adminTokens = [];
            adminUsers.forEach(doc => {
                if (doc.data().fcmTokens) adminTokens.push(...doc.data().fcmTokens);
            });
            if (adminTokens.length > 0) {
                await admin.messaging().sendEachForMulticast({ notification: { title, body }, tokens: [...new Set(adminTokens)] });
            }
        }
    } catch (error) { console.error('Erro ao verificar pendências:', error); }
}

// FUNÇÃO PARA NOTIFICAR BARBEIROS SOBRE AGENDAMENTOS PENDENTES
async function verificarAgendamentosPendentes() {
    try {
        const agendamentos = await db.collection('agendamentos').where('status', '==', 'pendente').get();
        if (agendamentos.empty) return;
        const barbeirosParaNotificar = {};
        agendamentos.forEach(doc => {
            const { barbeiroUid } = doc.data();
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
}

// AGENDADORES DE TAREFAS (SCHEDULERS)
setInterval(verificarPendencias, 60000); // A cada 1 minuto
setInterval(verificarAgendamentosPendentes, 60000); // A cada 1 minuto
setInterval(verificarLembretesDeAgendamento, 15 * 60 * 1000); // A cada 15 minutos
setInterval(postarMensagemDiariaBlog, 24 * 60 * 60 * 1000); // A cada 24 horas
setInterval(calcularRankingClientes, 60 * 60 * 1000); // A cada hora
setInterval(calcularRankingBarbeiros, 60 * 60 * 1000); // A cada hora

// INICIAÇÃO DO SERVIDOR
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    // Executa as funções de ranking na inicialização para garantir que existam
    calcularRankingClientes();
    calcularRankingBarbeiros();
});
