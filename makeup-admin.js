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

  function getTodayKey() {
    const date = new Date();

    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
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
              <button type="button" onclick="handleMakeupAdminAction('approve', '${request.id}', this)">승인</button>
              <button type="button" class="danger" onclick="handleMakeupAdminAction('reject', '${request.id}', this)">반려</button>
            ` : ''}
            ${request?.status === 'approved' ? `
              <button type="button" class="danger" onclick="handleMakeupAdminAction('cancel', '${request.id}', this)">취소</button>
            ` : ''}
            ${!request ? `
              <button type="button" class="danger" onclick="handleMakeupAdminAction('close', '${slot.id}', this)">마감</button>
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
      if (error.code === 'PGRST202') {
        console.warn('보강 시간 자동 생성 함수를 아직 불러오지 못했습니다.', error);
      } else {
        showMessage(`보강 시간을 자동 생성하지 못했습니다. ${error.message}`, 'error');
      }
    }

    const [slotResult, requestResult, memberResult] = await Promise.all([
      client
        .from('makeup_slots')
        .select('*')
        .gte('slot_date', getTodayKey())
        .order('slot_date')
        .order('slot_time'),
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

  window.handleMakeupAdminAction = async (action, id, button) => {
    const originalText = button?.textContent || '';

    if (button) {
      button.disabled = true;
      button.textContent = '처리 중';
    }

    try {
      if (action === 'close') {
        const { error } = await client
          .from('makeup_slots')
          .update({ status: 'closed' })
          .eq('id', id);
        if (error) throw error;
      } else if (action === 'cancel') {
        if (!confirm('승인된 보강 수업을 취소할까요?')) {
          if (button) {
            button.disabled = false;
            button.textContent = originalText;
          }
          return;
        }

        const request = requests.find((item) => item.id === id);
        if (!request) throw new Error('취소할 보강 신청을 찾지 못했습니다.');

        const requestResult = await client
          .from('makeup_requests')
          .update({ status: 'cancelled', reviewed_at: new Date().toISOString() })
          .eq('id', id)
          .select('id');
        if (requestResult.error) throw requestResult.error;
        if (!requestResult.data?.length) {
          throw new Error('관리자 변경 권한이 없습니다.');
        }

        const slotResult = await client
          .from('makeup_slots')
          .update({ status: 'open' })
          .eq('id', request.slot_id)
          .select('id');
        if (slotResult.error) throw slotResult.error;
        if (!slotResult.data?.length) {
          throw new Error('보강 시간 변경 권한이 없습니다.');
        }
      } else {
        const decision = action === 'approve' ? 'approved' : 'rejected';
        const request = requests.find((item) => item.id === id);
        if (!request) throw new Error('처리할 보강 신청을 찾지 못했습니다.');

        const rpcResult = await Promise.race([
          client.rpc('review_makeup_request', {
            p_request_id: id,
            p_decision: decision,
          }),
          new Promise((resolve) => {
            setTimeout(
              () => resolve({ error: { code: 'TIMEOUT', message: '처리 시간 초과' } }),
              5000
            );
          }),
        ]);

        if (!rpcResult.error) {
          await loadData();
          return;
        }

        const requestResult = await client
          .from('makeup_requests')
          .update({ status: decision, reviewed_at: new Date().toISOString() })
          .eq('id', id)
          .select('id');
        if (requestResult.error) throw requestResult.error;
        if (!requestResult.data?.length) {
          const rpcMessage = rpcResult.error?.message || 'RPC 처리 실패';
          const { data: authData } = await client.auth.getUser();
          const loginEmail = authData?.user?.email || '확인되지 않음';
          throw new Error(
            `관리자 변경 권한이 없습니다. 현재 로그인: ${loginEmail}. ${rpcMessage}`
          );
        }

        const slotResult = await client
          .from('makeup_slots')
          .update({ status: decision === 'approved' ? 'booked' : 'open' })
          .eq('id', request.slot_id)
          .select('id');

        if (slotResult.error) {
          await client
            .from('makeup_requests')
            .update({ status: 'pending', reviewed_at: null })
            .eq('id', id);
          throw slotResult.error;
        }
        if (!slotResult.data?.length) {
          await client
            .from('makeup_requests')
            .update({ status: 'pending', reviewed_at: null })
            .eq('id', id);
          const rpcMessage = rpcResult.error?.message || 'RPC 처리 실패';
          const { data: authData } = await client.auth.getUser();
          const loginEmail = authData?.user?.email || '확인되지 않음';
          throw new Error(
            `보강 시간 변경 권한이 없습니다. 현재 로그인: ${loginEmail}. ${rpcMessage}`
          );
        }
      }

      await loadData();
    } catch (error) {
      const message = `보강 신청을 처리하지 못했습니다. ${error.message || error}`;
      showMessage(message, 'error');
      alert(message);

      if (button) {
        button.disabled = false;
        button.textContent = originalText;
      }
    }
  };

  loadData();
});
