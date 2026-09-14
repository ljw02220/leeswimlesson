document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;

  function setText(id, value) {
    const element = document.getElementById(id);

    if (element) {
      element.textContent = value;
    }
  }

  function renderEmpty(container, message) {
    if (container) {
      container.innerHTML = `<p class="member-empty">${message}</p>`;
    }
  }

  function renderDateBox(dateKey, options = {}) {
    const date = new Date(`${dateKey}T00:00:00`);
    const days = ['일', '월', '화', '수', '목', '금', '토'];
    const className = options.isHoliday
      ? 'lesson-date-box holiday'
      : 'lesson-date-box';

    return `
      <div class="${className}">
        <span>${date.getMonth() + 1}월</span>
        <strong>${date.getDate()}</strong>
        <small>${days[date.getDay()]}</small>
      </div>
    `;
  }

  function renderScheduledLesson(lesson) {
    if (lesson.status === 'holiday') {
      return `
        <article class="lesson-detail-item holiday">
          ${renderDateBox(lesson.date, { isHoliday: true })}

          <div class="lesson-detail-content">
            <div class="lesson-detail-top">
              <div>
                <span>${portal.formatLessonTime(lesson.time)}</span>
                <strong>${lesson.holidayName || lesson.title || '휴일'}</strong>
              </div>

              <span class="lesson-status holiday">휴일</span>
            </div>

            <p>${lesson.memo || '휴일이라 수업이 없습니다.'}</p>
          </div>
        </article>
      `;
    }

    return `
      <article class="lesson-detail-item">
        ${renderDateBox(lesson.date)}

        <div class="lesson-detail-content">
          <div class="lesson-detail-top">
            <div>
              <span>${portal.formatLessonTime(lesson.time)}</span>
              <strong>${lesson.title || '개인레슨'}</strong>
            </div>

            <span class="lesson-status scheduled">예정</span>
          </div>

          <p>${lesson.memo || '예정된 개인레슨입니다.'}</p>
        </div>
      </article>
    `;
  }

  function renderCompletedLesson(lesson) {
    return `
      <article class="lesson-history-item">
        <div class="lesson-history-header">
          <div>
            <span>${portal.formatShortDate(lesson.date)}</span>
            <strong>${lesson.title || '개인레슨'}</strong>
          </div>

          <span class="lesson-status completed">완료</span>
        </div>

        <div class="lesson-content-box">
          <p>${lesson.memo || '수업을 완료했습니다.'}</p>
        </div>
      </article>
    `;
  }

  try {
    const { member } = await portal.loadCurrentMember();
    const total = Number(member.total_lessons || 0);
    const used = Number(member.used_lessons || 0);
    const remaining = portal.getRemainingLessons(member);
    const progressRate = total > 0 ? Math.round((used / total) * 100) : 0;
    const upcomingLessons = portal.getUpcomingLessonsWithHolidays(
      member,
      remaining || 4
    );
    const completedLessons = portal.getCompletedLessons(member, 6);
    const nextLesson = upcomingLessons.find(
      (lesson) => lesson.status === 'scheduled'
    );

    setText(
      'nextLessonDate',
      nextLesson ? portal.formatDateWithDay(nextLesson.date) : '예정 없음'
    );
    setText(
      'nextLessonTime',
      nextLesson ? portal.formatLessonTime(nextLesson.time) : '-'
    );
    setText('lessonProgress', `${used} / ${total}회`);
    setText('remainingLessons', `${remaining}회 남음`);

    const progressHeader = document.querySelector('.lesson-progress-header');
    const progressFill = document.querySelector('.lesson-progress-fill');

    if (progressHeader) {
      const strong = progressHeader.querySelector('strong');
      const small = progressHeader.querySelector('small');

      if (strong) {
        strong.textContent = `${progressRate}%`;
      }

      if (small) {
        small.textContent = `총 ${total}회 중 ${used}회 진행`;
      }
    }

    if (progressFill) {
      progressFill.style.width = `${Math.min(progressRate, 100)}%`;
    }

    const lessonCount = document.querySelector('.lesson-count');

    if (lessonCount) {
      const scheduledCount = upcomingLessons.filter(
        (lesson) => lesson.status === 'scheduled'
      ).length;

      lessonCount.textContent = `${scheduledCount}건`;
    }

    const scheduledList = document.getElementById('scheduledLessonList');

    if (upcomingLessons.length > 0) {
      scheduledList.innerHTML = upcomingLessons
        .map(renderScheduledLesson)
        .join('');
    } else {
      renderEmpty(scheduledList, '예정된 수업이 없습니다.');
    }

    const historyList = document.querySelector('.lesson-history-list');

    if (completedLessons.length > 0) {
      historyList.innerHTML = completedLessons.map(renderCompletedLesson).join('');
    } else {
      renderEmpty(historyList, '완료된 수업 기록이 없습니다.');
    }
  } catch (error) {
    console.error('내 수업 정보를 불러오지 못했습니다.', error);

    renderEmpty(
      document.getElementById('scheduledLessonList'),
      '회원 정보를 불러오지 못했습니다.'
    );
  }

  portal.renderIcons();
});
