document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;
  let allUpcomingLessons = [];
  let allCompletedLessons = [];
  let calendarWeekOffset = 0;
  let selectedCalendarDateKey = formatDateKey(new Date());

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
        <article class="lesson-detail-item ${lesson.type || 'personal'}">
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

  function formatDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function getTwoWeekPeriod(weekOffset = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const start = new Date(today);
    start.setDate(today.getDate() - today.getDay() + weekOffset * 7);

    const end = new Date(start);
    end.setDate(start.getDate() + 13);

    return { today, start, end };
  }

  function renderTwoWeekCalendar() {
    const calendar = document.getElementById('twoWeekCalendar');
    const range = document.getElementById('twoWeekRange');

    if (!calendar) {
      return;
    }

    const { today, start, end } = getTwoWeekPeriod(calendarWeekOffset);
    const todayKey = formatDateKey(today);
    const startKey = formatDateKey(start);
    const endKey = formatDateKey(end);

    if (
      selectedCalendarDateKey < startKey ||
      selectedCalendarDateKey > endKey
    ) {
      selectedCalendarDateKey = startKey;
    }
    const visibleLessons = allUpcomingLessons.filter(
      (lesson) => lesson.date >= startKey && lesson.date <= endKey
    );
    const lessonsByDate = visibleLessons.reduce((map, lesson) => {
      if (!map.has(lesson.date)) {
        map.set(lesson.date, []);
      }

      map.get(lesson.date).push(lesson);

      return map;
    }, new Map());

    if (range) {
      range.textContent = `${start.getMonth() + 1}.${start.getDate()} - ${
        end.getMonth() + 1
      }.${end.getDate()}`;
    }

    const cells = [];

    for (let index = 0; index < 14; index += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + index);

      const dateKey = formatDateKey(date);
      const holidayName = portal.getHolidayName(dateKey);
      const dayLessons = (lessonsByDate.get(dateKey) || []).filter(
        (lesson) => lesson.status !== 'holiday'
      );
      const isPast = dateKey < todayKey;
      const isToday = dateKey === todayKey;
      const dayClass = date.getDay() === 0 ? ' sunday' : date.getDay() === 6 ? ' saturday' : '';
      const stateClass = `${isPast ? ' past' : ''}${isToday ? ' today' : ''}${
        holidayName ? ' holiday' : ''
      }${dateKey === selectedCalendarDateKey ? ' selected' : ''}`;
      const holidayEvent = holidayName
        ? `<span class="calendar-lesson holiday">${holidayName}</span>`
        : '';
      const lessonEvents = dayLessons
        .map((lesson) => {
          return `
            <span class="calendar-lesson scheduled ${
              lesson.type || 'personal'
            }">
              <strong>${portal.formatLessonTime(lesson.time)}</strong>
              <small>${formatLessonTitle(lesson.title)}</small>
            </span>
          `;
        })
        .join('');

      cells.push(`
        <button
          type="button"
          class="lesson-calendar-day${dayClass}${stateClass}"
          data-calendar-date="${dateKey}"
          aria-label="${date.getMonth() + 1}월 ${date.getDate()}일 일정 보기"
        >
          <span class="calendar-date-number">${date.getDate()}</span>
          <div class="calendar-day-lessons">${holidayEvent}${lessonEvents}</div>
        </button>
      `);
    }

    calendar.innerHTML = cells.join('');

    const previousButton = document.getElementById('calendarPreviousButton');
    const todayButton = document.getElementById('calendarTodayButton');

    if (previousButton) {
      previousButton.disabled = calendarWeekOffset === 0;
    }

    if (todayButton) {
      todayButton.disabled = calendarWeekOffset === 0;
    }

    renderSelectedCalendarDay();
  }

  function renderSelectedCalendarDay() {
    const dateLabel = document.getElementById('selectedCalendarDate');
    const countLabel = document.getElementById('selectedCalendarCount');
    const detail = document.getElementById('selectedCalendarDetail');

    if (!dateLabel || !countLabel || !detail) {
      return;
    }

    const date = new Date(`${selectedCalendarDateKey}T00:00:00`);
    const holidayName = portal.getHolidayName(selectedCalendarDateKey);
    const lessons = allUpcomingLessons.filter(
      (lesson) =>
        lesson.date === selectedCalendarDateKey && lesson.status !== 'holiday'
    );

    dateLabel.textContent = portal.formatDateWithDay(selectedCalendarDateKey);
    countLabel.textContent = `${lessons.length}건`;

    const holidayHTML = holidayName
      ? `<div class="member-day-notice holiday">${holidayName}</div>`
      : '';
    const lessonsHTML = lessons
      .map(
        (lesson) => `
          <div class="member-day-lesson ${lesson.type || 'personal'}">
            <span>${portal.formatLessonTime(lesson.time)}</span>
            <strong>${formatLessonTitle(lesson.title)}</strong>
            <small>${
              lesson.type === 'group'
                ? '단체수업'
                : lesson.type === 'makeup'
                ? '보강'
                : '개인레슨'
            }</small>
          </div>
        `
      )
      .join('');

    if (!holidayHTML && !lessonsHTML) {
      detail.innerHTML = '<p class="member-empty">예정된 수업이 없습니다.</p>';
      return;
    }

    detail.innerHTML = `${holidayHTML}${lessonsHTML}`;
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
    const noteText = lesson.memo || '수업 내용이 없습니다.';

    if (shouldShowNote) {
      return `
        <article class="lesson-history-item lesson-history-item-expandable ${
          lesson.type || 'personal'
        }">
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
      <article class="lesson-history-item ${lesson.type || 'personal'}">
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

  document
    .getElementById('calendarPreviousButton')
    ?.addEventListener('click', () => {
      calendarWeekOffset = Math.max(0, calendarWeekOffset - 1);
      renderTwoWeekCalendar();
    });

  document
    .getElementById('calendarTodayButton')
    ?.addEventListener('click', () => {
      calendarWeekOffset = 0;
      renderTwoWeekCalendar();
    });

  document
    .getElementById('calendarNextButton')
    ?.addEventListener('click', () => {
      calendarWeekOffset += 1;
      renderTwoWeekCalendar();
    });

  document
    .getElementById('twoWeekCalendar')
    ?.addEventListener('click', (event) => {
      const day = event.target.closest('[data-calendar-date]');

      if (!day) {
        return;
      }

      selectedCalendarDateKey = day.dataset.calendarDate;
      renderTwoWeekCalendar();
    });

  try {
    const { member } = await portal.loadCurrentMember();
    const total = Number(member.total_lessons || 0);
    const used = portal.getEffectiveUsedLessons(member);
    const remaining = portal.getRemainingLessons(member);
    const progressRate = total > 0 ? Math.round((used / total) * 100) : 0;
    const upcomingLessonPool = portal.getUpcomingLessonsWithHolidays(
      member,
      Math.max(remaining, 100)
    );
    const approvedMakeupLessons = await portal.getApprovedMakeupLessons(member);
    allUpcomingLessons = [...upcomingLessonPool, ...approvedMakeupLessons].sort(
      (a, b) => `${a.date}_${a.time}`.localeCompare(`${b.date}_${b.time}`)
    );
    allCompletedLessons = await portal.getCompletedLessons(member, 100);

    const previewCompletedLessons = allCompletedLessons.slice(0, 1);
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

    renderTwoWeekCalendar();

    const historyList = document.querySelector('.lesson-history-list');

    renderLessonList(
      historyList,
      previewCompletedLessons,
      renderCompletedLesson,
      '완료된 수업 기록이 없습니다.'
    );

    setViewAllButtonState('completed', allCompletedLessons.length > 0);

    if (new URLSearchParams(window.location.search).get('view') === 'completed') {
      openLessonListModal('completed');
    }
  } catch (error) {
    console.error('내 수업 정보를 불러오지 못했습니다.', error);

    renderEmpty(
      document.getElementById('twoWeekCalendar'),
      '회원 정보를 불러오지 못했습니다.'
    );
  }

  portal.renderIcons();
});
