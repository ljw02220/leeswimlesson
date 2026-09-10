// ======================================================
// 개인레슨 회원관리
// ======================================================

const STORAGE_KEY = 'personalLessonMembers';

let members = loadMembers();
let currentFilter = '전체';
let editingMemberId = null;

// ======================================================
// 데이터 불러오기 / 저장
// ======================================================

function loadMembers() {
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

function saveMembers() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(members));
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

function escapeHTML(value) {
  const element = document.createElement('div');

  element.textContent = value ?? '';

  return element.innerHTML;
}

function getSchedule(member) {
  const days = Array.isArray(member.days) ? member.days.join('·') : '';

  const time = member.time || '';

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

  const filteredMembers = getFilteredMembers();

  tbody.innerHTML = '';

  if (filteredMembers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td
          colspan="6"
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
        <span
          class="
            status
            ${getPaymentClass(member.paymentStatus)}
          "
        >
          ${escapeHTML(member.paymentStatus || '확인필요')}
        </span>
      </td>
    `;

    row.addEventListener('click', () => {
      openMemberDetail(member.id);
    });

    tbody.appendChild(row);
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

function addMember(memberData) {
  const newMember = {
    id: Date.now(),

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

    lastLessonDate: memberData.lastLessonDate || '',

    status: memberData.status || '수강중',

    memo: memberData.memo || '',
  };

  members.push(newMember);

  saveMembers();

  renderAll();
}

// ======================================================
// 회원 수정
// ======================================================

function updateMember(memberId, updatedData) {
  const index = members.findIndex(
    (member) => String(member.id) === String(memberId)
  );

  if (index === -1) {
    console.error('수정할 회원을 찾을 수 없습니다.');

    return;
  }

  members[index] = {
    ...members[index],
    ...updatedData,
  };

  saveMembers();

  renderAll();
}

// ======================================================
// 회원 삭제
// ======================================================

function deleteMember(memberId) {
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

  members = members.filter((member) => String(member.id) !== String(memberId));

  saveMembers();

  closeMemberModal();

  renderAll();
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

  document.getElementById('paymentAmount').value = member.paymentAmount || '';

  document.getElementById('paymentDate').value = member.paymentDate || '';

  document.getElementById('paymentStatus').value =
    member.paymentStatus || '완납';

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

function handleMemberSubmit(event) {
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

  if (usedLessons > totalLessons) {
    alert('진행 횟수는 등록 횟수보다 많을 수 없습니다.');

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

    paymentAmount: Number(document.getElementById('paymentAmount').value) || 0,

    paymentDate: document.getElementById('paymentDate').value,

    paymentStatus: document.getElementById('paymentStatus').value,

    status: document.getElementById('memberStatus').value,

    lastLessonDate: document.getElementById('lastLessonDate').value,

    memo: document.getElementById('memberMemo').value.trim(),
  };

  if (editingMemberId === null) {
    addMember(memberData);
  } else {
    updateMember(editingMemberId, memberData);
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
  setupModalEvents();
  renderAll();
});

const logoutButton = document.getElementById('logoutButton');

if (logoutButton) {
  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('loginSession');
    sessionStorage.removeItem('loginSession');

    window.location.href = 'index.html';
  });
}
