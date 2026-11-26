document.addEventListener('DOMContentLoaded', () => {
  const client = window.swimDb?.client;

  const $ = (id) => document.getElementById(id);
  const escape = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        }[c])
    );
  let comments = [];
  let loading = false;
  const dateKey = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(d.getDate()).padStart(2, '0')}`;
  };
  let selectedDay = dateKey();
  const calendarMonth = new Date(`${selectedDay}T00:00:00`);
  calendarMonth.setDate(1);
  let monthLessons = [];
  let classFilter = 'all';
  function showGroupWorkout(type) {
    const hidden = type === 'personal' || type === 'makeup';
    document.body.classList.toggle('hide-group-workout', hidden);
    for (const id of ['homeWorkoutSavedView', 'homeDailyWorkout']) {
      const element = $(id);
      if (element) element.hidden = hidden;
    }
  }
  const matchesFilter = (type) => classFilter === 'all' || type === classFilter;
  $('homeChecksOpen').addEventListener('click', () => {
    const open = $('homeChecks').hidden;
    $('homeChecks').hidden = !open;
    $('homeChecksOpen').setAttribute('aria-expanded', String(open));
  });
  document.querySelectorAll('[data-home-filter]').forEach((button) =>
    button.addEventListener('click', () => {
      classFilter = button.dataset.homeFilter;
      showGroupWorkout(classFilter);
      document
        .querySelectorAll('[data-home-filter]')
        .forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
      renderCalendar();
    })
  );
  const formatDay = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;
  function renderCalendar() {
    const year = calendarMonth.getFullYear(),
      month = calendarMonth.getMonth();
    $('homeCalendarMonth').textContent = `${year}년 ${month + 1}월`;
    const seen =
      localStorage.getItem('swimNotificationSeenAt:admin:page:members.html') ||
      localStorage.getItem('swimNotificationSeenAt:admin') ||
      '';
    const cells = Array.from(
      { length: new Date(year, month, 1).getDay() },
      () => '<span aria-hidden="true"></span>'
    );
    for (let day = 1; day <= new Date(year, month + 1, 0).getDate(); day++) {
      const key = formatDay(new Date(year, month, day));
      const rows = monthLessons.filter(
        (r) => r.date === key && r.status !== 'deleted' && matchesFilter(r.type)
      );
      const hasComments = comments.some(
        (c) =>
          c.lesson_date === key &&
          c.created_at > seen &&
          matchesFilter(c.lesson_type)
      );
      cells.push(
        `<button type="button" data-admin-calendar-date="${key}" class="admin-calendar-day${
          key === selectedDay ? ' selected' : ''
        }${key === dateKey() ? ' today' : ''}" aria-pressed="${
          key === selectedDay
        }" ${key === dateKey() ? 'aria-current="date"' : ''} aria-label="${
          month + 1
        }월 ${day}일, 수업 ${rows.length}건${
          hasComments ? ', 새 댓글 있음' : ''
        }"><span>${day}</span><span class="admin-calendar-marks" aria-hidden="true">${
          rows.some((r) => r.type === 'group') ? '<i></i>' : ''
        }${
          rows.some((r) => r.type === 'personal' || r.type === 'makeup')
            ? '<i class="completed"></i>'
            : ''
        }${hasComments ? '<i class="comments"></i>' : ''}</span></button>`
      );
    }
    $('homeCalendarDays').innerHTML = cells.join('');
    $('homeSelectedDate').textContent = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'short',
    }).format(new Date(`${selectedDay}T00:00:00`));
    renderSchedule(
      monthLessons.filter(
        (r) => r.date === selectedDay && matchesFilter(r.type)
      )
    );
    renderComments();
    window.dispatchEvent(
      new CustomEvent('swim-admin-date', { detail: selectedDay })
    );
  }
  $('homeCalendarDays').addEventListener('click', (event) => {
    const button = event.target.closest('[data-admin-calendar-date]');
    if (!button) return;
    selectedDay = button.dataset.adminCalendarDate;
    renderCalendar();
    $('homeCalendarDays')
      .querySelector(`[data-admin-calendar-date="${selectedDay}"]`)
      ?.focus();
  });
  for (const [id, direction] of [
    ['homeCalendarPrev', -1],
    ['homeCalendarNext', 1],
  ])
    $(id).addEventListener('click', () => {
      if (loading) return;
      calendarMonth.setMonth(calendarMonth.getMonth() + direction);
      selectedDay = formatDay(calendarMonth);
      load();
    });
  $('homeCalendarToday').addEventListener('click', () => {
    if (loading) return;
    selectedDay = dateKey();
    const d = new Date(`${selectedDay}T00:00:00`);
    calendarMonth.setFullYear(d.getFullYear(), d.getMonth(), 1);
    load();
  });
  const statusName = {
    scheduled: '예정',
    completed: '완료',
    cancelled: '취소',
  };
  function result(settled) {
    if (settled.status === 'rejected') return { error: settled.reason };
    return settled.value || { error: new Error('응답 없음') };
  }
  let threads = [];
  let threadVersion = 0;
  const noteDrafts = new Map();
  const commentDrafts = new Map();
  const threadKey = (c) =>
    `${c.lesson_type}_${c.lesson_date}_${String(c.lesson_time).slice(0, 5)}`;
  function renderComments() {
    const seen =
      localStorage.getItem('swimNotificationSeenAt:admin:page:members.html') ||
      localStorage.getItem('swimNotificationSeenAt:admin') ||
      '';
    $('homeCommentCount').textContent = `${
      comments.filter((c) => c.created_at > seen).length
    }건`;
    const grouped = new Map();
    for (const row of monthLessons.filter(
      (r) =>
        r.date === selectedDay &&
        r.status !== 'deleted' &&
        matchesFilter(r.type)
    )) {
      const c = {
        lesson_type: row.type,
        lesson_date: row.date,
        lesson_time: String(row.time).slice(0, 5),
        title: row.title,
      };
      if (!grouped.has(threadKey(c))) grouped.set(threadKey(c), c);
    }
    for (const c of comments.filter(
      (c) => c.lesson_date === selectedDay && matchesFilter(c.lesson_type)
    ))
      if (!grouped.has(threadKey(c))) grouped.set(threadKey(c), c);
    threads = Array.from(grouped.values());
    $('homeCommentTotal').textContent = `${threads.length}개 수업`;
    const select = $('homeCommentThreadSelect');
    const previous = select.value;
    select.innerHTML = threads
      .map(
        (c) =>
          `<option value="${escape(threadKey(c))}">${escape(
            String(c.lesson_time).slice(0, 5)
          )} ${escape(
            c.title ||
              { group: '단체강습', personal: '개인레슨', makeup: '보강' }[
                c.lesson_type
              ] ||
              '수업'
          )}${c.created_at > seen ? ' · 새 댓글' : ''}</option>`
      )
      .join('');
    select.disabled = !threads.length;
    if (threads.some((c) => threadKey(c) === previous)) select.value = previous;
    if (threads.length) renderSelectedThread();
    else
      $('homeCommentList').innerHTML =
        '<p class="home-empty">선택한 날짜에는 수업이 없습니다.</p>';
  }
  async function renderSelectedThread() {
    const version = ++threadVersion;
    for (const form of $('homeCommentList').querySelectorAll(
      '[data-lesson-comment-form]'
    )) {
      const body = form.elements.comment.value;
      if (body.trim() || form.dataset.replyParent)
        commentDrafts.set(form.dataset.lessonCommentForm, {
          body,
          parent: form.dataset.replyParent,
          context: form.querySelector('.lesson-reply-context')?.outerHTML || '',
        });
      else commentDrafts.delete(form.dataset.lessonCommentForm);
    }
    $('homeCommentList').innerHTML = '';
    await Promise.all(
      threads.filter(c => !$('homeDiscussionDialog').open || threadKey(c) === $('homeCommentThreadSelect').value).map(async (c) => {
        const key = threadKey(c);
        $('homeCommentList').insertAdjacentHTML(
          'beforeend',
          `<section class="home-thread" data-lesson-comments="${escape(key)}">
      <header class="home-class-heading"><div><span>${escape(
        { group: '단체수업', personal: '개인레슨', makeup: '보강' }[
          c.lesson_type
        ] || '수업'
      )} · ${escape(String(c.lesson_time).slice(0, 5))}</span><h3>${escape(
            c.title || '수업'
          )}</h3></div><a href="lessons.html?date=${encodeURIComponent(
            c.lesson_date
          )}">수업 편집</a></header>
      <div class="home-day-actions"><button type="button" data-home-manage="${escape(key)}" data-action="status">상태 확인 · 취소</button>${c.lesson_type==='personal'?`<button type="button" data-home-manage="${escape(key)}" data-action="move">일정 변경</button>`:''}</div>
      <form class="home-thread-note home-note-form" data-home-note-form="${escape(
        key
      )}">
        <label for="homeLessonMemo-${escape(key)}">수업 내용</label>
        <textarea id="homeLessonMemo-${escape(
          key
        )}" name="memo" rows="4" maxlength="10000" placeholder="오늘 배운 내용과 연습할 점을 적어주세요. 회원에게도 보여요." disabled></textarea>
        <div class="home-note-actions"><p data-home-note-message role="status">수업 내용을 불러오는 중입니다.</p><button type="submit" disabled>내용 저장</button></div>
      </form>
      <div class="lesson-comments-list" aria-live="polite"><p class="home-empty">댓글을 불러오는 중입니다.</p></div>
      <form class="home-thread-form" data-lesson-comment-form="${escape(key)}">
        <label for="homeThreadComment-${escape(
          key
        )}">댓글 작성</label><div class="home-thread-input-row"><textarea id="homeThreadComment-${escape(
            key
          )}" name="comment" maxlength="500" rows="2" placeholder="회원에게 댓글이나 답글을 남겨주세요." required></textarea><button type="submit">등록</button></div>
        <p class="home-thread-message" role="status"></p>
      </form>
    </section>`
        );
        const section = $('homeCommentList').querySelector(
          `[data-lesson-comments="${key}"]`
        );
        const list = section.querySelector('.lesson-comments-list');
        const commentForm = section.querySelector('[data-lesson-comment-form]');
        const draft = commentDrafts.get(key);
        if (draft) {
          commentForm.elements.comment.value = draft.body;
          if (draft.parent) {
            commentForm.dataset.replyParent = draft.parent;
            commentForm.insertAdjacentHTML('afterbegin', draft.context);
          }
        }

        try {
          const [discussion, note] = await Promise.all([
            client.rpc('get_member_lesson_thread', {
              p_lesson_type: c.lesson_type,
              p_lesson_date: c.lesson_date,
              p_lesson_time: c.lesson_time,
            }),
            client
              .from('lessons')
              .select('memo')
              .eq('lesson_type', c.lesson_type)
              .eq('lesson_date', c.lesson_date)
              .eq('lesson_time', c.lesson_time)
              .order('updated_at', { ascending: false })
              .limit(1),
          ]);
          if (version !== threadVersion) return;
          const noteForm = section.querySelector('[data-home-note-form]');
          const noteMessage = noteForm.querySelector(
            '[data-home-note-message]'
          );
          if (note.error)
            noteMessage.textContent =
              '수업 내용을 불러오지 못했습니다. 수업을 다시 선택해주세요.';
          else {
            noteForm.elements.memo.defaultValue = note.data?.[0]?.memo || '';
            noteForm.elements.memo.value = noteDrafts.has(key)
              ? noteDrafts.get(key).memo
              : noteForm.elements.memo.defaultValue;
            noteForm.elements.memo.disabled = false;
            noteForm.querySelector('[type=submit]').disabled = false;
            noteMessage.textContent = '저장하면 이 수업의 회원에게 보여요.';
          }
          if (discussion.error) throw discussion.error;
          list.innerHTML = window.lessonThreads.render(
            discussion.data || [],
            key
          );
          section.dataset.loaded = 'true';
        } catch (error) {
          if (version !== threadVersion) return;
          list.textContent = `댓글을 불러오지 못했습니다. ${error.message}`;
        }
      })
    );
  }
  $('homeCommentThreadSelect').addEventListener('change', renderSelectedThread);
  $('homeCommentList').addEventListener('input', (event) => {
    const form = event.target.closest('[data-home-note-form]');
    if (!form) return;
    if (form.elements.memo.value === form.elements.memo.defaultValue)
      noteDrafts.delete(form.dataset.homeNoteForm);
    else
      noteDrafts.set(form.dataset.homeNoteForm, {
        memo: form.elements.memo.value,
      });
  });
  $('homeCommentList').addEventListener('submit', async (event) => {
    const noteForm = event.target.closest('[data-home-note-form]');
    if (noteForm) {
      event.preventDefault();
      const button = noteForm.querySelector('[type=submit]');
      if (button.disabled) return;
      const c = threads.find(
        (c) => threadKey(c) === noteForm.dataset.homeNoteForm
      );
      if (!c) return;
      const message = noteForm.querySelector('[data-home-note-message]');
      button.disabled = true;
      message.textContent = '저장 중입니다.';
      try {
        const memo = noteForm.elements.memo.value.trim();
        const { data: existing, error: readError } = await client
          .from('lessons')
          .select('id')
          .eq('lesson_type', c.lesson_type)
          .eq('lesson_date', c.lesson_date)
          .eq('lesson_time', c.lesson_time);
        if (readError) throw readError;
        if (!existing?.length && !memo)
          throw Error('수업 내용을 입력해주세요.');
        if (existing?.length) {
          const { error } = await client
            .from('lessons')
            .update({
              memo: memo || null,
              updated_at: new Date().toISOString(),
            })
            .in(
              'id',
              existing.map((r) => r.id)
            );
          if (error) throw error;
        } else {
          const lesson = monthLessons.find(
            (row) =>
              threadKey({
                lesson_type: row.type,
                lesson_date: row.date,
                lesson_time: row.time,
              }) === threadKey(c)
          );
          if (!lesson)
            throw Error(
              '등록된 수업 정보를 찾지 못했습니다. 수업관리에서 먼저 수업을 추가해주세요.'
            );
          const memberIds =
            c.lesson_type === 'group'
              ? [null]
              : (lesson.memberIds?.length
                  ? lesson.memberIds
                  : [lesson.memberId]
                ).filter(Boolean);
          if (!memberIds.length)
            throw Error(
              '회원 연결 정보를 찾지 못했습니다. 수업관리에서 확인해주세요.'
            );
          const payload = memberIds.map((memberId) => ({
            member_id: memberId,
            lesson_date: c.lesson_date,
            lesson_time: c.lesson_time,
            lesson_type: c.lesson_type,
            title:
              lesson.title ||
              { group: '단체수업', personal: '개인레슨', makeup: '보강' }[
                c.lesson_type
              ],
            status: 'scheduled',
            source:
              lesson.source ||
              {
                group: 'recurring',
                personal: 'personal',
                makeup: 'makeup-request',
              }[c.lesson_type],
            memo: memo || null,
          }));
          const { error } = await client.from('lessons').insert(payload);
          if (error) throw error;
        }
        noteDrafts.delete(noteForm.dataset.homeNoteForm);
        noteForm.elements.memo.defaultValue = memo;
        message.textContent = '수업 내용을 저장했습니다.';
      } catch (error) {
        message.textContent = `저장하지 못했습니다. ${error.message}`;
      } finally {
        button.disabled = false;
      }
      return;
    }
    const form = event.target.closest('[data-lesson-comment-form]');
    if (!form) return;
    event.preventDefault();
    const c = threads.find(
      (c) => threadKey(c) === form.dataset.lessonCommentForm
    );
    const body = form.elements.comment.value.trim();
    const button = form.querySelector('[type=submit]');
    if (!c || !body || button.disabled) return;
    const message = form.querySelector('.home-thread-message');
    button.disabled = true;
    message.textContent = '등록 중입니다.';
    try {
      const { error } = await client.rpc('add_member_lesson_comment', {
        p_lesson_type: c.lesson_type,
        p_lesson_date: c.lesson_date,
        p_lesson_time: c.lesson_time,
        p_body: body,
        p_parent_comment_id: form.dataset.replyParent || null,
      });
      if (error) throw error;
      form.reset();
      window.lessonThreads.clear(form);
      if (form.isConnected) {
        await renderSelectedThread();
        const savedMessage = $('homeCommentList').querySelector(
          `[data-lesson-comments="${threadKey(c)}"] .home-thread-message`
        );
        if (savedMessage) savedMessage.textContent = '댓글을 등록했습니다.';
      }
    } catch (error) {
      message.textContent = `등록하지 못했습니다. ${error.message}`;
    } finally {
      button.disabled = false;
    }
  });
  $('homeCommentList').addEventListener('click', async (event) => {
    const button = event.target.closest('[data-comment-delete]');
    if (
      !button ||
      button.disabled ||
      !confirm('댓글을 삭제할까요? 답글은 유지됩니다.')
    )
      return;
    const key = button.dataset.lessonId;
    button.disabled = true;
    try {
      const { error } = await client.rpc('delete_lesson_comment', {
        p_comment_id: button.dataset.commentDelete,
      });
      if (error) throw error;
      await renderSelectedThread();
    } catch (error) {
      button.disabled = false;
      const message = button
        .closest('[data-lesson-comments]')
        ?.querySelector('.home-thread-message');
      if (message)
        message.textContent = `삭제하지 못했습니다. ${error.message}`;
    }
  });
  function renderSchedule(items) {
    const rows = items
      .filter((i) => i.status !== 'deleted')
      .sort((a, b) => a.time.localeCompare(b.time));
    const scheduled = rows.filter((i) => i.status === 'scheduled').length;
    const completed = rows.filter((i) => i.status === 'completed').length;
    $('todayLessonCount').textContent = `${rows.length}건`;
    $(
      'homeScheduleSummary'
    ).textContent = `예정 ${scheduled} · 완료 ${completed}${
      rows.some((i) => i.status === 'cancelled')
        ? ` · 취소 ${rows.filter((i) => i.status === 'cancelled').length}`
        : ''
    }`;
    $('homeTodayLessons').hidden = false;
    $('homeTodayLessons').innerHTML = rows.length
      ? rows
          .map(
            (i) =>
              `<div class="home-day-lesson"><button type="button" data-open-home-thread="${escape(
                threadKey({
                  lesson_type: i.type,
                  lesson_date: i.date,
                  lesson_time: i.time,
                })
              )}" class="home-lesson-item"><span class="home-inline-name">${escape(i.type==='group'?'단체수업':i.title||({personal:'개인레슨',makeup:'보강'}[i.type])||'수업')}</span><time class="home-lesson-time">${escape(i.time)}</time><span class="home-lesson-status ${escape(i.status)}">${statusName[i.status]||'예정'}</span></button></div>`
          )
          .join('')
      : '<p class="home-empty">선택한 날짜에는 수업이 없습니다.<br>달력에서 다른 날짜를 확인할 수 있어요.</p>';
  }
  async function load() {
    if (loading) return;
    loading = true;
    if ($('homeRefresh')) $('homeRefresh').disabled = true;
    $('homeDashboardMessage').hidden = true;
    $('homeTodayDate').textContent = new Intl.DateTimeFormat('ko-KR', {
      month: 'long',
      day: 'numeric',
      weekday: 'long',
    }).format(new Date());
    try {
      if (!client) throw Error('서버 연결이 필요합니다.');
      const { data: auth, error: authError } = await client.auth.getUser();
      if (
        authError ||
        !['ljw022072@gmail.com', 'admin@admins.leeswimlesson.com'].includes(
          String(auth?.user?.email || '').toLowerCase()
        )
      )
        throw Error('관리자 로그인이 필요합니다.');
      const responses = await Promise.allSettled([
        client
          .from('payment_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        client
          .from('makeup_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        client
          .from('makeup_credits')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        client
          .from('signup_requests')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
        client.rpc('get_lesson_comment_notifications'),
        client
          .from('makeup_requests')
          .select(
            'id, member_id, members!makeup_requests_member_id_fkey(name), makeup_slots!makeup_requests_slot_id_fkey(slot_date,slot_time)'
          )
          .eq('status', 'approved'),
        client
          .from('lessons')
          .select(
            'id,member_id,lesson_date,lesson_time,lesson_type,title,status,source'
          )
          .gte('lesson_date', formatDay(calendarMonth))
          .lt(
            'lesson_date',
            formatDay(
              new Date(
                calendarMonth.getFullYear(),
                calendarMonth.getMonth() + 1,
                1
              )
            )
          ),
      ]);
      const [payment, makeup, credits, signup, commentData, approved, saved] =
        responses.map(result);
      const failures = [];
      for (const [id, r, label] of [
        ['homePaymentCount', payment, '입금'],
        ['homeSignupCount', signup, '가입'],
      ]) {
        $(id).textContent = r.error ? '—' : `${r.count || 0}건`;
        if (r.error) failures.push(label);
      }
      $('homeMakeupCount').textContent =
        makeup.error || credits.error
          ? '—'
          : `${(makeup.count || 0) + (credits.count || 0)}건`;
      if (makeup.error || credits.error) failures.push('보강');
      const checkTotal = [payment, makeup, credits, signup].reduce(
        (sum, r) => sum + Number(r.count || 0),
        0
      );
      $('homeChecksCount').textContent = [
        payment,
        makeup,
        credits,
        signup,
      ].some((r) => r.error)
        ? '확인 필요'
        : `${checkTotal}건`;
      if (commentData.error) {
        $('homeCommentCount').textContent = '—';
        $('homeCommentTotal').textContent = '';
        $('homeCommentList').innerHTML =
          '<p class="home-empty">댓글을 불러오지 못했습니다.</p>';
        failures.push('댓글');
      } else {
        comments = commentData.data || [];
      }
      try {
        if (approved.error) throw approved.error;
        if (saved.error) throw saved.error;
        window.makeupCalendarLessons = (approved.data || [])
          .filter((r) => r.makeup_slots)
          .map((r) => ({
            id: r.id,
            memberId: r.member_id,
            date: r.makeup_slots.slot_date,
            time: String(r.makeup_slots.slot_time).slice(0, 5),
            title: r.members?.name || '보강',
            type: 'makeup',
            source: 'makeup-request',
          }));
        const generated = await window.swimAdminSchedule.getMonth(
          calendarMonth.getFullYear(),
          calendarMonth.getMonth()
        );
        const rows = generated.map((i) => ({
          ...i,
          time: String(i.time).slice(0, 5),
        }));
        for (const record of saved.data || []) {
          const time = String(record.lesson_time).slice(0, 5);
          const matching = rows.find(
            (i) =>
              i.date === record.lesson_date &&
              i.type === record.lesson_type &&
              i.time === time &&
              (i.type === 'group' ||
                i.memberId === record.member_id ||
                (i.memberIds || []).includes(record.member_id))
          );
          if (matching) {
            matching.status = record.status;
            if (record.title) matching.title = record.title;
          } else
            rows.push({
              id: record.id,
              date: record.lesson_date,
              time,
              type: record.lesson_type,
              title:
                record.title ||
                { personal: '개인레슨', group: '단체강습', makeup: '보강' }[
                  record.lesson_type
                ],
              status: record.status,
            });
        }
        monthLessons = rows;
        renderCalendar();
      } catch (error) {
        console.warn('달력 수업 조회 실패', error);
        $('todayLessonCount').textContent = '—';
        $('homeScheduleSummary').textContent = '일정을 확인하지 못했습니다.';
        $('homeTodayLessons').innerHTML =
          '<p class="home-empty">수업을 불러오지 못했습니다.<br>새로고침하거나 수업관리에서 확인해주세요.</p>';
        failures.push('수업 달력');
      }
      if (failures.length) {
        $('homeDashboardMessage').hidden = false;
        $('homeDashboardMessage').textContent = `${failures.join(
          ' · '
        )} 정보를 불러오지 못했습니다. 새로고침해주세요.`;
      }
    } catch (error) {
      $('homeDashboardMessage').hidden = false;
      $('homeDashboardMessage').textContent = error.message;
      for (const id of [
        'homePaymentCount',
        'homeMakeupCount',
        'homeSignupCount',
        'homeCommentCount',
        'todayLessonCount',
      ])
        $(id).textContent = '—';
      $('homeScheduleSummary').textContent = '연결 확인이 필요합니다.';
      $('homeTodayLessons').innerHTML =
        '<p class="home-empty">연결 후 새로고침해주세요.</p>';
      $('homeCommentList').innerHTML =
        '<p class="home-empty">연결 후 새로고침해주세요.</p>';
    } finally {
      loading = false;
      if ($('homeRefresh')) $('homeRefresh').disabled = false;
    }
  }
  let managedLesson = null;
  const manageDialog = document.getElementById('homeLessonDialog');
  document
    .getElementById('homeLessonClose')
    .addEventListener('click', () => manageDialog.close());
  document
    .getElementById('homeLessonForm')
    .addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!managedLesson) return;
      const button = document.getElementById('homeLessonSave');
      button.disabled = true;
      const message = document.getElementById('homeLessonMessage');
      message.textContent = '저장 중입니다.';
      try {
        if (document.getElementById('homeMoveFields').hidden) {
          await window.swimAdminSchedule.setStatus(
            managedLesson,
            document.getElementById('homeLessonStatus').value
          );
        } else {
          const date = document.getElementById('homeMoveDate').value,
            time = document.getElementById('homeMoveTime').value;
          const month = new Date(`${date}T00:00:00`);
          const items = await window.swimAdminSchedule.getMonth(
            month.getFullYear(),
            month.getMonth()
          );
          if (
            (date !== managedLesson.date || time !== managedLesson.time) &&
            items.some(
              (item) =>
                item.date === date &&
                String(item.time).slice(0, 5) === time &&
                !['cancelled', 'deleted'].includes(item.status)
            )
          )
            throw Error('해당 시간에 다른 수업이 있습니다.');
          const ids = managedLesson.memberIds?.length
            ? managedLesson.memberIds
            : [managedLesson.memberId].filter(Boolean);
          if (!ids.length)
            throw Error(
              '연결된 회원을 확인할 수 없습니다. 수업관리에서 확인해주세요.'
            );
          const { error } = await client.rpc('move_personal_lesson', {
            p_member_ids: ids,
            p_original_date: managedLesson.originalDate || managedLesson.date,
            p_original_time: managedLesson.originalTime || managedLesson.time,
            p_new_date: date,
            p_new_time: time,
          });
          if (error) throw error;
          selectedDay = date;
          calendarMonth.setTime(
            new Date(`${date.slice(0, 7)}-01T00:00:00`).getTime()
          );
        }
        manageDialog.close();
        await load();
      } catch (error) {
        message.textContent = `저장하지 못했습니다. ${error.message}`;
      } finally {
        button.disabled = false;
      }
    });
  document.addEventListener('click', (event) => {
    const manage = event.target.closest('[data-home-manage]');
    if (manage) {
      managedLesson = monthLessons.find(
        (i) =>
          i.date === selectedDay &&
          ((i.lessonKey || i.id || `${i.type}_${i.time}`) === manage.dataset.homeManage || threadKey({lesson_type:i.type,lesson_date:i.date,lesson_time:i.time}) === manage.dataset.homeManage)
      );
      if (!managedLesson) return;
      const move = manage.dataset.action === 'move';
      document.getElementById('homeLessonDialogTitle').textContent = `${
        managedLesson.time
      } ${managedLesson.title || '수업'}`;
      document.getElementById('homeMoveFields').hidden = !move;
      document.getElementById('homeStatusFields').hidden = move;
      document.getElementById('homeLessonStatus').value =
        managedLesson.status || 'scheduled';
      document.getElementById('homeMoveDate').value = managedLesson.date;
      document.getElementById('homeMoveTime').value = managedLesson.time;
      document.getElementById('homeLessonMessage').textContent = '';
      manageDialog.showModal();
      return;
    }

    const button = event.target.closest('[data-open-home-thread]');
    if (!button) return;
    const selectedLesson = monthLessons.find(i => threadKey({lesson_type:i.type,lesson_date:i.date,lesson_time:i.time}) === button.dataset.openHomeThread);
    showGroupWorkout(selectedLesson?.type || classFilter);
    $('homeCommentThreadSelect').value = button.dataset.openHomeThread;
    if (!$('homeDiscussionDialog').open) $('homeDiscussionDialog').showModal();
    renderSelectedThread();
  });
  $('homeDiscussionClose').addEventListener('click', () => $('homeDiscussionDialog').close());
  $('homeRefresh')?.addEventListener('click', load);

  window.addEventListener('focus', () => {
    if (
      ![...$('homeCommentList').querySelectorAll('[name=comment]')].some(
        (field) => field.value.trim()
      ) &&
      !noteDrafts.size
    )
      load();
  });
  load();
});
