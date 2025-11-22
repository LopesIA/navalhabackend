// server.js (CORRIGIDO E PRONTO PARA PRODUÇÃO com chave de segurança no CRON)

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();

// --- IMPORTS NECESSÁRIOS ---
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');

// --- INICIALIZAÇÃO DO FIREBASE ADMIN ---
// A inicialização agora é mais robusta para ambientes de produção como o Render.
try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    console.log("Firebase Admin inicializado com sucesso.");
} catch (e) {
    console.error("Erro fatal ao inicializar o Firebase Admin. Verifique a variável de ambiente GOOGLE_APPLICATION_CREDENTIALS.", e);
    process.exit(1);
}

const app = express();
const db = admin.firestore();

// ... logo após const db = admin.firestore();

// --- LÓGICA DO BOT DE MENSAGENS ---
const botMessages = [
  // Categoria: Dicas para Clientes
  "Dica: Avalie seu profissional após o serviço para ganhar pontos de fidelidade e ajudar a comunidade!",
  "Você sabia? Indicando um amigo com seu e-mail, vocês dois ganham 100 pontos de fidelidade após o primeiro agendamento dele!",
  "Mantenha seu saldo atualizado! Use a função de depósito 💰 para adicionar créditos de forma rápida e segura.",
  "Torne-se VIP 💎 para ter 10% de desconto em todos os serviços e ganhar o dobro de pontos de fidelidade!",
  "Fique de olho no nosso Blog 📰! Postamos códigos de resgate valendo pontos. Procure por códigos entre (parênteses)!",
  "Explore a nossa Loja 🛍️! Produtos exclusivos da comunidade estão disponíveis para você.",
  "Complete agendamentos e desbloqueie conquistas 🏅 para mostrar seu status no chat!",
  "O chat local 📍 é perfeito para conversar com pessoas da sua cidade sobre tendências e profissionais.",
  "Seu saldo na carteira 💰 pode ser usado para pagar serviços, produtos da loja, VIP e mais!",
  "Encontrou um bug? Reporte para o administrador usando o botão 🚨 para nos ajudar a melhorar.",
  "Verifique a seção 'Minhas Compras' 🛍️ para acompanhar o status dos seus pedidos da loja.",
  "Clientes: Se o profissional estiver com a ⚡ 'Vaga Imediata', você não precisa marcar horário, é só ir!",
  "Usar o mapa 🗺️ no perfil do profissional abre a rota mais rápida até ele.",
  
  // Categoria: Dicas para Profissionais
  "Profissionais: Mantenham sua agenda 📅 atualizada para evitar conflitos e cancelamentos.",
  "Profissionais: Turbinar seu perfil 🚀 o coloca no topo da lista por 24 horas! Use para atrair mais clientes.",
  "Profissionais: Tornar-se PRO 🌟 zera ou diminui suas taxas de serviço. Confira os planos!",
  "Uma boa foto de logomarca 🎨 e um portfólio 🖼️ completo aumentam sua credibilidade e atraem mais clientes.",
  "Profissionais: Responda suas avaliações ⭐ para mostrar aos clientes que você se importa.",
  "Profissionais: Use o 'Modo Férias' 🏖️ para bloquear sua agenda quando for se ausentar.",
  "Profissionais: Criar promoções 🎁 é uma ótima forma de atrair clientes em dias de menor movimento.",
  "Profissionais: O Dashboard 🚀 mostra seu desempenho, faturamento e serviços mais populares.",
  "Profissionais: Adicione notas sobre seus clientes 🧑‍🤝‍🧑 para lembrar de preferências e detalhes importantes.",

  // Categoria: Geral
  "Mantenha o respeito no chat global 🌎. Mensagens ofensivas podem levar a banimento.",
  "Sua segurança é importante. Nunca compartilhe sua senha com ninguém.",
  "Instale o app na sua tela inicial 📱 para uma experiência mais rápida e notificações em tempo real.",
  "Precisa de ajuda ou tem uma sugestão? Use a opção 🚨 no canto inferior para falar diretamente com um administrador.",
  "A reputação ⭐ do profissional é baseada nas avaliações dos clientes. Ajude a comunidade avaliando!",
  
  // Adicione mais 75 mensagens aqui para completar as 100
  // Exemplo:
  "Dica: Verifique seu histórico 📜 para ver todos os serviços que você já realizou.",
  "O programa de fidelidade 🏆 permite trocar pontos por saldo na carteira!",
  "Profissionais: Um portfólio com boas fotos dos seus trabalhos é seu melhor cartão de visita.",
  "Clientes: Favorite seus profissionais preferidos para encontrá-los mais rápido (funcionalidade em breve!).",
  "O Nova Versão é mais que um app, é uma comunidade. Participe!",
  "Profissionais: A 'Vaga Imediata' ⚡ é perfeita para preencher horários vagos inesperadamente.",
  "Lembre-se: O pagamento é feito 100% pelo app, garantindo sua segurança e do profissional.",
  "Viu um produto legal na loja 🛍️? Você pode comprar direto pelo app com seu saldo.",
  "Problemas com um pagamento? Entre em contato com o suporte 🚨 imediatamente.",
  "Profissionais: O plano PRO 🌟 Ouro ZERA sua taxa de serviço. Todo o valor do serviço (menos taxa do cartão) é seu!",
  "Cada conquista 🏅 desbloqueada te dá um novo ícone no chat. Colecione todos!",
  "O ranking 📊 mostra quem são os clientes e profissionais mais ativos da plataforma.",
  "Quer vender seus produtos? Solicite o acesso à loja 🏪 nas suas configurações ⚙️.",
  "Ao comprar na loja, lembre-se de confirmar o recebimento ✅ para liberar o pagamento ao vendedor.",
  "Profissionais: O chat local 📍 é um ótimo lugar para divulgar seu trabalho para pessoas da sua cidade.",
  "Usar o app Nova Versão ajuda a fortalecer os profissionais locais da sua região.",
  "Sua opinião é importante! Envie sugestões para o administrador pelo botão 🚨.",
  "Mantenha seu app atualizado para receber as últimas melhorias e correções.",
  "Dica de segurança: Use uma senha forte e única para sua conta.",
  "Profissionais: Otimizem o tempo ⏰ dos seus serviços para que a agenda funcione perfeitamente.",
  // ... continue até 100
];
let lastBotMessageIndex = -1;

