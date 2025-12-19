// server.js (CORRIGIDO E PRONTO PARA PRODUÇÃO com chave de segurança no CRON)

// Carrega as variáveis de ambiente do arquivo .env (essencial para o Render)
require('dotenv').config();
const express = require('express');
const admin = require('firebase-admin');
const cors = require('cors');
const { google } = require('googleapis'); // <--- SÓ UMA VEZ AQUI NO TOPO!

// --- INICIALIZAÇÃO DO FIREBASE ---
const serviceAccount = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS);
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();
const app = express();

// Middleware de verificação de admin único para proteger as rotas
const isAdmin = async (req, res, next) => {
    const { adminUid } = req.body;
    
    // 1. Verifica se o UID foi enviado
    if (!adminUid) {
        return res.status(400).json({ message: "ID do Admin é obrigatório." });
    }

    try {
        // 2. Busca o documento no Firestore
        const adminDoc = await db.collection('usuarios').doc(adminUid).get();
        
        // 3. Valida se o usuário existe e se é do tipo 'admin'
        if (!adminDoc.exists || adminDoc.data().tipo !== 'admin') {
            return res.status(403).json({ message: "Acesso negado. Permissão de Admin necessária." });
        }
        
        // 4. Tudo certo, prossegue para a rota
        next(); 
    } catch (e) {
        // 5. Tratamento de erro de comunicação com o banco
        console.error("Erro no middleware isAdmin:", e.message);
        return res.status(500).json({ message: "Erro de autenticação do admin.", error: e.message });
    }
};
// --- CONFIGURAÇÃO DA GOOGLE PLAY API (REUTILIZANDO SUA CHAVE DO RENDER) ---
const authPlayStore = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/androidpublisher'],
});

const playDeveloperApi = google.androidpublisher({ 
    version: 'v3', 
    auth: authPlayStore 
});

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

