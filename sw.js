/* ═══════════════════════════════════════════════════
   JC Dashboard — Service Worker v2.0
   • Cache offline básico
   • Notificações push via FCM (app fechado)
═══════════════════════════════════════════════════ */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyAZHjmXunc7lSgn0Qb3S_r37OCfeQTJL8k",
  authDomain:        "jc-dashboard-6bc08.firebaseapp.com",
  projectId:         "jc-dashboard-6bc08",
  storageBucket:     "jc-dashboard-6bc08.firebasestorage.app",
  messagingSenderId: "32936256978",
  appId:             "1:32936256978:web:2fb7b196baefa4acaf140b"
});

const messaging = firebase.messaging();

const CACHE_NAME = 'jc-cache-v2';
const CACHE_URLS = ['/', '/index.html'];

// ── Instala e cacheia arquivos principais ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CACHE_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

// ── Ativa e remove caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Recebe push do FCM com app fechado ──
messaging.onBackgroundMessage(payload => {
  const { title = '🔔 JC Dashboard', body = 'Você tem boletos a verificar.', tag } =
    payload.notification || {};

  return self.registration.showNotification(title, {
    body,
    icon:             '/icon-192.png',
    badge:            '/icon-192.png',
    tag:              tag || 'jc-push',
    renotify:         true,
    requireInteraction: true,
    data:             { url: payload.data?.url || '/' }
  });
});

// ── Clique na notificação abre o app ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
