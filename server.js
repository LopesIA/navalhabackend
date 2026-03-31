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

// --- CONFIGURAÇÕES DO SERVIDOR ---
app.use(cors(corsOptions)); // Mantém a segurança do seu painel web intacta!
app.use(express.json({ limit: '50mb' })); // Aumenta o limite para receber fotos/áudios da Evolution
app.use(express.urlencoded({ limit: '50mb', extended: true }));


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

// --- CRON JOB ATUALIZADO (LEMBRETES COMPLETOS + RETENÇÃO 1 A 1 + CLIENTE MANUAL) ---
app.get('/cron/enviar-lembretes-completo', async (req, res) => {
    const { key } = req.query;
    
    if (key !== process.env.CRON_SECRET_KEY && key !== "Ja997640401") {
        return res.status(401).send('Unauthorized');
    }

    console.log("[CRON] Iniciando ciclo de notificações (Push + WhatsApp)...");

    // 🤖 FUNÇÃO INTERNA PARA DISPARAR WHATSAPP (COM BLINDAGEM DO 55)
    const enviarWhatsAppCron = async (destino, texto) => {
        if (!destino || destino === "whatsapp_gerencia" || destino === "desconhecido") return;
        
        const LINK_CLOUDFLARE = "https://evolution-king-agenda.onrender.com";
        const API_KEY_EVO = "Ja997640401"; 
        const nomeDaInstancia = "KingAgenda"; 

        let numeroLimpo = destino;
        if (!destino.includes('@lid')) {
            numeroLimpo = destino.replace(/[^0-9]/g, ''); // Tira traços e espaços
            // Adiciona o 55 se o número tiver apenas 10 ou 11 dígitos
            if (numeroLimpo.length === 10 || numeroLimpo.length === 11) {
                numeroLimpo = '55' + numeroLimpo;
            }
        }
        
        const body = { number: numeroLimpo, text: texto };
        
        try {
            const urlEvo = `${LINK_CLOUDFLARE}/message/sendText/${encodeURIComponent(nomeDaInstancia)}?checkNumber=false`;
            const r = await fetch(urlEvo, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'apikey': API_KEY_EVO },
                body: JSON.stringify(body)
            });
            if (!r.ok) console.error(`[CRON ZAP] Erro Evo (${numeroLimpo}):`, await r.text());
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (e) {
            console.error("[CRON ZAP] Erro no fetch:", e.message);
        }
    };

    // --- MÁQUINA DO TEMPO (DATAS) ---
    const agoraBrasil = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
    
    const amanhaBrasil = new Date(agoraBrasil); amanhaBrasil.setDate(amanhaBrasil.getDate() + 1);
    const cincoDiasBrasil = new Date(agoraBrasil); cincoDiasBrasil.setDate(cincoDiasBrasil.getDate() + 5);

    const formatDateIso = (d) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const dataHoje = formatDateIso(agoraBrasil);
    const dataAmanha = formatDateIso(amanhaBrasil);
    const data5Dias = formatDateIso(cincoDiasBrasil);
    
    const batch = db.batch();
    let contadorLembretes = 0; 
    let contadorRetencao = 0;  

    try {
        const baseQuery = db.collection('agendamentos').where('status', 'in', ['confirmado', 'conclusão pendente']);

        // =====================================================================
        // 1. LEMBRETES DE 5 DIAS ANTES
        // =====================================================================
        const snap5Dias = await baseQuery.where('data', '==', data5Dias).get();
        for (const doc of snap5Dias.docs) {
            const ag = doc.data();
            if (!ag.lembrete5diasEnviado) {
                console.log(`[CRON] Disparando 5 DIAS para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '📅 Falta pouco!', `Faltam 5 dias para o seu horário com ${ag.barbeiroNome}.`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `📅 *Faltam 5 dias!*\n\nOlá, ${ag.clienteNome || 'Cliente'}!\nPassando para avisar que o seu agendamento de *${ag.servico}* com *${ag.barbeiroNome}* será no dia ${ag.data.split('-').reverse().join('/')} às ${ag.horario}.\nJá estamos nos preparando para te receber! ✂️`);
                }
                batch.update(doc.ref, { lembrete5diasEnviado: true });
                contadorLembretes++;
            }
        }

        // =====================================================================
        // 2. LEMBRETES DE 1 DIA ANTES (AMANHÃ)
        // =====================================================================
        const snapAmanha = await baseQuery.where('data', '==', dataAmanha).get();
        for (const doc of snapAmanha.docs) {
            const ag = doc.data();
            if (!ag.lembrete1diaEnviado) {
                console.log(`[CRON] Disparando 1 DIA para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '⏰ É amanhã!', `Seu horário com ${ag.barbeiroNome} é amanhã às ${ag.horario}.`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `⏰ *É amanhã!*\n\nOlá, ${ag.clienteNome || 'Cliente'}!\nLembrando que o seu horário com *${ag.barbeiroNome}* é amanhã às ${ag.horario}.\nSe precisar reagendar, por favor nos avise pelo app! 💈`);
                }
                batch.update(doc.ref, { lembrete1diaEnviado: true });
                contadorLembretes++;
            }
        }

        // =====================================================================
        // 3. LEMBRETES DE HOJE (1 HORA, 20 MIN E AGRADECIMENTO)
        // =====================================================================
        const snapHoje = await baseQuery.where('data', '==', dataHoje).get();
        for (const doc of snapHoje.docs) {
            const ag = doc.data();
            if (!ag.horario) continue; 

            const [horas, minutos] = ag.horario.split(':').map(Number);
            const horaAgendamento = new Date(agoraBrasil);
            horaAgendamento.setHours(horas, minutos, 0, 0);

            // Calcula minutos (Positivo = Futuro | Negativo = Passado)
            const minutosFaltando = Math.floor((horaAgendamento.getTime() - agoraBrasil.getTime()) / 60000);

            // A. LEMBRETE DE 1 HORA (Entre 45 e 65 min antes)
            if (minutosFaltando <= 65 && minutosFaltando >= 45 && !ag.lembrete1hEnviado) {
                console.log(`[CRON] Disparando 1H para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '⏰ Falta 1 hora!', `Seu horário com ${ag.barbeiroNome} é hoje às ${ag.horario}.`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `⏰ *Falta 1 Hora!*\n\nOlá, ${ag.clienteNome}!\nSeu horário de *${ag.servico}* com *${ag.barbeiroNome}* é daqui a pouco, às ${ag.horario}.\nTe esperamos lá! ✂️`);
                }
                batch.update(doc.ref, { lembrete1hEnviado: true });
                contadorLembretes++;
            }

            // B. LEMBRETE DE 20 MINUTOS (Entre 5 e 25 min antes)
            else if (minutosFaltando <= 25 && minutosFaltando >= 5 && !ag.lembrete20minEnviado) {
                console.log(`[CRON] Disparando 20MIN para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '🚀 É daqui a pouco!', `Seu corte é em 20 minutos!`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `🚀 *É daqui a pouco!*\n\n${ag.clienteNome}, o seu horário com *${ag.barbeiroNome}* começa em 20 minutos!`);
                }
                batch.update(doc.ref, { lembrete20minEnviado: true, lembrete10minEnviado: true });
                contadorLembretes++;
            }

            // C. AGRADECIMENTO (Entre 30 e 60 min DEPOIS do horário marcado)
            else if (minutosFaltando <= -30 && minutosFaltando >= -60 && !ag.agradecimentoEnviado) {
                console.log(`[CRON] Disparando AGRADECIMENTO para ${ag.clienteNome}`);
                
                // Dispara o Push Notification
                if (!ag.clienteUid.startsWith('manual_')) {
                    sendNotification(ag.clienteUid, '⭐ O que achou?', `Muito obrigado pela preferência! Que tal avaliar o serviço do ${ag.barbeiroNome}?`, { link: '#historico' });
                }
                
                // Dispara o WhatsApp turbinado com links
                if (ag.clienteTelefone) {
                    // 🔥 MÁGICA DO GOOGLE: Trava a busca OBRIGATORIAMENTE na palavra "BARBEARIAS"
                    const nomeBuscaGoogle = "BARBEARIAS";
                    const linkGoogle = `https://www.google.com/search?q=${encodeURIComponent(nomeBuscaGoogle)}`;
                    
                    const msgZapAgradecimento = `⭐ *Muito obrigado pela preferência!*\n\nOlá, ${ag.clienteNome || 'Cliente'}! Passando para agradecer por ter escolhido o profissional *${ag.barbeiroNome}* hoje.\n\nSua opinião é o que nos faz crescer! Poderia nos avaliar rapidinho?\n\n📲 *1. No Aplicativo King Agenda:*\nAcesse: https://kingagenda.site\n_(Passos: Menu > Funções do Cliente > Minhas Atividades > Meu Agendamento > Avaliar)_\n\n🌍 *2. No Google:*\nBasta clicar no link abaixo e nos dar aquelas estrelinhas para ajudar outras pessoas a nos encontrarem:\n${linkGoogle}\n\nVoltando sempre, você acumula pontos! Tamo junto! 🤝`;

                    await enviarWhatsAppCron(ag.clienteTelefone, msgZapAgradecimento);
                }
                
                batch.update(doc.ref, { agradecimentoEnviado: true });
                contadorLembretes++;
            }
        } 

        // =====================================================================
        // 4. RETENÇÃO: CLIENTES SUMIDOS (ENTRE 25 E 70 DIAS) - 1 POR VEZ!
        // =====================================================================
        const vinteCincoDiasAtras = new Date(agoraBrasil.getTime() - 25 * 24 * 60 * 60 * 1000);
        const setentaDiasAtras = new Date(agoraBrasil.getTime() - 70 * 24 * 60 * 60 * 1000);
        
        const agendamentosAntigos = await db.collection('agendamentos')
            .where('ts', '<=', admin.firestore.Timestamp.fromDate(vinteCincoDiasAtras))
            .where('ts', '>=', admin.firestore.Timestamp.fromDate(setentaDiasAtras))
            .limit(100) 
            .get();

        const telefonesAnalisados = new Set();
        const uidsAnalisados = new Set();

        for (const doc of agendamentosAntigos.docs) {
            const ag = doc.data();

            // Pula se já enviamos lembrete de ausência para esse agendamento
            if (ag.lembreteAusenciaEnviado) continue;

            const isManual = !ag.clienteUid || ag.clienteUid.startsWith('manual_');

            // Se for manual e não tiver telefone, não tem como enviar Zap nem checar retorno, então pula e mata o doc.
            if (isManual && !ag.clienteTelefone) {
                batch.update(doc.ref, { lembreteAusenciaEnviado: true });
                continue;
            }

            // Controle para não mandar 2x pro mesmo cliente no mesmo loop
            if (isManual) {
                if (telefonesAnalisados.has(ag.clienteTelefone)) continue;
                telefonesAnalisados.add(ag.clienteTelefone);
            } else {
                if (uidsAnalisados.has(ag.clienteUid)) continue;
                uidsAnalisados.add(ag.clienteUid);
            }

            // 🛡️ VALIDAÇÃO DE SEGURANÇA: Voltou nos últimos 25 dias?
            let queryRecente;
            if (isManual) {
                queryRecente = db.collection('agendamentos').where('clienteTelefone', '==', ag.clienteTelefone);
            } else {
                queryRecente = db.collection('agendamentos').where('clienteUid', '==', ag.clienteUid);
            }

            const agendamentosDoCliente = await queryRecente.get();
            let temAgendamentoRecente = false;

            agendamentosDoCliente.forEach(docCli => {
                const ts = docCli.data().ts;
                const dataTS = ts ? ts.toDate() : new Date(0);
                if (dataTS > vinteCincoDiasAtras) {
                    temAgendamentoRecente = true;
                }
            });

            // Se ele tem agendamento recente, ou o serviço velho não for concluído/avaliado:
            if (temAgendamentoRecente || (ag.status !== 'concluido' && ag.status !== 'avaliado')) {
                batch.update(doc.ref, { lembreteAusenciaEnviado: true }); 
                continue; 
            }

            // 🎯 ACHOU UM CLIENTE SUMIDO VÁLIDO! Envia a mensagem:
            console.log(`[CRON] Disparando RETENÇÃO para: ${ag.clienteNome}`);
            
            // Só manda Push se tiver App
            if (!isManual) {
                sendNotification(ag.clienteUid, '✂️ Tá na hora do talento?', `Faz um tempo que você não aparece! Que tal agendar um corte hoje?`, { link: '#barbeiros' });
            }
            
            // Manda o ZAP (pra App ou Manual)
            if (ag.clienteTelefone) {
                const msgZap = `✂️ *Tá na hora do talento?*\n\nOlá, ${ag.clienteNome || 'Cliente'}! Faz um tempinho que você não vem aqui na barbearia.\nQue tal agendar um horário com a gente hoje? É só pedir aqui mesmo!`;
                await enviarWhatsAppCron(ag.clienteTelefone, msgZap);
            }

            batch.update(doc.ref, { lembreteAusenciaEnviado: true });
            contadorRetencao++;
            
            // 🔥 QUEBRA O LOOP IMEDIATAMENTE (ENVIA SÓ PRA 1)!
            break; 
        }

        await batch.commit();
        res.status(200).send(`OK: Lembretes: ${contadorLembretes} | Retenção (1 a 1): ${contadorRetencao}`);

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