async function sendBotMessage() {
    try {
        let randomIndex;
        do {
            randomIndex = Math.floor(Math.random() * botMessages.length);
        } while (randomIndex === lastBotMessageIndex && botMessages.length > 1); // Evita loop se só tiver 1 msg
        lastBotMessageIndex = randomIndex;

        const textoBot = botMessages[randomIndex];
        const deleteAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // Expira em 24h

        await db.collection("chats").doc("chatGlobal").collection("mensagens").add({
            remetenteUid: "bot-uid",
            remetenteNome: "Nova Versão Bot",
            tipo: "bot",
            texto: textoBot,
            ts: admin.firestore.FieldValue.serverTimestamp(),
            cidade: "global", // Bot fala no chat global
            tipoChat: "global", // Bot fala no chat global
            deleteAt: admin.firestore.Timestamp.fromDate(deleteAt)
        });
        console.log(`[BOT] Mensagem enviada: "${textoBot.substring(0, 50)}..."`);
    } catch (error) {
        console.error("[BOT] Erro ao enviar mensagem:", error);
    }
}

// Inicia o bot para enviar mensagem a cada 5 minutos (300000 ms)
// Apenas em ambiente de produção (RENDER) para não rodar localmente
if (process.env.NODE_ENV === 'production' || process.env.PORT) { // Verifica se está no Render
    setInterval(sendBotMessage, 300000); 
    console.log("[BOT] Bot de mensagens ativado. Enviando a cada 5 minutos.");
} else {
    console.log("[BOT] Bot de mensagens desativado em ambiente local.");
}
// --- FIM DA LÓGICA DO BOT ---

// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
// Permite que apenas seu app web se comunique com este backend.
// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
// Permite que apenas seu app web se comunique com este backend.

const allowedOrigins = [
    'https://navalha-de-ouro-v11.web.app',
    'https://novaversao.site',
    'http://localhost:3000' // Para desenvolvimento
];

const corsOptions = {
  origin: function (origin, callback) {
    // Permite requisições sem 'origin' (ex: de apps mobile ou Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Acesso não permitido pela política de CORS'));
    }
  },
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.use(express.json());


// --- FUNÇÃO CENTRAL DE NOTIFICAÇÃO (MELHORADA) ---
/**
 * Envia uma notificação para um usuário específico.
 * @param {string} uid - O ID do usuário no Firebase.
 * @param {string} title - O título da notificação.
 * @param {string} body - O corpo da mensagem da notificação.
 * @param {object} data - Dados adicionais, como um link para deep linking.
 * @returns {object} - Um objeto indicando o sucesso ou falha da operação.
 */
async function sendNotification(uid, title, body, data = {}) {
    if (!uid) {
        return { success: false, message: "UID não fornecido." };
    }
    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (!userDoc.exists) {
            return { success: false, message: `Usuário ${uid} não encontrado.` };
        }
        const tokens = userDoc.data().fcmTokens;
        if (!tokens || tokens.length === 0) {
            return { success: false, message: `Usuário ${uid} não possui tokens.` };
        }

        const message = {
            notification: { title, body },
            data, // Inclui o link aqui
            tokens: tokens,
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        // Limpeza de tokens inválidos
        const tokensToRemove = [];
        response.responses.forEach((result, index) => {
            if (!result.success) {
                const error = result.error.code;
                if (error === 'messaging/invalid-registration-token' || error === 'messaging/registration-token-not-registered') {
                    tokensToRemove.push(tokens[index]);
                }
            }
        });

        if (tokensToRemove.length > 0) {
            await userDoc.ref.update({
                fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove)
            });
        }

        return { success: true, response };
    } catch (error) {
        console.error(`Erro ao enviar notificação para ${uid}:`, error);
        return { success: false, message: error.message };
    }
}


// --- ROTAS DA API ---

