// ======================================================
// 개인레슨 회원관리
// ======================================================

const STORAGE_KEY = 'personalLessonMembers';
const REPORT_STORAGE_KEY = 'personalLessonReports';

let members = [];
let currentFilter = '전체';
let editingMemberId = null;
let memberLoadError = '';

// ======================================================
// 데이터 불러오기 / 저장
// ======================================================

function loadLocalMembers() {
  const savedData = localStorage.getItem(STORAGE_KEY);

  if (!savedData) {
    return [];
  }

  try {
    const parsedData = JSON.parse(savedData);

    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    console.error('회원 데이터를 불러오지 못했습니다.', error);

    return [];
  }
}

function saveLocalMembers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
}

function loadLocalReports() {
  const savedData = localStorage.getItem(REPORT_STORAGE_KEY);

  if (!savedData) {
    return [];
  }

  try {
    const parsedData = JSON.parse(savedData);

    return Array.isArray(parsedData) ? parsedData : [];
  } catch (error) {
    console.error('개인레슨 보고 내역을 불러오지 못했습니다.', error);

    return [];
  }
}

function saveLocalReports(reports) {
  localStorage.setItem(REPORT_STORAGE_KEY, JSON.stringify(reports));
}

function showMemberLoadError(message) {
  memberLoadError = message;

  const tbody = document.getElementById('memberTableBody');

  if (!tbody) {
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td
        colspan="7"
        class="empty-member-row"
      >
        ${escapeHTML(message)}
      </td>
    </tr>
  `;
}

function hasSupabaseConnection() {
  return Boolean(window.swimDb?.isConfigured() && window.swimDb?.client);
}

function normalizeDateValue(value) {
  return value || null;
}

function mapMemberFromDatabase(row) {
  return {
    id: row.id,
    name: row.name || '',
    phone: row.phone || '',
    lessonFormat: row.lesson_format || '1:1',
    days: row.days || [],
    time: row.lesson_time || '',
    totalLessons: Number(row.total_lessons || 0),
    usedLessons: Number(row.used_lessons || 0),
    paymentAmount: Number(row.payment_amount || 0),
    paymentDate: row.payment_date || '',
    paymentStatus: row.payment_status || '확인필요',
    personalReportedAt: row.personal_reported_at || '',
    personalReportedPaymentDate: row.personal_reported_payment_date || '',
    lastLessonDate: row.last_lesson_date || '',
    status: row.status || '수강중',
    memo: row.memo || '',
  };
}

function mapMemberToDatabase(member) {
  return {
    name: member.name,
    phone: member.phone || null,
    lesson_format: member.lessonFormat || '1:1',
    days: member.days || [],
    lesson_time: normalizeDateValue(member.time),
    total_lessons: Number(member.totalLessons || 0),
    used_lessons: Number(member.usedLessons || 0),
    payment_amount: Number(member.paymentAmount || 0),
    payment_date: normalizeDateValue(member.paymentDate),
    payment_status: member.paymentStatus || '확인필요',
    personal_reported_at: normalizeDateValue(member.personalReportedAt),
    personal_reported_payment_date: member.personalReportedAt
      ? normalizeDateValue(member.paymentDate)
      : null,
    last_lesson_date: normalizeDateValue(member.lastLessonDate),
    status: member.status || '수강중',
    memo: member.memo || null,
  };
}

function mapMemberToReport(member, reportedAt) {
  return {
    member_id: member.id || null,
    member_name: member.name,
    phone: member.phone || null,
    lesson_format: member.lessonFormat || '1:1',
    days: member.days || [],
    lesson_time: normalizeDateValue(member.time),
    payment_amount: Number(member.paymentAmount || 0),
    payment_date: normalizeDateValue(member.paymentDate),
    payment_status: member.paymentStatus || '완납',
    reported_at: normalizeDateValue(reportedAt),
    memo: member.memo || null,
  };
}

async function loadMembers() {
  if (!hasSupabaseConnection()) {
    members = loadLocalMembers();

    return;
  }

  const { data, error } = await window.swimDb.client
    .from('members')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Supabase 회원 데이터를 불러오지 못했습니다.', error);

    members = loadLocalMembers();

    showMemberLoadError('Supabase 회원 데이터를 불러오지 못했습니다.');

    return;
  }

  memberLoadError = '';

  members = data.map(mapMemberFromDatabase);

  saveLocalMembers();
}

async function createMember(memberData) {
  if (!hasSupabaseConnection()) {
    const localMember = {
      id: Date.now(),
      ...memberData,
    };

    members.push(localMember);
    saveLocalMembers();

    return localMember;
  }

  const { data, error } = await window.swimDb.client
    .from('members')
    .insert(mapMemberToDatabase(memberData))
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapMemberFromDatabase(data);
}

async function saveMember(memberId, memberData) {
  if (!hasSupabaseConnection()) {
    const index = members.findIndex(
      (member) => String(member.id) === String(memberId)
    );

    if (index === -1) {
      throw new Error('수정할 회원을 찾을 수 없습니다.');
    }

    members[index] = {
      ...members[index],
      ...memberData,
    };

    saveLocalMembers();

    return members[index];
  }

  const { data, error } = await window.swimDb.client
    .from('members')
    .update(mapMemberToDatabase(memberData))
    .eq('id', memberId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return mapMemberFromDatabase(data);
}

async function removeMember(memberId) {
  if (!hasSupabaseConnection()) {
    members = members.filter(
      (member) => String(member.id) !== String(memberId)
    );

    saveLocalMembers();

    return;
  }

  const { error } = await window.swimDb.client
    .from('members')
    .delete()
    .eq('id', memberId);

  if (error) {
    throw error;
  }
}

async function createPersonalLessonReport(member, reportedAt) {
  const report = mapMemberToReport(member, reportedAt);

  if (
    !report.member_name ||
    !report.payment_amount ||
    !report.payment_date ||
    !report.reported_at
  ) {
    return;
  }

  if (!hasSupabaseConnection()) {
    const reports = loadLocalReports();
    const exists = reports.some(
      (item) =>
        String(item.member_id) === String(report.member_id) &&
        item.payment_date === report.payment_date &&
        item.reported_at === report.reported_at
    );

    if (!exists) {
      reports.push({
        id: Date.now(),
        ...report,
      });

      saveLocalReports(reports);
    }

    return;
  }

  const existing = await window.swimDb.client
    .from('personal_lesson_reports')
    .select('id')
    .eq('member_id', report.member_id)
    .eq('payment_date', report.payment_date)
    .eq('reported_at', report.reported_at);

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data && existing.data.length > 0) {
    return;
  }

  const { error } = await window.swimDb.client
    .from('personal_lesson_reports')
    .insert(report);

  if (error) {
    throw error;
  }
}

async function deletePersonalLessonReport(member) {
  if (!member.personalReportedAt || !member.personalReportedPaymentDate) {
    return;
  }

  if (!hasSupabaseConnection()) {
    const reports = loadLocalReports().filter(
      (item) =>
        !(
          String(item.member_id) === String(member.id) &&
          item.payment_date === member.personalReportedPaymentDate &&
          item.reported_at === member.personalReportedAt
        )
    );

    saveLocalReports(reports);

    return;
  }

  const { error } = await window.swimDb.client
    .from('personal_lesson_reports')
    .delete()
    .eq('member_id', member.id)
    .eq('payment_date', member.personalReportedPaymentDate)
    .eq('reported_at', member.personalReportedAt);

  if (error) {
    throw error;
  }
}

// ======================================================
// 공통 함수
// ======================================================

function getRemainingLessons(member) {
  const total = Number(member.totalLessons || 0);
  const used = Number(member.usedLessons || 0);

  return Math.max(total - used, 0);
}

function formatMoney(amount) {
  return Number(amount || 0).toLocaleString('ko-KR');
}

function parseMoney(value) {
  const numberText = String(value || '').replace(/[^\d]/g, '');

  return Number(numberText) || 0;
}

function formatMoneyInputValue(value) {
  const amount = parseMoney(value);

  return amount > 0 ? formatMoney(amount) : '';
}

function formatTime(timeValue) {
  if (!timeValue) {
    return '';
  }

  return String(timeValue).slice(0, 5);
}

function getDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function formatShortDate(dateValue) {
  if (!dateValue) {
    return '';
  }

  const date = new Date(`${dateValue}T00:00:00`);

  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function escapeHTML(value) {
  const element = document.createElement('div');

  element.textContent = value ?? '';

  return element.innerHTML;
}

function getSchedule(member) {
  const days = Array.isArray(member.days) ? member.days.join('·') : '';

  const time = formatTime(member.time);

  if (!days && !time) {
    return '-';
  }

  return `${days} ${time}`.trim();
}

function getPaymentClass(status) {
  switch (status) {
    case '완납':
      return 'paid';

    case '미납':
      return 'overdue';

    case '확인필요':
      return 'pending';

    default:
      return 'pending';
  }
}

function isCurrentPaymentReported(member) {
  return Boolean(
    member.personalReportedAt &&
      member.paymentDate &&
      member.personalReportedPaymentDate === member.paymentDate
  );
}

function getReportButtonLabel(member) {
  if (!isCurrentPaymentReported(member)) {
    return '미보고';
  }

  return '보고 완료';
}

// ======================================================
// 회원 필터
// ======================================================

function getFilteredMembers() {
  switch (currentFilter) {
    case '수강중':
      return members.filter((member) => member.status === '수강중');

    case '재등록 예정':
      return members.filter(
        (member) =>
          member.status === '수강중' && getRemainingLessons(member) <= 2
      );

    case '미납':
      return members.filter(
        (member) =>
          member.paymentStatus === '미납' || member.paymentStatus === '확인필요'
      );

    case '전체':
    default:
      return members;
  }
}

// ======================================================
// 회원 목록 출력
// ======================================================

function renderMembers() {
  const tbody = document.getElementById('memberTableBody');

  if (!tbody) {
    console.error('memberTableBody를 찾을 수 없습니다.');

    return;
  }

  if (memberLoadError) {
    showMemberLoadError(memberLoadError);

    return;
  }

  const filteredMembers = getFilteredMembers();

  tbody.innerHTML = '';

  if (filteredMembers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td
          colspan="7"
          class="empty-member-row"
        >
          등록된 회원이 없습니다.
        </td>
      </tr>
    `;

    return;
  }

  filteredMembers.forEach((member) => {
    const remaining = getRemainingLessons(member);

    const row = document.createElement('tr');

    row.classList.add('member-row');

    row.dataset.memberId = member.id;

    row.innerHTML = `
      <td class="member-name-cell">
        <strong>
          ${escapeHTML(member.name)}
        </strong>

        <span>
          ${escapeHTML(member.phone || '-')}
        </span>
      </td>

      <td class="schedule-cell">
        ${escapeHTML(getSchedule(member))}
      </td>

      <td class="center-cell">
        ${Number(member.totalLessons || 0)}회
      </td>

      <td class="center-cell">
          ${remaining}회
      </td>

      <td class="center-cell">
        <span class="format-badge">
          ${escapeHTML(member.lessonFormat || '1:1')}
        </span>
      </td>

      <td class="center-cell">
        <div class="payment-cell">
        <span
          class="
            status
            ${getPaymentClass(member.paymentStatus)}
          "
        >
          ${escapeHTML(member.paymentStatus || '확인필요')}
        </span>

          <small>
            ${formatMoney(member.paymentAmount)}원
          </small>
        </div>
      </td>

      <td class="center-cell">
        <button
          type="button"
          class="
            report-button
            ${isCurrentPaymentReported(member) ? 'reported' : ''}
          "
          data-report-member-id="${member.id}"
        >
          ${
            getReportButtonLabel(member)
          }
        </button>
      </td>
    `;

    row.addEventListener('click', () => {
      openMemberDetail(member.id);
    });

    tbody.appendChild(row);
  });
}

