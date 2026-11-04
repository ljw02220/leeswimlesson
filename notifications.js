(function () {
  const client = window.swimDb?.client;
  const savedSession =
    sessionStorage.getItem('loginSession') || localStorage.getItem('loginSession');

  if (!client || !savedSession) return;

  let loginData;

  try {
    loginData = JSON.parse(savedSession);
  } catch (error) {
    console.warn('알림 로그인 정보를 확인하지 못했습니다.', error);
    return;
  }

  const isMember = loginData.role === 'member';
  const seenKey = `swimNotificationSeenAt:${loginData.memberId || 'admin'}`;
  const pushFunctionUrl = `${window.SUPABASE_URL || 'https://icfcwcqzbjqxkrgqyfha.supabase.co'}/functions/v1/web-push`;
  let notifications = [];
  let pushRegistration = null;
  let markedCurrentPage = false;

  function notificationPage(href) {
    return String(href || '').split(/[?#]/)[0].split('/').pop();
  }

  function pageSeenKey(page) {
    return `${seenKey}:page:${page}`;
  }

  function isUnread(item) {
    if (item.persistent) return true;
    const seenAt = localStorage.getItem(pageSeenKey(notificationPage(item.href))) ||
      localStorage.getItem(seenKey) || '';
    return Boolean(item.createdAt && item.createdAt > seenAt);
  }

  function markPageSeen(page) {
    const latest = notifications.filter((item) => notificationPage(item.href) === page)
      .reduce((value, item) => String(item.createdAt || '') > value ? item.createdAt : value, '');
    if (latest && latest > (localStorage.getItem(pageSeenKey(page)) || '')) {
      localStorage.setItem(pageSeenKey(page), latest);
    }
  }

  function renderChangeDots() {
    document.querySelectorAll('[data-swim-change-dot]').forEach((dot) => dot.remove());
    document.querySelectorAll('.top-nav a[href], .member-nav-item[href]').forEach((link) => {
      const page = notificationPage(link.getAttribute('href'));
      if (!notifications.some((item) => notificationPage(item.href) === page && isUnread(item))) return;
      link.classList.add('swim-change-target');
      const dot = document.createElement('span');
      dot.className = 'swim-change-dot';
      dot.dataset.swimChangeDot = '';
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', '새 소식 있음');
      dot.title = '새 소식 있음';
      link.appendChild(dot);
    });
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    })[character]);
  }

  function getPersistentCount() {
    return notifications
      .filter((item) => item.persistent)
      .reduce((sum, item) => sum + Number(item.count || 0), 0);
  }

  function addStyles() {
    if (document.getElementById('swim-notification-styles')) return;

    const style = document.createElement('style');
    style.id = 'swim-notification-styles';
    style.textContent = `
      .swim-notification-wrap { position: relative; margin-left: auto; }
      .swim-notification-trigger { position: relative; }
      .top-nav .swim-notification-trigger { border: 0; background: transparent; color: #344054; font: inherit; font-weight: 700; cursor: pointer; padding: 10px 12px; }
      .swim-notification-badge { position: absolute; top: 3px; right: 2px; min-width: 17px; height: 17px; padding: 0 4px; border: 2px solid #fff; border-radius: 999px; background: #ef4444; color: #fff; font-size: 10px; font-weight: 800; line-height: 13px; text-align: center; box-sizing: border-box; }
      .member-notification-button .swim-notification-badge { top: -5px; right: -5px; }
      .swim-notification-badge { min-width: 9px; width: 9px; height: 9px; padding: 0; border-width: 1px; }
      .swim-change-target { position: relative; }
      .swim-change-dot { display: inline-block; width: 7px; height: 7px; flex-shrink: 0; border-radius: 50%; background: #ef4444; vertical-align: middle; }
      .swim-change-target > .swim-change-dot { position: absolute; top: 5px; right: 3px; }
      .swim-notification-item strong .swim-change-dot { margin-left: 6px; }
      .swim-notification-panel { position: absolute; z-index: 1000; top: calc(100% + 10px); right: 0; width: min(340px, calc(100vw - 28px)); max-height: 420px; overflow: auto; padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; box-shadow: 0 16px 40px rgba(15, 23, 42, .18); }
      .swim-notification-panel[hidden] { display: none; }
      .swim-notification-title { margin: 0; padding: 10px 10px 8px; color: #0f172a; font-size: 15px; }
      .swim-push-settings { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: 0 4px 6px; padding: 11px 10px; border: 1px solid #dbeafe; border-radius: 7px; background: #f8fbff; }
      .swim-push-copy { min-width: 0; }
      .swim-push-copy strong { display: block; color: #0f172a; font-size: 13px; }
      .swim-push-copy span { display: block; margin-top: 3px; color: #64748b; font-size: 11px; line-height: 1.35; }
      .swim-push-button { flex: 0 0 auto; min-width: 64px; padding: 7px 10px; border: 1px solid #2563eb; border-radius: 6px; background: #2563eb; color: #fff; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
      .swim-push-button.is-on { border-color: #cbd5e1; background: #fff; color: #475569; }
      .swim-push-button:disabled { cursor: wait; opacity: .65; }
      .swim-push-message { margin: 0 14px 8px; color: #64748b; font-size: 11px; line-height: 1.45; }
      .swim-push-message.is-error { color: #dc2626; }
      .swim-notification-item { display: block; width: 100%; padding: 11px 10px; border: 0; border-top: 1px solid #eef2f7; background: #fff; color: #334155; text-align: left; text-decoration: none; font-size: 13px; line-height: 1.45; cursor: pointer; }
      .swim-notification-item strong { display: block; margin-bottom: 2px; color: #0f172a; font-size: 13px; }
      .swim-payment-confirm { margin-top: 8px; padding: 7px 14px; border: 0; border-radius: 6px; background: #2563eb; color: white; font: inherit; font-weight: 700; cursor: pointer; }
      .swim-payment-confirm:disabled { opacity: .6; cursor: wait; }
      .swim-notification-empty { margin: 0; padding: 18px 10px; color: #64748b; font-size: 13px; text-align: center; }
      @media (max-width: 700px) { .top-nav .swim-notification-trigger { padding: 8px; font-size: 12px; } }
    `;
    document.head.appendChild(style);
  }

  function createAdminButton() {
    const nav = document.querySelector('.top-nav');
    const account = nav?.querySelector('.admin-account');
    if (!nav || !account) return null;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swim-notification-trigger';
    button.setAttribute('aria-label', '알림');
    button.title = '알림';
    button.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';
    nav.insertBefore(button, account);
    return button;
  }

  function getTrigger() {
    const memberButton = document.querySelector('.member-notification-button');
    if (memberButton) {
      memberButton.classList.add('swim-notification-trigger');
      return memberButton;
    }
    return createAdminButton();
  }

  function setupPanel(trigger) {
    const wrap = document.createElement('div');
    wrap.className = 'swim-notification-wrap';
    trigger.parentNode.insertBefore(wrap, trigger);
    wrap.appendChild(trigger);

    const panel = document.createElement('section');
    panel.className = 'swim-notification-panel';
    panel.hidden = true;
    panel.innerHTML = `
      <h2 class="swim-notification-title">알림</h2>
      <div class="swim-push-settings">
        <div class="swim-push-copy">
          <strong>휴대폰 알림</strong>
          <span>사이트를 닫아도 새 소식을 받습니다.</span>
        </div>
        <button type="button" class="swim-push-button">확인 중</button>
      </div>
      <p class="swim-push-message" hidden></p>
      <div class="swim-notification-list"></div>
    `;
    wrap.appendChild(panel);

    setupPushSettings(panel);

    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
    });

    panel.addEventListener('click', (event) => {
      const link = event.target.closest('.swim-notification-item[href]');
      if (!link) return;
      markPageSeen(notificationPage(link.getAttribute('href')));
      renderList(panel);
      renderChangeDots();
      renderBadge(trigger, notifications.filter(isUnread).length);
    });

    document.addEventListener('click', (event) => {
      if (!wrap.contains(event.target)) panel.hidden = true;
    });

    return panel;
  }

  function urlBase64ToUint8Array(value) {
    const padding = '='.repeat((4 - (value.length % 4)) % 4);
    const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
  }

  function setPushMessage(panel, message = '', isError = false) {
    const element = panel.querySelector('.swim-push-message');
    element.textContent = message;
    element.hidden = !message;
    element.classList.toggle('is-error', isError);
  }

  async function getAccessToken() {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    if (!data.session?.access_token) throw new Error('로그인 정보를 확인할 수 없습니다.');
    return data.session.access_token;
  }

  async function callPushFunction(body) {
    const token = await getAccessToken();
    const response = await fetch(pushFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || '휴대폰 알림 설정을 저장하지 못했습니다.');
    return result;
  }

  async function getPushRegistration() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    if (!pushRegistration) {
      pushRegistration = await navigator.serviceWorker.register('./swim-service-worker.js?v=20261007');
      await navigator.serviceWorker.ready;
    }
    return pushRegistration;
  }

  async function refreshPushButton(panel) {
    const button = panel.querySelector('.swim-push-button');
    const registration = await getPushRegistration();
    if (!registration || !('Notification' in window)) {
      button.textContent = '지원 안 됨';
      button.disabled = true;
      setPushMessage(panel, '이 브라우저에서는 휴대폰 알림을 사용할 수 없습니다.', true);
      return;
    }
    const subscription = await registration.pushManager.getSubscription();
    const enabled = Boolean(subscription) && Notification.permission === 'granted';
    button.textContent = enabled ? '끄기' : '켜기';
    button.classList.toggle('is-on', enabled);
    button.disabled = false;
    button.dataset.enabled = String(enabled);

    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
    if (isIos && !isStandalone && !enabled) {
      setPushMessage(panel, '아이폰은 공유 버튼에서 홈 화면에 추가한 뒤, 추가된 아이콘으로 열어 켜주세요.');
    } else if (Notification.permission === 'denied') {
      setPushMessage(panel, '브라우저 설정에서 이 사이트의 알림 권한을 허용해주세요.', true);
    } else {
      setPushMessage(panel);
    }
  }

  async function enablePush(panel) {
    const registration = await getPushRegistration();
    if (!registration) throw new Error('이 브라우저에서는 휴대폰 알림을 사용할 수 없습니다.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('알림 권한이 허용되지 않았습니다.');

    const token = await getAccessToken();
    const publicKeyResponse = await fetch(`${pushFunctionUrl}?action=public-key`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const publicKeyResult = await publicKeyResponse.json().catch(() => ({}));
    if (!publicKeyResponse.ok || !publicKeyResult.publicKey) {
      throw new Error(publicKeyResult.error || '푸시 공개키를 불러오지 못했습니다.');
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKeyResult.publicKey),
      });
    }
    await callPushFunction({ action: 'subscribe', subscription: subscription.toJSON() });
    setPushMessage(panel, '이 기기로 휴대폰 알림을 받습니다.');
  }

  async function disablePush(panel) {
    const registration = await getPushRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) {
      await callPushFunction({ action: 'unsubscribe', endpoint: subscription.endpoint });
      await subscription.unsubscribe();
    }
    setPushMessage(panel, '이 기기의 휴대폰 알림을 껐습니다.');
  }

  function setupPushSettings(panel) {
    const button = panel.querySelector('.swim-push-button');
    button.addEventListener('click', async () => {
      button.disabled = true;
      button.textContent = '처리 중';
      try {
        if (button.dataset.enabled === 'true') await disablePush(panel);
        else await enablePush(panel);
      } catch (error) {
        console.error('휴대폰 알림 설정 실패:', error);
        setPushMessage(panel, error.message || '휴대폰 알림을 설정하지 못했습니다.', true);
      } finally {
        await refreshPushButton(panel).catch((error) => {
          console.warn('휴대폰 알림 상태 확인 실패:', error);
        });
      }
    });
    refreshPushButton(panel).catch((error) => {
      console.warn('휴대폰 알림 준비 실패:', error);
      button.textContent = '설정 필요';
      button.disabled = false;
      setPushMessage(panel, 'Supabase 휴대폰 알림 설정을 먼저 완료해주세요.', true);
    });
  }

  function renderBadge(trigger, count) {
    trigger.querySelector('.swim-notification-badge')?.remove();
    if (!count) return;

    const badge = document.createElement('span');
    badge.className = 'swim-notification-badge';
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', '새 소식 있음');
    trigger.appendChild(badge);
  }

  function renderList(panel) {
    const list = panel.querySelector('.swim-notification-list');
    list.innerHTML = notifications.length
      ? notifications
          .map(
            (item) => `
              <a class="swim-notification-item" href="${escapeHTML(item.href)}">
                <strong>${escapeHTML(item.title)}${isUnread(item) ? '<span class="swim-change-dot" role="img" aria-label="새 소식 있음"></span>' : ''}</strong>
                <span>${escapeHTML(item.message)}</span>
              </a>
            `
          )
          .join('')
      : '<p class="swim-notification-empty">새로운 알림이 없습니다.</p>';
  }

  async function loadAdminNotifications() {
    const [signupResult, makeupResult, creditResult, paymentResult] = await Promise.all([
      client.from('signup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('makeup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('makeup_credits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('payment_requests').select('id, payment_date, payment_amount, requested_at, members(name)')
        .eq('status', 'pending').order('requested_at', { ascending: false }),
    ]);

    const items = [];
    if (paymentResult.error) console.warn('입금 알림을 불러오지 못했습니다.', paymentResult.error);
    else items.push(...(paymentResult.data || []).map((request) => ({
      title: `${request.members?.name || '회원'}님 입금 확인 대기`,
      message: `${request.payment_date} · ${Number(request.payment_amount).toLocaleString('ko-KR')}원`,
      href: 'finance.html#paymentRequests',
      createdAt: request.requested_at,
      persistent: true,
      count: 1,
    })));
    if (!signupResult.error && signupResult.count) {
      items.push({
        title: `가입 신청 ${signupResult.count}건`,
        message: '승인을 기다리는 회원이 있습니다.',
        href: 'members.html',
        persistent: true,
        count: signupResult.count,
      });
    }
    if (!makeupResult.error && makeupResult.count) {
      items.push({
        title: `보강 신청 ${makeupResult.count}건`,
        message: '승인 또는 반려 처리가 필요합니다.',
        href: 'lessons.html',
        persistent: true,
        count: makeupResult.count,
      });
    }
    if (!creditResult.error && creditResult.count) {
      items.push({
        title: `보강 횟수 확인 ${creditResult.count}건`,
        message: '회원의 누락 보강 요청을 확인해주세요.',
        href: 'lessons.html',
        persistent: true,
        count: creditResult.count,
      });
    }
    return items;
  }

  async function loadMemberNotifications() {
    if (!loginData.memberId) return [];

    const [requestResult, creditResult, usageResult, paymentResult] = await Promise.all([
      client
        .from('makeup_requests')
        .select('id, status, reviewed_at, makeup_slots(slot_date, slot_time)')
        .eq('member_id', loginData.memberId)
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(8),
      client
        .from('makeup_credits')
        .select('id, status, quantity, reviewed_at')
        .eq('member_id', loginData.memberId)
        .in('status', ['approved', 'rejected'])
        .order('reviewed_at', { ascending: false })
        .limit(8),
      client
        .from('makeup_credit_usages')
        .select('id, quantity, usage_type, used_at')
        .eq('member_id', loginData.memberId)
        .order('used_at', { ascending: false })
        .limit(8),
      client.from('payment_requests')
        .select('id, status, payment_date, payment_amount, requested_at, reviewed_at')
        .eq('member_id', loginData.memberId)
        .order('requested_at', { ascending: false }).limit(8),
    ]);

    const items = [];

    if (!paymentResult.error) items.push(...(paymentResult.data || []).map((request) => ({
      title: request.status === 'confirmed' ? '입금이 확인되었습니다.' : '입금 확인을 기다리고 있습니다.',
      message: `${request.payment_date} · ${Number(request.payment_amount).toLocaleString('ko-KR')}원`,
      href: 'member-profile.html',
      createdAt: request.reviewed_at || request.requested_at,
      persistent: request.status === 'pending',
      count: 1,
    })));

    if (!requestResult.error) items.push(...(requestResult.data || []).map((request) => {
      const approved = request.status === 'approved';
      const date = request.makeup_slots?.slot_date || '';
      const time = String(request.makeup_slots?.slot_time || '').slice(0, 5);
      return {
        title: approved ? '보강 신청이 승인되었습니다.' : '보강 신청이 반려되었습니다.',
        message: date ? `${date} ${time}` : '보강 신청 결과를 확인해주세요.',
        href: 'member-home.html',
        createdAt: request.reviewed_at || '',
      };
    }));

    if (!creditResult.error) items.push(...(creditResult.data || []).map((credit) => {
      const approved = credit.status === 'approved';
      return {
        title: approved
          ? `보강 ${credit.quantity}회가 승인되었습니다.`
          : '보강 횟수 확인 요청이 반려되었습니다.',
        message: approved
          ? '사용 가능한 보강 횟수에 추가되었습니다.'
          : '보강 횟수 현황에서 결과를 확인해주세요.',
        href: 'member-home.html',
        createdAt: credit.reviewed_at || '',
      };
    }));

    if (!usageResult.error) items.push(...(usageResult.data || []).map((usage) => ({
      title: usage.usage_type === 'payment_discount'
        ? `보강 ${usage.quantity}회가 결제에서 차감되었습니다.`
        : `보강 ${usage.quantity}회가 사용 처리되었습니다.`,
      message: '보강 횟수 현황에서 사용 내역을 확인해주세요.',
      href: 'member-home.html',
      createdAt: usage.used_at || '',
    })));

    return items;
  }

  async function loadCommentNotifications() {
    const { data, error } = await client.rpc('get_lesson_comment_notifications');
    if (error) {
      console.warn('댓글 알림을 불러오지 못했습니다.', error);
      return [];
    }

    return (data || []).map((comment) => {
      const typeName = comment.lesson_type === 'group'
        ? '단체수업'
        : comment.lesson_type === 'makeup'
          ? '보강'
          : '개인레슨';
      const time = String(comment.lesson_time || '').slice(0, 5);
      const body = String(comment.body || '').trim();
      const preview = body.length > 45 ? `${body.slice(0, 45)}...` : body;

      return {
        title: `${comment.author_name || '회원'}님의 새 댓글`,
        message: `${typeName} · ${comment.lesson_date} ${time} · ${preview}`,
        href: isMember ? 'member-lessons.html?view=completed' : 'members.html',
        createdAt: comment.created_at || '',
      };
    });
  }

  async function loadLessonNoteNotifications() {
    if (!isMember) return [];

    const { data, error } = await client.rpc('get_lesson_note_notifications');
    if (error) {
      console.warn('수업노트 알림을 불러오지 못했습니다.', error);
      return [];
    }

    return (data || []).map((note) => {
      const typeName = note.lesson_type === 'group'
        ? '단체수업'
        : note.lesson_type === 'makeup'
          ? '보강'
          : '개인레슨';
      const time = String(note.lesson_time || '').slice(0, 5);

      return {
        title: '새 수업노트가 작성되었습니다.',
        message: `${typeName} · ${note.lesson_date} ${time}`,
        href: 'member-lessons.html?view=completed',
        createdAt: note.created_at || '',
      };
    });
  }

  async function refresh(trigger, panel) {
    const [baseNotifications, commentNotifications, noteNotifications] = await Promise.all([
      isMember ? loadMemberNotifications() : loadAdminNotifications(),
      loadCommentNotifications(),
      loadLessonNoteNotifications(),
    ]);
    notifications = [
      ...baseNotifications,
      ...commentNotifications,
      ...noteNotifications,
    ].sort((a, b) => {
      if (a.persistent && !b.persistent) return -1;
      if (!a.persistent && b.persistent) return 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
    if (!markedCurrentPage) {
      markPageSeen(notificationPage(window.location.pathname));
      markedCurrentPage = true;
    }
    renderList(panel);
    renderChangeDots();
    renderBadge(trigger, notifications.filter(isUnread).length);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    const trigger = getTrigger();
    if (!trigger) return;
    const panel = setupPanel(trigger);
    refresh(trigger, panel);
    window.addEventListener('swim-payment-requested', () => refresh(trigger, panel));
    window.addEventListener('swim-payment-confirmed', () => refresh(trigger, panel));
    setInterval(() => refresh(trigger, panel), 30000);
  });
})();
