// server.js

const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// IMPORTANTE: Use a variável de ambiente que você configurou no Render
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const app = express();
const db = admin.firestore();

app.use(cors());
app.use(express.json());

// --- ROTA PARA ENVIAR NOTIFICAÇÃO PARA UM USUÁRIO ESPECÍFICO ---
app.post('/enviar-notificacao', async (req, res) => {
  const { uid, title, body } = req.body;
  if (!uid || !title || !body) {
    return res.status(400).send({
      success: false,
      message: 'uid, title e body são obrigatórios'
    });
  }

  try {
    const userRef = db.collection("usuarios").doc(uid);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
      return res.status(404).send({ success: false, message: 'Usuário não encontrado.' });
    }

    const userData = userDoc.data();
    const fcmTokens = userData.fcmTokens || [];

    if (fcmTokens.length === 0) {
      return res.status(200).send({ success: true, message: 'Usuário não possui tokens para notificar.', successCount: 0, failureCount: 0 });
    }

    const message = {
      notification: { title, body },
      tokens: fcmTokens,
      webpush: { notification: { icon: '/icone.png' } }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    console.log('Resposta do FCM recebida:', response);

    if (response.failureCount > 0) {
      const tokensToRemove = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          console.error(`Falha no envio para o token: ${fcmTokens[idx]}`, error);
          if (error.code === 'messaging/registration-token-not-registered' ||
              error.code === 'messaging/invalid-registration-token') {
            tokensToRemove.push(fcmTokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log('Removendo tokens inválidos do perfil do usuário:', tokensToRemove);
        await userRef.update({
          fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
        });
        console.log('Tokens inválidos removidos com sucesso.');
      }
    }

    res.status(200).send({
      success: true,
      message: 'Notificações enviadas!',
      successCount: response.successCount,
      failureCount: response.failureCount,
      failedTokens: response.responses
        .filter(r => !r.success)
        .map((r, i) => ({ token: fcmTokens[i], error: r.error.code }))
    });
  } catch (error) {
    console.error('Erro grave ao enviar notificação:', error);
    res.status(500).send({ success: false, message: 'Erro interno ao enviar notificação.' });
  }
});


// =================================================================
// ============== INÍCIO DAS NOVAS IMPLEMENTAÇÕES ==================
// =================================================================

// --- ROTA PARA ENVIAR NOTIFICAÇÃO DE MARKETING EM MASSA (ADMIN) ---
app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;
    if (!title || !body || !adminUid) {
        return res.status(400).send({ success: false, message: 'title, body e adminUid são obrigatórios' });
    }

    try {
        // Verifica se o requisitante é um admin
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).send({ success: false, message: 'Acesso negado. Apenas administradores podem enviar notificações em massa.' });
        }

        const allUsersSnapshot = await db.collection('usuarios').get();
        let allTokens = [];
        allUsersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (userData.fcmTokens && userData.fcmTokens.length > 0) {
                allTokens.push(...userData.fcmTokens);
            }
        });

        if (allTokens.length === 0) {
            return res.status(200).send({ success: true, message: 'Nenhum usuário com token de notificação encontrado.' });
        }

        const uniqueTokens = [...new Set(allTokens)];
        const message = {
            notification: { title, body },
            webpush: { notification: { icon: '/icone.png' } }
        };

        // O FCM envia para até 500 tokens por vez, então dividimos em lotes
        const tokenChunks = [];
        for (let i = 0; i < uniqueTokens.length; i += 500) {
            tokenChunks.push(uniqueTokens.slice(i, i + 500));
        }

        let successCount = 0;
        let failureCount = 0;

        for (const chunk of tokenChunks) {
            const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
            successCount += response.successCount;
            failureCount += response.failureCount;
            console.log(`Lote de notificações enviado: ${response.successCount} sucesso(s), ${response.failureCount} falha(s).`);
        }

        res.status(200).send({
            success: true,
            message: 'Notificações de marketing enviadas para todos os usuários!',
            totalTokens: uniqueTokens.length,
            successCount,
            failureCount
        });

    } catch (error) {
        console.error('Erro ao enviar notificação em massa:', error);
        res.status(500).send({ success: false, message: 'Erro interno ao enviar notificação em massa.' });
    }
});


