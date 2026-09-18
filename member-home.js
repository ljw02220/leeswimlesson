document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;
  let allUpcomingLessons = [];
  let allCompletedLessons = [];

  function setText(id, value) {
    const element = document.getElementById(id);

    if (!element) {
      return;
    }

    element.textContent = value;
  }

  function renderEmpty(container, message) {
    if (!container) {
      return;
    }

    container.innerHTML = `<p class="member-empty">${message}</p>`;
  }

  function formatLessonTitle(title) {
    if (!title) {
      return '개인레슨';
    }

    if (title === '1:1' || title === '개인' || title === 'personal') {
      return '개인레슨';
    }

    return title;
  }

  function getDayName(date) {
    const days = ['일', '월', '화', '수', '목', '금', '토'];

    return days[date.getDay()];
  }

  function getOneMonthDateRange() {
    const start = new Date();
    const end = new Date(start);
    const targetDay = end.getDate();

    start.setHours(0, 0, 0, 0);
    end.setDate(1);
    end.setMonth(end.getMonth() + 1);
    end.setDate(
      Math.min(
        targetDay,
        new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate()
      )
    );
    end.setHours(23, 59, 59, 999);

    return { start, end };
  }

  function getLessonsWithinOneMonth(lessons) {
    const { start, end } = getOneMonthDateRange();

    return lessons.filter((lesson) => {
      const lessonDate = new Date(`${lesson.date}T00:00:00`);

      return lessonDate >= start && lessonDate <= end;
    });
  }

  function renderLessonItem(lesson) {
    const date = new Date(`${lesson.date}T00:00:00`);

    const statusText = lesson.status === 'completed' ? '완료' : '예정';

    return `
        <article class="member-lesson-item ${lesson.type || 'personal'}">
          <div class="lesson-date-box">
            <span>
              ${date.getMonth() + 1}월
            </span>

            <strong>
              ${date.getDate()}
            </strong>

            <small>
              ${getDayName(date)}
            </small>
          </div>

          <div class="lesson-info">
            <span>
              ${portal.formatLessonTime(lesson.time)}
            </span>

            <strong>
              ${formatLessonTitle(lesson.title)}
            </strong>
          </div>

          <span
            class="lesson-status ${lesson.status}"
          >
            ${statusText}
          </span>
        </article>
      `;
  }

  function getLessonItemKey(lesson) {
    return [lesson.id, lesson.date, lesson.time, lesson.title]
      .filter(Boolean)
      .join('-')
      .replace(/[^a-zA-Z0-9가-힣_-]/g, '-');
  }

  function renderPaymentStatus(member) {
    const paymentStatus = document.getElementById('paymentStatus');

    if (!paymentStatus) {
      return;
    }

    const status = member.payment_status || '확인필요';

    paymentStatus.textContent = status;

    paymentStatus.className = status === '완납' ? 'payment-complete' : '';
  }

  function renderPaymentInfo(member) {
    setText(
      'paymentDate',
      member.payment_date
        ? `${portal.formatShortDate(member.payment_date)} 입금`
        : '결제일 미등록'
    );

    setText('memberPaymentAmount', portal.formatMoney(member.payment_amount));
  }

  function renderUpcomingLessons(upcomingLessons) {
    const container = document.getElementById('upcomingLessonList');

    if (upcomingLessons.length === 0) {
      renderEmpty(container, '예정된 수업이 없습니다.');

      return;
    }

    container.innerHTML = upcomingLessons.map(renderLessonItem).join('');
  }

  function renderCompletedLessons(completedLessons) {
    const container = document.querySelector('.member-feedback-list');

    if (completedLessons.length === 0) {
      renderEmpty(container, '최근 완료된 수업이 없습니다.');

      return;
    }

    container.innerHTML = completedLessons.map(renderFeedbackItem).join('');
  }

  function renderFeedbackItem(lesson, options = {}) {
    const isExpandable = Boolean(options.showNote);

    const noteId = `home-lesson-note-${getLessonItemKey(lesson)}`;

    const noteText = lesson.memo || '수업 내용이 없습니다.';

    if (isExpandable) {
      return `
        <article class="member-feedback-item expandable ${
          lesson.type || 'personal'
        }">
          <button
            type="button"
            class="lesson-note-toggle"
            aria-expanded="false"
            aria-controls="${noteId}"
          >
            <span class="lesson-note-summary">
              <span class="feedback-date">
                ${portal.formatShortDate(lesson.date)}
              </span>

              <span class="feedback-content">
                <strong>
                  ${formatLessonTitle(lesson.title)}
                </strong>
              </span>

              <span
                class="lesson-note-chevron"
                aria-hidden="true"
              >
                ⌄
              </span>
            </span>
          </button>

          <div
            id="${noteId}"
            class="lesson-note-panel"
            hidden
          >
            <div class="lesson-content-box">
              <p>${noteText}</p>
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="member-feedback-item ${lesson.type || 'personal'}">
        <div class="feedback-date">
          ${portal.formatShortDate(lesson.date)}
        </div>

        <div class="feedback-content">
          <strong>
            ${formatLessonTitle(lesson.title)}
          </strong>

          <p>
            ${noteText}
          </p>
        </div>
      </article>
    `;
  }

  function closeUpcomingLessonModal() {
    const modal = document.getElementById('upcomingLessonModal');

    if (!modal) {
      return;
    }

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openUpcomingLessonModal() {
    const modal = document.getElementById('upcomingLessonModal');
    const body = document.getElementById('upcomingLessonModalBody');

    if (!modal || !body) {
      return;
    }

    if (allUpcomingLessons.length === 0) {
      renderEmpty(body, '예정된 수업이 없습니다.');
    } else {
      body.innerHTML = allUpcomingLessons.map(renderLessonItem).join('');
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeCompletedLessonModal() {
    const modal = document.getElementById('completedLessonModal');

    if (!modal) {
      return;
    }

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openCompletedLessonModal() {
    const modal = document.getElementById('completedLessonModal');
    const body = document.getElementById('completedLessonModalBody');

    if (!modal || !body) {
      return;
    }

    if (allCompletedLessons.length === 0) {
      renderEmpty(body, '완료된 수업 기록이 없습니다.');
    } else {
      body.innerHTML = allCompletedLessons
        .map((lesson) => renderFeedbackItem(lesson, { showNote: true }))
        .join('');
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  document
    .getElementById('upcomingLessonModalOpen')
    ?.addEventListener('click', openUpcomingLessonModal);

  document
    .getElementById('upcomingLessonModalClose')
    ?.addEventListener('click', closeUpcomingLessonModal);

  document
    .getElementById('upcomingLessonModal')
    ?.addEventListener('click', (event) => {
      if (event.target.id === 'upcomingLessonModal') {
        closeUpcomingLessonModal();
      }
    });

  document
    .getElementById('completedLessonModalOpen')
    ?.addEventListener('click', openCompletedLessonModal);

  document
    .getElementById('completedLessonModalClose')
    ?.addEventListener('click', closeCompletedLessonModal);

  document
    .getElementById('completedLessonModal')
    ?.addEventListener('click', (event) => {
      if (event.target.id === 'completedLessonModal') {
        closeCompletedLessonModal();
      }
    });

  document
    .getElementById('completedLessonModalBody')
    ?.addEventListener('click', (event) => {
      const toggle = event.target.closest('.lesson-note-toggle');

      if (!toggle) {
        return;
      }

      const panelId = toggle.getAttribute('aria-controls');
      const panel = panelId ? document.getElementById(panelId) : null;
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

      toggle.setAttribute('aria-expanded', String(!isExpanded));

      if (panel) {
        panel.hidden = isExpanded;
      }
    });

  try {
    const { member } = await portal.loadCurrentMember();

    const remaining = portal.getRemainingLessons(member);

    const approvedMakeupLessons = await portal.getApprovedMakeupLessons(member);

    allUpcomingLessons = getLessonsWithinOneMonth([
      ...portal.getUpcomingLessons(member, 100),
      ...approvedMakeupLessons,
    ]).sort((a, b) =>
      `${a.date}_${a.time}`.localeCompare(`${b.date}_${b.time}`)
    );

    const upcomingLessons = allUpcomingLessons.slice(0, 2);

    allCompletedLessons = await portal.getCompletedLessons(member, 100, {
      onlyWithMemo: true,
    });

    const completedLessons = allCompletedLessons.slice(0, 1);

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

    setText(
      'monthlyLessonCount',
      `${portal.getThisMonthCompletedCount(member)}회`
    );

    renderPaymentStatus(member);

    renderPaymentInfo(member);

    renderUpcomingLessons(upcomingLessons);

    renderCompletedLessons(completedLessons);
  } catch (error) {
    console.error('회원 홈 정보를 불러오지 못했습니다.', error);

    renderEmpty(
      document.getElementById('upcomingLessonList'),
      '회원 정보를 불러오지 못했습니다.'
    );
  }

  portal.renderIcons();
});