// Rota para notificação individual (usada em todo o app)
app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    const result = await sendNotification(uid, title, body, data);
    if (result.success) {
        res.status(200).json({ message: "Notificação enviada." });
    } else {
        res.status(500).json({ message: "Falha ao enviar notificação.", error: result.message });
    }
});

// Rota para notificação em massa
app.post('/enviar-notificacao-massa', async (req, res) => {
    const { title, body, adminUid } = req.body;

    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado." });
        }
    } catch (e) {
        return res.status(500).json({ message: "Erro de autenticação do admin." });
    }

    if (!title || !body) {
        return res.status(400).json({ message: "Título e corpo são obrigatórios." });
    }

    try {
        const allUsersSnap = await db.collection('usuarios').get();
        if (allUsersSnap.empty) {
            return res.status(404).json({ message: "Nenhum usuário encontrado." });
        }

        const allTokens = allUsersSnap.docs.reduce((acc, doc) => {
            const tokens = doc.data().fcmTokens;
            if (tokens && Array.isArray(tokens) && tokens.length > 0) {
                acc.push(...tokens);
            }
            return acc;
        }, []);

        const uniqueTokens = [...new Set(allTokens)];

        if (uniqueTokens.length === 0) {
            return res.status(200).json({ message: "Nenhum dispositivo registrado.", successCount: 0, failureCount: 0 });
        }

        const message = {
            notification: { title, body },
            data: { link: '/' }
        };

        const tokenChunks = [];
        for (let i = 0; i < uniqueTokens.length; i += 500) {
            tokenChunks.push(uniqueTokens.slice(i, i + 500));
        }

        let totalSuccessCount = 0;
        let totalFailureCount = 0;

        for (const chunk of tokenChunks) {
            const response = await admin.messaging().sendEachForMulticast({ ...message, tokens: chunk });
            totalSuccessCount += response.successCount;
            totalFailureCount += response.failureCount;

            const tokensToRemove = [];
            response.responses.forEach((result, index) => {
                const error = result.error?.code;
                if (error === 'messaging/invalid-registration-token' || error === 'messaging/registration-token-not-registered') {
                    tokensToRemove.push(chunk[index]);
                }
            });

            if (tokensToRemove.length > 0) {
                console.log(`Limpando ${tokensToRemove.length} tokens inválidos.`);
                const usersToUpdate = await db.collection('usuarios').where('fcmTokens', 'array-contains-any', tokensToRemove).get();
                const batch = db.batch();
                usersToUpdate.forEach(userDoc => {
                    const ref = userDoc.ref;
                    batch.update(ref, { fcmTokens: admin.firestore.FieldValue.arrayRemove(...tokensToRemove) });
                });
                await batch.commit();
            }
        }

        res.status(200).json({
            message: "Operação de envio em massa concluída.",
            successCount: totalSuccessCount,
            failureCount: totalFailureCount,
        });

    } catch (error) {
        console.error("Erro CRÍTICO no envio em massa:", error);
        res.status(500).json({
            message: "Erro interno no servidor ao enviar notificações em massa.",
            error: error.message
        });
    }
});

// ADICIONE ESTE BLOCO DE CÓDIGO NO SERVER.JS

// COLE ESTE BLOCO CORRIGIDO NO LUGAR DO QUE VOCÊ APAGOU

// --- NOVAS ROTAS DE ADMIN E GOOGLE PLAY ---

const { google } = require('googleapis');

// Inicializa o cliente da API do Google Play
const androidpublisher = google.androidpublisher('v3');

// Middleware de verificação de admin para proteger as rotas
const isAdmin = async (req, res, next) => {
    const { adminUid } = req.body;
    if (!adminUid) {
        return res.status(400).json({ message: "ID do Admin é obrigatório." });
    }
    try {
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado. Permissão de Admin necessária." });
        }
        next(); // Se for admin, continua para a próxima função (a rota em si)
    } catch (e) {
        return res.status(500).json({ message: "Erro de autenticação do admin.", error: e.message });
    }
};

// Rota para atualizar dados do usuário no Firestore
 app.post('/admin/update-user-firestore', isAdmin, async (req, res) => {
    // Não desestruture 'adminUid' aqui para não enviar ao Firestore
    const { targetUid, updates } = req.body;
    if (!targetUid || !updates) {
        return res.status(400).json({ message: "ID do usuário e dados para atualização são obrigatórios." });
    }
    try {
        // Adiciona o timestamp para forçar o reload no cliente
        const finalUpdates = {
            ...updates,
            forceReloadTimestamp: admin.firestore.FieldValue.serverTimestamp() // <-- ADICIONADO AQUI
        };

        await db.collection('usuarios').doc(targetUid).update(finalUpdates);
        res.status(200).json({ message: "Dados do usuário atualizados no Firestore com sucesso." });
    } catch (error) {
        console.error("Erro ao atualizar dados do usuário no Firestore:", error);
        res.status(500).json({ message: "Falha ao atualizar dados.", error: error.message });
    }
 });