// ======================================================
// 개인레슨 보고 완료
// ======================================================

async function markMemberReported(memberId) {
  const member = members.find(
    (item) => String(item.id) === String(memberId)
  );

  if (!member) {
    return;
  }

  if (isCurrentPaymentReported(member)) {
    await cancelMemberReport(member);

    return;
  }

  if (Number(member.paymentAmount || 0) <= 0) {
    alert('결제 금액이 있는 회원만 보고 완료 처리할 수 있습니다.');

    return;
  }

  if (!member.paymentDate) {
    alert('결제일을 먼저 입력해주세요.');

    return;
  }

  if (member.paymentStatus === '미납') {
    alert('미납 회원은 보고 완료 처리할 수 없습니다.');

    return;
  }

  const reportedAt = getDateKey(new Date());
  const reportedPaymentDate = member.paymentDate;

  try {
    await createPersonalLessonReport(member, reportedAt);

    if (hasSupabaseConnection()) {
      const { data, error } = await window.swimDb.client
        .from('members')
        .update({
          personal_reported_at: reportedAt,
          personal_reported_payment_date: reportedPaymentDate,
        })
        .eq('id', member.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      const index = members.findIndex(
        (item) => String(item.id) === String(member.id)
      );

      if (index !== -1) {
        members[index] = mapMemberFromDatabase(data);
      }
    } else {
      member.personalReportedAt = reportedAt;
      member.personalReportedPaymentDate = reportedPaymentDate;

      saveLocalMembers();
    }

    renderAll();
  } catch (error) {
    console.error('보고 완료 처리에 실패했습니다.', error);

    alert(
      '보고 완료 처리 중 오류가 발생했습니다. Supabase 컬럼을 먼저 추가했는지 확인해주세요.'
    );
  }
}

async function cancelMemberReport(member) {
  const confirmed = confirm(
    `${member.name} 회원의 개인레슨 보고 완료를 취소할까요?`
  );

  if (!confirmed) {
    return;
  }

  try {
    await deletePersonalLessonReport(member);

    if (hasSupabaseConnection()) {
      const { data, error } = await window.swimDb.client
        .from('members')
        .update({
          personal_reported_at: null,
          personal_reported_payment_date: null,
        })
        .eq('id', member.id)
        .select('*')
        .single();

      if (error) {
        throw error;
      }

      const index = members.findIndex(
        (item) => String(item.id) === String(member.id)
      );

      if (index !== -1) {
        members[index] = mapMemberFromDatabase(data);
      }
    } else {
      member.personalReportedAt = '';
      member.personalReportedPaymentDate = '';

      saveLocalMembers();
    }

    renderAll();
  } catch (error) {
    console.error('보고 완료 취소에 실패했습니다.', error);

    alert('보고 완료 취소 중 오류가 발생했습니다.');
  }
}

function setupReportButtons() {
  const tbody = document.getElementById('memberTableBody');

  if (!tbody) {
    return;
  }

  tbody.addEventListener('click', (event) => {
    const reportButton = event.target.closest('[data-report-member-id]');

    if (!reportButton) {
      return;
    }

    event.stopPropagation();

    markMemberReported(reportButton.dataset.reportMemberId);
  });
}

// ======================================================
// 상단 통계
// ======================================================

function renderMetrics() {
  const cards = document.querySelectorAll('.metric-card');

  if (cards.length < 4) {
    return;
  }

  const totalMembers = members.length;

  const activeMembers = members.filter(
    (member) => member.status === '수강중'
  ).length;

  const renewalMembers = members.filter(
    (member) => member.status === '수강중' && getRemainingLessons(member) <= 2
  ).length;

  const unpaidMembers = members.filter(
    (member) =>
      member.paymentStatus === '미납' || member.paymentStatus === '확인필요'
  );

  const unpaidAmount = members
    .filter((member) => member.paymentStatus === '미납')
    .reduce((sum, member) => sum + Number(member.paymentAmount || 0), 0);

  // 전체 회원
  cards[0].querySelector('span').textContent = '전체 회원';

  cards[0].querySelector('strong').textContent = `${totalMembers}명`;

  cards[0].querySelector('small').textContent = '등록된 개인레슨 회원';

  // 수강중
  cards[1].querySelector('span').textContent = '수강중';

  cards[1].querySelector('strong').textContent = `${activeMembers}명`;

  cards[1].querySelector('small').textContent = '현재 수업 진행중';

  // 재등록 예정
  cards[2].querySelector('span').textContent = '재등록 예정';

  cards[2].querySelector('strong').textContent = `${renewalMembers}명`;

  cards[2].querySelector('small').textContent = '잔여 수업 2회 이하';

  // 미납
  cards[3].querySelector('span').textContent = '미납 회원';

  cards[3].querySelector('strong').textContent = `${unpaidMembers.length}명`;

  cards[3].querySelector('small').textContent =
    unpaidAmount > 0 ? `총 ${formatMoney(unpaidAmount)}원` : '미납 내역 없음';
}

// ======================================================
// 필터 버튼
// ======================================================

function setupFilters() {
  const buttons = document.querySelectorAll('.filter-chip');

  const filterNames = ['전체', '수강중', '재등록 예정', '미납'];

  buttons.forEach((button, index) => {
    if (!filterNames[index]) {
      button.style.display = 'none';

      return;
    }

    button.textContent = filterNames[index];

    button.dataset.filter = filterNames[index];

    button.addEventListener('click', () => {
      currentFilter = button.dataset.filter;

      buttons.forEach((item) => {
        item.classList.remove('active');
      });

      button.classList.add('active');

      renderMembers();
    });
  });
}

// ======================================================
// 회원 추가
// ======================================================

async function addMember(memberData) {
  const newMember = {
    name: memberData.name,

    phone: memberData.phone || '',

    lessonFormat: memberData.lessonFormat || '1:1',

    days: memberData.days || [],

    time: memberData.time || '',

    totalLessons: Number(memberData.totalLessons || 0),

    usedLessons: Number(memberData.usedLessons || 0),

    paymentAmount: Number(memberData.paymentAmount || 0),

    paymentDate: memberData.paymentDate || '',

    paymentStatus: memberData.paymentStatus || '확인필요',

    personalReportedAt: memberData.personalReportedAt || '',

    personalReportedPaymentDate: memberData.personalReportedAt
      ? memberData.paymentDate || ''
      : '',

    lastLessonDate: memberData.lastLessonDate || '',

    status: memberData.status || '수강중',

    memo: memberData.memo || '',
  };

  try {
    const savedMember = await createMember(newMember);

    if (savedMember.personalReportedAt) {
      await createPersonalLessonReport(
        savedMember,
        savedMember.personalReportedAt
      );
    }

    members.push(savedMember);

    renderAll();
  } catch (error) {
    console.error('회원을 저장하지 못했습니다.', error);

    alert('회원 저장 중 오류가 발생했습니다.');
  }
}

// ======================================================
// 회원 수정
// ======================================================

async function updateMember(memberId, updatedData) {
  const index = members.findIndex(
    (member) => String(member.id) === String(memberId)
  );

  if (index === -1) {
    console.error('수정할 회원을 찾을 수 없습니다.');

    return;
  }

  try {
    const previousMember = members[index];
    const savedMember = await saveMember(memberId, updatedData);
    const shouldDeletePreviousReport =
      isCurrentPaymentReported(previousMember) &&
      (!savedMember.personalReportedAt ||
        previousMember.personalReportedAt !== savedMember.personalReportedAt ||
        previousMember.paymentDate !== savedMember.paymentDate);

    if (shouldDeletePreviousReport) {
      await deletePersonalLessonReport(previousMember);
    }

    if (savedMember.personalReportedAt) {
      await createPersonalLessonReport(
        savedMember,
        savedMember.personalReportedAt
      );
    }

    members[index] = savedMember;

    renderAll();
  } catch (error) {
    console.error('회원 정보를 수정하지 못했습니다.', error);

    alert('회원 수정 중 오류가 발생했습니다.');
  }
}

// ======================================================
// 회원 삭제
// ======================================================

async function deleteMember(memberId) {
  const member = members.find(
    (member) => String(member.id) === String(memberId)
  );

  if (!member) {
    console.error('삭제할 회원을 찾을 수 없습니다.');

    return;
  }

  const confirmed = confirm(`${member.name} 회원을 삭제하시겠습니까?`);

  if (!confirmed) {
    return;
  }

  try {
    await removeMember(memberId);

    members = members.filter(
      (member) => String(member.id) !== String(memberId)
    );

    closeMemberModal();

    renderAll();
  } catch (error) {
    console.error('회원을 삭제하지 못했습니다.', error);

    alert('회원 삭제 중 오류가 발생했습니다.');
  }
}

// ======================================================
// 모달 이벤트
// ======================================================

function setupModalEvents() {
  const modal = document.getElementById('memberModal');

  const form = document.getElementById('memberForm');

  const closeButton = document.getElementById('closeMemberModal');

  const cancelButton = document.getElementById('cancelMemberButton');

  const deleteButton = document.getElementById('deleteMemberButton');

  const totalInput = document.getElementById('totalLessons');

  const usedInput = document.getElementById('usedLessons');

  const phoneInput = document.getElementById('memberPhone');

  const paymentAmountInput = document.getElementById('paymentAmount');

  if (!modal) {
    console.error('memberModal을 찾을 수 없습니다.');

    return;
  }

  if (!form) {
    console.error('memberForm을 찾을 수 없습니다.');

    return;
  }

  if (closeButton) {
    closeButton.addEventListener('click', closeMemberModal);
  }

  if (cancelButton) {
    cancelButton.addEventListener('click', closeMemberModal);
  }

  if (deleteButton) {
    deleteButton.addEventListener('click', () => {
      if (editingMemberId !== null) {
        deleteMember(editingMemberId);
      }
    });
  }

  modal.addEventListener('click', (event) => {
    if (event.target === modal) {
      closeMemberModal();
    }
  });

  form.addEventListener('submit', handleMemberSubmit);

  if (totalInput) {
    totalInput.addEventListener('input', updateRemainingPreview);
  }

  if (usedInput) {
    usedInput.addEventListener('input', updateRemainingPreview);
  }

  if (phoneInput) {
    phoneInput.addEventListener('input', formatPhoneInput);
  }

  if (paymentAmountInput) {
    paymentAmountInput.addEventListener('input', formatMoneyInput);
  }
}

// ======================================================
// 전화번호 자동 하이픈
// ======================================================

function formatPhoneInput(event) {
  let value = event.target.value.replace(/\D/g, '');

  if (value.length > 11) {
    value = value.slice(0, 11);
  }

  if (value.length <= 3) {
    event.target.value = value;
  } else if (value.length <= 7) {
    event.target.value = `${value.slice(0, 3)}-${value.slice(3)}`;
  } else {
    event.target.value = `${value.slice(0, 3)}-${value.slice(
      3,
      7
    )}-${value.slice(7)}`;
  }
}

// ======================================================
// 금액 자동 쉼표
// ======================================================

function formatMoneyInput(event) {
  event.target.value = formatMoneyInputValue(event.target.value);
}

// ======================================================
// 잔여 횟수 미리보기
// ======================================================

function updateRemainingPreview() {
  const total = Number(document.getElementById('totalLessons')?.value) || 0;

  const used = Number(document.getElementById('usedLessons')?.value) || 0;

  const remaining = Math.max(total - used, 0);

  const preview = document.getElementById('remainingLessonPreview');

  if (preview) {
    preview.textContent = `${remaining}회`;
  }
}

// ======================================================
// 회원 추가 모달 열기
// ======================================================

function openAddMemberModal() {
  const modal = document.getElementById('memberModal');

  const form = document.getElementById('memberForm');

  if (!modal || !form) {
    return;
  }

  editingMemberId = null;

  form.reset();

  document.getElementById('memberModalTitle').textContent = '회원 추가';

  document.getElementById('totalLessons').value = 8;

  document.getElementById('usedLessons').value = 0;

  document.getElementById('lessonFormat').value = '1:1';

  document.getElementById('paymentStatus').value = '완납';

  document.getElementById('memberStatus').value = '수강중';

  document.getElementById('deleteMemberButton').style.display = 'none';

  updateRemainingPreview();

  modal.classList.add('open');

  document.body.style.overflow = 'hidden';

  document.getElementById('memberName')?.focus();
}

// ======================================================
// 회원 상세 / 수정 모달
// ======================================================

function openMemberDetail(memberId) {
  const member = members.find(
    (member) => String(member.id) === String(memberId)
  );

  if (!member) {
    return;
  }

  editingMemberId = member.id;

  document.getElementById('memberModalTitle').textContent = '회원 정보';

  document.getElementById('memberName').value = member.name || '';

  document.getElementById('memberPhone').value = member.phone || '';

  document.querySelectorAll('input[name="lessonDay"]').forEach((checkbox) => {
    checkbox.checked =
      Array.isArray(member.days) && member.days.includes(checkbox.value);
  });

  document.getElementById('memberTime').value = member.time || '';

  document.getElementById('lessonFormat').value = member.lessonFormat || '1:1';

  document.getElementById('totalLessons').value = member.totalLessons || 0;

  document.getElementById('usedLessons').value = member.usedLessons || 0;

  document.getElementById('paymentAmount').value = formatMoneyInputValue(
    member.paymentAmount
  );

  document.getElementById('paymentDate').value = member.paymentDate || '';

  document.getElementById('paymentStatus').value =
    member.paymentStatus || '완납';

  document.getElementById('personalReportedAt').value =
    member.personalReportedAt || '';

  document.getElementById('memberStatus').value = member.status || '수강중';

  document.getElementById('lastLessonDate').value = member.lastLessonDate || '';

  document.getElementById('memberMemo').value = member.memo || '';

  document.getElementById('deleteMemberButton').style.display = 'inline-flex';

  updateRemainingPreview();

  document.getElementById('memberModal').classList.add('open');

  document.body.style.overflow = 'hidden';
}

// ======================================================
// 모달 닫기
// ======================================================

function closeMemberModal() {
  const modal = document.getElementById('memberModal');

  if (!modal) {
    return;
  }

  modal.classList.remove('open');

  document.body.style.overflow = '';

  editingMemberId = null;
}

// ======================================================
// 회원 폼 저장
// ======================================================

async function handleMemberSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('memberName').value.trim();

  if (!name) {
    alert('회원명을 입력해주세요.');

    return;
  }

  const selectedDays = Array.from(
    document.querySelectorAll('input[name="lessonDay"]:checked')
  ).map((checkbox) => checkbox.value);

  const totalLessons =
    Number(document.getElementById('totalLessons').value) || 0;

  const usedLessons = Number(document.getElementById('usedLessons').value) || 0;
  const paymentDate = document.getElementById('paymentDate').value;
  const paymentStatus = document.getElementById('paymentStatus').value;
  const personalReportedAt = document.getElementById('personalReportedAt').value;

  if (usedLessons > totalLessons) {
    alert('진행 횟수는 등록 횟수보다 많을 수 없습니다.');

    return;
  }

  if (personalReportedAt && !paymentDate) {
    alert('보고 완료일을 입력하려면 결제일도 입력해주세요.');

    return;
  }

  if (personalReportedAt && paymentStatus === '미납') {
    alert('미납 회원은 보고 완료 처리할 수 없습니다.');

    return;
  }

  const memberData = {
    name,

    phone: document.getElementById('memberPhone').value.trim(),

    lessonFormat: document.getElementById('lessonFormat').value,

    days: selectedDays,

    time: document.getElementById('memberTime').value,

    totalLessons,

    usedLessons,

    paymentAmount: parseMoney(document.getElementById('paymentAmount').value),

    paymentDate,

    paymentStatus,

    personalReportedAt,

    status: document.getElementById('memberStatus').value,

    lastLessonDate: document.getElementById('lastLessonDate').value,

    memo: document.getElementById('memberMemo').value.trim(),
  };

  if (editingMemberId === null) {
    await addMember(memberData);
  } else {
    await updateMember(editingMemberId, memberData);
  }

  closeMemberModal();
}

