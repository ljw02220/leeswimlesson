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

const recentTests = new Map<string, number>();

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

  let stage = 'request';
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

    if (body.action === 'test') {
      stage = 'test';
      if (!vapidPublicKey || !vapidPrivateKey) return json({error:'서버 VAPID 키 설정을 확인해주세요.'},503);
      const {data:subscriptions,error}=await admin.from('push_subscriptions')
        .select('id,endpoint,p256dh,auth_key').eq('user_id',user.id).eq('endpoint',String(body.endpoint||''));
      if(error)throw error;
      const subscription=subscriptions?.[0];
      if(!subscription)return json({error:'이 기기를 다시 연결한 뒤 테스트해주세요.'},400);
      const now=Date.now();
      if(now-(recentTests.get(user.id)||0)<5000)return json({error:'5초 후 다시 테스트해주세요.'},429);
      for(const [key,time] of recentTests)if(now-time>60000)recentTests.delete(key);
      recentTests.set(user.id,now);
      try {
        webpush.setVapidDetails(vapidSubject,vapidPublicKey,vapidPrivateKey);
        const result=await webpush.sendNotification({endpoint:subscription.endpoint,keys:{p256dh:subscription.p256dh,auth:subscription.auth_key}},JSON.stringify({title:'수영관리 테스트 알림',body:'테스트 알림을 바로 발송했어요.',url:'./member-home.html',icon:'./icons/icon-192.png',tag:`test-${crypto.randomUUID()}`}),{urgency:'high',TTL:60,timeout:10000});
        if(result.statusCode<200||result.statusCode>=300)throw Error('Push service rejected delivery');
        return json({sent:1});
      }catch(error){
        const status=(error as {statusCode?:number})?.statusCode;
        console.error('Direct test push failed',{status,userId:user.id});
        if(status===404||status===410){await admin.from('push_subscriptions').delete().eq('id',subscription.id);return json({error:'기기 구독이 만료됐어요. 알림을 껐다가 다시 켜주세요.'},410);}
        if(status===401||status===403)return json({error:'푸시 발송 인증에 실패했어요. VAPID 공개키·비밀키가 같은 쌍인지 확인해주세요.'},502);
        return json({error:'기기 알림 서버가 발송을 받지 못했어요. web-push 서버 로그를 확인해주세요.'},502);
      }
    }

    if (body.action === 'subscribe') {
      stage = 'subscribe';
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
      stage = 'unsubscribe';
      const { error } = await admin.from('push_subscriptions')
        .delete()
        .eq('user_id', user.id)
        .eq('endpoint', body.endpoint || '');
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: '지원하지 않는 요청입니다.' }, 400);
  } catch (error) {
    const detail=error as {message?:string;code?:string};
    console.error('web-push failure', {stage,code:detail?.code,message:detail?.message});
    const labels:Record<string,string>={
      '42P01':'알림 구독 테이블이 없습니다. 최신 05 알림 SQL을 실행해주세요.',
      'PGRST205':'알림 구독 테이블을 찾지 못했습니다. 최신 05 알림 SQL을 실행해주세요.',
      'PGRST204':'알림 테이블의 항목이 맞지 않습니다. 최신 05 알림 SQL을 실행해주세요.',
      '42501':'알림 구독 저장 권한이 없습니다. 서버 권한과 최신 05 알림 SQL을 확인해주세요.',
      '23505':'기기 구독 정보가 충돌했습니다. 알림을 껐다가 다시 켜주세요.'
    };
    const code=detail?.code||'UNKNOWN';
    return json({error:labels[code] || (stage==='subscribe'?'기기 등록에 실패했습니다. Supabase의 web-push 함수 Logs에서 오류를 확인해주세요.':'푸시 알림 처리에 실패했습니다. Supabase의 web-push 함수 Logs를 확인해주세요.')},500);
  }
});