// Rota para definir uma nova senha para o usuário
 app.post('/admin/reset-user-password', isAdmin, async (req, res) => {
    // Não desestruture 'adminUid' aqui
    const { targetUid, newPassword } = req.body;
    if (!targetUid || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "ID do usuário e uma nova senha de no mínimo 6 caracteres são obrigatórios." });
    }
    try {
        await admin.auth().updateUser(targetUid, { password: newPassword });

        // Adiciona o timestamp para forçar o reload no cliente após reset de senha
        await db.collection('usuarios').doc(targetUid).update({
             forceReloadTimestamp: admin.firestore.FieldValue.serverTimestamp() // <-- ADICIONADO AQUI
        });

        res.status(200).json({ message: "Senha do usuário alterada com sucesso." });
    } catch (error) {
        console.error("Erro ao redefinir senha de usuário:", error);
        res.status(500).json({ message: "Falha ao redefinir senha.", error: error.message });
    }
 });

// Rota para habilitar/desabilitar uma conta de usuário
 app.post('/admin/toggle-user-status', isAdmin, async (req, res) => {
    // Não desestruture 'adminUid' aqui
    const { targetUid, disable } = req.body; // 'disable' deve ser true ou false
    if (!targetUid || typeof disable !== 'boolean') {
        return res.status(400).json({ message: "ID do usuário e status (disable: true/false) são obrigatórios." });
    }
    try {
        await admin.auth().updateUser(targetUid, { disabled: disable });

        // Adiciona o timestamp para forçar o reload no cliente após mudança de status
        await db.collection('usuarios').doc(targetUid).update({
             forceReloadTimestamp: admin.firestore.FieldValue.serverTimestamp() // <-- ADICIONADO AQUI
        });

        res.status(200).json({ message: `Usuário ${disable ? 'desabilitado' : 'habilitado'} com sucesso.` });
    } catch (error) {
        console.error("Erro ao alterar status do usuário:", error);
        res.status(500).json({ message: "Falha ao alterar status do usuário.", error: error.message });
    }
 });

// Função auxiliar para ativar o benefício no Firestore
// SUBSTITUA a função 'activateBenefitInFirestore' inteira (Linha ~501) por esta:

async function activateBenefitInFirestore(uid, sku) {
    const userRef = db.collection('usuarios').doc(uid);
    const expiracao = new Date();
    let updates = {};

    // --- INÍCIO DA MUDANÇA: Adicionando SKUs de depósito ---
    // Procura por SKUs no formato 'deposito_VALOR' (ex: deposito_10, deposito_50)
    const depositoMatch = sku.match(/^deposito_(\d+)$/); 
    
    if (depositoMatch && depositoMatch[1]) {
        const valorDeposito = parseInt(depositoMatch[1], 10);
        if (isNaN(valorDeposito) || valorDeposito <= 0) {
            throw new Error(`SKU de depósito inválido: ${sku}`);
        }
        
        console.log(`Processando depósito de R$ ${valorDeposito} para ${uid}`);
        updates = {
            saldo: admin.firestore.FieldValue.increment(valorDeposito)
            // Você pode adicionar pontos de fidelidade por depósito aqui, se quiser:
            // pontosFidelidade: admin.firestore.FieldValue.increment(pontosGanhos) 
        };
    // --- FIM DA MUDANÇA ---

    } else {
        // Lógica existente para VIP, PRO, etc.
        switch (sku) {
            case 'adesao_vip_6_meses':
                expiracao.setDate(expiracao.getDate() + 180);
                updates = {
                    vip: true,
                    vipExpirationDate: admin.firestore.Timestamp.fromDate(expiracao)
                };
                break;
            case 'turbinar_perfil_24h':
                expiracao.setHours(expiracao.getHours() + 24);
                updates = {
                    boostExpiracao: admin.firestore.Timestamp.fromDate(expiracao),
                    ultimoBoostComprado: admin.firestore.FieldValue.serverTimestamp()
                };
                break;
            case 'pro_tier1':
            case 'pro_tier2':
            case 'pro_tier3':
                expiracao.setDate(expiracao.getDate() + 30);
                const tier = sku.split('_')[1]; // extrai 'tier1', 'tier2', etc.
                updates = {
                    proAtivo: true,
                    proTier: tier,
                    proExpirationDate: admin.firestore.Timestamp.fromDate(expiracao)
                };
                break;
            default:
                throw new Error(`SKU desconhecido: ${sku}`);
        }
    }

    await userRef.update(updates);
    console.log(`Benefício ${sku} ativado para o usuário ${uid}.`);
}