// --- FUNÇÃO PARA VERIFICAR LEMBRETES DE AGENDAMENTO (OPÇÃO 1) ---
async function verificarLembretesDeAgendamento() {
    try {
        const agora = new Date();
        const umaHoraFrente = new Date(agora.getTime() + 60 * 60 * 1000);
        
        // Pega todos agendamentos pendentes de conclusão
        const agendamentosSnapshot = await db.collection('agendamentos')
            .where('status', '==', 'conclusão pendente')
            .where('lembreteEnviado', '==', false) // Apenas os que ainda não receberam lembrete
            .get();

        if (agendamentosSnapshot.empty) return;

        agendamentosSnapshot.forEach(async doc => {
            const agendamento = doc.data();
            const horarioString = agendamento.horario; // Ex: "14:00"

            if (!horarioString) return; // Ignora vagas imediatas que não têm horário fixo

            const [horas, minutos] = horarioString.split(':');
            const dataAgendamento = new Date(agendamento.confirmadoEm.toDate()); // Usa a data da confirmação
            dataAgendamento.setHours(horas, minutos, 0, 0);

            // Se o horário do agendamento estiver dentro da próxima hora
            if (dataAgendamento > agora && dataAgendamento <= umaHoraFrente) {
                const title = "⏰ Lembrete de Agendamento!";
                const body = `Seu horário com ${agendamento.barbeiroNome} para o serviço "${agendamento.servico}" é às ${agendamento.horario}. Não se atrase!`;

                const message = {
                    notification: { title, body },
                    webpush: { notification: { icon: '/icone.png' } }
                };

                // Envia notificação para o cliente
                const userDoc = await db.collection('usuarios').doc(agendamento.clienteUid).get();
                if (userDoc.exists) {
                    const tokens = userDoc.data().fcmTokens || [];
                    if (tokens.length > 0) {
                        await admin.messaging().sendEachForMulticast({ ...message, tokens });
                        console.log(`Lembrete de agendamento enviado para ${agendamento.clienteNome}.`);
                        // Marca que o lembrete foi enviado para não enviar de novo
                        await doc.ref.update({ lembreteEnviado: true });
                    }
                }
            }
        });
    } catch (error) {
        console.error('Erro ao verificar lembretes de agendamento:', error);
    }
}


