document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;
  let currentMember = null;

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function setMessage(message, tone = 'success') {
    const element = document.getElementById('paymentReportMessage');

    if (!element) {
      return;
    }

    element.textContent = message;
    element.dataset.tone = tone;
  }

  function renderMember(member) {
    const total = Number(member.total_lessons || 0);
    const used = Number(member.used_lessons || 0);
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

    currentMember = member;
    renderMember(member);
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const paymentDate = document.getElementById('paymentReportDate');

  if (paymentDate) {
    paymentDate.value = todayKey;
  }

  const paymentForm = document.getElementById('paymentReportForm');

  if (paymentForm) {
    paymentForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!currentMember) {
        return;
      }

      const paymentAmount = portal.parseMoney(
        document.getElementById('paymentReportAmount')?.value
      );
      const paymentDateValue =
        document.getElementById('paymentReportDate')?.value || '';

      if (!paymentDateValue || paymentAmount <= 0) {
        setMessage('결제일과 결제금액을 입력해주세요.', 'error');

        return;
      }

      try {
        currentMember = await portal.updateMemberPayment(currentMember, {
          paymentDate: paymentDateValue,
          paymentAmount,
        });

        renderMember(currentMember);
        paymentForm.reset();

        if (paymentDate) {
          paymentDate.value = todayKey;
        }

        setMessage('결제 알림을 저장했습니다. 관리자 확인 후 반영됩니다.');
      } catch (error) {
        console.error('결제 알림 저장 실패:', error);

        setMessage('결제 알림을 저장하지 못했습니다.', 'error');
      }
    });
  }

  const paymentReportAmount = document.getElementById('paymentReportAmount');

  if (paymentReportAmount) {
    paymentReportAmount.addEventListener('input', (event) => {
      const numbersOnly = event.target.value.replace(/[^0-9]/g, '');

      if (!numbersOnly) {
        event.target.value = '';

        return;
      }

      event.target.value = Number(numbersOnly).toLocaleString('ko-KR');
    });
  }

  const messageForm = document.getElementById('memberMessageForm');

  if (messageForm) {
    messageForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (!currentMember) {
        return;
      }

      const messageInput = document.getElementById('memberMessage');
      const message = messageInput?.value.trim() || '';

      if (!message) {
        alert('전달 내용을 입력해주세요.');

        return;
      }

      try {
        currentMember = await portal.updateMemberMemo(currentMember, message);
        messageInput.value = '';

        alert('전달 내용을 저장했습니다.');
      } catch (error) {
        console.error('전달 내용 저장 실패:', error);

        alert('전달 내용을 저장하지 못했습니다.');
      }
    });
  }

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
