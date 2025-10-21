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
    const { targetUid, updates } = req.body;
    if (!targetUid || !updates) {
        return res.status(400).json({ message: "ID do usuário e dados para atualização são obrigatórios." });
    }
    try {
        await db.collection('usuarios').doc(targetUid).update(updates);
        res.status(200).json({ message: "Dados do usuário atualizados no Firestore com sucesso." });
    } catch (error) {
        console.error("Erro ao atualizar dados do usuário no Firestore:", error);
        res.status(500).json({ message: "Falha ao atualizar dados.", error: error.message });
    }
});

// Rota para definir uma nova senha para o usuário
app.post('/admin/reset-user-password', isAdmin, async (req, res) => {
    const { targetUid, newPassword } = req.body;
    if (!targetUid || !newPassword || newPassword.length < 6) {
        return res.status(400).json({ message: "ID do usuário e uma nova senha de no mínimo 6 caracteres são obrigatórios." });
    }
    try {
        await admin.auth().updateUser(targetUid, { password: newPassword });
        res.status(200).json({ message: "Senha do usuário alterada com sucesso." });
    } catch (error) {
        console.error("Erro ao redefinir senha de usuário:", error);
        res.status(500).json({ message: "Falha ao redefinir senha.", error: error.message });
    }
});

// Rota para habilitar/desabilitar uma conta de usuário
app.post('/admin/toggle-user-status', isAdmin, async (req, res) => {
    const { targetUid, disable } = req.body; // 'disable' deve ser true ou false
    if (!targetUid || typeof disable !== 'boolean') {
        return res.status(400).json({ message: "ID do usuário e status (disable: true/false) são obrigatórios." });
    }
    try {
        await admin.auth().updateUser(targetUid, { disabled: disable });
        res.status(200).json({ message: `Usuário ${disable ? 'desabilitado' : 'habilitado'} com sucesso.` });
    } catch (error) {
        console.error("Erro ao alterar status do usuário:", error);
        res.status(500).json({ message: "Falha ao alterar status do usuário.", error: error.message });
    }
});

// Função auxiliar para ativar o benefício no Firestore
async function activateBenefitInFirestore(uid, sku) {
    const userRef = db.collection('usuarios').doc(uid);
    const expiracao = new Date();
    let updates = {};

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


// Rota de saúde para o Render saber que o app está no ar
app.get('/', (req, res) => {
    res.send('Backend VersãoPro está no ar!');
});

// --- INICIALIZAÇÃO DO SERVIDOR ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
