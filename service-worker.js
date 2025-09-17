// Importa os scripts do Firebase necessários para o Service Worker
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/11.0.1/firebase-messaging-compat.js');

// Suas credenciais do Firebase (devem ser as mesmas do seu app)
const firebaseConfig = {
  apiKey: "AIzaSyDBt7NcU5rP-hsrBZ07ne_HbiMCHRyVcnY",
  authDomain: "navalha-de-ouro-v11.firebaseapp.com",
  projectId: "navalha-de-ouro-v11",
  storageBucket: "navalha-de-ouro-v11.firebasestorage.app",
  messagingSenderId: "434474263075",
  appId: "1:434474263075:web:163893d68a1b5dbe74c796"
};

// Inicializa o Firebase no Service Worker
firebase.initializeApp(firebaseConfig);

// Obtém a instância do serviço de Messaging
const messaging = firebase.messaging();

// Adiciona um manipulador para escutar mensagens recebidas em segundo plano
messaging.onBackgroundMessage(function(payload) {
  console.log('[service-worker.js] Mensagem recebida em segundo plano.', payload);

  // Extrai o título e as opções da notificação a partir do payload
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    // Opcional: defina um ícone para a notificação.
    // Certifique-se de que o ícone exista no caminho especificado na sua pasta pública.
    // icon: '/images/logo.png' 
  };

  // Exibe a notificação para o usuário
  return self.registration.showNotification(notificationTitle, notificationOptions);
});