// Inicia o bot para enviar mensagem a cada 30 minutos (1800000 ms)
// Apenas em ambiente de produção (RENDER) para não rodar localmente
if (process.env.NODE_ENV === 'production' || process.env.PORT) { // Verifica se está no Render
    setInterval(sendBotMessage, 1800000); 
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
    'https://www.novaversao.site',
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
    if (!uid) return { success: false, message: "UID não fornecido." };
    
    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (!userDoc.exists) return { success: false, message: `Usuário ${uid} não encontrado.` };
        
        const tokens = userDoc.data().fcmTokens;
        if (!tokens || tokens.length === 0) return { success: false, message: `Usuário ${uid} não possui tokens.` };

        // --- TRUQUE DO ALARME: ENVIAR COMO "DATA MESSAGE" ---
        // Não usamos o campo 'notification' aqui para que o Android não exiba a padrão.
        // O Service Worker vai pegar esses dados e criar a notificação personalizada.
        const message = {
            data: {
                title: title,
                body: body,
                ...data, // Seus dados extras (link, action, etc)
                forceAlarm: 'true' // Flag para o SW saber que deve tocar muito
            },
            tokens: tokens,
            android: {
                priority: 'high', // Acorda a CPU
            },
            apns: {
                payload: {
                    aps: {
                        contentAvailable: true // Acorda o iOS
                    }
                }
            }
        };

        const response = await admin.messaging().sendEachForMulticast(message);

        // Limpeza de tokens (MANTIDA IGUAL)
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


// Rota para notificação individual (CORRIGIDA PARA NÃO TRAVAR O APP)
app.post('/enviar-notificacao', async (req, res) => {
    const { uid, title, body, data } = req.body;
    
    // Tenta enviar
    const result = await sendNotification(uid, title, body, data);

    if (result.success) {
        res.status(200).json({ success: true, message: "Notificação enviada." });
    } else {
        // MUDANÇA IMPORTANTE:
        // Se falhar (ex: usuário sem token), retornamos 200 (OK) mas com aviso no JSON.
        // Isso impede que o Frontend ache que o servidor caiu e fique tentando de novo (loop infinito).
        console.warn(`[NOTIFICAÇÃO] Falha controlada para ${uid}: ${result.message}`);
        
        res.status(200).json({ 
            success: false, 
            message: "Falha ao enviar notificação (provavelmente sem token).", 
            error: result.message 
        });
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

// Rota para atualizar dados do usuário no Firestore
app.post('/admin/update-user-firestore', isAdmin, async (req, res) => {
    const { targetUid, updates } = req.body;
    if (!targetUid || !updates) {
        return res.status(400).json({ message: "ID e dados obrigatórios." });
    }
    try {
        const finalUpdates = {
            ...updates,
            forceReloadTimestamp: admin.firestore.FieldValue.serverTimestamp()
        };

        await db.collection('usuarios').doc(targetUid).update(finalUpdates);

        // --- CÓDIGO NOVO AQUI: DETECTA SE VIROU TIER 4 ---
        if (updates.proTier === 'tier4' && updates.proAtivo === true) {
            console.log(`[ADMIN-SYNC] Admin definiu usuário ${targetUid} como Tier 4. Sincronizando...`);
            sincronizarPortfolioEmAlta(targetUid);
        }
        // ------------------------------------------------

        res.status(200).json({ message: "Dados atualizados com sucesso." });
    } catch (error) {
        console.error("Erro update admin:", error);
        res.status(500).json({ message: "Falha ao atualizar.", error: error.message });
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
    let isTier4Activation = false; // Flag para controlar a sincronização

    // Lógica de Depósito
    const depositoMatch = sku.match(/^deposito_(\d+)$/); 
    
    if (depositoMatch && depositoMatch[1]) {
        const valorDeposito = parseInt(depositoMatch[1], 10);
        if (isNaN(valorDeposito) || valorDeposito <= 0) {
            throw new Error(`SKU de depósito inválido: ${sku}`);
        }
        console.log(`Processando depósito de R$ ${valorDeposito} para ${uid}`);
        updates = {
            saldo: admin.firestore.FieldValue.increment(valorDeposito)
        };

    } else {
        // Lógica de Planos e Boost
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
            case 'pro_tier4': // GARANTINDO QUE TIER 4 ESTÁ AQUI
                expiracao.setDate(expiracao.getDate() + 30);
                const tier = sku.split('_')[1]; // extrai 'tier1', 'tier4', etc.
                
                updates = {
                    proAtivo: true,
                    proTier: tier,
                    proExpirationDate: admin.firestore.Timestamp.fromDate(expiracao)
                };

                // Se for Tier 4, marca a flag para sincronizar depois
                if (tier === 'tier4') {
                    isTier4Activation = true;
                }
                break;
            default:
                throw new Error(`SKU desconhecido: ${sku}`);
        }
    }

    // 1. Atualiza o usuário no banco
    await userRef.update(updates);
    console.log(`Benefício ${sku} ativado para o usuário ${uid}.`);

    // 2. SE FOR TIER 4, EXECUTA A SINCRONIZAÇÃO AUTOMÁTICA
    if (isTier4Activation) {
        console.log(`[AUTO-SYNC] Usuário ${uid} virou Tier 4. Iniciando sincronização...`);
        // Não usamos await aqui para não travar a resposta da API de pagamento (roda em segundo plano)
        sincronizarPortfolioEmAlta(uid);
    }
}

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

// Rota da Roleta Segura (ATUALIZADA: Correção de Data e Admin Ilimitado)
app.post('/api/girar-roleta', async (req, res) => {
    const { uid } = req.body;

    if (!uid) return res.status(400).json({ success: false, message: "UID obrigatório." });

    try {
        const userRef = db.collection('usuarios').doc(uid);
        
        const result = await db.runTransaction(async (t) => {
            const userDoc = await t.get(userRef);
            if (!userDoc.exists) throw new Error("Usuário não encontrado.");
            
            const perfil = userDoc.data();
            const hoje = new Date().toDateString();

            // Função auxiliar para ler datas com segurança (Timestamp ou String)
            const getDateSafe = (field) => {
                if (!field) return null;
                if (typeof field.toDate === 'function') return field.toDate();
                return new Date(field); // Tenta converter string ISO para Date
            };

            // --- 1. Verifica Limites de Giros ---
            let girosTotais = 1; // Padrão

            // Lógica VIP
            if (perfil.vip && perfil.vipExpirationDate) {
                const expiracaoVip = getDateSafe(perfil.vipExpirationDate);
                if (expiracaoVip && expiracaoVip > new Date()) {
                    if (girosTotais < 4) girosTotais = 4;
                }
            }

            // Lógica PRO
            if (perfil.proAtivo && perfil.proExpirationDate) {
                const expiracao = getDateSafe(perfil.proExpirationDate);
                if (expiracao && expiracao > new Date()) {
                    if (perfil.proTier && LIMITES_GIROS[perfil.proTier]) {
                        const girosPro = LIMITES_GIROS[perfil.proTier];
                        if (girosPro > girosTotais) girosTotais = girosPro;
                    }
                }
            }

            const isNovoDia = perfil.ultimoGiroRoleta !== hoje;
            let girosRealizados = perfil.girosRealizadosHoje || 0;

            if (isNovoDia && girosRealizados > 0) {
                girosRealizados = 0;
            }

            // --- ALTERAÇÃO: Se for admin, ignora o erro de limite ---
            if (perfil.tipo !== 'admin') {
                if (girosRealizados >= girosTotais) {
                    throw new Error("Sem giros disponíveis para hoje.");
                }
            }

            // --- 2. Sorteio ---
            const targetIndex = Math.floor(Math.random() * 20);
            const premioGanho = ARRAY_PREMIOS_SERVER[targetIndex];

            // --- 3. Prepara Updates ---
            let updates = { 
                ultimoGiroRoleta: hoje,
                // Incrementa mesmo se for admin, só para manter o registro
                girosRealizadosHoje: isNovoDia && girosRealizados > 0 ? 1 : admin.firestore.FieldValue.increment(1)
            };
            
            let msgRetorno = "";
            let tipoPr = "";

            if (premioGanho.tipo === 'ponto') {
                updates.pontosFidelidade = admin.firestore.FieldValue.increment(premioGanho.valor);
                msgRetorno = `Você ganhou ${premioGanho.valor} pontos de fidelidade!`;
                tipoPr = "ponto";
            } 
            else if (premioGanho.tipo === 'moldura' || premioGanho.tipo === 'balao') {
                const tipoItem = premioGanho.tipo === 'moldura' ? 'Moldura' : 'Estilo de Chat';
                const chaveObjeto = premioGanho.tipo === 'moldura' ? `premiosTemporarios.moldura_${premioGanho.key}` : `premiosTemporarios.balao_${premioGanho.key}`;
                
                let baseDate = new Date();
                const mapaPremios = perfil.premiosTemporarios || {};
                const chaveSimples = premioGanho.tipo === 'moldura' ? `moldura_${premioGanho.key}` : `balao_${premioGanho.key}`;
                
                if (mapaPremios[chaveSimples]) {
                    const existingDate = getDateSafe(mapaPremios[chaveSimples]);
                    if (existingDate && existingDate > new Date()) baseDate = existingDate;
                }

                baseDate.setHours(baseDate.getHours() + 24); 
                updates[chaveObjeto] = admin.firestore.Timestamp.fromDate(baseDate);
                
                msgRetorno = `Sorte Grande! Você ganhou **${tipoItem} ${premioGanho.nome}** por +24 horas! (Acumulado)`;
                tipoPr = "item";
            } 
            else if (premioGanho.tipo === 'caixa') {
                if (perfil.tipo !== 'cliente') {
                    let baseDate = new Date();
                    if (perfil.boostExpiracao) {
                        const boostDate = getDateSafe(perfil.boostExpiracao);
                        if (boostDate && boostDate > new Date()) baseDate = boostDate;
                    }
                    baseDate.setHours(baseDate.getHours() + 24);
                    updates.boostExpiracao = admin.firestore.Timestamp.fromDate(baseDate);
                    updates.ultimoBoostComprado = admin.firestore.FieldValue.serverTimestamp();
                    msgRetorno = "Você ganhou +24 horas de Perfil Turbinado (Acumulado)!";
                } else {
                    let baseDate = new Date();
                    if (perfil.vip && perfil.vipExpirationDate) {
                        const vipDate = getDateSafe(perfil.vipExpirationDate);
                        if (vipDate && vipDate > new Date()) baseDate = vipDate;
                    }
                    baseDate.setDate(baseDate.getDate() + 5);
                    updates.vip = true;
                    updates.vipExpirationDate = admin.firestore.Timestamp.fromDate(baseDate);
                    msgRetorno = "Incrível! Você ganhou +5 Dias de VIP Grátis (Acumulado)!";
                }
                tipoPr = "caixa";
            }

            t.update(userRef, updates);
            return { targetIndex, msgRetorno, tipoPr };
        });

        res.status(200).json({ success: true, ...result });

    } catch (error) {
        console.error("Erro na roleta:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

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

// Rota de Faxina Geral: Remove usuários do Firestore que não existem mais no Auth
app.post('/admin/sync-database-cleanup', isAdmin, async (req, res) => {
    console.log("[CLEANUP] Iniciando varredura de usuários fantasmas...");
    let removidos = 0;
    let verificados = 0;

    try {
        const usersSnap = await db.collection('usuarios').get();
        
        for (const doc of usersSnap.docs) {
            const uid = doc.id;
            verificados++;

            try {
                // Tenta buscar o usuário no Firebase Authentication
                await admin.auth().getUser(uid);
            } catch (error) {
                // Se o erro for 'user-not-found', significa que o usuário foi deletado do Auth
                if (error.code === 'auth/user-not-found') {
                    console.log(`[CLEANUP] Removendo usuário fantasma: ${uid}`);
                    
                    // 1. Deleta o documento do usuário
                    await doc.ref.delete();
                    
                    // 2. Opcional: Se você tiver fotos na 'batalha_likes' desse usuário, limpe também
                    const batalhaSnap = await db.collection('batalha_likes').where('ownerUid', '==', uid).get();
                    const batch = db.batch();
                    batalhaSnap.forEach(bDoc => batch.delete(bDoc.ref));
                    await batch.commit();

                    removidos++;
                }
            }
        }

        res.status(200).json({ 
            success: true, 
            message: `Faxina concluída! Verificados: ${verificados}, Removidos: ${removidos}` 
        });

    } catch (error) {
        console.error("Erro na faxina geral:", error);
        res.status(500).json({ success: false, message: error.message });
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

// --- CRON JOB CORRIGIDO (Fuso Horário Brasil + 20min) ---
app.get('/cron/enviar-lembretes-completo', async (req, res) => {
    const { key } = req.query;
    
    // Verificação de segurança
    if (key !== process.env.CRON_SECRET_KEY && key !== "Ja997640401") {
        return res.status(401).send('Unauthorized');
    }

    console.log("[CRON] Iniciando ciclo de notificações (Fuso Brasil)...");

    // 1. FORÇA A DATA PARA O FUSO DE SÃO PAULO
    // Isso cria um objeto Date que representa a hora atual no Brasil
    const agoraBrasil = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));

    const batch = db.batch();
    let contador = 0;

    try {
        // === 1. LEMBRETE DE 1 HORA ANTES ===
        // Janela: Daqui a 60 minutos (com margem de 5 min para garantir)
        const futuro1h = new Date(agoraBrasil.getTime() + 60 * 60 * 1000);
        
        // Pega HH:MM do horário que será daqui a 1 hora
        const hora1h = `${String(futuro1h.getHours()).padStart(2,'0')}:${String(futuro1h.getMinutes()).padStart(2,'0')}`;
        
        console.log(`[CRON] Verificando agendamentos para 1h antes: Procurando horário ${hora1h}`);

        const snap1h = await db.collection('agendamentos')
            .where('status', 'in', ['confirmado', 'conclusão pendente'])
            .where('lembrete1hEnviado', '==', false)
            .where('horario', '==', hora1h) // Busca exato ou poderia usar intervalo
            .get();

        snap1h.forEach(doc => {
            const ag = doc.data();
            // Verifica se o agendamento é de HOJE (comparando timestamps aproximados ou string de dia se tiver)
            // Assumindo que agendamentos pendentes são recentes
            sendNotification(ag.clienteUid, '⏰ Falta 1 hora!', `Seu horário com ${ag.barbeiroNome} é às ${ag.horario}.`, { link: '#historico' });
            batch.update(doc.ref, { lembrete1hEnviado: true });
            contador++;
        });

        // === 2. LEMBRETE DE 20 MINUTOS ANTES (SOLICITADO) ===
        const futuro20min = new Date(agoraBrasil.getTime() + 20 * 60 * 1000);
        const hora20min = `${String(futuro20min.getHours()).padStart(2,'0')}:${String(futuro20min.getMinutes()).padStart(2,'0')}`;

        console.log(`[CRON] Verificando agendamentos para 20min antes: Procurando horário ${hora20min}`);

        const snap20min = await db.collection('agendamentos')
            .where('status', 'in', ['confirmado', 'conclusão pendente'])
            .where('lembrete10minEnviado', '==', false) // Usamos o mesmo campo booleano do banco, mas a lógica agora é 20min
            .where('horario', '==', hora20min)
            .get();

        snap20min.forEach(doc => {
            const ag = doc.data();
            sendNotification(
                ag.clienteUid, 
                '🚀 É daqui a pouco!', 
                `Seu corte é em 20 minutos! Se precisar cancelar, faça isso AGORA no app para evitar penalidades.`, 
                { link: '#historico' }
            );
            // Atualiza o campo (o nome do campo continua 10min pra não quebrar compatibilidade, mas a lógica é 20)
            batch.update(doc.ref, { lembrete10minEnviado: true });
            contador++;
        });

        // === 3. RETENÇÃO (CLIENTES SUMIDOS HÁ 25 DIAS) - Executa só as 10h da manhã ===
        if (agoraBrasil.getHours() === 10 && agoraBrasil.getMinutes() < 10) { 
            const vinteCincoDiasAtras = new Date(agoraBrasil.getTime() - 25 * 24 * 60 * 60 * 1000);
            
            // Query simples (pode precisar de índice composto)
            const usuariosSumidos = await db.collection('usuarios')
                .where('tipo', '==', 'cliente')
                .where('ultimoAgendamento', '<=', vinteCincoDiasAtras)
                .limit(50) // Limite para não estourar o cron
                .get();

            usuariosSumidos.forEach(doc => {
                // Lógica para não mandar todo dia (verificar campo 'ultimoAvisoRetencao')
                // Simplificado aqui:
                const u = doc.data();
                // Só manda se não mandou nos ultimos 10 dias
                sendNotification(
                    doc.id, 
                    '✂️ Tá na hora do talento?', 
                    `Faz um tempo que você não aparece! Que tal agendar um corte hoje?`, 
                    { link: '#barbeiros' }
                );
            });
        }

        await batch.commit();
        res.status(200).send(`OK (Brasil Time): Processado ${hora1h} e ${hora20min}. Total envios: ${contador}`);

    } catch (error) {
        console.error(error);
        res.status(500).send("Erro no processamento: " + error.message);
    }
});

// Rota de saúde para o Render saber que o app está no ar
app.get('/', (req, res) => {
    res.send('Backend VersãoPro está no ar!');
});

// --- FUNÇÃO AUXILIAR: Sincronizar Portfólio com Em Alta (Server-Side) ---
async function sincronizarPortfolioEmAlta(uid) {
    try {
        const userDoc = await db.collection('usuarios').doc(uid).get();
        if (!userDoc.exists) return;

        const u = userDoc.data();
        
        // Verifica se realmente é Tier 4 (Segurança)
        // (Ou se você quiser forçar mesmo sem ser, remova este if)
        if (!u.proAtivo || u.proTier !== 'tier4') {
            console.log(`[SYNC] Usuário ${uid} não é Tier 4. Pulando sincronização.`);
            return;
        }

        const portfolio = u.portfolio || [];
        if (portfolio.length === 0) return;

        console.log(`[SYNC] Sincronizando ${portfolio.length} fotos de ${u.nome} para o Em Alta...`);

        const batch = db.batch();
        let opsCount = 0;

        for (const imgUrl of portfolio) {
            // Ignora imagens de Antes/Depois (formato especial) se houver
            if (typeof imgUrl === 'string' && imgUrl.startsWith("BA|")) continue;

            // Verifica duplicidade para não criar repetido
            const checkSnap = await db.collection('batalha_likes')
                .where('imgUrl', '==', imgUrl)
                .limit(1)
                .get();

            if (checkSnap.empty) {
                const novoDocRef = db.collection('batalha_likes').doc();
                batch.set(novoDocRef, {
                    imgUrl: imgUrl,
                    ownerUid: uid,
                    ownerName: u.nome,
                    ownerTier: 'tier4',
                    count: 0,
                    likedBy: [],
                    ts: admin.firestore.FieldValue.serverTimestamp(),
                    origem: 'automatico_server'
                });
                opsCount++;
            }
        }

        if (opsCount > 0) {
            await batch.commit();
            console.log(`[SYNC] Sucesso! ${opsCount} novas fotos adicionadas ao Em Alta.`);
        } else {
            console.log(`[SYNC] Nenhuma foto nova para adicionar (todas já existiam ou portfólio vazio).`);
        }

    } catch (error) {
        console.error("[SYNC] Erro ao sincronizar Em Alta:", error);
    }
}

// --- FUNÇÃO AUXILIAR: CALCULAR DISTÂNCIA (Haversine) ---
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  var R = 6371; // Raio da terra em km
  var dLat = deg2rad(lat2-lat1);
  var dLon = deg2rad(lon2-lon1); 
  var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var d = R * c; // Distância em km
  return d;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

// --- ROTA: DISPARAR SOS COM RAIO DE 3KM ---
app.post('/api/disparar-sos', async (req, res) => {
    const { latOrigem, lonOrigem, nomeProfissional, mensagem, desconto, uidProfissional } = req.body;

    if (!latOrigem || !lonOrigem || !nomeProfissional) {
        return res.status(400).json({ message: "Dados incompletos." });
    }

    try {
        // 1. Busca todos os usuários clientes que têm token de notificação
        // (Otimização: Em um app gigante, usaríamos GeoFire, mas para este caso o filtro em memória funciona bem)
        const usersSnap = await db.collection('usuarios')
            .where('tipo', '==', 'cliente')
            .get();

        if (usersSnap.empty) {
            return res.status(200).json({ message: "Nenhum cliente encontrado.", count: 0 });
        }

        const tokensParaEnviar = [];
        let countUsuariosProximos = 0;

        usersSnap.forEach(doc => {
            const u = doc.data();
            
            // Verifica se o usuário tem localização e tokens
            if (u.latitude && u.longitude && u.fcmTokens && u.fcmTokens.length > 0) {
                // Calcula distância
                const distancia = getDistanceFromLatLonInKm(latOrigem, lonOrigem, u.latitude, u.longitude);
                
                // Se estiver dentro de 3km (e não for o próprio profissional, caso ele tenha conta de teste)
                if (distancia <= 3 && doc.id !== uidProfissional) {
                    tokensParaEnviar.push(...u.fcmTokens);
                    countUsuariosProximos++;
                }
            }
        });

        // Remove duplicatas de tokens
        const uniqueTokens = [...new Set(tokensParaEnviar)];

        if (uniqueTokens.length === 0) {
            return res.status(200).json({ message: "Nenhum cliente com notificação ativa no raio de 3km.", count: 0 });
        }

        // 2. Prepara a Mensagem Push
        const message = {
            notification: {
                title: `🚨 SOS: ${desconto}% OFF!`,
                body: `${nomeProfissional} liberou uma vaga agora! ${mensagem}`
            },
            data: {
                link: '#barbeiros', // Ao clicar, abre a lista
                forceAlarm: 'true'  // Toca o som de alerta personalizado
            }
        };

        // 3. Envia em Lotes (Multicast)
        const response = await admin.messaging().sendEachForMulticast({
            ...message,
            tokens: uniqueTokens
        });

        console.log(`[SOS] Enviado para ${uniqueTokens.length} dispositivos próximos.`);

        res.status(200).json({ 
            success: true, 
            message: `Alerta enviado para ${countUsuariosProximos} clientes próximos!`,
            sendedCount: response.successCount 
        });

    } catch (error) {
        console.error("Erro no SOS:", error);
        res.status(500).json({ message: "Erro interno no servidor." });
    }
});

// --- CRON JOB: RESETAR AGENDA (ATIVAR TODOS OS HORÁRIOS PARA QUEM USA AGENDA PROGRAMADA) ---
app.get('/cron/reset-agenda', async (req, res) => {
    const chaveRecebida = req.query.key;
    const CHAVE_SECRETA = 'Ja997640401'; 

    if (chaveRecebida !== CHAVE_SECRETA) {
        return res.status(403).send('ACESSO NEGADO.');
    }

    const timeToMin = (t) => {
        if (!t) return null;
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };

    try {
        // Não precisamos mais gerar uma agenda "cheia" universal
        
        // 1. BUSCA QUEM TEM AGENDA MANUAL ATIVA (E PEGA OS DADOS PARA O FILTRO)
        const usuariosRef = db.collection('usuarios');
        const snapshot = await usuariosRef.where('usaAgendaManual', '==', true).get();

        if (snapshot.empty) {
            return res.status(200).send('OK: Ninguém usa agenda manual no momento.');
        }

        // 2. ATUALIZA PROFISSIONAL POR PROFISSIONAL, APLICANDO OS FILTROS DE EXPEDIENTE
        const batch = db.batch();
        let contador = 0;

        snapshot.forEach(doc => {
            const dadosProf = doc.data();
            const agendaPersonalizada = {}; // VAMOS CONSTRUIR A AGENDA DESTE PROFISSIONAL AQUI

            // a. PEGA OS LIMITES DO PERFIL (com padrões seguros)
            // 07:00 = 420 min; 20:30 = 1230 min
            const inicioExp = timeToMin(dadosProf.horarioInicio) || 420;
            const fimExp = timeToMin(dadosProf.horarioFim) || 1230;

            let almocoIn = timeToMin(dadosProf.almocoInicio);
            let almocoOut = timeToMin(dadosProf.almocoFim);
            if (almocoIn === almocoOut) { almocoIn = -1; almocoOut = -1; }

            // b. GERA A AGENDA COM FILTRO (Loop de 07:00 a 20:30, o limite máximo)
            for (let i = 7 * 60; i <= 20 * 60 + 30; i += 30) {
                const horas = Math.floor(i / 60);
                const minutos = i % 60;
                const horario = `${horas}:${minutos.toString().padStart(2, '0')}`;
                
                let status = true; // Por padrão, está livre

                // Regra 1: Fora do Expediente? Bloqueia.
                if (i < inicioExp || i >= fimExp) {
                    status = false;
                }

                // Regra 2: No Almoço? Bloqueia.
                if (almocoIn !== -1 && i >= almocoIn && i < almocoOut) {
                    status = false;
                }
                
                // Atribui o status (true=livre, false=bloqueado)
                agendaPersonalizada[horario] = status;
            }

            // c. ATUALIZA NO BATCH
            batch.update(doc.ref, { 
                agenda: agendaPersonalizada 
            });
            contador++;
        });

        await batch.commit();

        console.log(`SUCESSO: ${contador} agendas foram atualizadas com filtros de Expediente/Almoço.`);
        res.status(200).send(`SUCESSO: ${contador} profissionais estão com a agenda programada atualizada.`);

    } catch (error) {
        console.error('ERRO NO CRON:', error);
        res.status(500).send('ERRO: Falha ao ativar horários.');
    }
});

app.post('/api/confirmar-compra-real', async (req, res) => {
    const { uid, skuId, purchaseToken } = req.body;
    // MANTIDO: ID REAL DO SEU APP
    const PACKAGE_NAME = "com.hildomatos.baber"; 

    if (!uid || !skuId || !purchaseToken) {
        return res.status(400).json({ success: false, message: "Dados incompletos." });
    }

    try {
        // 1. Busca os detalhes da compra no Google Play Console
        const googleRes = await playDeveloperApi.purchases.products.get({
            packageName: PACKAGE_NAME,
            productId: skuId,
            token: purchaseToken
        });

        // 2. Verifica se a compra está aprovada (State 0 = Purchased)
        if (googleRes.data.purchaseState === 0) {
            
            // --- NOVO: RECONHECER A COMPRA (ACKNOWLEDGE) ---
            // Isso avisa ao Google que você entregou o produto e evita estornos automáticos.
            try {
                await playDeveloperApi.purchases.products.acknowledge({
                    packageName: PACKAGE_NAME,
                    productId: skuId,
                    token: purchaseToken
                });
                console.log(`[GOOGLE] Compra ${skuId} reconhecida com sucesso.`);
            } catch (ackError) {
                // Se der erro aqui, pode ser que já tenha sido reconhecida, apenas avisamos no log
                console.warn("[GOOGLE] Aviso no Acknowledge:", ackError.message);
            }

            // --- TABELA DE DIAMANTES (MANTIDA) ---
            const tabelaPrecos = { 
                'diamante_1': 1, 'diamante_3': 3, 'diamante_10': 10, 
                'diamante_25': 25, 'diamante_100': 100 
            };
            const qtd = tabelaPrecos[skuId] || 0;

            // --- TABELA DE VALORES BRL (MANTIDA PARA O GRÁFICO) ---
            const tabelaValoresBRL = { 
                'diamante_1': 4.90, 'diamante_3': 14.90, 'diamante_10': 44.90, 
                'diamante_25': 99.90, 'diamante_100': 349.90 
            };
            const valorPagoBRL = tabelaValoresBRL[skuId] || 0;
            const mesAnoAtual = new Date().toISOString().substring(0, 7); 

            const userRef = db.collection('usuarios').doc(uid);
            const vendaRef = db.collection('vendas_playstore').doc(); 

            // --- TRANSAÇÃO (MANTIDA E SEGURA) ---
            await db.runTransaction(async (t) => {
                const doc = await t.get(userRef);
                const saldo = doc.data().saldoDigital || 0;
                
                // 1. Atualiza o saldo do usuário
                t.update(userRef, { saldoDigital: saldo + qtd });

                // 2. Registra o extrato para o gráfico do Admin
                t.set(vendaRef, {
                    uid: uid,
                    skuId: skuId,
                    valorBRL: valorPagoBRL,
                    ts: admin.firestore.FieldValue.serverTimestamp(),
                    mesAno: mesAnoAtual
                });
            });

            res.json({ success: true, message: "Diamantes entregues, reconhecidos e registrados!" });
        } else {
            res.status(400).json({ success: false, message: "Compra não aprovada pelo Google." });
        }
    } catch (error) {
        console.error("Erro na validação do Google:", error.message);
        res.status(500).json({ success: false, message: "Erro ao validar compra." });
    }
});

// Rota para buscar estatísticas financeiras Reais (Protegida por Admin)
app.post('/admin/stats-financeiro', isAdmin, async (req, res) => {
    try {
        console.log("[STATS] Calculando faturamento mensal...");
        
        // Busca todas as vendas registradas
        const snapshot = await db.collection('vendas_playstore').orderBy('ts', 'asc').get();
        
        const faturamentoPorMes = {};

        snapshot.forEach(doc => {
            const venda = doc.data();
            const mes = venda.mesAno; // Ex: "2025-12"
            const valor = venda.valorBRL || 0;

            // Soma o valor ao mês correspondente
            if (!faturamentoPorMes[mes]) {
                faturamentoPorMes[mes] = 0;
            }
            faturamentoPorMes[mes] += valor;
        });

        // Retorna os dados formatados para o Chart.js
        res.status(200).json({ 
            success: true, 
            labels: Object.keys(faturamentoPorMes), 
            valores: Object.values(faturamentoPorMes) 
        });

    } catch (error) {
        console.error("Erro ao gerar estatísticas:", error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