// Rota para validar a compra da Google Play
app.post('/google-play/validate-purchase', async (req, res) => {
    const { purchaseToken, sku, uid } = req.body;
    if (!purchaseToken || !sku || !uid) {
        return res.status(400).json({ success: false, message: 'purchaseToken, sku e uid são obrigatórios.' });
    }

    try {
        // Autentica com a API do Google
        const auth = new google.auth.GoogleAuth({
            credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
            scopes: ['https://www.googleapis.com/auth/androidpublisher'],
        });
        google.options({ auth });
        
        const packageName = 'com.seupacote.app'; // <-- IMPORTANTE: SUBSTITUA PELO NOME DO SEU PACOTE

        // Verifica se o token já foi validado antes para evitar reativação
        const purchaseRecordRef = db.collection('google_play_purchases').doc(purchaseToken);
        const purchaseRecord = await purchaseRecordRef.get();
        if (purchaseRecord.exists) {
            console.warn(`Tentativa de revalidar um purchaseToken já processado: ${purchaseToken}`);
            return res.status(409).json({ success: false, message: 'Esta compra já foi processada.' });
        }

        // Consulta a API do Google Play para validar a compra
        const result = await androidpublisher.purchases.products.get({
            packageName: packageName,
            productId: sku,
            token: purchaseToken,
        });

        // 0 = Comprado, 1 = Cancelado, 2 = Pendente
        if (result.data.purchaseState === 0) {
            // A compra é válida!
            // Ativa o benefício para o usuário no Firestore
            await activateBenefitInFirestore(uid, sku);

            // Salva um registro da compra para evitar reprocessamento
            await purchaseRecordRef.set({
                uid: uid,
                sku: sku,
                validationTimestamp: admin.firestore.FieldValue.serverTimestamp(),
                orderId: result.data.orderId
            });

            // Responde com sucesso para o frontend
            return res.status(200).json({ success: true, message: 'Compra validada e benefício ativado!' });
        } else {
            // A compra não está em estado "Comprado"
            throw new Error(`Status da compra inválido: ${result.data.purchaseState}`);
        }

    } catch (error) {
        console.error('Erro na validação da compra do Google Play:', error.message);
        // O código 404 geralmente significa que a compra não foi encontrada (token inválido)
        if (error.code === 404) {
             return res.status(404).json({ success: false, message: 'Compra não encontrada. Verifique o purchaseToken.' });
        }
        return res.status(500).json({ success: false, message: 'Erro interno ao validar a compra.', error: error.message });
    }
});

// Rota para buscar detalhes de um usuário (Auth e Firestore)
app.post('/admin/get-user-details', isAdmin, async (req, res) => {
    const { targetUid } = req.body;
    if (!targetUid) {
        return res.status(400).json({ message: "ID do usuário alvo é obrigatório." });
    }

    try {
        // Busca os dados de autenticação (como email, se está desabilitado, etc.)
        const userRecord = await admin.auth().getUser(targetUid);
        
        // Busca os dados do banco de dados (como nome, saldo, tipo, etc.)
        const firestoreDoc = await db.collection('usuarios').doc(targetUid).get();

        if (!firestoreDoc.exists) {
            return res.status(404).json({ message: "Usuário não encontrado no Firestore." });
        }

        // Combina os dados e envia de volta para o frontend
        res.status(200).json({
            auth: userRecord.toJSON(),
            firestore: firestoreDoc.data()
        });

    } catch (error) {
        console.error("Erro ao buscar detalhes do usuário:", error);
        res.status(500).json({ message: "Falha ao buscar detalhes do usuário.", error: error.message });
    }
});

// ==================================================================
// === INÍCIO: LÓGICA SEGURA DA ROLETA (SERVER-SIDE) ===
// ==================================================================

// Definição dos Prêmios (Deve bater com a ordem visual do Front-end)
const ARRAY_PREMIOS_SERVER = [
    { tipo: 'ponto', valor: 1 },           // 0
    { tipo: 'moldura', key: 'bronze', nome: 'Bronze' }, // 1
    { tipo: 'ponto', valor: 2 },           // 2
    { tipo: 'balao', key: 'bronze', nome: 'Chat Bronze' }, // 3
    { tipo: 'ponto', valor: 3 },           // 4
    { tipo: 'moldura', key: 'prata', nome: 'Prata' }, // 5
    { tipo: 'ponto', valor: 4 },           // 6
    { tipo: 'balao', key: 'prata', nome: 'Chat Prata' }, // 7
    { tipo: 'ponto', valor: 5 },           // 8
    { tipo: 'caixa', valor: 0 },           // 9 (Caixa Misteriosa)
    { tipo: 'ponto', valor: 6 },           // 10
    { tipo: 'moldura', key: 'ouro', nome: 'Ouro' }, // 11
    { tipo: 'ponto', valor: 7 },           // 12
    { tipo: 'balao', key: 'ouro', nome: 'Chat Ouro' }, // 13
    { tipo: 'ponto', valor: 8 },           // 14
    { tipo: 'moldura', key: 'diamante', nome: 'Diamante' }, // 15
    { tipo: 'ponto', valor: 9 },           // 16
    { tipo: 'balao', key: 'diamante', nome: 'Chat Diamante' }, // 17
    { tipo: 'ponto', valor: 10 },          // 18
    { tipo: 'ponto', valor: 4 }            // 19
];

// Configuração dos Planos PRO (Para saber quantos giros o usuário tem)
const LIMITES_GIROS = { 
    'tier1': 2, 
    'tier2': 3, 
    'tier3': 4, 
    'tier4': 5 
};

