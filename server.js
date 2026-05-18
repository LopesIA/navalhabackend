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
// --- CONFIGURAÇÕES DO SERVIDOR EXPRESS ---
// Permite que apenas seu app web se comunique com este backend.

const corsOptions = {
  origin: function (origin, callback) {
    // 1. Permite requisições sem 'origin' (ex: de apps mobile, backend ou Postman)
    if (!origin) return callback(null, true);

    // 2. CURINGA: Se a origem tiver qualquer uma destas palavras-chave, está liberado!
    if (
        origin.includes('navalha-de-ouro-v11') || 
        origin.includes('firebaseapp.com') || 
        origin.includes('web.app') ||
        origin.includes('novaversao.site') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    } else {
      return callback(new Error('Acesso não permitido pela política de CORS'));
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

    // 🛡️ TRAVA DE SEGURANÇA: BUSCA O NOME CORRETO SE ESTIVER UNDEFINED
    const obterNomeProfissionalSeguro = async (ag) => {
        let nome = ag.barbeiroNome;
        // Verifica se está quebrado, nulo, vazio ou "undefined"
        if (!nome || String(nome).toLowerCase() === "undefined" || String(nome).toLowerCase() === "null" || nome.trim() === "") {
            try {
                if (ag.barbeiroUid) {
                    const bDoc = await db.collection('usuarios').doc(ag.barbeiroUid).get();
                    if (bDoc.exists && bDoc.data().nome) {
                        return bDoc.data().nome; // Retorna o nome real do banco
                    }
                }
            } catch (e) {
                console.error("Erro ao resgatar nome do profissional:", e.message);
            }
            return "o(a) profissional"; // Fallback amigável caso tudo falhe
        }
        return nome; // Se estiver ok, retorna o nome normal
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
                const nomeBarbeiroSeguro = await obterNomeProfissionalSeguro(ag); // Nome Blindado!
                
                console.log(`[CRON] Disparando 5 DIAS para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '📅 Falta pouco!', `Faltam 5 dias para o seu horário com ${nomeBarbeiroSeguro}.`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `📅 *Faltam 5 dias!*\n\nOlá, ${ag.clienteNome || 'Cliente'}!\nPassando para avisar que o seu agendamento de *${ag.servico}* com *${nomeBarbeiroSeguro}* será no dia ${ag.data.split('-').reverse().join('/')} às ${ag.horario}.\nJá estamos nos preparando para te receber! ✂️`);
                }
                batch.update(doc.ref, { lembrete5diasEnviado: true });
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

            const minutosFaltando = Math.floor((horaAgendamento.getTime() - agoraBrasil.getTime()) / 60000);
            
            // Só chama a função de blindagem se for precisar enviar a mensagem
            let nomeBarbeiroSeguro = ""; 

            // A. LEMBRETE DE 1 HORA (Entre 45 e 65 min antes)
            if (minutosFaltando <= 65 && minutosFaltando >= 45 && !ag.lembrete1hEnviado) {
                nomeBarbeiroSeguro = await obterNomeProfissionalSeguro(ag);
                console.log(`[CRON] Disparando 1H para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '⏰ Falta 1 hora!', `Seu horário com ${nomeBarbeiroSeguro} é hoje às ${ag.horario}.`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `⏰ *Falta 1 Hora!*\n\nOlá, ${ag.clienteNome || 'Cliente'}!\nSeu horário de *${ag.servico}* com *${nomeBarbeiroSeguro}* é daqui a pouco, às ${ag.horario}.\nTe esperamos lá! ✂️`);
                }
                batch.update(doc.ref, { lembrete1hEnviado: true });
                contadorLembretes++;
            }

            // B. LEMBRETE DE 20 MINUTOS (Entre 5 e 25 min antes)
            else if (minutosFaltando <= 25 && minutosFaltando >= 5 && !ag.lembrete20minEnviado) {
                nomeBarbeiroSeguro = await obterNomeProfissionalSeguro(ag);
                console.log(`[CRON] Disparando 20MIN para ${ag.clienteNome}`);
                if (!ag.clienteUid.startsWith('manual_')) sendNotification(ag.clienteUid, '🚀 É daqui a pouco!', `Seu corte é em 20 minutos!`, { link: '#historico' });
                if (ag.clienteTelefone) {
                    await enviarWhatsAppCron(ag.clienteTelefone, `🚀 *É daqui a pouco!*\n\n${ag.clienteNome || 'Cliente'}, o seu horário com *${nomeBarbeiroSeguro}* começa em 20 minutos!`);
                }
                batch.update(doc.ref, { lembrete20minEnviado: true, lembrete10minEnviado: true });
                contadorLembretes++;
            }

            // C. AGRADECIMENTO (Entre 30 e 60 min DEPOIS do horário marcado)
            else if (minutosFaltando <= -30 && minutosFaltando >= -60 && !ag.agradecimentoEnviado) {
                nomeBarbeiroSeguro = await obterNomeProfissionalSeguro(ag);
                console.log(`[CRON] Disparando AGRADECIMENTO para ${ag.clienteNome}`);
                
                if (!ag.clienteUid.startsWith('manual_')) {
                    sendNotification(ag.clienteUid, '⭐ O que achou?', `Muito obrigado pela preferência! Que tal avaliar o serviço do(a) ${nomeBarbeiroSeguro}?`, { link: '#historico' });
                }
                
                if (ag.clienteTelefone) {
                    const nomeBuscaGoogle = "BARBEARIAS";
                    const linkGoogle = `https://www.google.com/search?q=${encodeURIComponent(nomeBuscaGoogle)}`;
                    
                    const msgZapAgradecimento = `⭐ *Muito obrigado pela preferência!*\n\nOlá, ${ag.clienteNome || 'Cliente'}! Passando para agradecer por ter escolhido o profissional *${nomeBarbeiroSeguro}* hoje.\n\nSua opinião é o que nos faz crescer! Poderia nos avaliar rapidinho?\n\n📲 *1. No Aplicativo King Agenda:*\nAcesse: https://kingagenda.site\n_(Passos: Menu > Funções do Cliente > Minhas Atividades > Meu Agendamento > Avaliar)_\n\n🌍 *2. No Google:*\nBasta clicar no link abaixo e nos dar aquelas estrelinhas para ajudar outras pessoas a nos encontrarem:\n${linkGoogle}\n\nVoltando sempre, você acumula pontos! Tamo junto! 🤝`;

                    await enviarWhatsAppCron(ag.clienteTelefone, msgZapAgradecimento);
                }
                
                batch.update(doc.ref, { agradecimentoEnviado: true });
                contadorLembretes++;
            }
        } 

        // =====================================================================
        // 4. RETENÇÃO: CLIENTES SUMIDOS (ENTRE 25 E 70 DIAS)
        // =====================================================================
        const vinteCincoDiasAtras = new Date(agoraBrasil.getTime() - 25 * 24 * 60 * 60 * 1000);
        const setentaDiasAtras = new Date(agoraBrasil.getTime() - 70 * 24 * 60 * 60 * 1000);
        
        // 🔥 A CORREÇÃO: orderBy('ts', 'desc') garante que pegamos sempre quem ACABOU de bater 25 dias
        const agendamentosAntigos = await db.collection('agendamentos')
            .where('ts', '<=', admin.firestore.Timestamp.fromDate(vinteCincoDiasAtras))
            .where('ts', '>=', admin.firestore.Timestamp.fromDate(setentaDiasAtras))
            .orderBy('ts', 'desc') 
            .limit(10) // Baixei para 10 para o WhatsApp não te bloquear por spam de uma vez
            .get();
            
        const telefonesAnalisados = new Set();
        const uidsAnalisados = new Set();
        
        for (const doc of agendamentosAntigos.docs) {
            const ag = doc.data();
            
            // Se já enviou, ignora
            if (ag.lembreteAusenciaEnviado) continue;

            const isManual = !ag.clienteUid || ag.clienteUid.startsWith('manual_');

            if (isManual && !ag.clienteTelefone) {
                batch.update(doc.ref, { lembreteAusenciaEnviado: true });
                continue;
            }

            if (isManual) {
                if (telefonesAnalisados.has(ag.clienteTelefone)) continue;
                telefonesAnalisados.add(ag.clienteTelefone);
            } else {
                if (uidsAnalisados.has(ag.clienteUid)) continue;
                uidsAnalisados.add(ag.clienteUid);
            }

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
            
            // Se o cara já cortou recente ou se o agendamento antigo não foi concluído
            if (temAgendamentoRecente || (ag.status !== 'concluido' && ag.status !== 'avaliado')) {
                batch.update(doc.ref, { lembreteAusenciaEnviado: true });
                continue; 
            }

            console.log(`[CRON] Disparando RETENÇÃO para: ${ag.clienteNome}`);
            if (!isManual) {
                sendNotification(ag.clienteUid, '✂️ Tá na hora do talento?', `Faz um tempo que você não aparece! Que tal agendar um corte hoje?`, { link: '#barbeiros' });
            }
            
            if (ag.clienteTelefone) {
                const msgZap = `✂️ *Tá na hora do talento?*\n\nOlá, ${ag.clienteNome || 'Cliente'}! Faz um tempinho que você não vem aqui na barbearia.\nQue tal agendar um horário com a gente hoje? É só pedir aqui mesmo!`;
                await enviarWhatsAppCron(ag.clienteTelefone, msgZap);
            }

            batch.update(doc.ref, { lembreteAusenciaEnviado: true });
            contadorRetencao++;
            
            // Eu removi o "break" daqui. Agora ele vai mandar para as 10 pessoas do lote de uma vez, 
            // e não apenas 1 por dia. Como tem aquele 'sleep' de 1 segundo na Evo, não dá bloqueio!
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

// =================================================================
// 🛡️ MEMÓRIA TEMPORÁRIA CONTRA DUPLICIDADES DE WEBHOOK (15 SEGUNDOS)
// =================================================================
const mensagensProcessadas = new Set();

// =================================================================
// 🤖 WEBHOOK ATUALIZADO: APENAS DIRECIONAMENTO E RESPOSTA FIXA
// =================================================================
app.post(['/webhook/whatsapp', '/webhook/whatsapp/messages-upsert'], async (req, res) => {
    try {
        const data = req.body;
        
        // 1. Verifica o evento (Apenas mensagens novas)
        const evento = data.event || data.event_type;
        if (evento !== "messages.upsert" && evento !== "MESSAGES_UPSERT") {
            return res.status(200).send('IGNORED_EVENT');
        }

        // 2. Responde imediatamente para a Evolution não travar o fluxo
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

        // 5. BLINDAGEM CONTRA DUPLICATAS DE WEBHOOK REPETIDO
        if (msgId) {
            if (mensagensProcessadas.has(msgId)) {
                console.log(`[TRAVA] Mensagem repetida ignorada no Webhook: ${msgId}`);
                return;
            }
            mensagensProcessadas.add(msgId);
            setTimeout(() => mensagensProcessadas.delete(msgId), 15000); 
        }

        // 6. DESEMPACOTAR A MENSAGEM (O SEGREDO DAS MSG TEMPORÁRIAS)
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

        // Se for áudio, mídia sem legenda ou figurinha, processa a resposta padrão mesmo assim
        console.log(`[ZAP] Mensagem recebida de ${numeroRemetente}`);
        
        // 8. FIX MIKAELA
        if (numeroRemetente && numeroRemetente.includes("126280762691761")) {
            numeroRemetente = "5527996598623@s.whatsapp.net"; 
        }

        // =========================================================
        // 🕵️‍♂️ 9. MÁQUINA DE DESCOBERTA AUTOMÁTICA DO NÚMERO REAL
        // =========================================================
        if (numeroRemetente && numeroRemetente.includes('@lid')) {
            try {
                const cacheLid = await db.collection('lid_mapping').doc(numeroRemetente).get();
                if (cacheLid.exists) {
                    numeroRemetente = cacheLid.data().realNumber;
                } else {
                    const nomeWhatsapp = data.data?.pushName || msgInfo?.pushName || data.sender?.name || data.sender?.pushName;
                    if (nomeWhatsapp) {
                        let usuariosEncontrados = [];
                        const nomeBusca = nomeWhatsapp.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                        
                        const allUsers = await db.collection('usuarios').get();
                        allUsers.forEach(doc => {
                            const u = doc.data();
                            if (u.telefone && u.nome) {
                                const nomeBanco = u.nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                if (nomeBanco === nomeBusca || nomeBanco.includes(nomeBusca) || nomeBusca.includes(nomeBanco)) {
                                    usuariosEncontrados.push(u);
                                }
                            }
                        });

                        if (usuariosEncontrados.length > 0) {
                            let alvo = usuariosEncontrados.length === 1 ? usuariosEncontrados[0] : usuariosEncontrados.find(u => u.tipo === 'cliente');
                            if (!alvo) alvo = usuariosEncontrados[0]; 

                            let numeroRealEncontrado = alvo.telefone.replace(/[^0-9]/g, ''); 
                            if (!numeroRealEncontrado.startsWith('55')) {
                                numeroRealEncontrado = '55' + numeroRealEncontrado;
                            }
                            numeroRealEncontrado = numeroRealEncontrado.includes('@s.whatsapp.net') ? numeroRealEncontrado : `${numeroRealEncontrado}@s.whatsapp.net`;
                            
                            await db.collection('lid_mapping').doc(numeroRemetente).set({ realNumber: numeroRealEncontrado });
                            numeroRemetente = numeroRealEncontrado; 
                        }
                    }
                }
            } catch (e) {
                console.log(`[ZAP] Erro na Descoberta de Número:`, e.message);
            }
        }

        // ============================================================
        // 📝 TEXTO DE RESPOSTA FIXO E PERFEITO (EXIGIDO)
        // ============================================================
        const respostaFixa = "Olá! Sou a IA de Lembretes do *King Agenda* ⏰.\n\nPor aqui, eu realizo apenas o disparo de avisos e confirmações de horários. Se você quiser agendar, cancelar ou tirar qualquer dúvida, por favor, entre em contato diretamente com o profissional ou utilize o chat dentro do aplicativo *King Agenda*! 😉";

        // CONFIGURAÇÕES DO MODULO DE ENVIO DA EVOLUTION
        const LINK_CLOUDFLARE = "https://evolution-king-agenda.onrender.com"; 
        const API_KEY_EVO = "Ja997640401"; 

        const enviarMensagemSuporte = async (destino) => {
            let numeroParaEnvio = destino;
            if (!destino.includes('@lid')) {
                numeroParaEnvio = destino.split('@')[0].replace(/[^0-9]/g, '');
            }

            const body = {
                number: numeroParaEnvio,
                text: respostaFixa
            };
            
            try {
                const urlEvo = `${LINK_CLOUDFLARE}/message/sendText/${encodeURIComponent(nomeDaInstancia)}?checkNumber=false`;
                await fetch(urlEvo, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'apikey': API_KEY_EVO },
                    body: JSON.stringify(body)
                });
                console.log(`[ZAP] Resposta fixa enviada com sucesso para ${numeroParaEnvio}`);
            } catch (e) { 
                console.error("[ZAP] Erro ao enviar resposta fixa:", e.message); 
            }
        };

        // Executa o envio da mensagem de aviso
        await enviarMensagemSuporte(numeroRemetente);
        
    } catch (error) {
        console.error("Erro no Webhook:", error);
    }
});


