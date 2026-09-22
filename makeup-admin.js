document.addEventListener('DOMContentLoaded', () => {
  const client = window.swimDb?.client;
  const modal = document.getElementById('makeup-manage-modal');
  const list = document.getElementById('makeup-request-list');
  const message = document.getElementById('makeup-admin-message');
  let slots = [];
  let requests = [];
  let members = [];

  function formatDate(date) {
    return new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(`${date}T00:00:00`));
  }

  function formatTime(time) {
    return String(time || '').slice(0, 5);
  }

  function getMemberName(memberId) {
    return members.find((member) => member.id === memberId)?.name || '회원';
  }

  function showMessage(text, tone = '') {
    message.textContent = text;
    message.dataset.tone = tone;
  }

  async function ensureRecurringSlots() {
    const { error } = await client.rpc('ensure_makeup_slots');

    if (error) throw error;
  }

  function render() {
    const activeRequests = requests.filter((request) =>
      ['pending', 'approved'].includes(request.status)
    );

    window.makeupCalendarLessons = activeRequests
      .map((request) => {
        const slot = slots.find((item) => item.id === request.slot_id);

        if (!slot) return null;

        return {
          id: request.id,
          requestId: request.id,
          memberId: request.member_id,
          date: slot.slot_date,
          time: formatTime(slot.slot_time),
          title: `${getMemberName(request.member_id)}${
            request.status === 'pending' ? ' (승인대기)' : ''
          }`,
          type: 'makeup',
          source: 'makeup-request',
        };
      })
      .filter(Boolean);

    const rows = slots.map((slot) => {
      const request = requests.find(
        (item) =>
          item.slot_id === slot.id &&
          ['pending', 'approved'].includes(item.status)
      );
      const status = request?.status || slot.status;
      const statusText = {
        open: '신청 가능',
        pending: '승인 대기',
        approved: '승인 완료',
        booked: '마감',
        closed: '마감',
      }[status];

      return `
        <article class="makeup-admin-item">
          <div>
            <strong>${formatDate(slot.slot_date)} ${formatTime(slot.slot_time)}</strong>
            <span>${request ? getMemberName(request.member_id) : statusText}</span>
          </div>
          <div class="makeup-admin-actions">
            ${request?.status === 'pending' ? `
              <button type="button" data-action="approve" data-id="${request.id}">승인</button>
              <button type="button" class="danger" data-action="reject" data-id="${request.id}">반려</button>
            ` : ''}
            ${request?.status === 'approved' ? `
              <button type="button" class="danger" data-action="cancel" data-id="${request.id}">취소</button>
            ` : ''}
            ${!request ? `
              <button type="button" class="danger" data-action="close" data-id="${slot.id}">마감</button>
            ` : `<em>${statusText}</em>`}
          </div>
        </article>
      `;
    });

    list.innerHTML = rows.length
      ? rows.join('')
      : '<p class="today-empty">등록된 보강 가능 시간이 없습니다.</p>';

    if (typeof window.refreshLessonRecordState === 'function') {
      window.refreshLessonRecordState();
    } else if (typeof window.renderCalendar === 'function') {
      window.renderCalendar();
    }
  }

  async function loadData() {
    if (!client) return;

    try {
      await ensureRecurringSlots();
    } catch (error) {
      showMessage(
        ['PGRST202', 'PGRST205'].includes(error.code)
          ? 'Supabase SQL Editor에서 supabase-makeup-migration.sql을 먼저 실행해주세요.'
          : `보강 시간을 준비하지 못했습니다. ${error.message}`,
        'error'
      );
      return;
    }

    const [slotResult, requestResult, memberResult] = await Promise.all([
      client.from('makeup_slots').select('*').order('slot_date').order('slot_time'),
      client.from('makeup_requests').select('*').order('requested_at'),
      client.from('members').select('id, name'),
    ]);
    const error = slotResult.error || requestResult.error || memberResult.error;

    if (error) {
      showMessage(
        error.code === 'PGRST205'
          ? 'Supabase SQL Editor에서 supabase-makeup-migration.sql을 먼저 실행해주세요.'
          : `보강 정보를 불러오지 못했습니다. ${error.message}`,
        'error'
      );
      return;
    }

    slots = slotResult.data || [];
    requests = requestResult.data || [];
    members = memberResult.data || [];
    showMessage('');
    render();
  }

  function openModal() {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    loadData();
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
  }

  window.openMakeupManagement = openModal;
  window.cancelMakeupLesson = async (requestId) => {
    const { error } = await client.rpc('cancel_makeup_request', {
      p_request_id: requestId,
    });

    if (error) throw error;

    await loadData();
  };
  document.getElementById('makeupManageButton')?.addEventListener('click', openModal);
  document.getElementById('close-makeup-manage')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });

  list?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    if (action === 'close') {
      await client.from('makeup_slots').update({ status: 'closed' }).eq('id', id);
    } else if (action === 'cancel') {
      const shouldCancel = confirm('승인된 보강 수업을 취소할까요?');

      if (!shouldCancel) return;

      const { error } = await client.rpc('cancel_makeup_request', {
        p_request_id: id,
      });

      if (error) {
        showMessage(`보강을 취소하지 못했습니다. ${error.message}`, 'error');
        return;
      }
    } else {
      const request = requests.find((item) => item.id === id);
      const nextStatus = action === 'approve' ? 'approved' : 'rejected';
      await client
        .from('makeup_requests')
        .update({ status: nextStatus, reviewed_at: new Date().toISOString() })
        .eq('id', id);
      await client
        .from('makeup_slots')
        .update({ status: action === 'approve' ? 'booked' : 'open' })
        .eq('id', request.slot_id);
    }

    await loadData();
  });

  loadData();
});
