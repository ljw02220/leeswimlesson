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
  let notifications = [];

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
      .swim-notification-panel { position: absolute; z-index: 1000; top: calc(100% + 10px); right: 0; width: min(340px, calc(100vw - 28px)); max-height: 420px; overflow: auto; padding: 8px; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; box-shadow: 0 16px 40px rgba(15, 23, 42, .18); }
      .swim-notification-panel[hidden] { display: none; }
      .swim-notification-title { margin: 0; padding: 10px 10px 8px; color: #0f172a; font-size: 15px; }
      .swim-notification-item { display: block; width: 100%; padding: 11px 10px; border: 0; border-top: 1px solid #eef2f7; background: #fff; color: #334155; text-align: left; text-decoration: none; font-size: 13px; line-height: 1.45; cursor: pointer; }
      .swim-notification-item strong { display: block; margin-bottom: 2px; color: #0f172a; font-size: 13px; }
      .swim-notification-empty { margin: 0; padding: 18px 10px; color: #64748b; font-size: 13px; text-align: center; }
      @media (max-width: 700px) { .top-nav .swim-notification-trigger { padding: 8px; font-size: 12px; } }
    `;
    document.head.appendChild(style);
  }

  function createAdminButton() {
    const nav = document.querySelector('.top-nav');
    const logout = document.getElementById('logoutButton');
    if (!nav || !logout) return null;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'swim-notification-trigger';
    button.setAttribute('aria-label', '알림');
    button.textContent = '알림';
    nav.insertBefore(button, logout);
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
    panel.innerHTML = '<h2 class="swim-notification-title">알림</h2><div class="swim-notification-list"></div>';
    wrap.appendChild(panel);

    trigger.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        localStorage.setItem(seenKey, new Date().toISOString());
        renderBadge(trigger, getPersistentCount());
      }
    });

    document.addEventListener('click', (event) => {
      if (!wrap.contains(event.target)) panel.hidden = true;
    });

    return panel;
  }

  function renderBadge(trigger, count) {
    trigger.querySelector('.swim-notification-badge')?.remove();
    if (!count) return;

    const badge = document.createElement('span');
    badge.className = 'swim-notification-badge';
    badge.textContent = count > 99 ? '99+' : String(count);
    trigger.appendChild(badge);
  }

  function renderList(panel) {
    const list = panel.querySelector('.swim-notification-list');
    list.innerHTML = notifications.length
      ? notifications
          .map(
            (item) => `
              <a class="swim-notification-item" href="${escapeHTML(item.href)}">
                <strong>${escapeHTML(item.title)}</strong>
                <span>${escapeHTML(item.message)}</span>
              </a>
            `
          )
          .join('')
      : '<p class="swim-notification-empty">새로운 알림이 없습니다.</p>';
  }

  async function loadAdminNotifications() {
    const [signupResult, makeupResult, creditResult] = await Promise.all([
      client.from('signup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('makeup_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      client.from('makeup_credits').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    const items = [];
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

    const [requestResult, creditResult] = await Promise.all([
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
    ]);

    const items = [];

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
    renderList(panel);

    const seenAt = localStorage.getItem(seenKey) || '';
    const unreadCount = notifications.filter(
      (item) => !item.persistent && item.createdAt > seenAt
    ).length;
    const count = getPersistentCount() + unreadCount;
    renderBadge(trigger, count);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addStyles();
    const trigger = getTrigger();
    if (!trigger) return;
    const panel = setupPanel(trigger);
    refresh(trigger, panel);
    setInterval(() => refresh(trigger, panel), 30000);
  });
})();
