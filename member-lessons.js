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

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatCommentTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat('ko-KR', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
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
    const noteText = escapeHTML(lesson.memo || '수업 내용이 없습니다.');

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

            <section class="lesson-comments" data-lesson-comments="${lesson.id}">
              <div class="lesson-comments-heading">
                <strong>수업 댓글</strong>
                <span>같이 수업한 회원에게도 보여요.</span>
              </div>
              <div class="lesson-comments-list">
                <p class="lesson-comments-empty">댓글을 불러오는 중입니다.</p>
              </div>
              <form class="lesson-comment-form" data-lesson-comment-form="${lesson.id}">
                <input
                  type="text"
                  name="comment"
                  maxlength="500"
                  placeholder="수업에 대한 메모나 댓글을 남겨주세요."
                  autocomplete="off"
                  required
                />
                <button type="submit">등록</button>
              </form>
            </section>
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

  async function loadLessonComments(lessonId) {
    const section = document.querySelector(
      `[data-lesson-comments="${lessonId}"]`
    );
    const list = section?.querySelector('.lesson-comments-list');
    if (!section || !list || !window.swimDb?.client) return;

    const { data, error } = await window.swimDb.client.rpc(
      'get_lesson_comments',
      { p_lesson_id: lessonId }
    );

    if (error) {
      list.innerHTML = `
        <p class="lesson-comments-error">
          댓글 기능을 준비하지 못했습니다. 관리자에게 문의해주세요.
        </p>
      `;
      return;
    }

    list.innerHTML = data?.length
      ? data
          .map(
            (comment) => `
              <article class="lesson-comment${comment.is_mine ? ' mine' : ''}">
                <div>
                  <span>
                    <strong>${escapeHTML(comment.author_name)}</strong>
                    <time>${formatCommentTime(comment.created_at)}</time>
                  </span>
                  ${
                    comment.is_mine
                      ? `<button
                          type="button"
                          class="lesson-comment-delete"
                          data-comment-delete="${comment.id}"
                          data-lesson-id="${lessonId}"
                        >삭제</button>`
                      : ''
                  }
                </div>
                <p>${escapeHTML(comment.body)}</p>
              </article>
            `
          )
          .join('')
      : '<p class="lesson-comments-empty">아직 댓글이 없습니다.</p>';
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
    body.scrollTop = 0;
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

  document.getElementById('lessonListModalBody')?.addEventListener('click', async (event) => {
    const toggle = event.target.closest('.lesson-note-toggle');

    if (!toggle) {
      return;
    }

    const panelId = toggle.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';

    document
      .querySelectorAll(
        '#lessonListModalBody .lesson-note-toggle[aria-expanded="true"]'
      )
      .forEach((openToggle) => {
        if (openToggle === toggle) return;

        openToggle.setAttribute('aria-expanded', 'false');
        const openPanelId = openToggle.getAttribute('aria-controls');
        const openPanel = openPanelId
          ? document.getElementById(openPanelId)
          : null;

        if (openPanel) openPanel.hidden = true;
      });

    toggle.setAttribute('aria-expanded', String(!isExpanded));

    if (panel) {
      panel.hidden = isExpanded;

      if (!isExpanded) {
        const comments = panel.querySelector('[data-lesson-comments]');
        if (comments?.dataset.lessonComments) {
          await loadLessonComments(comments.dataset.lessonComments);
        }
      }
    }
  });

  document
    .getElementById('lessonListModalBody')
    ?.addEventListener('submit', async (event) => {
      const form = event.target.closest('[data-lesson-comment-form]');
      if (!form) return;

      event.preventDefault();
      const lessonId = form.dataset.lessonCommentForm;
      const input = form.elements.comment;
      const body = input?.value.trim() || '';
      const button = form.querySelector('button[type="submit"]');
      if (!body) return;

      if (button) {
        button.disabled = true;
        button.textContent = '등록 중';
      }

      const { error } = await window.swimDb.client.rpc('add_lesson_comment', {
        p_lesson_id: lessonId,
        p_body: body,
      });

      if (button) {
        button.disabled = false;
        button.textContent = '등록';
      }

      if (error) {
        alert(`댓글을 등록하지 못했습니다. ${error.message}`);
        return;
      }

      form.reset();
      await loadLessonComments(lessonId);
    });

  document
    .getElementById('lessonListModalBody')
    ?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-comment-delete]');
      if (!button) return;

      if (!confirm('작성한 댓글을 삭제할까요?')) return;

      button.disabled = true;
      const { error } = await window.swimDb.client.rpc(
        'delete_lesson_comment',
        { p_comment_id: button.dataset.commentDelete }
      );

      if (error) {
        button.disabled = false;
        alert(`댓글을 삭제하지 못했습니다. ${error.message}`);
        return;
      }

      await loadLessonComments(button.dataset.lessonId);
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
