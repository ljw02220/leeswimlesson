document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function renderMember(member) {
    const total = Number(member.total_lessons || 0);
    const used = portal.getEffectiveUsedLessons(member);
    const remaining = portal.getRemainingLessons(member);

    setText('profileName', member.name || '-');
    setText('profilePhone', member.phone || '-');
    setText('profileStatus', member.status || '확인필요');
    setText('profileLessonType', member.lesson_format || '개인레슨');
    setText('profileLessonDays', portal.formatDays(member.days));
    setText('profileLessonTime', portal.formatLessonTime(member.lesson_time));
    setText('profileTotalLessons', `${total}회`);
    setText('profileUsedLessons', `${used}회`);
    setText('profileRemainingLessons', `${remaining}회`);
    setText('profilePaymentAmount', portal.formatMoney(member.payment_amount));
    setText(
      'profilePaymentDate',
      member.payment_date ? portal.formatFullDate(member.payment_date) : '-'
    );

    const status = document.getElementById('profilePaymentStatus');

    if (status) {
      status.textContent = member.payment_status || '확인필요';
      status.className = 'payment-status';
      status.classList.add(
        member.payment_status === '완납' ? 'complete' : 'pending'
      );
    }
  }

  async function loadProfile() {
    const { member } = await portal.loadCurrentMember();

    renderMember(member);
  }

  window.addEventListener('focus', () => {
    loadProfile().catch((error) => console.error('회원정보 새로고침 실패:', error));
  });

  const editButton = document.getElementById('profileEditButton');

  if (editButton) {
    editButton.addEventListener('click', () => {
      alert('회원 정보 수정은 관리자에게 요청해주세요.');
    });
  }

  const logoutButton = document.getElementById('logoutButton');

  if (logoutButton) {
    logoutButton.addEventListener('click', portal.logout);
  }

  try {
    await loadProfile();
  } catch (error) {
    console.error('내 정보를 불러오지 못했습니다.', error);

    setText('profileName', '회원 정보를 불러오지 못했습니다.');
  }

  portal.renderIcons();
});
