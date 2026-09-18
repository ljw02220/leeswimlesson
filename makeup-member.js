document.addEventListener('DOMContentLoaded', async () => {
  const client = window.swimDb?.client;
  const modal = document.getElementById('makeupModal');
  const slotList = document.getElementById('makeupSlotList');
  const statusBox = document.getElementById('makeupRequestStatus');
  const weekdays = [
    { value: 2, label: '화' }, { value: 3, label: '수' },
    { value: 4, label: '목' }, { value: 5, label: '금' },
    { value: 6, label: '토' }, { value: 0, label: '일' },
  ];
  const timesByWeekday = {
    0: ['12:00', '13:00'],
    2: ['14:00', '15:00'],
    3: ['15:00'],
    4: ['14:00', '15:00'],
    5: ['07:00', '15:00'],
    6: ['11:00', '12:00', '13:00'],
  };
  let member = null;
  let availableSlots = [];
  let selectedWeekday = null;
  let selectedTime = '';
  let selectedSlotId = '';
  let calendarDate = new Date();

  function toDateKey(date) {
    return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0')].join('-');
  }

  function formatSlot(slot) {
    const dateText = new Intl.DateTimeFormat('ko-KR', {
      month: 'long', day: 'numeric', weekday: 'short',
    }).format(new Date(`${slot.slot_date}T00:00:00`));
    return `${dateText} ${String(slot.slot_time).slice(0, 5)}`;
  }

  function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const availableByDate = new Map(availableSlots.filter((slot) => {
      const date = new Date(`${slot.slot_date}T00:00:00`);
      return date.getDay() === selectedWeekday &&
        String(slot.slot_time).slice(0, 5) === selectedTime;
    }).map((slot) => [slot.slot_date, slot]));
    const cells = Array.from({ length: firstDay }, () =>
      '<span class="makeup-calendar-day empty"></span>');

    for (let day = 1; day <= lastDate; day += 1) {
      const slot = availableByDate.get(toDateKey(new Date(year, month, day)));
      cells.push(`<button type="button" class="makeup-calendar-day ${slot ? 'available' : ''} ${slot?.id === selectedSlotId ? 'selected' : ''}"
        ${slot ? `data-slot-id="${slot.id}"` : 'disabled'}>${day}</button>`);
    }

    return `<section class="makeup-picker-section">
      <span class="makeup-picker-label">날짜</span>
      <div class="makeup-calendar-header">
        <button type="button" data-calendar-nav="-1" aria-label="이전 달">‹</button>
        <strong>${year}년 ${month + 1}월</strong>
        <button type="button" data-calendar-nav="1" aria-label="다음 달">›</button>
      </div>
      <div class="makeup-calendar-weekdays">${['일','월','화','수','목','금','토'].map((day) => `<span>${day}</span>`).join('')}</div>
      <div class="makeup-calendar-grid">${cells.join('')}</div>
    </section>`;
  }

  function renderPicker() {
    const selectedSlot = availableSlots.find((slot) => slot.id === selectedSlotId);
    slotList.innerHTML = `
      <section class="makeup-picker-section">
        <span class="makeup-picker-label">요일과 시간</span>
        <div class="makeup-weekday-time-list">${weekdays.map((day) => `
          <div class="makeup-weekday-time-row">
            <strong>${day.label}</strong>
            <div>${(timesByWeekday[day.value] || []).map((time) =>
              `<button type="button" data-makeup-time data-weekday="${day.value}" data-time="${time}"
                class="${selectedWeekday === day.value && selectedTime === time ? 'selected' : ''}">${time}</button>`
            ).join('')}</div>
          </div>`).join('')}</div>
      </section>
      ${selectedTime ? renderCalendar() : ''}
      ${selectedSlot ? `<div class="makeup-selection-confirm"><span>선택한 보강</span>
        <strong>${formatSlot(selectedSlot)}</strong>
        <button type="button" data-submit-slot="${selectedSlot.id}">보강 신청</button></div>` : ''}`;
  }

  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  async function loadMakeupData() {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 1);
    const [slotResult, requestResult] = await Promise.all([
      client.from('makeup_slots').select('*').eq('status', 'open')
        .gte('slot_date', toDateKey(today)).lte('slot_date', toDateKey(endDate))
        .order('slot_date').order('slot_time'),
      client.from('makeup_requests').select('*, makeup_slots(*)')
        .eq('member_id', member.id).order('requested_at', { ascending: false }),
    ]);
    const error = slotResult.error || requestResult.error;

    if (error) {
      const text = error.code === 'PGRST205' ? '보강 신청 기능을 준비 중입니다.'
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

    const activeSlotIds = new Set(requests.filter((item) =>
      ['pending', 'approved'].includes(item.status)).map((item) => item.slot_id));
    availableSlots = (slotResult.data || []).filter((slot) =>
      !activeSlotIds.has(slot.id) && !window.memberPortal.getHolidayName(slot.slot_date));

    renderPicker();
  }

  document.getElementById('makeupModalOpen')?.addEventListener('click', async () => {
    selectedWeekday = null; selectedTime = ''; selectedSlotId = '';
    calendarDate = new Date();
    await loadMakeupData();
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('makeupModalClose')?.addEventListener('click', closeModal);
  modal?.addEventListener('click', (event) => { if (event.target === modal) closeModal(); });
  slotList?.addEventListener('click', async (event) => {
    const time = event.target.closest('[data-makeup-time]');
    const date = event.target.closest('[data-slot-id]');
    const nav = event.target.closest('[data-calendar-nav]');
    const submit = event.target.closest('[data-submit-slot]');

    if (time) {
      selectedWeekday = Number(time.dataset.weekday);
      selectedTime = time.dataset.time;
      selectedSlotId = '';
      const firstSlot = availableSlots.find((slot) =>
        new Date(`${slot.slot_date}T00:00:00`).getDay() === selectedWeekday &&
        String(slot.slot_time).slice(0, 5) === selectedTime);
      calendarDate = firstSlot ? new Date(`${firstSlot.slot_date}T00:00:00`) : new Date();
      renderPicker();
    } else if (nav) {
      calendarDate.setMonth(calendarDate.getMonth() + Number(nav.dataset.calendarNav));
      renderPicker();
    } else if (date) {
      selectedSlotId = date.dataset.slotId; renderPicker();
    } else if (submit) {
      submit.disabled = true;
      const { error } = await client.from('makeup_requests').insert({
        slot_id: submit.dataset.submitSlot, member_id: member.id,
      });
      if (error) {
        alert(error.code === '23505' ? '다른 회원이 먼저 신청한 시간입니다.' : error.message);
        submit.disabled = false; return;
      }
      closeModal(); await loadMakeupData();
    }
  });

  try {
    ({ member } = await window.memberPortal.loadCurrentMember());
    await loadMakeupData();
  } catch (error) {
    statusBox.innerHTML = '<p class="member-empty">보강 신청 정보를 불러오지 못했습니다.</p>';
  }
});