const { GoogleGenerativeAI } = require("@google/generative-ai");

app.get('/ia/modelos', async (req, res) => {
    try {
        const API_KEY = process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.trim() : "";
        const url = `https://generativelanguage.googleapis.com/v1/models?key=${API_KEY}`;
        const response = await fetch(url);
        const data = await response.json();
        
        // Isso vai nos mostrar EXATAMENTE quais modelos sua chave pode ver
        res.json(data);
    } catch (e) {
        res.status(500).json({ erro: e.message });
    }
});

// =================================================================
// 🤖 ROTA SEGURA DO CHAT VISAGISTA (COM CAPTURA DE ERRO EXATO)
// =================================================================
app.post('/api/chat-visagista', async (req, res) => {
    const { conteudoHistorico, modeloAtual } = req.body;
    const API_KEY = process.env.GEMINI_API_KEY;

    if (!API_KEY) {
        return res.status(500).json({ sucesso: false, erro: "A chave GEMINI_API_KEY não foi encontrada no Render!" });
    }

    // LISTA CORRIGIDA COM OS MODELOS REAIS DA SUA NOVA CHAVE
    let modelosParaTestar = [
        "gemini-2.5-flash", 
        "gemini-2.0-flash", 
        "gemini-flash-latest", 
        "gemini-2.5-pro"
    ];
    
    if (modeloAtual) {
        modelosParaTestar = modelosParaTestar.filter(m => m !== modeloAtual);
        modelosParaTestar.unshift(modeloAtual);
    }

    let ultimoErroAPI = "Desconhecido";

    for (const modelo of modelosParaTestar) {
        try {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${API_KEY}`;
            const response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: conteudoHistorico,
                    generationConfig: { temperature: 0.7, maxOutputTokens: 8000 }
                })
            });

            const data = await response.json();

            // Se o Google recusar, guardamos o motivo exato e tentamos o próximo
            if (!response.ok) {
                ultimoErroAPI = `O Google recusou (${response.status}): ${data.error?.message || 'Sem detalhes'}`;
                console.warn(`[VISAGISTA] ${modelo} falhou:`, ultimoErroAPI);
                continue; 
            }

            // Sucesso!
            return res.json({ sucesso: true, texto: data.candidates[0].content.parts[0].text, modeloAceito: modelo });

        } catch (erro) {
            ultimoErroAPI = erro.message;
        }
    }
    
    // Se todos falharem, envia o erro EXATO para o seu console
    res.status(500).json({ sucesso: false, erro: ultimoErroAPI });
});
// =================================================================

const mensagensProcessadas = new Set();

app.post(['/webhook/whatsapp', '/webhook/whatsapp/messages-upsert'], async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Verifica o evento (Apenas mensagens novas)
        const evento = data.event || data.event_type;
        if (evento !== "messages.upsert" && evento !== "MESSAGES_UPSERT") {
            return res.status(200).send('IGNORED_EVENT');
        }

        // 2. Responde imediatamente para a Evolution não travar
        res.status(200).send('EVENT_RECEIVED');

        // 3. Extrai dados vitais com segurança
        const msgInfo = data.data || {};
        const key = msgInfo.key || {};
        let numeroRemetente = key.remoteJid;
        const fromMe = key.fromMe;
        const msgId = key.id || msgInfo.id || msgInfo.messageId;
        const nomeDaInstancia = data.instance || "KingAgenda"; 

        // 4. Ignora Status, Grupos e Mensagens do próprio Bot imediatamente
        if (!numeroRemetente || fromMe || numeroRemetente.includes('@g.us') || numeroRemetente.includes('status')) {
            return;
        }

        // 5. BLINDAGEM CONTRA DUPLICATAS 
        if (msgId) {
            if (mensagensProcessadas.has(msgId)) {
                console.log(`[TRAVA] Mensagem repetida ignorada pela Evolution: ${msgId}`);
                return;
            }
            mensagensProcessadas.add(msgId);
            setTimeout(() => mensagensProcessadas.delete(msgId), 15000); 
        }

        // 6. 🚨 DESEMPACOTAR A MENSAGEM (O SEGREDO DAS MSG TEMPORÁRIAS) 🚨
        let msgObj = msgInfo.message || {};
        
        if (msgObj.ephemeralMessage && msgObj.ephemeralMessage.message) {
            msgObj = msgObj.ephemeralMessage.message; 
        } else if (msgObj.viewOnceMessage && msgObj.viewOnceMessage.message) {
            msgObj = msgObj.viewOnceMessage.message; 
        } else if (msgObj.viewOnceMessageV2 && msgObj.viewOnceMessageV2.message) {
            msgObj = msgObj.viewOnceMessageV2.message; 
        } else if (msgObj.documentWithCaptionMessage && msgObj.documentWithCaptionMessage.message) {
            msgObj = msgObj.documentWithCaptionMessage.message; 
        }

        // 7. EXTRAIR O TEXTO DE VERDADE
        const textoRecebido = 
            msgObj.conversation || 
            (msgObj.extendedTextMessage && msgObj.extendedTextMessage.text) || 
            (msgObj.imageMessage && msgObj.imageMessage.caption) || 
            (msgObj.videoMessage && msgObj.videoMessage.caption) || 
            "";

        // Se for áudio ou figurinha, ignora sem quebrar o servidor
        if (!textoRecebido) {
            return;
        }

        console.log(`[ZAP] Mensagem de ${numeroRemetente}: "${textoRecebido}"`);
        
        // 8. FIX MIKAELA
        if (numeroRemetente && numeroRemetente.includes("126280762691761")) {
            numeroRemetente = "5527996598623@s.whatsapp.net"; 
        }

        // =========================================================
        // 🕵️‍♂️ 9. MÁQUINA DE DESCOBERTA AUTOMÁTICA DO NÚMERO REAL (COM CACHE)
        // =========================================================
        if (numeroRemetente && numeroRemetente.includes('@lid')) {
            try {
                const cacheLid = await db.collection('lid_mapping').doc(numeroRemetente).get();
                if (cacheLid.exists) {
                    numeroRemetente = cacheLid.data().realNumber;
                    console.log(`[ZAP] 🎯 Fantasma já conhecido no Cache! Número real: ${numeroRemetente}`);
                } else {
                    const nomeWhatsapp = data.data?.pushName || msgInfo?.pushName || data.sender?.name || data.sender?.pushName;
                    
                    if (nomeWhatsapp) {
                        console.log(`[ZAP] 👻 Fantasma novo detectado! Nome: ${nomeWhatsapp}. Vasculhando banco...`);
                        
                        let usuariosEncontrados = [];
                        const nomeBusca = nomeWhatsapp.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                        
                        const allUsers = await db.collection('usuarios').get();
                        allUsers.forEach(doc => {
                            const u = doc.data();
                            if (u.telefone && u.nome) {
                                const nomeBanco = u.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                if (nomeBanco === nomeBusca || nomeBanco.includes(nomeBusca) || nomeBusca.includes(nomeBanco)) {
                                    usuariosEncontrados.push(u); // Guarda os dados inteiros
                                }
                            }
                        });

                        if (usuariosEncontrados.length > 0) {
                            // SE ACHAR MÚLTIPLOS, FILTRA QUEM É CLIENTE PARA NÃO DAR ERRO! SE NÃO ACHAR, PEGA O PRIMEIRO.
                            let alvo = usuariosEncontrados.length === 1 ? usuariosEncontrados[0] : usuariosEncontrados.find(u => u.tipo === 'cliente');
                            if (!alvo) alvo = usuariosEncontrados[0]; 

                            let numeroRealEncontrado = alvo.telefone.replace(/[^0-9]/g, ''); 
                            if (!numeroRealEncontrado.startsWith('55')) {
                                numeroRealEncontrado = '55' + numeroRealEncontrado;
                            }
                            numeroRealEncontrado = numeroRealEncontrado.includes('@s.whatsapp.net') ? numeroRealEncontrado : `${numeroRealEncontrado}@s.whatsapp.net`;
                            
                            console.log(`[ZAP] 🎯 Descoberta forçada com sucesso! O número de ${nomeWhatsapp} é ${numeroRealEncontrado}`);
                            
                            await db.collection('lid_mapping').doc(numeroRemetente).set({ realNumber: numeroRealEncontrado });
                            numeroRemetente = numeroRealEncontrado; 
                        } else {
                            console.log(`[ZAP] ⚠️ Cliente '${nomeWhatsapp}' não descoberto. Mantendo @lid.`);
                        }
                    }
                }
            } catch (e) {
                console.log(`[ZAP] Erro na Descoberta:`, e.message);
            }
        }
        
        // 10. TRATAMENTO DE SEGURANÇA PARA O BANCO DE DADOS (Rodado DEPOIS da descoberta)
        let remoteJidLimpo = numeroRemetente.split('@')[0];
        if (numeroRemetente.includes('@lid')) {
            remoteJidLimpo = numeroRemetente; // Mantém o @lid inteiro no histórico
        }


            // ============================================================
            // 🔎 SUPER BUSCA: IDENTIDADE, CARGO E SERVIÇOS POR BARBEARIA
            // ============================================================
            let nomeConhecido = "";
            let tipoUsuario = "cliente"; 
            let isProprietario = false;
            let meuUid = "";
            let equipeNomes = [];
            let equipePorBarbearia = {}; 
            let tabelaServicosPorBarbearia = {}; 
            let telefonePorBarbearia = {}; 

            try {
                // Descobre quem está mandando a mensagem
                const userSnap = await db.collection('usuarios').where('telefone', '==', remoteJidLimpo).limit(1).get();
                if (!userSnap.empty) {
                    const uData = userSnap.docs[0].data();
                    nomeConhecido = uData.nome || "";
                    tipoUsuario = uData.tipo || "cliente";
                    isProprietario = uData.isProprietario === true;
                    meuUid = userSnap.docs[0].id;
                } else {
                    const agSnap = await db.collection('agendamentos').where('clienteTelefone', '==', remoteJidLimpo).orderBy('ts', 'desc').limit(1).get();
                    if (!agSnap.empty && agSnap.docs[0].data().clienteNome) {
                        nomeConhecido = agSnap.docs[0].data().clienteNome;
                    }
                }

                // 🏢 BUSCA A EQUIPE BASEADA NO DOCUMENTO DO DONO (A MÁGICA DA CORREÇÃO)
                const equipeSnap = await db.collection('usuarios').where('tipo', 'in', ['barbeiro', 'profissional', 'admin']).get();
                let cacheDonos = {};

                for (const doc of equipeSnap.docs) {
                    const d = doc.data();
                    if (d.nome) {
                        // 1. Descobre quem é o Dono desta pessoa
                        let uidDoDono = d.donoUid || d.vinculoSalao || (d.pertenceABarbearia ? d.pertenceABarbearia.uid : null) || doc.id; 
                        
                        // 2. Busca e faz o Cache dos dados reais do DONO
                        if (!cacheDonos[uidDoDono]) {
                            const donoDoc = await db.collection('usuarios').doc(uidDoDono).get();
                            if (donoDoc.exists) {
                                cacheDonos[uidDoDono] = donoDoc.data();
                            } else {
                                cacheDonos[uidDoDono] = d; // Fallback de segurança
                            }
                        }

                        const dadosDono = cacheDonos[uidDoDono];
                        const barbeariaAtual = dadosDono.nomeBarbearia || d.nomeBarbearia || "Barbearia King"; 

                        // 3. Lê o array "equipe" DE DENTRO do documento do Dono!
                        if (!equipePorBarbearia[barbeariaAtual]) {
                            let nomesEquipeTemp = new Set(); // O Set evita nomes duplicados na IA
                            
                            // O dono sempre faz parte da equipe
                            if (dadosDono.nome) nomesEquipeTemp.add(dadosDono.nome);

                            // Varredura no array de equipe do dono
                            if (dadosDono.equipe && Array.isArray(dadosDono.equipe)) {
                                for (const membro of dadosDono.equipe) {
                                    let nomeMembroAdicionar = "";
                                    
                                    // O banco pode ter salvo como um objeto {uid, nome} ou só a string do UID
                                    if (typeof membro === 'object' && membro.nome) {
                                        nomeMembroAdicionar = membro.nome;
                                    } else {
                                        let uidMembro = typeof membro === 'object' ? membro.uid : membro;
                                        if (uidMembro) {
                                            try {
                                                // Vai no banco caçar o nome pelo UID
                                                const mDoc = await db.collection('usuarios').doc(uidMembro).get();
                                                if (mDoc.exists && mDoc.data().nome) {
                                                    nomeMembroAdicionar = mDoc.data().nome;
                                                }
                                            } catch(e) {
                                                console.log("Erro ao caçar nome do membro:", e.message);
                                            }
                                        }
                                    }

                                    if (nomeMembroAdicionar) {
                                        nomesEquipeTemp.add(nomeMembroAdicionar);
                                        // Se quem está falando com o bot for o dono, alimenta a variável interna dele
                                        if (isProprietario && uidDoDono === meuUid) {
                                            equipeNomes.push(nomeMembroAdicionar);
                                        }
                                    }
                                }
                            }
                            
                            // Converte de volta para Array para ficar legível
                            equipePorBarbearia[barbeariaAtual] = Array.from(nomesEquipeTemp);

                            // 4. Puxa Serviços e Telefone do Dono
                            tabelaServicosPorBarbearia[barbeariaAtual] = dadosDono.listaServicos || [];
                            
                            let telDono = dadosDono.telefone || "";
                            if (telDono.includes('@')) telDono = telDono.split('@')[0];
                            telefonePorBarbearia[barbeariaAtual] = telDono || "Número não informado";
                        }
                    }
                }
            } catch (e) {
                console.log("[DB] Erro ao buscar identidade/serviços:", e.message);
            }


            // ============================================================
            // 🧠 MEMÓRIA DO BOT
            // ============================================================
            const limitHistorico = 40; 
            const chatRef = db.collection('historico_conversa').doc(remoteJidLimpo).collection('mensagens');

            await chatRef.add({
                role: 'user',
                parts: [{ text: textoRecebido }],
                ts: admin.firestore.FieldValue.serverTimestamp()
            });

            const historySnap = await chatRef.orderBy('ts', 'desc').limit(limitHistorico).get();
            let historicoParaIA = [];
            
            historySnap.forEach(doc => {
                const msg = doc.data();
                if (msg.role && msg.parts) {
                    historicoParaIA.unshift({ role: msg.role, parts: msg.parts });
                }
            });

            // ============================================================
            // 🛠️ FERRAMENTAS COMPLETAS
            // ============================================================
            const tools = [{
                "function_declarations": [
                    {
                        "name": "listar_meus_agendamentos",
                        "description": "Lista agendamentos. Se for o CHEFE perguntando, ele pode informar o nome do barbeiro para ver a agenda dele.",
                        "parameters": { 
                            "type": "OBJECT", 
                            "properties": {
                                "barbeiroAlvo": { "type": "STRING", "description": "Opcional. Nome do profissional" }
                            } 
                        }
                    },
                    {
                        "name": "consultar_disponibilidade",
                        "description": "Busca a lista de TODOS os horários livres de um barbeiro em uma data. Use OBRIGATORIAMENTE para mostrar opções ao cliente.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "data": { "type": "STRING", "description": "Data YYYY-MM-DD" },
                                "barbeiroNome": { "type": "STRING", "description": "Nome do profissional" }
                            },
                            "required": ["data", "barbeiroNome"]
                        }
                    },
                    {
                        "name": "criar_agendamento",
                        "description": "Cria um novo agendamento para o cliente ou para a equipe.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "barbeiroNome": { "type": "STRING", "description": "Nome do barbeiro" },
                                "clienteNome": { "type": "STRING", "description": "Nome do cliente" },
                                "data": { "type": "STRING", "description": "Data YYYY-MM-DD" },
                                "horario": { "type": "STRING", "description": "Horário HH:MM" },
                                "servico": { "type": "STRING", "description": "Nome do serviço" }
                            },
                            "required": ["barbeiroNome", "clienteNome", "data", "horario", "servico"]
                        }
                    },
                    {
                        "name": "atualizar_agendamento",
                        "description": "Altera um agendamento existente. Exige a DATA e o HORÁRIO antigos.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "dataAntiga": { "type": "STRING", "description": "A data atual do agendamento YYYY-MM-DD" },
                                "horarioAntigo": { "type": "STRING", "description": "O horário atual do agendamento HH:MM" },
                                "novaData": { "type": "STRING", "description": "Nova Data YYYY-MM-DD" },
                                "novoHorario": { "type": "STRING", "description": "Novo Horário HH:MM" },
                                "novoServico": { "type": "STRING", "description": "Novo nome do serviço" },
                                "novoBarbeiroNome": { "type": "STRING", "description": "Nome do novo profissional." }
                            },
                            "required": ["dataAntiga", "horarioAntigo"] 
                        }
                    },
                    {
                        "name": "cancelar_agendamento",
                        "description": "Cancela um agendamento específico.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "data": { "type": "STRING", "description": "Data do agendamento YYYY-MM-DD" },
                                "horariocancelar": { "type": "STRING", "description": "Horário a cancelar HH:MM" }
                            },
                            "required": ["data", "horariocancelar"]
                        }
                    },
                    {
                        "name": "excluir_agendamento_definitivo",
                        "description": "Apaga PERMANENTEMENTE um agendamento do banco de dados.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "data": { "type": "STRING", "description": "Data YYYY-MM-DD" },
                                "horario": { "type": "STRING", "description": "Horário HH:MM" }
                            },
                            "required": ["data", "horario"]
                        }
                    },
                    {
                        "name": "atualizar_meu_perfil",
                        "description": "Atualiza ou cria o nome do usuário no banco de dados.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "novoNome": { "type": "STRING", "description": "Novo nome do usuário" }
                            },
                            "required": ["novoNome"]
                        }
                    },
                    {
                        "name": "consultar_gestao_financeira",
                        "description": "Consulta o relatório financeiro e de desempenho (Entradas, Saídas, Saldo). Apenas o Chefe/Proprietário pode usar.",
                        "parameters": {
                            "type": "OBJECT",
                            "properties": {
                                "periodo": { "type": "STRING", "description": "O período desejado: 'dia', 'semana' ou 'mes'." },
                                "barbeiroAlvo": { "type": "STRING", "description": "Opcional. Nome do profissional para filtrar. Se vazio, traz o total da barbearia." }
                            },
                            "required": ["periodo"]
                        }
                    }
                ]
            }];

            // 👈 MAPA COMPLETO PARA A IA (Barbearia -> Contato -> Equipe -> Serviços)
            const listaCompletaIA = Object.keys(equipePorBarbearia).map(barbearia => {
                const profissionais = equipePorBarbearia[barbearia].join(', ');
                const telefoneUnidade = telefonePorBarbearia[barbearia]; // 👈 Puxa o telefone
                const servicos = (tabelaServicosPorBarbearia[barbearia] || []).map(s => {
                    const n = s.nome || "Serviço";
                    const v = s.valor || s.preco || 0;
                    return `• ${n} (R$ ${v})`;
                }).join('\n');
                
                return `💈 UNIDADE: ${barbearia}\n📱 CONTATO PRIVADO: ${telefoneUnidade}\n- Equipe: ${profissionais}\n- TABELA DE SERVIÇOS:\n${servicos || "Nenhum serviço cadastrado"}`;
            }).join('\n\n====================\n\n');

            // ============================================================
            // 🤖 PERSONA MUTA-FORMA
            // ============================================================
            let regrasCargos = "";
            if (isProprietario) {
                regrasCargos = `[ATENÇÃO] Você está falando com o CHEFE / PROPRIETÁRIO do salão. EQUIPE: [${equipeNomes.join(', ')}]. 
                - PODER DE GESTÃO: Ele pode pedir o desempenho financeiro usando 'consultar_gestao_financeira'.
                - Seja direto, como um gerente reportando ao CEO.`;
            } else if (tipoUsuario === 'barbeiro' || tipoUsuario === 'profissional') {
                regrasCargos = `[ATENÇÃO] Você está falando com um PROFISSIONAL da equipe (Barbeiro). Ele gerencia APENAS a própria agenda.`;
            } else {
                regrasCargos = `[ATENÇÃO] Você está falando com um CLIENTE. Siga OBRIGATORIAMENTE este fluxo rigoroso, UM PASSO POR VEZ:
                  PASSO 1: Pergunte: "Em qual barbearia você gostaria de agendar?". PARE DE FALAR AQUI!
                  PASSO 2: Assim que o cliente disser a unidade, olhe o MAPA COMPLETO abaixo. Liste APENAS os profissionais que trabalham naquela unidade e pergunte com quem ele quer cortar.
                  PASSO 3: Leia a TABELA DE SERVIÇOS exclusiva daquela unidade no MAPA COMPLETO e pergunte qual serviço ele deseja. É ESTRITAMENTE PROIBIDO misturar serviços de outras unidades ou inventar serviços.
                  PASSO 4: Pergunte a Data (ex: "amanhã", "sexta-feira").
                  PASSO 5: Use a ferramenta 'consultar_disponibilidade' e mostre os horários.
                  PASSO 6: Pergunte o nome dele caso você ainda não saiba.
                  PASSO 7: Resuma os dados (Unidade, Profissional, Serviço, Data, Horário e o VALOR EXATO da tabela daquela unidade) e peça a confirmação ("SIM").
                  PASSO 8: Agende apenas após o SIM.`;
            }

            const API_KEY = process.env.GEMINI_API_KEY;
            const MODEL_NAME = "gemini-2.5-flash"; 

            const dataHojeBrasil = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
            const dataFormatada = dataHojeBrasil.toLocaleDateString('pt-BR');

            const systemInstruction = {
                parts: [{ text: `Você é a IA Avançada do King Agenda. Hoje é dia ${dataFormatada}.
                Telefone: ${remoteJidLimpo}. Nome detectado: ${nomeConhecido ? nomeConhecido : "Desconhecido"}.
                
                Aqui está o MAPA COMPLETO de Barbearias, Profissionais, Telefones e TABELAS DE SERVIÇOS:
                \n${listaCompletaIA}
                
                ${regrasCargos}

                REGRAS DE OURO E ATALHOS:
                1. ISOLAMENTO DE UNIDADES: Nunca ofereça um serviço de uma unidade para o cliente que escolheu outra unidade.
                2. NÃO INVENTE SERVIÇOS: Ofereça e agende apenas o que estiver na tabela da unidade escolhida.
                3. TRATAMENTO DE ERRO DE HORÁRIO: Se a ferramenta retornar erro de horário indisponível/ocupado/fora do expediente, você DEVE enviar OBRIGATORIAMENTE a seguinte frase exata: "VOCÊ PODE ENTRAR EM CONTATO COM A BARBEARIA NESSE NÚMERO PRIVADO [Inserir aqui o número do CONTATO PRIVADO da unidade que fica no dado "telefone" do usuario que que é o dono ou seja busque no dado "donoUid" o id e depois procure o dado "telefone"] PRA CONSULTAR CORRETAMENTE, POIS POSSO COMETER ALGUNS ERROS!".
                4. NÃO SEJA AFOBADA: Faça UMA pergunta por vez.
                5. PROIBIDO EMENDAR FUNÇÕES: Após usar a ferramenta "consultar_disponibilidade", você é OBRIGADA a responder ao cliente com uma mensagem de texto (fazendo o Resumo do Passo 7). NUNCA chame a função "criar_agendamento" sem que o cliente tenha digitado "SIM".
                6. O ATALHO DO CLIENTE APRESSADO: Se o cliente já informar a data E o horário exatos, faça a consulta de disponibilidade em silêncio. Se o horário que ele pediu estiver na lista de livres, vá direto para o Passo 7 (Resumo). Se não estiver livre, mostre-lhe a lista de horários disponíveis.` }]
            };

            // MANTENHA A LINHA ABAIXO INTACTA
            let respostaFinal = "";

            try {
                console.log(`[IA] Pensando (Cargo: ${isProprietario ? 'Admin' : tipoUsuario})...`);
                
                const response1 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: historicoParaIA, 
                        tools: tools,
                        system_instruction: systemInstruction
                    })
                });

                const data1 = await response1.json();
                
                if (!data1.candidates || !data1.candidates[0]) {
                    respostaFinal = "Tive um lapso de memória. Pode repetir?";
                } else {
                    const part1 = data1.candidates[0].content.parts[0];

                    if (part1.functionCall) {
                        const fnName = part1.functionCall.name;
                        const fnArgs = part1.functionCall.args;
                        console.log(`[IA] Ação: ${fnName}`, fnArgs);

                        let functionResult = {};
                        let fallbackMsg = "";

                        // ============================================================
                        // ⚙️ MOTORES MATEMÁTICOS (Com Subcoleção Agenda Diária)
                        // ============================================================
                        const timeToMin = (t) => {
                            if (!t) return 0;
                            const [h, m] = t.split(':').map(Number);
                            return h * 60 + m;
                        };

                        const minToTime = (m) => {
                            const h = Math.floor(m / 60);
                            const mins = m % 60;
                            return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
                        };

                        const getDateSafe = (field) => {
                            if (!field) return null;
                            if (typeof field.toDate === 'function') return field.toDate();
                            if (field instanceof Date) return field;
                            return new Date(field); 
                        };

const validarExpediente = async (barbeiro, dataStr, novoInicio, novoFim) => {
                            let inicioExp = timeToMin(barbeiro.horarioInicio || "08:00");
                            let fimExp = timeToMin(barbeiro.horarioFim || "20:00");
                            let almocoIn = timeToMin(barbeiro.almocoInicio || "12:00");
                            let almocoOut = timeToMin(barbeiro.almocoFim || "13:00");
                            if (almocoIn === almocoOut) { almocoIn = -1; almocoOut = -1; }

                            let usaAgendaManual = barbeiro.usaAgendaManual === true;
                            let agendaDoDia = barbeiro.agenda || {};

                            try {
                                const agDiariaDoc = await db.collection('usuarios').doc(barbeiro.uid).collection('agenda_diaria').doc(dataStr).get();
                                if (agDiariaDoc.exists) {
                                    const dd = agDiariaDoc.data();
                                    if (dd.horarios && Object.keys(dd.horarios).length > 0) { agendaDoDia = dd.horarios; usaAgendaManual = true; }
                                    else if (Object.keys(dd).length > 0 && !dd.horarios) { agendaDoDia = dd; usaAgendaManual = true; }
                                }
                            } catch (e) {}

                            // Regra 1: Fora do limite geral?
                            if (novoInicio < inicioExp || novoFim > fimExp) return false;
                            
                            // Regra 2: Caiu no horário de almoço padrão?
                            if (!usaAgendaManual && almocoIn !== -1 && ((novoInicio >= almocoIn && novoInicio < almocoOut) || (novoFim > almocoIn && novoFim <= almocoOut) || (novoInicio <= almocoIn && novoFim >= almocoOut))) return false;
                            
                            // Regra 3: Bateu nos blocos de 30min da agenda manual?
                            if (usaAgendaManual) {
                                for (let i = novoInicio; i < novoFim; i += 30) {
                                    const st = agendaDoDia[minToTime(i)];
                                    if (st === false || String(st).toLowerCase() === "false" || String(st).toLowerCase() === "ocupado") return false;
                                }
                            }
                            return true; // Passou em tudo! Tá livre!
                        };

                        // Assíncrono para ler a subcoleção agenda_diaria
                        const getWorkingIntervals = async (barbeiro, dataStr) => {
                            let agendaDoDia = barbeiro.agenda || {};

                            try {
                                const agendaDiariaDoc = await db.collection('usuarios').doc(barbeiro.uid).collection('agenda_diaria').doc(dataStr).get();
                                if (agendaDiariaDoc.exists) {
                                    const dadosDiarios = agendaDiariaDoc.data();
                                    agendaDoDia = dadosDiarios.horarios || dadosDiarios; 
                                }
                            } catch (e) {
                                console.log("[DB] Sem agenda_diaria especial para o dia, usando agenda fixa.");
                            }
                                
                            let baseSlots = [];
                            for (const [horaTxt, taLivre] of Object.entries(agendaDoDia)) {
                                // 🛠️ CORREÇÃO: Agora aceita boolean (true) ou texto ("true", "livre") do banco de dados!
                                if (taLivre === true || String(taLivre).toLowerCase() === "true" || String(taLivre).toLowerCase() === "livre") {
                                    let hFormat = horaTxt.length === 4 ? "0" + horaTxt : horaTxt;
                                    baseSlots.push(timeToMin(hFormat));
                                }
                            }
                            baseSlots.sort((a, b) => a - b);
                            
                            let intervals = [];
                            if (baseSlots.length > 0) {
                                let start = baseSlots[0];
                                let end = baseSlots[0] + 30; 
                                for (let i = 1; i < baseSlots.length; i++) {
                                    if (baseSlots[i] === end) {
                                        end += 30; 
                                    } else if (baseSlots[i] > end) {
                                        intervals.push({ start, end });
                                        start = baseSlots[i];
                                        end = baseSlots[i] + 30;
                                    }
                                }
                                intervals.push({ start, end });
                            }
                            return { intervals, baseSlots };
                        };

                        const isWithinWorkingHours = (start, end, intervals) => {
                            for (let iv of intervals) {
                                if (start >= iv.start && end <= iv.end) return true;
                            }
                            return false;
                        };

                        let baseQuery = db.collection('agendamentos');
                        if (!isProprietario) { 
                            if (tipoUsuario === 'barbeiro' || tipoUsuario === 'profissional') {
                                baseQuery = baseQuery.where('barbeiroUid', '==', meuUid); 
                            } else {
                                baseQuery = baseQuery.where('clienteTelefone', '==', remoteJidLimpo); 
                            }
                        }

                        // === 1. LISTAR AGENDAMENTOS ===
                        if (fnName === "listar_meus_agendamentos") {
                            try {
                                let queryListar = baseQuery.where('status', 'in', ['confirmado', 'conclusão pendente']);
                                const snap = await queryListar.get();

                                if (snap.empty) {
                                    functionResult = { msg: "Nenhum agendamento encontrado." };
                                } else {
                                    let lista = [];
                                    const buscaNome = fnArgs.barbeiroAlvo ? fnArgs.barbeiroAlvo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : null;
                                    
                                    snap.forEach(doc => {
                                        const d = doc.data();
                                        const nomeBanco = (d.barbeiroNome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        if (!buscaNome || nomeBanco.includes(buscaNome)) {
                                            lista.push(`- Dia ${d.data} às ${d.horario}: ${d.servico} com ${d.barbeiroNome} (Cliente: ${d.clienteNome})`);
                                        }
                                    });

                                    functionResult = { status: "SUCESSO", agendamentos: lista };
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 2. CONSULTAR DISPONIBILIDADE (MOTOR MATEMÁTICO DOMINÓ) ===
                        else if (fnName === "consultar_disponibilidade") {
                            try {
                                const allUsers = await db.collection('usuarios').get();
                                let barbeiroEncontrado = null;
                                const nomeBusca = fnArgs.barbeiroNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                                allUsers.forEach(doc => {
                                    const d = doc.data();
                                    const ehValido = (d.tipo !== 'admin' || d.isProprietario === true);
                                    if (ehValido) { 
                                        const nomeBanco = (d.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        if (nomeBanco.includes(nomeBusca)) {
                                            barbeiroEncontrado = { uid: doc.id, ...d };
                                        }
                                    }
                                });

                                if (!barbeiroEncontrado) {
                                    functionResult = { erro: "Profissional não encontrado." };
                                } else {
                                    let inicioExp = timeToMin(barbeiroEncontrado.horarioInicio || "08:00");
                                    let fimExp = timeToMin(barbeiroEncontrado.horarioFim || "20:00");
                                    let almocoIn = timeToMin(barbeiroEncontrado.almocoInicio || "12:00");
                                    let almocoOut = timeToMin(barbeiroEncontrado.almocoFim || "13:00");
                                    if (almocoIn === almocoOut) { almocoIn = -1; almocoOut = -1; }
                                    
                                    let usaAgendaManual = barbeiroEncontrado.usaAgendaManual === true;
                                    let agendaDoDia = barbeiroEncontrado.agenda || {}; 

                                    try {
                                        const agendaDiariaDoc = await db.collection('usuarios').doc(barbeiroEncontrado.uid).collection('agenda_diaria').doc(fnArgs.data).get();
                                        if (agendaDiariaDoc.exists) {
                                            const dadosDiarios = agendaDiariaDoc.data();
                                            if (dadosDiarios.horarios && Object.keys(dadosDiarios.horarios).length > 0) {
                                                agendaDoDia = dadosDiarios.horarios;
                                                usaAgendaManual = true; 
                                            } else if (Object.keys(dadosDiarios).length > 0 && !dadosDiarios.horarios) {
                                                agendaDoDia = dadosDiarios;
                                                usaAgendaManual = true;
                                            }
                                        }
                                    } catch (e) {}

                                    const agSnap = await db.collection('agendamentos')
                                        .where('barbeiroUid', '==', barbeiroEncontrado.uid)
                                        .where('data', '==', fnArgs.data)
                                        .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                        .get(); 
                                    
                                    const ocupados = [];
                                    agSnap.forEach(doc => {
                                        const ag = doc.data();
                                        let inicio = timeToMin(ag.horario);
                                        let duracao = ag.duracao ? Number(ag.duracao) : 30; 
                                        let fim = inicio + duracao;
                                        ocupados.push({ inicio, fim, servico: ag.servico });
                                    });

                                    // 💡 A MÁGICA: Odena os ocupados do mais cedo pro mais tarde
                                    ocupados.sort((a, b) => a.inicio - b.inicio);

                                    const hoje = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                                    const isToday = fnArgs.data === hoje.toISOString().split('T')[0];
                                    const agoraMin = hoje.getHours() * 60 + hoje.getMinutes();

                                    let horariosLivres = [];
                                    const duracaoPadrao = barbeiroEncontrado.intervaloAtendimento ? Number(barbeiroEncontrado.intervaloAtendimento) : 30;
                                    
                                    // 💡 O CURSOR DESLIZANTE
                                    let cursor = inicioExp;

                                    while (cursor <= fimExp - duracaoPadrao) {
                                        // A. O horário já passou?
                                        if (isToday && cursor <= agoraMin) {
                                            cursor += duracaoPadrao;
                                            continue;
                                        }

                                        // B. Horário de almoço padrão
                                        if (!usaAgendaManual && almocoIn !== -1 && cursor >= almocoIn && cursor < almocoOut) {
                                            cursor = almocoOut;
                                            continue;
                                        }

                                        // C. CÁLCULO ANTI-ACAVALAMENTO COM PULO INTELIGENTE
                                        let colidiu = false;
                                        let salto = 0;
                                        let slotFim = cursor + duracaoPadrao;
                                        
                                        for (const oc of ocupados) {
                                            if (cursor < oc.fim && slotFim > oc.inicio) {
                                                colidiu = true;
                                                salto = oc.fim; // Se bateu, desliza o cursor exatamente para o FIM do serviço (Ex: 18:40)
                                                break;
                                            }
                                        }

                                        if (colidiu) {
                                            cursor = salto;
                                            continue;
                                        }

                                        const horaFormatada = minToTime(cursor);

                                        // D. Verificação da Agenda Manual
                                        if (usaAgendaManual) {
                                            const statusSlot = agendaDoDia[horaFormatada];
                                            if (statusSlot === false || String(statusSlot).toLowerCase() === "false" || String(statusSlot).toLowerCase() === "ocupado") {
                                                cursor += duracaoPadrao;
                                                continue;
                                            }
                                        }

                                        // E. Verifica se cabe no "buraco" antes do próximo
                                        let proximoObstaculo = fimExp;
                                        const proxBlk = ocupados.find(b => b.inicio > cursor);
                                        if (proxBlk && proxBlk.inicio < proximoObstaculo) proximoObstaculo = proxBlk.inicio;
                                        if (!usaAgendaManual && almocoIn !== -1 && cursor < almocoIn && almocoIn < proximoObstaculo) proximoObstaculo = almocoIn;

                                        if ((proximoObstaculo - cursor) >= duracaoPadrao) {
                                            horariosLivres.push(horaFormatada);
                                        }

                                        cursor += duracaoPadrao;
                                    }

                                    if (horariosLivres.length > 0) {
                                        functionResult = { status: "LIVRE", horarios: horariosLivres };
                                    } else {
                                        functionResult = { status: "LOTADO", msg: "A agenda deste profissional está 100% lotada ou bloqueada neste dia." };
                                    }
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 3. CRIAR AGENDAMENTO ===
                        else if (fnName === "criar_agendamento") {
                            try {
                                const allUsers = await db.collection('usuarios').get();
                                let barbeiroEncontrado = null;
                                const nomeBusca = fnArgs.barbeiroNome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

                                allUsers.forEach(doc => {
                                    const d = doc.data();
                                    const ehValido = (d.tipo !== 'admin' || d.isProprietario === true);
                                    if (ehValido) { 
                                        const nomeBanco = (d.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        if (nomeBanco.includes(nomeBusca)) {
                                            barbeiroEncontrado = { 
                                                uid: doc.id, 
                                                nome: d.nome, 
                                                percentual: d.percentualComissao || 50, 
                                                agenda: d.agenda,
                                                listaServicos: d.listaServicos, // 👈 SALVA A LISTA DELE
                                                nomeBarbearia: d.nomeBarbearia || "Barbearia King",
                                                donoUid: d.donoUid || d.vinculoSalao || (d.pertenceABarbearia ? d.pertenceABarbearia.uid : null) || doc.id 
                                            };
                                        }
                                    }
                                });

                                if (!barbeiroEncontrado) {
                                    functionResult = { erro: "Profissional não encontrado." };
                                } else {
                                    let horaFinal = fnArgs.horario;
                                    if (!horaFinal.startsWith("0") && horaFinal.length === 4) horaFinal = "0" + horaFinal;
                                    
                                    const novoInicio = timeToMin(horaFinal);
                                    
                                    // 🎯 BUSCA A LISTA OFICIAL DO BARBEIRO OU DO DONO DIRETAMENTE DO BANCO!
                                    let lista = barbeiroEncontrado.listaServicos || [];
                                    if (lista.length === 0) {
                                        let idDono = barbeiroEncontrado.donoUid;
                                        if (typeof idDono === 'object' && idDono !== null) idDono = idDono.uid;
                                        if (idDono && idDono !== barbeiroEncontrado.uid) {
                                            const docDono = await db.collection('usuarios').doc(idDono).get();
                                            if (docDono.exists && docDono.data().listaServicos) {
                                                lista = docDono.data().listaServicos;
                                            }
                                        }
                                    }
                                    
                                    let valorServico = 0; 
                                    let nomeServicoOficial = "";
                                    let duracaoServicoFinal = 30; 
                                    let servicoEncontradoNoBanco = false; 

                                    if (lista.length > 0) {
                                        const buscaServico = fnArgs.servico.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                        
                                        let achado = lista.find(s => {
                                            const nomeS = String(s.nome || s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                            return nomeS === buscaServico;
                                        });

                                        if (!achado) {
                                            const listaOrdenada = [...lista].sort((a, b) => String(b.nome||"").length - String(a.nome||"").length);
                                            achado = listaOrdenada.find(s => {
                                                const nomeS = String(s.nome || s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                return nomeS.includes(buscaServico) || buscaServico.includes(nomeS);
                                            });
                                        }
                                        
                                        if (achado) {
                                            servicoEncontradoNoBanco = true;
                                            if (achado.valor) valorServico = Number(achado.valor);
                                            else if (achado.preco) valorServico = Number(achado.preco);
                                            if (achado.duracao) duracaoServicoFinal = Number(achado.duracao);
                                            nomeServicoOficial = achado.nome || achado;
                                        }
                                    }

                                    if (!servicoEncontradoNoBanco) {
                                        functionResult = { erro: `O serviço '${fnArgs.servico}' NÃO EXISTE na tabela oficial. Use exatamente os nomes listados no cardápio.` };
                                    } else {
                                        const novoFim = novoInicio + duracaoServicoFinal; 
                                        const isValido = await validarExpediente(barbeiroEncontrado, fnArgs.data, novoInicio, novoFim);

                                        if (!isValido) {
                                            functionResult = { erro: "O horário escolhido está fora do expediente/agenda_diaria." };
                                        } else {
                                            const conflitoSnap = await db.collection('agendamentos')
                                                .where('barbeiroUid', '==', barbeiroEncontrado.uid)
                                                .where('data', '==', fnArgs.data)
                                                .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                                .limit(100)
                                                .get();

                                            let temConflito = false;
                                            conflitoSnap.forEach(doc => {
                                                const ag = doc.data();
                                                const ocInicio = timeToMin(ag.horario);
                                                const ocDuracao = ag.duracao ? Number(ag.duracao) : 40;
                                                const ocFim = ocInicio + ocDuracao; 
                                                if (novoInicio < ocFim && novoFim > ocInicio) {
                                                    temConflito = true;
                                                }
                                            });

                                            if (temConflito) {
                                                functionResult = { erro: "HORÁRIO JÁ OCUPADO (Acavalamento detectado)." };
                                            } else {
                                                const comissao = (valorServico * barbeiroEncontrado.percentual) / 100;
                                                const telefoneSalvar = (typeof isProprietario !== 'undefined' && (isProprietario || tipoUsuario === 'barbeiro' || tipoUsuario === 'profissional')) ? "whatsapp_gerencia" : remoteJidLimpo;

                                                await db.collection('agendamentos').add({
                                                    barbeiroUid: barbeiroEncontrado.uid,
                                                    barbeiroNome: barbeiroEncontrado.nome,
                                                    nomeBarbearia: barbeiroEncontrado.nomeBarbearia, 
                                                    clienteNome: fnArgs.clienteNome,
                                                    clienteTelefone: telefoneSalvar,
                                                    clienteUid: "whatsapp_guest",
                                                    data: fnArgs.data,
                                                    horario: horaFinal,
                                                    servico: nomeServicoOficial,
                                                    duracao: duracaoServicoFinal,
                                                    valor: valorServico,
                                                    valorOriginal: valorServico,
                                                    valorFinalPago: valorServico,
                                                    status: "confirmado",
                                                    origem: "whatsapp_bot",
                                                    ts: admin.firestore.FieldValue.serverTimestamp(),
                                                    visualizado: false,
                                                    comissaoCalculada: comissao,
                                                    percentualComissao: barbeiroEncontrado.percentual,
                                                    metodosPagamento: { dinheiro: 0, pix: 0, credito: 0, debito: 0 }
                                                });
                                                
                                                functionResult = { status: "SUCESSO", valor: valorServico };
                                            }
                                        }
                                    } 
                                } 
                            } catch (e) { functionResult = { erro: "Erro ao agendar: " + e.message }; }
                        }

                        // === 4. ATUALIZAR AGENDAMENTO ===
                        else if (fnName === "atualizar_agendamento") {
                            try {
                                let hAntigo = fnArgs.horarioAntigo;
                                if (hAntigo && !hAntigo.startsWith("0") && hAntigo.length === 4) hAntigo = "0" + hAntigo;

                                const agSnap = await baseQuery
                                    .where('data', '==', fnArgs.dataAntiga)
                                    .where('horario', '==', hAntigo)
                                    .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                    .get();

                                if (agSnap.empty) {
                                    functionResult = { erro: "Agendamento antigo não encontrado ou sem permissão." };
                                } else {
                                    const targetDoc = agSnap.docs[0];
                                    const oldData = targetDoc.data();
                                    
                                    let novaDataFinal = fnArgs.novaData || oldData.data;
                                    let novoHorarioFinal = fnArgs.novoHorario || oldData.horario;
                                    if (!novoHorarioFinal.startsWith("0") && novoHorarioFinal.length === 4) novoHorarioFinal = "0" + novoHorarioFinal;

                                    let novoBarbeiroUid = oldData.barbeiroUid;
                                    let novoBarbeiroNome = oldData.barbeiroNome;
                                    let barbeiroObjCompleto = null;

                                    const allUsers = await db.collection('usuarios').get();
                                    const buscaNomeB = (fnArgs.novoBarbeiroNome || oldData.barbeiroNome).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                    
                                    allUsers.forEach(uDoc => {
                                        const u = uDoc.data();
                                        const nomeBanco = (u.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        if (nomeBanco.includes(buscaNomeB)) { 
                                            novoBarbeiroUid = uDoc.id; 
                                            novoBarbeiroNome = u.nome; 
                                            barbeiroObjCompleto = { uid: uDoc.id, ...u }; 
                                        }
                                    });

                                    if (!barbeiroObjCompleto) {
                                        functionResult = { erro: "Profissional destino não encontrado." };
                                    } else {
                                        
                                        let duracaoServ = oldData.duracao ? Number(oldData.duracao) : 30;
                                        let valorServico = oldData.valorOriginal || oldData.valor || 0;
                                        let nomeServicoOficial = oldData.servico;
                                        let comissaoCalculada = oldData.comissaoCalculada || 0;
                                        let percentual = barbeiroObjCompleto.percentualComissao || barbeiroObjCompleto.comissao || barbeiroObjCompleto.taxaComissao || 50;

                                        if (fnArgs.novoServico) {
                                            // 🎯 BUSCA A LISTA OFICIAL DO BARBEIRO OU DO DONO DIRETAMENTE DO BANCO!
                                            let lista = barbeiroObjCompleto.listaServicos || [];
                                            if (lista.length === 0) {
                                                let idDono = barbeiroObjCompleto.donoUid || barbeiroObjCompleto.vinculoSalao || (barbeiroObjCompleto.pertenceABarbearia ? barbeiroObjCompleto.pertenceABarbearia.uid : null);
                                                if (typeof idDono === 'object' && idDono !== null) idDono = idDono.uid;
                                                if (idDono && idDono !== barbeiroObjCompleto.uid) {
                                                    const docDono = await db.collection('usuarios').doc(idDono).get();
                                                    if (docDono.exists && docDono.data().listaServicos) {
                                                        lista = docDono.data().listaServicos;
                                                    }
                                                }
                                            }
                                            
                                            const buscaServico = fnArgs.novoServico.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                            
                                            let achado = lista.find(s => {
                                                const nomeS = String(s.nome || s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                return nomeS === buscaServico;
                                            });

                                            if (!achado) {
                                                const listaOrdenada = [...lista].sort((a, b) => String(b.nome||"").length - String(a.nome||"").length);
                                                achado = listaOrdenada.find(s => {
                                                    const nomeS = String(s.nome || s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                    return nomeS.includes(buscaServico) || buscaServico.includes(nomeS);
                                                });
                                            }

                                            if (achado) {
                                                if (achado.valor) valorServico = Number(achado.valor);
                                                else if (achado.preco) valorServico = Number(achado.preco);
                                                if (achado.duracao) duracaoServ = Number(achado.duracao);
                                                nomeServicoOficial = achado.nome || achado;
                                                comissaoCalculada = (valorServico * Number(percentual)) / 100;
                                            } else {
                                                functionResult = { erro: `O serviço '${fnArgs.novoServico}' NÃO EXISTE na tabela.` };
                                                return;
                                            }
                                        }

                                        const novoInicio = timeToMin(novoHorarioFinal);
                                        const novoFim = novoInicio + duracaoServ; 
                                        const isValido = await validarExpediente(barbeiroObjCompleto, novaDataFinal, novoInicio, novoFim);

                                        if (!isValido) {
                                            functionResult = { erro: "O novo horário está fora do expediente." };
                                        } else {
                                            const conflitoSnap = await db.collection('agendamentos')
                                                .where('barbeiroUid', '==', novoBarbeiroUid)
                                                .where('data', '==', novaDataFinal)
                                                .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                                .limit(100)
                                                .get();

                                            let temConflito = false;
                                            conflitoSnap.forEach(doc => {
                                                if (doc.id !== targetDoc.id) { 
                                                    const ag = doc.data();
                                                    const ocInicio = timeToMin(ag.horario);
                                                    const ocDuracao = ag.duracao ? Number(ag.duracao) : 30;
                                                    const ocFim = ocInicio + ocDuracao; 
                                                    if (novoInicio < ocFim && novoFim > ocInicio) {
                                                        temConflito = true;
                                                    }
                                                }
                                            });

                                            if (temConflito) {
                                                functionResult = { erro: "HORÁRIO NOVO JÁ OCUPADO." };
                                            } else {
                                                let novosDados = {
                                                    data: novaDataFinal,
                                                    horario: novoHorarioFinal,
                                                    barbeiroUid: novoBarbeiroUid,
                                                    barbeiroNome: novoBarbeiroNome,
                                                    servico: nomeServicoOficial,
                                                    valor: valorServico,
                                                    valorOriginal: valorServico,
                                                    valorFinalPago: valorServico,
                                                    duracao: duracaoServ,
                                                    comissaoCalculada: comissaoCalculada,
                                                    percentualComissao: Number(percentual),
                                                    editadoEm: admin.firestore.FieldValue.serverTimestamp()
                                                };

                                                await db.collection('agendamentos').doc(targetDoc.id).update(novosDados);
                                                functionResult = { status: "SUCESSO", msg: "Atualizado.", novoValor: valorServico };
                                            }
                                        }
                                    }
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 4. ATUALIZAR AGENDAMENTO ===
                        else if (fnName === "atualizar_agendamento") {
                            try {
                                let hAntigo = fnArgs.horarioAntigo;
                                if (hAntigo && !hAntigo.startsWith("0") && hAntigo.length === 4) hAntigo = "0" + hAntigo;

                                const agSnap = await baseQuery
                                    .where('data', '==', fnArgs.dataAntiga)
                                    .where('horario', '==', hAntigo)
                                    .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                    .get();

                                if (agSnap.empty) {
                                    functionResult = { erro: "Agendamento antigo não encontrado ou sem permissão." };
                                } else {
                                    const targetDoc = agSnap.docs[0];
                                    const oldData = targetDoc.data();
                                    
                                    let novaDataFinal = fnArgs.novaData || oldData.data;
                                    let novoHorarioFinal = fnArgs.novoHorario || oldData.horario;
                                    if (!novoHorarioFinal.startsWith("0") && novoHorarioFinal.length === 4) novoHorarioFinal = "0" + novoHorarioFinal;

                                    let novoBarbeiroUid = oldData.barbeiroUid;
                                    let novoBarbeiroNome = oldData.barbeiroNome;
                                    let barbeiroObjCompleto = null;

                                    const allUsers = await db.collection('usuarios').get();
                                    const buscaNomeB = (fnArgs.novoBarbeiroNome || oldData.barbeiroNome).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                    
                                    allUsers.forEach(uDoc => {
                                        const u = uDoc.data();
                                        const nomeBanco = (u.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        if (nomeBanco.includes(buscaNomeB)) { 
                                            novoBarbeiroUid = uDoc.id; 
                                            novoBarbeiroNome = u.nome; 
                                            barbeiroObjCompleto = { uid: uDoc.id, ...u }; // Garante que o uid esteja dentro do objeto
                                        }
                                    });

                                    if (!barbeiroObjCompleto) {
                                        functionResult = { erro: "Profissional destino não encontrado." };
                                    } else {
                                        
                                        // 🚀 A MÁGICA COMEÇA AQUI: Busca o novo serviço na tabela real
                                        let duracaoServ = oldData.duracao ? Number(oldData.duracao) : 30;
                                        let valorServico = oldData.valorOriginal || oldData.valor || 0;
                                        let nomeServicoOficial = oldData.servico;
                                        let comissaoCalculada = oldData.comissaoCalculada || 0;
                                        
                                        // Busca o percentual do barbeiro (com vários fallbacks de segurança)
                                        let percentual = barbeiroObjCompleto.percentualComissao || barbeiroObjCompleto.comissao || barbeiroObjCompleto.taxaComissao || 50;

                                        // Se a IA solicitou a troca de serviço
                                        if (fnArgs.novoServico) {
                                            const nomeBarbeariaTarget = barbeiroObjCompleto.nomeBarbearia || "Barbearia King";
                                            // Puxa da tabela geral da barbearia OU da lista individual do barbeiro
                                            const lista = tabelaServicosPorBarbearia[nomeBarbeariaTarget] || barbeiroObjCompleto.listaServicos || [];
                                            
                                            const buscaServico = fnArgs.novoServico.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                            
                                            let achado = lista.find(s => {
                                                const nomeS = String(s.nome || s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                return nomeS === buscaServico;
                                            });

                                            if (!achado) {
                                                const listaOrdenada = [...lista].sort((a, b) => String(b.nome||"").length - String(a.nome||"").length);
                                                achado = listaOrdenada.find(s => {
                                                    const nomeS = String(s.nome || s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                                    return nomeS.includes(buscaServico) || buscaServico.includes(nomeS);
                                                });
                                            }

                                            // SE ACHOU O SERVIÇO NA TABELA, ATUALIZA TUDO!
                                            if (achado) {
                                                if (achado.valor) valorServico = Number(achado.valor);
                                                else if (achado.preco) valorServico = Number(achado.preco);
                                                
                                                if (achado.duracao) duracaoServ = Number(achado.duracao);
                                                nomeServicoOficial = achado.nome || achado;
                                                
                                                // Recalcula a comissão
                                                comissaoCalculada = (valorServico * Number(percentual)) / 100;
                                            } else {
                                                // Se a IA inventou um serviço que não existe, cancela a operação
                                                functionResult = { erro: `O serviço '${fnArgs.novoServico}' NÃO EXISTE na tabela.` };
                                                return; // Aborta
                                            }
                                        }

                                        const novoInicio = timeToMin(novoHorarioFinal);
                                        const novoFim = novoInicio + duracaoServ; 
                                        const isValido = await validarExpediente(barbeiroObjCompleto, novaDataFinal, novoInicio, novoFim);

                                        if (!isValido) {
                                            functionResult = { erro: "O novo horário está fora do expediente da agenda_diaria." };
                                        } else {
                                            const conflitoSnap = await db.collection('agendamentos')
                                                .where('barbeiroUid', '==', novoBarbeiroUid)
                                                .where('data', '==', novaDataFinal)
                                                .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                                .limit(100)
                                                .get();

                                            let temConflito = false;
                                            conflitoSnap.forEach(doc => {
                                                if (doc.id !== targetDoc.id) { 
                                                    const ag = doc.data();
                                                    const ocInicio = timeToMin(ag.horario);
                                                    const ocDuracao = ag.duracao ? Number(ag.duracao) : 30;
                                                    const ocFim = ocInicio + ocDuracao; 
                                                    // Verifica o acavalamento usando a NOVA duração
                                                    if (novoInicio < ocFim && novoFim > ocInicio) {
                                                        temConflito = true;
                                                    }
                                                }
                                            });

                                            if (temConflito) {
                                                functionResult = { erro: "HORÁRIO NOVO JÁ OCUPADO (Não há tempo suficiente para este serviço)." };
                                            } else {
                                                
                                                // 📦 MONTA O PACOTE DE ATUALIZAÇÃO COMPLETO
                                                let novosDados = {
                                                    data: novaDataFinal,
                                                    horario: novoHorarioFinal,
                                                    barbeiroUid: novoBarbeiroUid,
                                                    barbeiroNome: novoBarbeiroNome,
                                                    servico: nomeServicoOficial,
                                                    valor: valorServico,
                                                    valorOriginal: valorServico,
                                                    valorFinalPago: valorServico,
                                                    duracao: duracaoServ,
                                                    comissaoCalculada: comissaoCalculada,
                                                    percentualComissao: Number(percentual),
                                                    editadoEm: admin.firestore.FieldValue.serverTimestamp()
                                                };

                                                await db.collection('agendamentos').doc(targetDoc.id).update(novosDados);
                                                functionResult = { status: "SUCESSO", msg: "Atualizado.", novoValor: valorServico };
                                            }
                                        }
                                    }
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 5. CANCELAR AGENDAMENTO ===
                        else if (fnName === "cancelar_agendamento") {
                            try {
                                let hCanc = fnArgs.horariocancelar;
                                if (hCanc && !hCanc.startsWith("0") && hCanc.length === 4) hCanc = "0" + hCanc;

                                const agSnap = await baseQuery
                                    .where('data', '==', fnArgs.data)
                                    .where('horario', '==', hCanc)
                                    .where('status', 'in', ['confirmado', 'conclusão pendente'])
                                    .get();

                                if (agSnap.empty) {
                                    functionResult = { erro: "Agendamento não encontrado ou sem permissão." };
                                } else {
                                    await db.collection('agendamentos').doc(agSnap.docs[0].id).update({ status: 'cancelado' });
                                    functionResult = { status: "CANCELADO" };
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 6. EXCLUIR DEFINITIVO ===
                        else if (fnName === "excluir_agendamento_definitivo") {
                            try {
                                let hCanc = fnArgs.horario;
                                if (hCanc && !hCanc.startsWith("0") && hCanc.length === 4) hCanc = "0" + hCanc;

                                const agSnap = await baseQuery
                                    .where('data', '==', fnArgs.data)
                                    .where('horario', '==', hCanc)
                                    .get();

                                if (agSnap.empty) {
                                    functionResult = { erro: "Agendamento não encontrado para exclusão." };
                                } else {
                                    await db.collection('agendamentos').doc(agSnap.docs[0].id).delete(); 
                                    functionResult = { status: "SUCESSO", msg: "Apagado." };
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 7. ATUALIZAR NOME DO PERFIL ===
                        else if (fnName === "atualizar_meu_perfil") {
                            try {
                                const userSnap = await db.collection('usuarios').where('telefone', '==', remoteJidLimpo).limit(1).get();
                                if (userSnap.empty) {
                                    await db.collection('usuarios').add({
                                        telefone: remoteJidLimpo,
                                        nome: fnArgs.novoNome,
                                        tipo: 'cliente',
                                        ts: admin.firestore.FieldValue.serverTimestamp()
                                    });
                                } else {
                                    await db.collection('usuarios').doc(userSnap.docs[0].id).update({ nome: fnArgs.novoNome });
                                }
                                functionResult = { status: "SUCESSO" };
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        // === 8. CONSULTAR GESTÃO FINANCEIRA ===
                        else if (fnName === "consultar_gestao_financeira") {
                            try {
                                if (!isProprietario && tipoUsuario !== 'admin') {
                                    functionResult = { erro: "Acesso Negado. Apenas o Proprietário tem acesso ao relatório financeiro." };
                                } else {
                                    const periodo = fnArgs.periodo || 'dia';
                                    const hoje = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
                                    let dataInicio = new Date(hoje);
                                    
                                    if (periodo === 'dia') {
                                        dataInicio.setHours(0, 0, 0, 0);
                                    } else if (periodo === 'semana') {
                                        const diaDaSemana = hoje.getDay();
                                        dataInicio.setDate(hoje.getDate() - diaDaSemana);
                                        dataInicio.setHours(0, 0, 0, 0);
                                    } else if (periodo === 'mes') {
                                        dataInicio.setDate(1);
                                        dataInicio.setHours(0, 0, 0, 0);
                                    }

                                    let targetUid = null;
                                    let nomeAlvo = "Toda a Barbearia";
                                    
                                    if (fnArgs.barbeiroAlvo) {
                                        const buscaNome = fnArgs.barbeiroAlvo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                        const allUsers = await db.collection('usuarios').get();
                                        allUsers.forEach(doc => {
                                            const u = doc.data();
                                            const nomeBanco = (u.nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                            if (nomeBanco.includes(buscaNome)) {
                                                targetUid = doc.id;
                                                nomeAlvo = u.nome;
                                            }
                                        });
                                    }

                                    // Busca Agendamentos (Concluídos)
                                    let queryAgendamentos = db.collection('agendamentos').where('status', 'in', ['concluido']);
                                    const agSnap = await queryAgendamentos.get();
                                    
                                    let totalEntradas = 0;
                                    let qtdServicos = 0;

                                    agSnap.forEach(doc => {
                                        const ag = doc.data();
                                        let tsAgendamento = getDateSafe(ag.dataConclusaoFalsa) || getDateSafe(ag.dataConclusao) || getDateSafe(ag.ts);

                                        if (tsAgendamento && tsAgendamento >= dataInicio && tsAgendamento <= hoje) {
                                            if (targetUid && ag.barbeiroUid !== targetUid) return;
                                            
                                            let valor = Number(ag.valorFinalPago || ag.valor || 0);
                                            totalEntradas += valor;
                                            qtdServicos++;
                                        }
                                    });

                                    // Busca Extrato Financeiro Manual
                                    let queryExtrato = db.collection('extrato_financeiro');
                                    const exSnap = await queryExtrato.get();
                                    
                                    let totalSaidas = 0;
                                    let totalEntradasManuais = 0;

                                    exSnap.forEach(doc => {
                                        const ex = doc.data();
                                        let tsExtrato = getDateSafe(ex.dataEvento) || getDateSafe(ex.ts);

                                        if (tsExtrato && tsExtrato >= dataInicio && tsExtrato <= hoje) {
                                            if (targetUid && ex.usuarioUid !== targetUid && ex.uidProfissional !== targetUid) return;
                                            
                                            let valor = Number(ex.valor || 0);
                                            if (ex.tipo === 'saida' || ex.tipo === 'despesa') {
                                                totalSaidas += valor;
                                            } else if (ex.tipo === 'entrada') {
                                                totalEntradasManuais += valor;
                                            }
                                        }
                                    });

                                    let somaTotalEntradas = totalEntradas + totalEntradasManuais;
                                    let lucroLiquido = somaTotalEntradas - totalSaidas;

                                    functionResult = { 
                                        status: "SUCESSO", 
                                        periodo: periodo,
                                        profissionalAnalisado: nomeAlvo,
                                        dadosFinanceiros: {
                                            servicosRealizadosConcluidos: qtdServicos,
                                            faturamentoServicos: somaTotalEntradas,
                                            totalDespesasSaidas: totalSaidas,
                                            lucroLiquidoFinal: lucroLiquido
                                        }
                                    };
                                }
                            } catch (e) { functionResult = { erro: e.message }; }
                        }

                        console.log("[IA] Resultado Real:", functionResult);

                        // 3️⃣ SEGUNDA CHAMADA
                        try {
                            const response2 = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    contents: [
                                        ...historicoParaIA, 
                                        { role: "model", parts: [part1] }, 
                                        {
                                            role: "function",
                                            parts: [{
                                                functionResponse: {
                                                    name: fnName,
                                                    response: { name: fnName, content: functionResult }
                                                }
                                            }]
                                        }
                                    ],
                                    tools: tools
                                })
                            });

                            const data2 = await response2.json();
                            
                            if (data2.candidates && data2.candidates[0] && data2.candidates[0].content && data2.candidates[0].content.parts && data2.candidates[0].content.parts[0].text) {
                                respostaFinal = data2.candidates[0].content.parts[0].text;
                            } else {
                                console.log("[IA] Texto vazio na volta. Usando Fallback.");
                                respostaFinal = fallbackMsg;
                            }

                        } catch (err2) {
                            console.error("[IA] Fallback:", err2.message);
                            respostaFinal = fallbackMsg; 
                        }
                    } else {
                        respostaFinal = part1.text || "Pode repetir?";
                    }
                }
            } catch (err) {
                console.error("[IA] Erro Geral:", err);
                respostaFinal = "Erro no servidor.";
            }

            // 💾 SALVA RESPOSTA
            if (respostaFinal) {
                await chatRef.add({
                    role: 'model',
                    parts: [{ text: respostaFinal }],
                    ts: admin.firestore.FieldValue.serverTimestamp()
                });
            }

            // --- ENVIO ---
const LINK_CLOUDFLARE = "https://evolution-king-agenda.onrender.com"; 
const API_KEY_EVO = "Ja997640401"; 

            if (!respostaFinal) respostaFinal = "Erro interno.";
            respostaFinal = respostaFinal.replace(/undefined/g, "");

            const enviarMensagem = async (destino) => {
                // 1. 🛡️ TRATAMENTO DE LIDs: Se o WhatsApp ocultou o número real, devolvemos para o @lid inteiro.
                let numeroParaEnvio = destino;
                if (!destino.includes('@lid')) {
                    numeroParaEnvio = destino.split('@')[0].replace(/[^0-9]/g, '');
                }

                // Aqui já não precisamos do options: checkNumber no body, vai tudo na URL
                const body = {
                    number: numeroParaEnvio,
                    text: respostaFinal
                };
                
                console.log(`[ZAP] Enviando Payload para ${numeroParaEnvio}:`, JSON.stringify(body));

                try {
                    // 🔥 GOLPE FATAL: Passando a ordem de NÃO CHECAR diretamente na URL! 🔥
                    const urlEvo = `${LINK_CLOUDFLARE}/message/sendText/${encodeURIComponent(nomeDaInstancia)}?checkNumber=false`;
                    
                    const r = await fetch(urlEvo, {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'apikey': API_KEY_EVO 
                        },
                        body: JSON.stringify(body)
                    });
                    
                    console.log(`[ZAP] Status envio: ${r.status}`);

                    if (!r.ok) {
                        const erroEvo = await r.text();
                        console.error("[ZAP] A Evolution recusou! Motivo exato:", erroEvo);
                    }

                } catch (e) { 
                    console.error("[ZAP] Erro no fetch:", e.message); 
                }
            };

            await enviarMensagem(numeroRemetente);
        
    } catch (error) {
        console.error("Erro no Webhook:", error);
    }
});

// --- ROTA DE CORREÇÃO DE DATAS (RODAR UMA VEZ E APAGAR) ---
app.get('/admin/corrigir-datas-extrato', async (req, res) => {
    try {
        console.log("🔄 Iniciando correção massiva de datas...");
        
        // 1. Pega todos os extratos
        const extratosSnapshot = await db.collection('extrato_financeiro').get();
        
        if (extratosSnapshot.empty) return res.send("Nenhum extrato encontrado.");

        let atualizados = 0;
        let erros = 0;
        let ignorados = 0;

        // O Firestore só aceita 500 operações por lote (batch). Vamos fazer de 1 em 1 para garantir.
        // Se tiver muitos dados (>2000), pode demorar uns segundos.

        for (const docExtrato of extratosSnapshot.docs) {
            const dadosExtrato = docExtrato.data();
            const agendamentoId = dadosExtrato.agendamentoId;

            if (!agendamentoId) {
                ignorados++;
                continue;
            }

            try {
                // 2. Busca o Agendamento Original
                const docAgendamento = await db.collection('agendamentos').doc(agendamentoId).get();

                if (!docAgendamento.exists) {
                    console.log(`⚠️ Agendamento ${agendamentoId} não existe mais. Pulando.`);
                    ignorados++;
                    continue;
                }

                const dadosAgendamento = docAgendamento.data();

                // 3. Define a Data Correta
                // A prioridade é: dataConclusao > ts (timestamp) > data original
                let novaDataEvento = null;

                if (dadosAgendamento.dataConclusao) {
                    novaDataEvento = dadosAgendamento.dataConclusao;
                } else if (dadosAgendamento.ts) {
                    // Se não tiver dataConclusao, usamos o TS de quando foi modificado pela ultima vez
                    novaDataEvento = dadosAgendamento.ts;
                }

                // Só atualiza se achou uma data válida e se for diferente da atual (pra economizar escrita)
                if (novaDataEvento) {
                    // Atualiza o extrato
                    await db.collection('extrato_financeiro').doc(docExtrato.id).update({
                        dataEvento: novaDataEvento,
                        dataCorrecao: admin.firestore.FieldValue.serverTimestamp() // Marca que mexemos aqui
                    });
                    atualizados++;
                    console.log(`✅ Extrato ${docExtrato.id} corrigido para: ${novaDataEvento.toDate ? novaDataEvento.toDate() : novaDataEvento}`);
                } else {
                    ignorados++;
                }

            } catch (errLoop) {
                console.error(`Erro no extrato ${docExtrato.id}:`, errLoop);
                erros++;
            }
        }

        console.log(`🏁 FIM. Atualizados: ${atualizados} | Ignorados: ${ignorados} | Erros: ${erros}`);
        res.send(`<h2>Correção Finalizada!</h2><p>✅ Atualizados: ${atualizados}</p><p>⏭️ Ignorados: ${ignorados}</p><p>❌ Erros: ${erros}</p>`);

    } catch (error) {
        console.error("Erro Geral:", error);
        res.status(500).send("Erro fatal no script: " + error.message);
    }
});

// ==================================================================
// ⏰ ROTA DE CRON JOB (UPTIME ROBOT) - VERIFICAÇÃO DE INAUGURAÇÃO
// ==================================================================
app.get('/cron/verificar-inauguracao', async (req, res) => {
    try {
        // 1. SEGURANÇA: Chave simples para ninguém ficar chamando essa rota à toa
        const chaveSeguranca = req.query.key;
        if (chaveSeguranca !== 'CronSeguroKing2026') {
            return res.status(401).send('Acesso não autorizado. Chave incorreta.');
        }

        console.log("⏰ [CRON] Iniciando verificação de profissionais em Inauguração...");

        // 2. BUSCA: Pega todos que estão com o modo ativado
        const snapshot = await db.collection('usuarios')
            .where('modoInauguracao', '==', true)
            .get();

        if (snapshot.empty) {
            console.log("✅ [CRON] Nenhum profissional em inauguração no momento.");
            return res.status(200).send('Nenhum profissional para processar.');
        }

        let processados = 0;
        let desativados = 0;
        const batch = db.batch(); // Usamos batch para ser atômico e rápido
        const agora = new Date();

        snapshot.forEach(doc => {
            processados++;
            const dados = doc.data();
            let deveDesativar = false;
            let motivo = '';

            // --- REGRA 1: PRAZO DE 30 DIAS ---
            if (dados.dataInicioInauguracao) {
                // Converte Timestamp do Firestore para Date JS
                const dataInicio = dados.dataInicioInauguracao.toDate ? dados.dataInicioInauguracao.toDate() : new Date(dados.dataInicioInauguracao);
                
                // Calcula diferença em dias
                const diferencaTempo = agora.getTime() - dataInicio.getTime();
                const diasPassados = diferencaTempo / (1000 * 3600 * 24);

                if (diasPassados >= 30) {
                    deveDesativar = true;
                    motivo = 'Prazo de 30 dias expirado';
                }
            }

            // --- REGRA 2: META FINANCEIRA (R$ 100,00) ---
            // Se não tiver o campo, assume 0
            const saldoDescontos = dados.saldoDescontosInauguracao || 0;
            if (saldoDescontos >= 100) {
                deveDesativar = true;
                motivo = `Meta de R$ 100 atingida (Atual: R$ ${saldoDescontos})`;
            }

            // --- AÇÃO ---
            if (deveDesativar) {
                console.log(`🚫 Desativando inauguração de ${dados.nome || doc.id} - Motivo: ${motivo}`);
                
                const userRef = db.collection('usuarios').doc(doc.id);
                batch.update(userRef, {
                    modoInauguracao: false,
                    statusInauguracao: 'concluido',
                    tier: 4, // Opcional: Já garante o Tier 4 se a regra for essa
                    dataFimInauguracao: admin.firestore.FieldValue.serverTimestamp()
                });
                desativados++;
            }
        });

        // Só commita se tiver algo para atualizar
        if (desativados > 0) {
            await batch.commit();
        }

        const msgFinal = `[CRON] Fim. Processados: ${processados} | Desativados: ${desativados}`;
        console.log(msgFinal);
        res.status(200).send(msgFinal);

    } catch (error) {
        console.error("❌ [CRON ERRO]", error);
        res.status(500).send("Erro interno no Cron Job: " + error.message);
    }
});

// ============================================================
// 🚀 ROTA MÁGICA: DESLIGAR A TRAVA DO EVOLUTION (@LID)
// ============================================================
app.get('/desligar-trava', async (req, res) => {
    const urlEvo = `https://evolution-king-agenda.onrender.com/settings/set/KingAgenda`;
    const API_KEY_EVO = "Ja997640401";
    
    try {
        // Envia uma ordem direta para as configurações ocultas da Evolution
        const r = await fetch(urlEvo, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json', 
                'apikey': API_KEY_EVO 
            },
            body: JSON.stringify({ 
                check_number: false,   // Para versões v1
                checkNumber: false     // Para versões v2
            })
        });
        
        const resultado = await r.json();
        res.json({ 
            mensagem: "✅ TRAVA DESLIGADA COM SUCESSO! A Evolution agora aceita @lid e números ocultos.", 
            detalhes: resultado 
        });
    } catch (e) {
        res.send("Erro ao desligar a trava: " + e.message);
    }
});

// ==================================================================
// FIM DA ROTA DE CRON
// ==================================================================

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});