// ======================================================
// 회원 추가 버튼
// ======================================================

function setupAddButton() {
  const button = document.querySelector('.page-heading .primary-action');

  if (!button) {
    return;
  }

  button.addEventListener('click', openAddMemberModal);
}

// ======================================================
// 관리 메모
// ======================================================

function renderManagementMemo() {
  const memoList = document.querySelector('.memo-list');

  if (!memoList) {
    return;
  }

  const importantMembers = members
    .filter((member) => {
      const remaining = getRemainingLessons(member);

      return (
        member.paymentStatus === '미납' ||
        member.paymentStatus === '확인필요' ||
        (member.status === '수강중' && remaining <= 2)
      );
    })
    .slice(0, 5);

  memoList.innerHTML = '';

  if (importantMembers.length === 0) {
    memoList.innerHTML = `
      <article class="memo-item">
        <span class="memo-date">
          관리
        </span>

        <strong>
          확인할 회원이 없습니다.
        </strong>

        <p>
          미납 또는 재등록 예정 회원이 없습니다.
        </p>
      </article>
    `;

    return;
  }

  importantMembers.forEach((member) => {
    const remaining = getRemainingLessons(member);

    let title = '';
    let description = '';

    if (
      member.paymentStatus === '미납' ||
      member.paymentStatus === '확인필요'
    ) {
      title = `${member.name} 회원 결제 확인`;

      description =
        member.paymentStatus === '미납'
          ? `결제 예정금액 ${formatMoney(member.paymentAmount)}원`
          : '결제 상태 확인 필요';
    } else {
      title = `${member.name} 회원 재등록 예정`;

      description = `잔여 수업 ${remaining}회`;
    }

    const article = document.createElement('article');

    article.className = 'memo-item';

    article.innerHTML = `
        <span class="memo-date">
          확인
        </span>

        <strong>
          ${escapeHTML(title)}
        </strong>

        <p>
          ${escapeHTML(description)}
        </p>
      `;

    article.addEventListener('click', () => {
      openMemberDetail(member.id);
    });

    memoList.appendChild(article);
  });
}

// ======================================================
// 화면 전체 업데이트
// ======================================================

function renderAll() {
  renderMembers();
  renderMetrics();
  renderManagementMemo();
}

// ======================================================
// 최초 실행
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
  setupFilters();
  setupAddButton();
  setupReportButtons();
  setupModalEvents();

  loadMembers().then(renderAll);
});