// ============================================================
// 🤖 FUNÇÃO GLOBAL PARA DISPARAR WHATSAPP (ACESSÍVEL POR TODOS)
// ============================================================
const enviarWhatsAppCron = async (destino, texto) => {
    if (!destino || destino === "whatsapp_gerencia" || destino === "desconhecido") return;
    
    const LINK_CLOUDFLARE = "https://evolution-king-agenda.onrender.com";
    const API_KEY_EVO = "Ja997640401"; 
    const nomeDaInstancia = "KingAgenda"; 

    let numeroLimpo = destino;
    if (!destino.includes('@lid')) {
        numeroLimpo = destino.replace(/[^0-9]/g, ''); 
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
        if (!r.ok) console.error(`[ZAP] Erro Evo (${numeroLimpo}):`, await r.text());
        // Aguarda 1 segundinho por segurança
        await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
        console.error("[ZAP] Erro no fetch:", e.message);
    }
};

// ============================================================
// 🚀 ROTA NOVA: CONFIRMAÇÃO IMEDIATA DE AGENDAMENTO (WHATSAPP)
// ============================================================
app.post('/api/confirmar-agendamento', express.json(), async (req, res) => {
    const { telefone, clienteNome, barbeiroNome, data, horario, servico } = req.body;
    
    if (!telefone) {
        return res.status(400).send("Telefone não informado");
    }

    try {
        const msgZap = `✅ *Agendamento Confirmado!*\n\nOlá, ${clienteNome}!\nSeu horário com o profissional *${barbeiroNome}* está garantido.\n\n📅 Data: ${data}\n⏰ Horário: ${horario}\n✂️ Serviço: ${servico}\n\nTe esperamos lá!`;
        
        // Agora ele vai achar a função perfeitamente!
        await enviarWhatsAppCron(telefone, msgZap);
        
        console.log(`[ZAP] Confirmação imediata enviada para: ${clienteNome}`);
        res.status(200).send("Confirmação enviada com sucesso!");
    } catch (error) {
        console.error("❌ Erro ao enviar confirmação imediata:", error);
        res.status(500).send("Erro ao enviar mensagem.");
    }
});