// --- FUNÇÃO PARA POSTAR MENSAGEM DIÁRIA NO BLOG (OPÇÃO EXTRA) ---
function gerarCodigoAleatorio(tamanho = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let codigo = '';
    for (let i = 0; i < tamanho; i++) {
        codigo += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return codigo;
}

async function postarMensagemDiariaBlog() {
    try {
        const codigo = gerarCodigoAleatorio();
        const mensagem = `Resgate o código (${codigo}) e receba 5 pontos de fidelidade! Lembre-se de usar os parênteses para resgatar.`;

        await db.collection("blog").add({
            titulo: "🎁 Código de Resgate Diário!",
            conteudo: mensagem,
            autor: "Sistema Navalha de Ouro",
            autorUid: "sistema",
            ts: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log(`Post diário do blog criado com o código: ${codigo}`);
    } catch (error) {
        console.error('Erro ao postar mensagem diária no blog:', error);
    }
}


// --- FUNÇÃO PARA CALCULAR RANKING SEMANAL (OPÇÃO 5) ---
async function calcularRankingSemanal() {
    try {
        const usuariosSnapshot = await db.collection('usuarios').orderBy('pontosFidelidade', 'desc').limit(10).get();
        const ranking = [];
        
        usuariosSnapshot.forEach(doc => {
            const user = doc.data();
            ranking.push({
                uid: doc.id,
                nome: user.nome,
                pontos: user.pontosFidelidade || 0
            });
        });

        // Salva o ranking em um documento específico para fácil acesso
        await db.collection('config').doc('rankingSemanal').set({
            ranking: ranking,
            atualizadoEm: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log('Ranking semanal de fidelidade foi atualizado com sucesso.');

    } catch (error) {
        console.error('Erro ao calcular o ranking semanal:', error);
    }
}


// =================================================================
// ============== FIM DAS NOVAS IMPLEMENTAÇÕES =====================
// =================================================================


// --- FUNÇÃO PARA VERIFICAR PENDÊNCIAS (ADMIN) ---
async function verificarPendencias() {
    try {
        const depositosPendentes = await db.collection('depositos').where('status', '==', 'pendente').get();
        const saquesPendentes = await db.collection('saques').where('status', '==', 'pendente').get();

        const numDepositos = depositosPendentes.size;
        const numSaques = saquesPendentes.size;

        if (numDepositos > 0 || numSaques > 0) {
            const title = "Alerta de Transações Pendentes!";
            let body = "";
            if (numDepositos > 0) body += `Há ${numDepositos} depósito(s) pendente(s). `;
            if (numSaques > 0) body += `Há ${numSaques} saque(s) pendente(s).`;

            const adminUsersSnapshot = await db.collection('usuarios').where('tipo', '==', 'admin').get();
            if (adminUsersSnapshot.empty) {
                console.log('Nenhum administrador encontrado para notificar.');
                return;
            }

            const adminTokens = [];
            adminUsersSnapshot.forEach(doc => {
                const userData = doc.data();
                if (userData.fcmTokens && userData.fcmTokens.length > 0) {
                    adminTokens.push(...userData.fcmTokens);
                }
            });

            if (adminTokens.length > 0) {
                const uniqueTokens = [...new Set(adminTokens)]; // Garante que não há tokens duplicados
                const message = {
                    notification: { title, body },
                    tokens: uniqueTokens,
                    webpush: { notification: { icon: '/icone.png' } }
                };
                await admin.messaging().sendEachForMulticast(message);
                console.log('Notificação de pendências de SAQUE/DEPÓSITO enviada para todos os admins.');
            }
        }
    } catch (error) {
        console.error('Erro ao verificar pendências de SAQUE/DEPÓSITO:', error);
    }
}

// ALTERAÇÃO INICIADA: Nova função para notificar barbeiros sobre agendamentos pendentes
async function verificarAgendamentosPendentes() {
    try {
        const agendamentosPendentesSnapshot = await db.collection('agendamentos').where('status', '==', 'pendente').get();

        if (agendamentosPendentesSnapshot.empty) {
            // console.log('Nenhum agendamento pendente encontrado.');
            return;
        }

        const barbeirosParaNotificar = {};

        // Agrupa os agendamentos por barbeiro
        agendamentosPendentesSnapshot.forEach(doc => {
            const agendamento = doc.data();
            const barbeiroUid = agendamento.barbeiroUid;
            if (barbeiroUid) {
                if (!barbeirosParaNotificar[barbeiroUid]) {
                    barbeirosParaNotificar[barbeiroUid] = 0;
                }
                barbeirosParaNotificar[barbeiroUid]++;
            }
        });

        // Envia uma notificação para cada barbeiro com a contagem de agendamentos
        for (const barbeiroUid in barbeirosParaNotificar) {
            const count = barbeirosParaNotificar[barbeiroUid];
            const userDoc = await db.collection('usuarios').doc(barbeiroUid).get();

            if (userDoc.exists) {
                const userData = userDoc.data();
                const fcmTokens = userData.fcmTokens || [];
                
                if (fcmTokens.length > 0) {
                    const title = "⏰ Agendamentos Pendentes!";
                    const body = `Você tem ${count} agendamento(s) aguardando sua aprovação.`;
                    
                    const message = {
                        notification: { title, body },
                        tokens: fcmTokens,
                        webpush: { notification: { icon: '/icone.png' } }
                    };

                    await admin.messaging().sendEachForMulticast(message);
                    console.log(`Notificação de agendamento pendente enviada para o barbeiro ${barbeiroUid}.`);
                }
            }
        }

    } catch (error) {
        console.error('Erro ao verificar e notificar agendamentos pendentes:', error);
    }
}
// ALTERAÇÃO FINALIZADA


// Agendadores que rodam a cada minuto
setInterval(verificarPendencias, 60000);
// ALTERAÇÃO INICIADA: Adicionado novo agendador para barbeiros
setInterval(verificarAgendamentosPendentes, 60000);
// ALTERAÇÃO FINALIZADA

// NOVOS AGENDADORES
setInterval(verificarLembretesDeAgendamento, 15 * 60 * 1000); // Roda a cada 15 minutos
setInterval(postarMensagemDiariaBlog, 24 * 60 * 60 * 1000); // Roda a cada 24 horas
setInterval(calcularRankingSemanal, 7 * 24 * 60 * 60 * 1000); // Roda a cada 7 dias


// --- INICIAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    // Roda as funções uma vez na inicialização para garantir que os dados estejam frescos
    postarMensagemDiariaBlog();
    calcularRankingSemanal();
});