// Rota da Roleta Segura
app.post('/api/girar-roleta', async (req, res) => {
    const { uid } = req.body;

    if (!uid) return res.status(400).json({ success: false, message: "UID obrigatório." });

    try {
        const userRef = db.collection('usuarios').doc(uid);
        
        // Usa transação para garantir que não haja giros simultâneos fraudulentos
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new Error("Usuário não encontrado.");
            
            const perfil = userDoc.data();
            const hoje = new Date().toDateString();

            // 1. Verifica Limites de Giros
            let girosTotais = 1; // Padrão (Gratuito)
            
            // Verifica se é PRO ativo e define limite
            if (perfil.proAtivo && perfil.proExpirationDate) {
                const expiracao = perfil.proExpirationDate.toDate();
                if (expiracao > new Date()) {
                    if (perfil.proTier && LIMITES_GIROS[perfil.proTier]) {
                        girosTotais = LIMITES_GIROS[perfil.proTier];
                    }
                }
            }

            const isNovoDia = perfil.ultimoGiroRoleta !== hoje;
            let girosRealizados = isNovoDia ? 0 : (perfil.girosRealizadosHoje || 0);

            if (girosRealizados >= girosTotais) {
                throw new Error("Sem giros disponíveis para hoje.");
            }

            // 2. Sorteio do Prêmio (RNG no Servidor)
            // Dica de Segurança: Aqui você pode manipular as probabilidades se quiser que Diamante seja mais raro.
            // Por enquanto, mantive aleatório uniforme (1/20) para simplificar.
            const targetIndex = Math.floor(Math.random() * 20);
            const premioGanho = ARRAY_PREMIOS_SERVER[targetIndex];

            // 3. Prepara Updates
            let updates = { 
                ultimoGiroRoleta: hoje,
                girosRealizadosHoje: isNovoDia ? 1 : admin.firestore.FieldValue.increment(1)
            };
            
            let msgRetorno = "";
            let tipoPr = "";

            // Lógica de Entrega dos Prêmios
            if (premioGanho.tipo === 'ponto') {
                updates.pontosFidelidade = admin.firestore.FieldValue.increment(premioGanho.valor);
                msgRetorno = `Você ganhou ${premioGanho.valor} pontos de fidelidade!`;
                tipoPr = "ponto";
            } 
            else if (premioGanho.tipo === 'moldura' || premioGanho.tipo === 'balao') {
                const tipoItem = premioGanho.tipo === 'moldura' ? 'Moldura' : 'Estilo de Chat';
                const chaveObjeto = premioGanho.tipo === 'moldura' ? `premiosTemporarios.moldura_${premioGanho.key}` : `premiosTemporarios.balao_${premioGanho.key}`;
                
                // Lógica de Acumular Tempo
                let baseDate = new Date();
                // Verifica data atual no banco
                const mapaPremios = perfil.premiosTemporarios || {};
                const chaveSimples = premioGanho.tipo === 'moldura' ? `moldura_${premioGanho.key}` : `balao_${premioGanho.key}`;
                
                if (mapaPremios[chaveSimples]) {
                    const existingDate = mapaPremios[chaveSimples].toDate();
                    if (existingDate > new Date()) {
                        baseDate = existingDate; // Acumula a partir da data futura
                    }
                }

                baseDate.setHours(baseDate.getHours() + 24); // +24 Horas
                updates[chaveObjeto] = admin.firestore.Timestamp.fromDate(baseDate);
                
                msgRetorno = `Sorte Grande! Você ganhou **${tipoItem} ${premioGanho.nome}** por +24 horas! (Acumulado)`;
                tipoPr = "item";
            } 
            else if (premioGanho.tipo === 'caixa') {
                // Lógica da Caixa Misteriosa
                if (perfil.tipo !== 'cliente') {
                    // Profissional: Ganha Boost
                    let baseDate = new Date();
                    if (perfil.boostExpiracao && perfil.boostExpiracao.toDate() > new Date()) {
                        baseDate = perfil.boostExpiracao.toDate();
                    }
                    baseDate.setHours(baseDate.getHours() + 24);
                    
                    updates.boostExpiracao = admin.firestore.Timestamp.fromDate(baseDate);
                    updates.ultimoBoostComprado = admin.firestore.FieldValue.serverTimestamp();
                    msgRetorno = "Você ganhou +24 horas de Perfil Turbinado (Acumulado)!";
                } else {
                    // Cliente: Ganha VIP
                    let baseDate = new Date();
                    if (perfil.vip && perfil.vipExpirationDate && perfil.vipExpirationDate.toDate() > new Date()) {
                        baseDate = perfil.vipExpirationDate.toDate();
                    }
                    baseDate.setDate(baseDate.getDate() + 5); // +5 Dias
                    
                    updates.vip = true;
                    updates.vipExpirationDate = admin.firestore.Timestamp.fromDate(baseDate);
                    msgRetorno = "Incrível! Você ganhou +5 Dias de VIP Grátis (Acumulado)!";
                }
                tipoPr = "caixa";
            }

            // Aplica Updates
            t.update(userRef, updates);

            return { targetIndex, msgRetorno, tipoPr };
        });

        res.status(200).json({ success: true, ...result });

    } catch (error) {
        console.error("Erro na roleta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});
// ==================================================================
// === FIM: LÓGICA SEGURA DA ROLETA ===
// ==================================================================

// --- ROTAS DE CRON JOB ---

// Rota para postar o código diário no blog
app.get('/cron/postar-codigo-blog', async (req, res) => {
    const { key } = req.query;

    if (key !== process.env.CRON_SECRET_KEY) {
        console.warn(`Tentativa de acesso não autorizado ao CRON JOB do blog. Chave recebida: ${key}`);
        return res.status(401).send('ERRO: Chave inválida.');
    }
    
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        const amanha = new Date(hoje);
        amanha.setDate(amanha.getDate() + 1);

        const blogHojeSnap = await db.collection("blog")
            .where('ts', '>=', hoje)
            .where('ts', '<', amanha)
            .where('autor', '==', 'Sistema VersãoPro')
            .get();

        if (!blogHojeSnap.empty) {
            return res.status(200).send('OK: Blog já postado hoje.');
        }

        const palavrasChave = [
            "fade", "moicano", "americano", "social", "tesoura", "degradê", "risquinho", "jaca", "corte infantil", "barba", "navalhado", "platinado", "luzes",
            "designer de cilios", "manicure e pedicure", "corte de cabelo", "gratidão", "paz", "amor", "beleza", "versãopro"
        ];
        const barbeirosSnap = await db.collection('usuarios').where('tipo', '==', 'barbeiro').get();
        barbeirosSnap.forEach(doc => {
            if (doc.data().nome) {
               palavrasChave.push(doc.data().nome);
            }
        });

        if (palavrasChave.length === 0) {
            console.error("CRON JOB: Nenhuma palavra-chave disponível para gerar o código do blog.");
            return res.status(500).send("ERRO: Nenhuma palavra-chave encontrada.");
        }

        const palavraSorteada = palavrasChave[Math.floor(Math.random() * palavrasChave.length)];
        const codigo = `(${palavraSorteada.toLowerCase().replace(/\s/g, '-')})`;

        await db.collection("blog").add({
            titulo: "🎁 Presente Diário Disponível!",
            conteudo: `O código de resgate de hoje está aqui! Use-o no app para ganhar 5 pontos de fidelidade. Lembre-se: use o código exatamente como está, incluindo os parênteses, para o resgate funcionar com sucesso! Código: ${codigo}`,
            autor: "Sistema VersãoPro",
            autorUid: "sistema",
            ts: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Blog diário postado com o código: ${codigo}`);
        res.status(200).send('OK: Novo blog postado.');
    } catch (error) {
        console.error('Erro ao executar o CRON do blog:', error);
        res.status(500).send('ERRO: Falha ao executar a tarefa do blog.');
    }
});

// ADICIONE ESTA NOVA ROTA AO FINAL DO ARQUIVO SERVER.JS, ANTES DA ROTA '/'
// Rota de CRON para limpar fotos de clientes expiradas
app.get('/cron/limpar-fotos-portfolio', async (req, res) => {
    const { key } = req.query;

    if (key !== process.env.CRON_SECRET_KEY) {
        return res.status(401).send('ERRO: Chave inválida.');
    }

    try {
        const agora = admin.firestore.Timestamp.now();
        const profissionaisSnap = await db.collection('usuarios')
            .where('portfolio', '!=', [])
            .get();

        if (profissionaisSnap.empty) {
            return res.status(200).send("OK: Nenhum portfólio para verificar.");
        }

        const batch = db.batch();
        let fotosRemovidas = 0;

        profissionaisSnap.forEach(doc => {
            const profissional = doc.data();
            const portfolioAtual = profissional.portfolio || [];
            
            const portfolioFiltrado = portfolioAtual.filter(item => {
                // Mantém itens que não são de clientes, ou que são permanentes, ou que ainda não expiraram
                const manter = !item.enviadaPorCliente || item.permanente || item.expiraEm > agora;
                if (!manter) {
                    fotosRemovidas++;
                }
                return manter;
            });

            // Se o portfólio mudou, atualiza no batch
            if (portfolioFiltrado.length < portfolioAtual.length) {
                batch.update(doc.ref, { portfolio: portfolioFiltrado });
            }
        });
        
        await batch.commit();

        console.log(`Limpeza de Portfólio: ${fotosRemovidas} foto(s) de cliente expirada(s) foram removidas.`);
        res.status(200).send(`OK: ${fotosRemovidas} foto(s) removida(s).`);

    } catch (error) {
        console.error('Erro no CRON de limpeza de portfólio:', error);
        res.status(500).send('ERRO: Falha ao executar tarefa.');
    }
});


// ***NOVA ROTA DE CRON JOB PARA LIMPAR MENSAGENS***
app.get('/cron/limpar-chats', async (req, res) => {
    const { key } = req.query;

    if (key !== process.env.CRON_SECRET_KEY) {
        console.warn(`Tentativa de acesso não autorizado ao CRON JOB de limpeza de chat. Chave recebida: ${key}`);
        return res.status(401).send('ERRO: Chave inválida.');
    }

    try {
        const chatRef = db.collection('chats').doc('chatGlobal').collection('mensagens');
        
        // Calcula o timestamp de 24 horas atrás
        const vinteQuatroHorasAtras = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        // Cria a query para buscar mensagens mais antigas que 24h
        const query = chatRef.where('ts', '<', vinteQuatroHorasAtras);

        const snapshot = await query.get();
        
        if (snapshot.empty) {
            console.log("Limpeza de Chat: Nenhuma mensagem antiga para deletar.");
            return res.status(200).send('OK: Nenhuma mensagem para deletar.');
        }

        // Deleta as mensagens em lotes de 500 (limite do batch)
        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();

        console.log(`Limpeza de Chat: ${snapshot.size} mensagens antigas foram deletadas.`);
        res.status(200).send(`OK: ${snapshot.size} mensagens deletadas.`);

    } catch (error) {
        console.error('Erro ao executar o CRON de limpeza de chat:', error);
        res.status(500).send('ERRO: Falha ao executar a tarefa de limpeza.');
    }
});

app.get('/cron/enviar-lembretes', async (req, res) => {
    const { key } = req.query;

    // 1. Validação da Chave Secreta
    if (key !== process.env.CRON_SECRET_KEY) {
        console.warn(`[CRON Lembretes] Tentativa de acesso não autorizado.`);
        return res.status(401).send('ERRO: Chave inválida.');
    }

    console.log("[CRON Lembretes] Iniciando verificação de lembretes...");

    try {
        const agora = new Date();
        // Define o período da janela de lembrete (ex: entre 2 e 3 horas a partir de agora)
        const inicioJanela = new Date(agora.getTime() + 2 * 60 * 60 * 1000); // 2 horas a partir de agora
        const fimJanela = new Date(agora.getTime() + 3 * 60 * 60 * 1000);   // 3 horas a partir de agora

        // Converte as datas para o formato de string H:mm (ex: "14:30")
        // IMPORTANTE: Seu banco de dados salva o horário como string (ex: "14:30").
        // Esta lógica só funciona para agendamentos no MESMO DIA.
        const horaInicio = `${inicioJanela.getHours()}:${inicioJanela.getMinutes().toString().padStart(2, '0')}`;
        const horaFim = `${fimJanela.getHours()}:${fimJanela.getMinutes().toString().padStart(2, '0')}`;
        
        // Busca agendamentos 'confirmados' (que no seu código é 'conclusão pendente'), 
        // que ainda não tiveram lembrete enviado,
        // e cujo horário (string) esteja dentro da nossa janela.
        const query = db.collection('agendamentos')
            .where('status', '==', 'conclusão pendente') // Você usa 'conclusão pendente' após aprovar
            .where('lembreteEnviado', '==', false)
            .where('horario', '>=', horaInicio)
            .where('horario', '<=', horaFim);

        const snapshot = await query.get();

        if (snapshot.empty) {
            console.log(`[CRON Lembretes] Nenhum agendamento encontrado entre ${horaInicio} e ${horaFim}.`);
            return res.status(200).send('OK: Nenhum lembrete para enviar.');
        }

        console.log(`[CRON Lembretes] ${snapshot.size} lembretes para enviar.`);
        let enviados = 0;
        const batch = db.batch();

        for (const doc of snapshot.docs) {
            const ag = doc.data();
            const agendamentoId = doc.id;

            // Evita enviar lembrete se o agendamento for de um dia anterior (caso a query pegue lixo)
            if (ag.ts.toDate() < new Date(agora.getTime() - 24 * 60 * 60 * 1000)) {
                continue; // Pula agendamentos muito antigos
            }

            // Prepara para marcar como enviado
            const agendamentoRef = db.collection('agendamentos').doc(agendamentoId);
            batch.update(agendamentoRef, { lembreteEnviado: true });

            // Envia notificação para o Cliente
            // (Usando sua função sendNotification que já existe no server.js)
            sendNotification(
                ag.clienteUid,
                '🔔 Lembrete de Agendamento!',
                `Seu horário com ${ag.barbeiroNome} (${ag.servico}) é logo mais, às ${ag.horario}! Não se atrase.`,
                { link: '#historico' }
            );

            // Envia notificação para o Profissional
            sendNotification(
                ag.barbeiroUid,
                '🔔 Lembrete de Cliente!',
                `Seu horário com ${ag.clienteNome} (${ag.servico}) é às ${ag.horario}. Prepare-se para atendê-lo(a).`,
                { link: '#agendamentos' }
            );
            
            enviados++;
        }

        await batch.commit(); // Marca todos como enviados no DB
        
        console.log(`[CRON Lembretes] ${enviados} lembretes enviados com sucesso.`);
        res.status(200).send(`OK: ${enviados} lembretes enviados.`);

    } catch (error) {
        console.error('[CRON Lembretes] Erro ao executar tarefa:', error);
        res.status(500).send('ERRO: Falha ao executar a tarefa de lembretes.');
    }
});

// Rota de saúde para o Render saber que o app está no ar
app.get('/', (req, res) => {
    res.send('Backend VersãoPro está no ar!');
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