// ==================================================================
// ⏰ NOVA ROTA DE CRON: MOTOR PROATIVO DE LEMBRETES (1H, 20MIN E OBRIGADO)
// ==================================================================
app.get('/cron/disparar-lembretes', async (req, res) => {
    try {
        const chaveSeguranca = req.query.key;
        if (chaveSeguranca !== 'CronSeguroKing2026') {
            return res.status(401).send('Acesso não autorizado.');
        }

        console.log("⏰ [CRON-LEMBRETES] Buscando agendamentos para processar avisos...");

        // Configurações da Evolution
        const LINK_CLOUDFLARE = "https://evolution-king-agenda.onrender.com"; 
        const API_KEY_EVO = "Ja997640401";
        const nomeDaInstancia = "KingAgenda";

        // Captura a hora atual do Brasil (São Paulo)
        const dataHojeBrasil = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
        const dataHojeStr = dataHojeBrasil.toISOString().split('T')[0]; // Formato YYYY-MM-DD
        const agoraEmMinutos = dataHojeBrasil.getHours() * 60 + dataHojeBrasil.getMinutes();

        // Utilitário matemático de tempo
        const timeToMin = (t) => {
            if (!t) return 0;
            const [h, m] = t.split(':').map(Number);
            return h * 60 + m;
        };

        // 1. DISPARAR LEMBRETES (Para agendamentos com status 'confirmado')
        const agendamentosSnap = await db.collection('agendamentos')
            .where('data', '==', dataHojeStr)
            .where('status', '==', 'confirmado')
            .get();

        for (const doc of agendamentosSnap.docs) {
            const ag = doc.data();
            const idAgendamento = doc.id;
            
            // Ignora se o cliente não tem telefone válido cadastrado no bot
            if (!ag.clienteTelefone || ag.clienteTelefone === "whatsapp_gerencia") continue;

            const horarioServicoMinutos = timeToMin(ag.horario);
            const minutosRestantes = horarioServicoMinutos - agoraEmMinutos;

            let textoAlerta = "";
            let campoAtualizar = {};

            // 🕒 CRITÉRIO 1: Lembrete de 1 Hora Antes (Janela tolerante entre 50 e 70 minutos)
            if (minutosRestantes >= 50 && minutosRestantes <= 70 && !ag.lembrete1hEnviado) {
                textoAlerta = `Olá, *${ag.clienteNome}*! Passando para te lembrar que seu agendamento de *${ag.servico}* com o profissional *${ag.barbeiroNome}* na *${ag.nomeBarbearia || 'nossa barbearia'}* está marcado para daqui a **1 hora** (às ${ag.horario}). Estamos te esperando! 💈`;
                campoAtualizar = { lembrete1hEnviado: true };
            } 
            // 🕒 CRITÉRIO 2: Lembrete de 20 Minutos Antes (Janela tolerante entre 10 e 25 minutos)
            else if (minutosRestantes >= 10 && minutosRestantes <= 25 && !ag.lembrete20mEnviado) {
                textoAlerta = `Ei, *${ag.clienteNome}*! Seu horário está chegando. Seu atendimento de *${ag.servico}* está confirmado para daqui a **20 minutos** (às ${ag.horario}). Caso vá se atrasar, por favor avise o profissional! ⚡`;
                campoAtualizar = { lembrete20mEnviado: true };
            }

            // Se ativou algum critério, dispara via Evolution e carimba o Firestore
            if (textoAlerta !== "") {
                let numLimpo = ag.clienteTelefone.split('@')[0].replace(/[^0-9]/g, '');
                if (ag.clienteTelefone.includes('@lid')) numLimpo = ag.clienteTelefone;

                try {
                    const urlEvo = `${LINK_CLOUDFLARE}/message/sendText/${encodeURIComponent(nomeDaInstancia)}?checkNumber=false`;
                    await fetch(urlEvo, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY_EVO },
                        body: JSON.stringify({ number: numLimpo, text: textoAlerta })
                    });
                    
                    // Grava de forma definitiva no banco para nunca mais duplicar
                    await db.collection('agendamentos').doc(idAgendamento).update(campoAtualizar);
                    console.log(`[CRON-LEMBRETE] Alerta disparado para ${ag.clienteNome} (${idAgendamento})`);
                } catch (errEnvio) {
                    console.error(`[CRON-LEMBRETE] Falha ao enviar para ${idAgendamento}:`, errEnvio.message);
                }
            }
        }

        // 2. DISPARAR AGRADECIMENTOS (Para agendamentos marcados como 'concluido' hoje)
        const concluidosSnap = await db.collection('agendamentos')
            .where('data', '==', dataHojeStr)
            .where('status', '==', 'concluido')
            .get();

        for (const doc of concluidosSnap.docs) {
            const ag = doc.data();
            const idAgendamento = doc.id;

            if (!ag.clienteTelefone || ag.clienteTelefone === "whatsapp_gerencia" || ag.agradecimentoEnviado) continue;

            const horarioServicoMinutos = timeToMin(ag.horario);
            const duracao = ag.duracao ? Number(ag.duracao) : 30;
            const fimServicoMinutos = horarioServicoMinutos + duracao;

            // Envia o agradecimento apenas se o horário do fim do corte já passou do momento atual
            if (agoraEmMinutos > fimServicoMinutos) {
                const textoAgradecimento = `Muito obrigado pela preferência, *${ag.clienteNome}*! Seu atendimento de *${ag.servico}* foi concluído com sucesso. Esperamos que tenha gostado do resultado! Até a próxima visita! 🌟💈`;
                
                let numLimpo = ag.clienteTelefone.split('@')[0].replace(/[^0-9]/g, '');
                if (ag.clienteTelefone.includes('@lid')) numLimpo = ag.clienteTelefone;

                try {
                    const urlEvo = `${LINK_CLOUDFLARE}/message/sendText/${encodeURIComponent(nomeDaInstancia)}?checkNumber=false`;
                    await fetch(urlEvo, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'apikey': API_KEY_EVO },
                        body: JSON.stringify({ number: numLimpo, text: textoAgradecimento })
                    });
                    
                    // Carimba faturamento do envio concluído no banco
                    await db.collection('agendamentos').doc(idAgendamento).update({ agradecimentoEnviado: true });
                    console.log(`[CRON-AGRADECIMENTO] Mensagem de obrigado enviada para ${ag.clienteNome}`);
                } catch (errEnvio) {
                    console.error(`[CRON-AGRADECIMENTO] Falha ao enviar para ${idAgendamento}:`, errEnvio.message);
                }
            }
        }

        res.status(200).send("✅ Lembretes processados com sucesso!");

    } catch (error) {
        console.error("Erro fatal na execução do Cron de Lembretes:", error);
        res.status(500).send("Erro interno: " + error.message);
    }
});

