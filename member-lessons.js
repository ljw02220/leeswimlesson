document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;
  let allUpcomingLessons = [];
  let allCompletedLessons = [];

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

  function formatLessonTitle(title) {
    if (!title) {
      return '개인레슨';
    }

    if (title === '1:1' || title === '개인' || title === 'personal') {
      return '개인레슨';
    }

    return title;
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
              <strong>${formatLessonTitle(lesson.title)}</strong>
            </div>

            <span class="lesson-status scheduled">예정</span>
          </div>
        </div>
      </article>
    `;
  }

  function getLessonItemKey(lesson) {
    return [lesson.id, lesson.date, lesson.time, lesson.title]
      .filter(Boolean)
      .join('-')
      .replace(/[^a-zA-Z0-9가-힣_-]/g, '-');
  }

  function renderCompletedLesson(lesson, options = {}) {
    const shouldShowNote = Boolean(options.showNote);
    const noteId = `lesson-note-${getLessonItemKey(lesson)}`;
    const noteText = lesson.memo || '수업 노트가 아직 없습니다.';

    if (shouldShowNote) {
      return `
        <article class="lesson-history-item lesson-history-item-expandable">
          <button
            type="button"
            class="lesson-note-toggle"
            aria-expanded="false"
            aria-controls="${noteId}"
          >
            <span class="lesson-history-header">
              <span>
                <span>${portal.formatShortDate(lesson.date)}</span>
                <strong>${formatLessonTitle(lesson.title)}</strong>
              </span>

              <span class="lesson-history-actions">
                <span class="lesson-status completed">완료</span>
                <span class="lesson-note-chevron" aria-hidden="true">⌄</span>
              </span>
            </span>
          </button>

          <div id="${noteId}" class="lesson-note-panel" hidden>
            <div class="lesson-content-box">
              <p>${noteText}</p>
            </div>
          </div>
        </article>
      `;
    }

    return `
      <article class="lesson-history-item">
        <div class="lesson-history-header">
          <div>
            <span>${portal.formatShortDate(lesson.date)}</span>
            <strong>${formatLessonTitle(lesson.title)}</strong>
          </div>

          <span class="lesson-status completed">완료</span>
        </div>
      </article>
    `;
  }

  function renderLessonList(container, lessons, renderer, emptyMessage) {
    if (!container) {
      return;
    }

    if (lessons.length > 0) {
      container.innerHTML = lessons.map(renderer).join('');
    } else {
      renderEmpty(container, emptyMessage);
    }
  }

  function setViewAllButtonState(type, isEnabled) {
    const button = document.querySelector(
      `[data-lesson-modal-open="${type}"]`
    );

    if (button) {
      button.disabled = !isEnabled;
    }
  }

  function closeLessonListModal() {
    const modal = document.getElementById('lessonListModal');

    if (!modal) {
      return;
    }

    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function openLessonListModal(type) {
    const modal = document.getElementById('lessonListModal');
    const title = document.getElementById('lessonListModalTitle');
    const kicker = document.getElementById('lessonListModalKicker');
    const body = document.getElementById('lessonListModalBody');

    if (!modal || !title || !kicker || !body) {
      return;
    }

    if (type === 'completed') {
      kicker.textContent = 'Completed';
      title.textContent = '완료한 전체 수업';
      renderLessonList(
        body,
        allCompletedLessons,
        (lesson) => renderCompletedLesson(lesson, { showNote: true }),
        '완료된 수업 기록이 없습니다.'
      );
    } else {
      kicker.textContent = 'Upcoming';
      title.textContent = '나의 예정된 수업';
      renderLessonList(
        body,
        allUpcomingLessons,
        renderScheduledLesson,
        '예정된 수업이 없습니다.'
      );
    }

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  document
    .querySelectorAll('[data-lesson-modal-open]')
    .forEach((button) => {
      button.addEventListener('click', () => {
        openLessonListModal(button.dataset.lessonModalOpen);
      });
    });

  document
    .getElementById('lessonListModalClose')
    ?.addEventListener('click', closeLessonListModal);

  document.getElementById('lessonListModal')?.addEventListener('click', (event) => {
    if (event.target.id === 'lessonListModal') {
      closeLessonListModal();
    }
  });

  document.getElementById('lessonListModalBody')?.addEventListener('click', (event) => {
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
    const total = Number(member.total_lessons || 0);
    const used = Number(member.used_lessons || 0);
    const remaining = portal.getRemainingLessons(member);
    const progressRate = total > 0 ? Math.round((used / total) * 100) : 0;
    allUpcomingLessons = portal.getUpcomingLessonsWithHolidays(
      member,
      Math.max(remaining, 12)
    );
    allCompletedLessons = await portal.getCompletedLessons(member, 100);

    const previewUpcomingLessons = allUpcomingLessons.slice(0, 2);
    const previewCompletedLessons = allCompletedLessons.slice(0, 2);
    const nextLesson = allUpcomingLessons.find(
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
      const scheduledCount = allUpcomingLessons.filter(
        (lesson) => lesson.status === 'scheduled'
      ).length;

      lessonCount.textContent = `${scheduledCount}건`;
    }

    const scheduledList = document.getElementById('scheduledLessonList');

    renderLessonList(
      scheduledList,
      previewUpcomingLessons,
      renderScheduledLesson,
      '예정된 수업이 없습니다.'
    );

    setViewAllButtonState('scheduled', allUpcomingLessons.length > 0);

    const historyList = document.querySelector('.lesson-history-list');

    renderLessonList(
      historyList,
      previewCompletedLessons,
      renderCompletedLesson,
      '완료된 수업 기록이 없습니다.'
    );

    setViewAllButtonState('completed', allCompletedLessons.length > 0);
  } catch (error) {
    console.error('내 수업 정보를 불러오지 못했습니다.', error);

    renderEmpty(
      document.getElementById('scheduledLessonList'),
      '회원 정보를 불러오지 못했습니다.'
    );
  }

  portal.renderIcons();
});
