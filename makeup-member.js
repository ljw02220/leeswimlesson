document.addEventListener('DOMContentLoaded', async () => {
  const client = window.swimDb?.client;
  const modal = document.getElementById('makeupModal');
  const slotList = document.getElementById('makeupSlotList');
  const statusBox = document.getElementById('makeupRequestStatus');
  let member = null;

  function formatSlot(slot) {
    const date = new Date(`${slot.slot_date}T00:00:00`);
    const dateText = new Intl.DateTimeFormat('ko-KR', {
      month: 'long', day: 'numeric', weekday: 'short',
    }).format(date);
    return `${dateText} ${String(slot.slot_time).slice(0, 5)}`;
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function loadMakeupData() {
    const today = new Date().toISOString().slice(0, 10);
    const [slotResult, requestResult] = await Promise.all([
      client
        .from('makeup_slots')
        .select('*')
        .eq('status', 'open')
        .gte('slot_date', today)
        .order('slot_date')
        .order('slot_time'),
      client
        .from('makeup_requests')
        .select('*, makeup_slots(*)')
        .eq('member_id', member.id)
        .order('requested_at', { ascending: false }),
    ]);
    const error = slotResult.error || requestResult.error;

    if (error) {
      const text = error.code === 'PGRST205'
        ? '보강 신청 기능을 준비 중입니다.'
        : '보강 신청 정보를 불러오지 못했습니다.';
      statusBox.innerHTML = `<p class="member-empty">${text}</p>`;
      slotList.innerHTML = `<p class="member-empty">${text}</p>`;
      return;
    }

    const requests = requestResult.data || [];
    const latest = requests[0];
    const statusText = { pending: '승인 대기', approved: '승인 완료', rejected: '반려' };

    statusBox.innerHTML = latest
      ? `<div class="makeup-status-row"><strong>${formatSlot(latest.makeup_slots)}</strong><span class="${latest.status}">${statusText[latest.status]}</span></div>`
      : '<p class="member-empty">신청한 보강 수업이 없습니다.</p>';

    const activeSlotIds = new Set(
      requests.filter((item) => ['pending', 'approved'].includes(item.status))
        .map((item) => item.slot_id)
    );
    const availableSlots = (slotResult.data || []).filter(
      (slot) => !activeSlotIds.has(slot.id)
    );

    slotList.innerHTML = availableSlots.length
      ? availableSlots.map((slot) => `
          <article class="makeup-slot-item">
            <strong>${formatSlot(slot)}</strong>
            <button type="button" data-slot-id="${slot.id}">신청</button>
          </article>
        `).join('')
      : '<p class="member-empty">현재 신청 가능한 시간이 없습니다.</p>';
  }

  document.getElementById('makeupModalOpen')?.addEventListener('click', async () => {
    await loadMakeupData();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('makeupModalClose')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  slotList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-slot-id]');
    if (!button) return;
    button.disabled = true;
    const { error } = await client.from('makeup_requests').insert({
      slot_id: button.dataset.slotId,
      member_id: member.id,
    });
    if (error) {
      alert(error.code === '23505' ? '다른 회원이 먼저 신청한 시간입니다.' : error.message);
      button.disabled = false;
      return;
    }
    closeModal();
    await loadMakeupData();
  });

  try {
    ({ member } = await window.memberPortal.loadCurrentMember());
    await loadMakeupData();
  } catch (error) {
    statusBox.innerHTML = '<p class="member-empty">보강 신청 정보를 불러오지 못했습니다.</p>';
  }
});
