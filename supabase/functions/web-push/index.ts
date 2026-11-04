import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-secret',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:ljw022072@gmail.com';

  if (request.method === 'GET') {
    if (!vapidPublicKey) return json({ error: 'VAPID 공개키가 설정되지 않았습니다.' }, 503);
    return json({ publicKey: vapidPublicKey });
  }

  try {
    const body = await request.json();
    const admin = createClient(supabaseUrl, serviceRoleKey);

    if (body.type === 'INSERT' && body.table === 'push_notification_events') {
      if (request.headers.get('x-webhook-secret') !== Deno.env.get('PUSH_WEBHOOK_SECRET')) {
        return json({ error: '웹훅 인증에 실패했습니다.' }, 401);
      }
      if (!vapidPublicKey || !vapidPrivateKey) return json({ error: 'VAPID 키가 설정되지 않았습니다.' }, 503);
      webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

      const event = body.record;
      const { data: subscriptions, error } = await admin
        .from('push_subscriptions')
        .select('id, endpoint, p256dh, auth_key')
        .eq('user_id', event.target_user_id);
      if (error) throw error;

      const payload = JSON.stringify({
        title: event.title,
        body: event.body,
        url: event.url,
        tag: event.tag || `event-${event.id}`,
      });
      const expiredIds: string[] = [];
      await Promise.all((subscriptions || []).map(async (subscription) => {
        try {
          await webpush.sendNotification({
            endpoint: subscription.endpoint,
            keys: { p256dh: subscription.p256dh, auth: subscription.auth_key },
          }, payload);
        } catch (error) {
          const pushError = error as { statusCode?: number };
          if (pushError.statusCode === 404 || pushError.statusCode === 410) expiredIds.push(subscription.id);
          else console.error('Push delivery failed', error);
        }
      }));
      if (expiredIds.length) await admin.from('push_subscriptions').delete().in('id', expiredIds);
      await admin.from('push_notification_events').update({ sent_at: new Date().toISOString() }).eq('id', event.id);
      return json({ sent: (subscriptions || []).length - expiredIds.length });
    }

    const authorization = request.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) return json({ error: '로그인이 필요합니다.' }, 401);

    if (body.action === 'subscribe') {
      const subscription = body.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: '올바르지 않은 구독 정보입니다.' }, 400);
      }
      const { error } = await admin.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth_key: subscription.keys.auth,
        user_agent: request.headers.get('user-agent'),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'endpoint' });
      if (error) throw error;
      return json({ ok: true });
    }

    if (body.action === 'unsubscribe') {
      const { error } = await admin.from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', body.endpoint || '');
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: '지원하지 않는 요청입니다.' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : '푸시 알림 처리 중 오류가 발생했습니다.' }, 500);
  }
});
