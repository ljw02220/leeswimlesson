document.addEventListener('DOMContentLoaded', () => {
  const client = window.swimDb?.client;
  const modal = document.getElementById('makeup-manage-modal');
  const list = document.getElementById('makeup-request-list');
  const message = document.getElementById('makeup-admin-message');
  let slots = [];
  let requests = [];
  let members = [];
  let selectedDate = getTodayKey();

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

  function addDays(dateKey, amount) {
    const date = new Date(`${dateKey}T00:00:00`);
    date.setDate(date.getDate() + amount);
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

    const requestRows = activeRequests.map((request) => {
      const slot = slots.find((item) => item.id === request.slot_id);
      if (!slot) return '';
      const pending = request.status === 'pending';

      return `
        <article class="makeup-admin-item">
          <div>
            <strong>${getMemberName(request.member_id)}</strong>
            <span>${formatDate(slot.slot_date)} ${formatTime(slot.slot_time)} · ${pending ? '승인 대기' : '승인 완료'}</span>
          </div>
          <div class="makeup-admin-actions">
            ${pending ? `
              <button type="button" onclick="handleMakeupAdminAction('approve', '${request.id}', this)">승인</button>
              <button type="button" class="danger" onclick="handleMakeupAdminAction('reject', '${request.id}', this)">반려</button>
            ` : `
              <button type="button" class="danger" onclick="handleMakeupAdminAction('cancel', '${request.id}', this)">취소</button>
            `}
          </div>
        </article>`;
    }).join('');

    const dateKeys = Array.from({ length: 15 }, (_, index) => addDays(getTodayKey(), index));
    const calendar = dateKeys.map((dateKey) => {
      const daySlots = slots.filter((slot) => slot.slot_date === dateKey);
      const openCount = daySlots.filter((slot) => {
        const hasRequest = activeRequests.some((request) => request.slot_id === slot.id);
        return slot.status === 'open' && !hasRequest;
      }).length;
      const closedCount = daySlots.length - openCount;
      const date = new Date(`${dateKey}T00:00:00`);

      return `
        <button type="button" class="makeup-date-cell ${dateKey === selectedDate ? 'selected' : ''}"
          data-makeup-date="${dateKey}">
          <span>${date.getMonth() + 1}/${date.getDate()}</span>
          <strong>${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}</strong>
          <small>${daySlots.length ? `가능 ${openCount}${closedCount ? ` · 마감 ${closedCount}` : ''}` : '시간 없음'}</small>
        </button>`;
    }).join('');

    const selectedSlots = slots.filter((slot) => slot.slot_date === selectedDate);
    const allClosed = selectedSlots.length > 0 && selectedSlots.every((slot) => {
      const hasRequest = activeRequests.some((request) => request.slot_id === slot.id);
      return slot.status !== 'open' || hasRequest;
    });
    const slotRows = selectedSlots.map((slot) => {
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
        <div class="makeup-slot-toggle-row">
          <div><strong>${formatTime(slot.slot_time)}</strong><span>${request ? `${getMemberName(request.member_id)} · ${statusText}` : statusText}</span></div>
          ${request ? `<em>${statusText}</em>` : `
            <button type="button" class="${slot.status === 'open' ? 'danger' : ''}"
              onclick="handleMakeupAdminAction('${slot.status === 'open' ? 'close' : 'reopen'}', '${slot.id}', this)">
              ${slot.status === 'open' ? '마감' : '다시 열기'}
            </button>`}
        </div>`;
    }).join('');

    list.innerHTML = `
      <section class="makeup-request-section">
        <h4>신청 대기·확정</h4>
        ${requestRows || '<p class="today-empty">처리할 보강 신청이 없습니다.</p>'}
      </section>
      <section class="makeup-calendar-section">
        <div class="makeup-section-heading"><h4>마감 관리</h4><span>오늘부터 2주</span></div>
        <div class="makeup-two-week-calendar">${calendar}</div>
        <div class="makeup-selected-date-heading">
          <strong>${formatDate(selectedDate)}</strong>
          ${selectedSlots.length ? `<button type="button" onclick="handleMakeupDayAction('${selectedDate}', '${allClosed ? 'open' : 'close'}', this)">${allClosed ? '전체 다시 열기' : '이 날짜 전체 마감'}</button>` : ''}
        </div>
        <div class="makeup-selected-slots">${slotRows || '<p class="today-empty">보강 시간이 없는 날짜입니다.</p>'}</div>
      </section>`;

    list.querySelectorAll('[data-makeup-date]').forEach((button) => {
      button.addEventListener('click', () => {
        selectedDate = button.dataset.makeupDate;
        render();
      });
    });

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
    selectedDate = getTodayKey();
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

  window.handleMakeupDayAction = async (dateKey, action, button) => {
    const targetSlots = slots.filter((slot) => {
      const hasRequest = requests.some(
        (request) => request.slot_id === slot.id && ['pending', 'approved'].includes(request.status)
      );
      return slot.slot_date === dateKey && !hasRequest;
    });
    if (!targetSlots.length) return;

    const opening = action === 'open';
    if (!confirm(`${formatDate(dateKey)}의 보강 시간을 ${opening ? '모두 다시 열까요?' : '모두 마감할까요?'}`)) return;
    button.disabled = true;
    const { error } = await client
      .from('makeup_slots')
      .update({ status: opening ? 'open' : 'closed' })
      .in('id', targetSlots.map((slot) => slot.id));

    if (error) {
      alert(`날짜별 보강 시간을 변경하지 못했습니다. ${error.message}`);
      button.disabled = false;
      return;
    }
    await loadData();
  };

  window.handleMakeupAdminAction = async (action, id, button) => {
    const originalText = button?.textContent || '';

    if (button) {
      button.disabled = true;
      button.textContent = '처리 중';
    }

    try {
      if (action === 'close' || action === 'reopen') {
        const { error } = await client
          .from('makeup_slots')
          .update({ status: action === 'close' ? 'closed' : 'open' })
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
