/* ══════════════════════════════════════════════════════════
   JC Dashboard — Cloud Functions
   Dispara notificação push diária para boletos vencendo
   Agendado: todo dia às 08:00 (horário de Brasília)
══════════════════════════════════════════════════════════ */

const { onSchedule }     = require('firebase-functions/v2/scheduler');
const { initializeApp }  = require('firebase-admin/app');
const { getFirestore }   = require('firebase-admin/firestore');
const { getMessaging }   = require('firebase-admin/messaging');

initializeApp();

exports.notificarBoletosDiarios = onSchedule(
  {
    schedule:  'every day 08:00',
    timeZone:  'America/Sao_Paulo',
    region:    'southamerica-east1',
  },
  async () => {
    const db        = getFirestore();
    const messaging = getMessaging();

    const hoje   = new Date(); hoje.setHours(0, 0, 0, 0);
    const amanha = new Date(hoje); amanha.setDate(amanha.getDate() + 1);

    const toISO = d => d.toISOString().slice(0, 10);

    // ── Busca todos os usuários ──
    const usersSnap = await db.collection('jc_users').listDocuments();

    for (const userRef of usersSnap) {
      try {
        // Busca dados do usuário
        const userDoc = await userRef.get();
        const userData = userDoc.data() || {};

        // Busca boletos do usuário (estrutura: userData.obras[].contasPagar[])
        const obras = userData.obras || [];
        const vencendoHoje   = [];
        const vencendoAmanha = [];
        const vencidos       = [];

        obras.forEach(obra => {
          (obra.contasPagar || []).forEach(b => {
            if (b.pago || !b.venc) return;
            if (b.venc === toISO(hoje))        vencendoHoje.push({ ...b, _obra: obra.codigo });
            else if (b.venc === toISO(amanha)) vencendoAmanha.push({ ...b, _obra: obra.codigo });
            else if (b.venc < toISO(hoje))     vencidos.push({ ...b, _obra: obra.codigo });
          });
        });

        const total = vencendoHoje.length + vencendoAmanha.length;
        if (total === 0 && vencidos.length === 0) continue;

        // Monta mensagem
        let titulo, corpo;
        if (vencendoHoje.length > 0) {
          const soma = vencendoHoje.reduce((s, b) => s + (parseFloat(b.valor) || 0), 0);
          titulo = `🚨 ${vencendoHoje.length} boleto(s) vencem HOJE`;
          corpo  = vencendoHoje.slice(0, 3)
            .map(b => `• ${b._obra} — ${b.empresa} — R$ ${soma.toLocaleString('pt-BR',{minimumFractionDigits:2})}`)
            .join('\n');
          if (vencendoHoje.length > 3) corpo += `\n…e mais ${vencendoHoje.length - 3}`;
        } else if (vencendoAmanha.length > 0) {
          titulo = `⚠ ${vencendoAmanha.length} boleto(s) vencem AMANHÃ`;
          corpo  = vencendoAmanha.slice(0, 3).map(b => `• ${b._obra} — ${b.empresa}`).join('\n');
        } else {
          titulo = `🔴 ${vencidos.length} boleto(s) em atraso`;
          corpo  = vencidos.slice(0, 3).map(b => `• ${b._obra} — ${b.empresa}`).join('\n');
        }

        // Busca tokens FCM do usuário
        const tokensSnap = await userRef.collection('jc_fcm_tokens').get();
        if (tokensSnap.empty) continue;

        const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
        if (!tokens.length) continue;

        // Envia para cada token (multicast)
        const response = await messaging.sendEachForMulticast({
          tokens,
          notification: { title: titulo, body: corpo },
          data:         { url: '/', tag: 'jc-diario' },
          android:      { priority: 'high', notification: { sound: 'default' } },
          apns:         { payload: { aps: { sound: 'default', badge: vencendoHoje.length } } },
          webpush:      { notification: { requireInteraction: true, icon: '/icon-192.png' } }
        });

        // Remove tokens inválidos (expirados/desinstalados)
        const invalidos = [];
        response.responses.forEach((r, i) => {
          if (!r.success && r.error?.code === 'messaging/registration-token-not-registered') {
            invalidos.push(tokens[i]);
          }
        });
        for (const t of invalidos) {
          const snap = await userRef.collection('jc_fcm_tokens')
            .where('token', '==', t).limit(1).get();
          snap.forEach(d => d.ref.delete());
        }

        console.log(`[FCM] Usuário ${userRef.id}: ${response.successCount} enviado(s), ${response.failureCount} falha(s)`);

      } catch (err) {
        console.error(`[FCM] Erro no usuário ${userRef.id}:`, err);
      }
    }

    console.log('[FCM] Ciclo diário concluído.');
  }
);