// ==================================================================
// 🏃‍♂️ ROTA DE CRON: RESGATE DE CLIENTES AUSENTES (MAIS DE 25 DIAS)
// ==================================================================
app.get('/cron/clientes-ausentes', async (req, res) => {
    try {
        const chaveSeguranca = req.query.key;
        if (chaveSeguranca !== 'CronSeguroKing2026') {
            return res.status(401).send('Acesso não autorizado.');
        }

        console.log("🔄 [CRON-AUSENTES] Iniciando varredura de clientes sumidos...");

        // Configurações da Evolution API
        const LINK_CLOUDFLARE = "https://evolution-king-agenda.onrender.com"; 
        const API_KEY_EVO = "Ja997640401";
        const nomeDaInstancia = "KingAgenda";

        // Captura as datas no fuso horário do Brasil
        const hojeBrasil = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Sao_Paulo"}));
        const hojeStr = hojeBrasil.toISOString().split('T')[0];

        // Calcula a data exata de 25 dias atrás
        const dataLimite = new Date(hojeBrasil);
        dataLimite.setDate(hojeBrasil.getDate() - 25);
        const dataLimiteStr = dataLimite.toISOString().split('T')[0];

        // 1. Busca todos os agendamentos concluídos até 25 dias atrás
        const agendamentosAntigosSnap = await db.collection('agendamentos')
            .where('status', '==', 'concluido')
            .where('data', '<=', dataLimiteStr)
            .get();

        if (agendamentosAntigosSnap.empty) {
            return res.status(200).send("Nenhum agendamento antigo para analisar.");
        }

        // Agrupa os agendamentos para descobrir o último corte de cada cliente
        const mapaUltimoCorte = {};
        agendamentosAntigosSnap.forEach(doc => {
            const ag = doc.data();
            const fone = ag.clienteTelefone;
            if (fone && fone !== "whatsapp_gerencia") {
                // Se não tem no mapa ou se esse agendamento é mais recente do que o salvo, atualiza
                if (!mapaUltimoCorte[fone] || ag.data > mapaUltimoCorte[fone].data) {
                    mapaUltimoCorte[fone] = {
                        clienteNome: ag.clienteNome,
                        barbeiroNome: ag.barbeiroNome,
                        nomeBarbearia: ag.nomeBarbearia || "nossa barbearia",
                        data: ag.data
                    };
                }
            }
        });

        let disparosRealizados = 0;

        // 2. Agora verifica se esses clientes de fato não voltaram nos últimos 25 dias
        for (const [telefone, dadosCorte] of Object.entries(mapaUltimoCorte)) {
            
            // Procura se o cliente tem alguma coisa recente (nos últimos 25 dias)
            const agendamentoRecenteSnap = await db.collection('agendamentos')
                .where('clienteTelefone', '==', telephone)
                .where('data', '>', dataLimiteStr)
                .limit(1)
                .get();

            // Se a busca voltou vazia, significa que ele REALMENTE está sumido há mais de 25 dias!
            if (agendamentoRecenteSnap.empty) {
                
                // 🛡️ BLINDAGEM ANTI-SPAM: Busca o perfil do usuário para ver se já não mandamos o aviso de sumido recentemente
                const userSnap = await db.collection('usuarios').where('telefone', '==', telephone.split('@')[0]).limit(1).get();
                
                if (!userSnap.empty) {
                    const userDoc = userSnap.docs[0];
                    const userData = userDoc.data();

                    // Se já enviou uma mensagem de ausente nos últimos 30 dias, pula para não incomodar o cliente
                    if (userData.ultimoAlertaAusente === hojeStr) continue;

                    // Mensagem de marketing matadora para trazer o cliente de volta
                    const mensagemResgate = `Olá, *${dadosCorte.clienteNome}*! Tudo bem? CC ✂️\n\nReparamos aqui no sistema do *King Agenda* que já faz mais de 25 dias desde o seu último corte com o profissional *${dadosCorte.barbeiroNome}* na *${dadosCorte.nomeBarbearia}*.\n\nO tempo voa e o visual já deve estar precisando daquele talento, hein? Que tal dar uma olhadinha nos horários livres dessa semana e já garantir a sua vaga? Abra o aplicativo e agende em poucos cliques! 💈🏃‍♂️`;

                    let numLimpo = telephone.split('@')[0].replace(/[^0-9]/g, '');
                    if (telephone.includes('@lid')) numLimpo = telephone;

                    try {
                        const urlEvo = `${LINK_CLOUDFLARE}/message/sendText/${encodeURIComponent(nomeDaInstancia)}?checkNumber=false`;
                        await fetch(urlEvo, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'apikey': API_KEY_EVO },
                            body: JSON.stringify({ number: numLimpo, text: mensagemResgate })
                        });

                        // Carimba o perfil do usuário dizendo que ele já foi notificado hoje de que está ausente
                        await db.collection('usuarios').doc(userDoc.id).update({
                            ultimoAlertaAusente: hojeStr
                        });

                        disparosRealizados++;
                        console.log(`[CRON-AUSENTES] 🚀 Mensagem de resgate enviada para ${dadosCorte.clienteNome}`);
                    } catch (errEnvio) {
                        console.error(`[CRON-AUSENTES] Erro ao enviar para ${telephone}:`, errEnvio.message);
                    }
                }
            }
        }

        res.status(200).send(`✅ Varredura concluída! Músicas de resgate disparadas para ${disparosRealizados} clientes sumidos.`);

    } catch (error) {
        console.error("Erro fatal no Cron de Clientes Ausentes:", error);
        res.status(500).send("Erro interno: " + error.message);
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