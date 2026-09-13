document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function renderEmpty(container, message) {
    if (!container) {
      return;
    }

    container.innerHTML = `<p class="member-empty">${message}</p>`;
  }

  function renderLessonItem(lesson) {
    const date = new Date(`${lesson.date}T00:00:00`);

    return `
      <article class="member-lesson-item">
        <div class="lesson-date-box">
          <span>${date.getMonth() + 1}월</span>
          <strong>${date.getDate()}</strong>
          <small>${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]}</small>
        </div>

        <div class="lesson-info">
          <span>${portal.formatLessonTime(lesson.time)}</span>
          <strong>${lesson.title || '개인레슨'}</strong>
          <small>${lesson.memo || '예정된 개인레슨입니다.'}</small>
        </div>

        <span class="lesson-status ${lesson.status}">
          ${lesson.status === 'completed' ? '완료' : '예정'}
        </span>
      </article>
    `;
  }

  function renderFeedbackItem(lesson) {
    return `
      <article class="member-feedback-item">
        <div class="feedback-date">${portal.formatShortDate(lesson.date)}</div>

        <div class="feedback-content">
          <strong>${lesson.title || '개인레슨'}</strong>
          <p>${lesson.memo || '수업을 완료했습니다.'}</p>
        </div>
      </article>
    `;
  }

  try {
    const { member } = await portal.loadCurrentMember();
    const remaining = portal.getRemainingLessons(member);
    const upcomingLessons = portal.getUpcomingLessons(member, 3);
    const completedLessons = portal.getCompletedLessons(member, 2);
    const nextLesson = upcomingLessons[0];

    setText('memberGreetingName', member.name || '회원');
    setText(
      'nextLessonDate',
      nextLesson ? portal.formatDateWithDay(nextLesson.date) : '예정 없음'
    );
    setText(
      'nextLessonTime',
      nextLesson ? portal.formatLessonTime(nextLesson.time) : '-'
    );
    setText('remainingLessons', `${remaining}회`);
    setText('lessonProgressText', `총 ${member.total_lessons || 0}회 중`);
    setText('monthlyLessonCount', `${portal.getThisMonthCompletedCount(member)}회`);
    const paymentStatus = document.getElementById('paymentStatus');

    if (paymentStatus) {
      paymentStatus.textContent = member.payment_status || '확인필요';
      paymentStatus.className =
        member.payment_status === '완납' ? 'payment-complete' : '';
    }

    setText(
      'paymentDate',
      member.payment_date
        ? `${portal.formatShortDate(member.payment_date)} 입금`
        : '결제일 미등록'
    );
    setText('memberPaymentAmount', portal.formatMoney(member.payment_amount));

    const upcomingContainer = document.getElementById('upcomingLessonList');

    if (upcomingLessons.length > 0) {
      upcomingContainer.innerHTML = upcomingLessons.map(renderLessonItem).join('');
    } else {
      renderEmpty(upcomingContainer, '예정된 수업이 없습니다.');
    }

    const feedbackContainer = document.querySelector('.member-feedback-list');

    if (completedLessons.length > 0) {
      feedbackContainer.innerHTML = completedLessons.map(renderFeedbackItem).join('');
    } else {
      renderEmpty(feedbackContainer, '최근 완료된 수업이 없습니다.');
    }
  } catch (error) {
    console.error('회원 홈 정보를 불러오지 못했습니다.', error);

    renderEmpty(
      document.getElementById('upcomingLessonList'),
      '회원 정보를 불러오지 못했습니다.'
    );
  }

  portal.renderIcons();
});
