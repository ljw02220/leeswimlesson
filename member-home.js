document.addEventListener('DOMContentLoaded', async () => {
  const portal = window.memberPortal;
  let allUpcomingLessons = [];
  let allCompletedLessons = [];
  let calendarLessons = [];
  let calendarMember = null;
  let freeSwimDates = new Set();
  let swimDistances = new Map();
  let classDistances = new Map();
  let participationDates = new Set();
  let participationBusy = false;
  const participationStartsOn = '2026-11-24';
  const countsWorkout = day => day < participationStartsOn || participationDates.has(day);
  let freeSwimBusy = false;
  let freeSwimError = '';
  let freeSwimLoadVersion = 0;

  async function loadFreeSwims() {
    const version = ++freeSwimLoadVersion;
    freeSwimDates = new Set();
    swimDistances = new Map();
    classDistances = new Map();
    participationDates = new Set();
    freeSwimError = '';
    freeSwimBusy = true;
    renderFreeSwimControl();
    const start = dateKey(calendarMonth);
    const end = dateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1));
    try {
      if (!calendarMember || !window.swimDb?.client) throw new Error('연결이 필요합니다.');
      const [free,classResult,dailyResult,participationResult] = await Promise.all([
        window.swimDb.client.from('member_free_swims').select('swim_date,distance_meters').eq('member_id',calendarMember.id).gte('swim_date',start).lt('swim_date',end),
        window.swimDb.client.from('lessons').select('id,member_id,lesson_date,lesson_time,lesson_type,status,swim_distance_meters,updated_at').gte('lesson_date',start).lt('lesson_date',end).order('updated_at',{ascending:false}),
        window.swimDb.client.from('daily_workouts').select('workout_date,distance_meters').gte('workout_date',start).lt('workout_date',end),
        window.swimDb.client.from('member_workout_participations').select('workout_date').eq('member_id',calendarMember.id).gte('workout_date',start).lt('workout_date',end),
      ]);
      if(participationResult.error)throw participationResult.error;
      if(dailyResult.error)throw dailyResult.error;
      if(free.error)throw free.error;if(classResult.error)throw classResult.error;
      if(version!==freeSwimLoadVersion)return;
      freeSwimDates=new Set((free.data||[]).map(row=>row.swim_date));
      swimDistances=new Map((free.data||[]).map(row=>[row.swim_date,row.distance_meters]));
      participationDates=new Set((participationResult.data||[]).map(r=>r.workout_date));
      const dailyDistances=new Map((dailyResult.data||[]).map(r=>[r.workout_date,Number(r.distance_meters)||0]));
      const slots=new Set();
      for(const row of classResult.data||[]){
        if(row.lesson_date>dateKey(new Date())||row.lesson_type==='personal'||!countsWorkout(row.lesson_date)||dailyDistances.has(row.lesson_date))continue;
        const day=new Date(`${row.lesson_date}T00:00:00`).getDay();
        const belongs=row.lesson_type==='group'
          ? (calendarMember.group_lessons||[]).some(g=>Number(g.day)===day&&String(g.time).slice(0,5)===String(row.lesson_time).slice(0,5))
          : row.member_id===calendarMember.id;
        if(!belongs)continue;
        const key=`${row.lesson_type}_${row.lesson_date}_${String(row.lesson_time).slice(0,5)}`;
        if(slots.has(key))continue;slots.add(key);
        if(['cancelled','deleted'].includes(row.status)||!Number(row.swim_distance_meters))continue;
        classDistances.set(row.lesson_date,(classDistances.get(row.lesson_date)||0)+Number(row.swim_distance_meters));
      }
      // One shared workout per attended/scheduled day, even with several lesson slots.
      for(const [day,meters] of dailyDistances){
        if(day>dateKey(new Date())||!countsWorkout(day))continue;
        if(calendarLessons.some(l=>l.date===day&&l.type!=='personal'&&!['cancelled','deleted'].includes(l.status)))classDistances.set(day,meters);
      }
    } catch (error) {
      if (version !== freeSwimLoadVersion) return;
      freeSwimError = '자유수영 기록을 불러오지 못했습니다. 다시 시도해주세요.';
      console.warn('자유수영 조회 실패: 01-base-schema.sql 적용 여부를 확인하세요.', error);
    } finally {
      if (version === freeSwimLoadVersion) {
        freeSwimBusy = false;
        renderHomeCalendar();
      }
    }
  }

  function renderFreeSwimControl() {
    const button = document.getElementById('freeSwimToggle');
    if (!button) return;
    const checked = freeSwimDates.has(selectedDate);
    const future = selectedDate > dateKey(new Date());
    button.textContent = freeSwimBusy ? '확인 중…' : checked ? '자유수영 기록 삭제' : '거리 없이 오수완만 찍기';
    button.setAttribute('aria-pressed', String(checked));
    button.disabled = freeSwimBusy || future || !calendarMember || Boolean(freeSwimError);
    document.getElementById('freeSwimMessage').textContent = freeSwimError || (future ? '자유수영을 다녀온 뒤 기록해주세요.' : checked ? '수업 전후에 따로 수영한 거리도 자유수영에 기록해주세요.' : '수영거리는 수업 횟수와 별도로 기록돼요.');
    document.getElementById('freeSwimRetry').hidden = !freeSwimError;
    document.getElementById('swimDistanceSave').disabled=button.disabled;
    document.getElementById('swimDistanceInput').disabled=button.disabled;
    setText('memberSwimMonthLabel',`${calendarMonth.getMonth()+1}월 수영거리`);
    const freeTotal=[...swimDistances.values()].reduce((sum,value)=>sum+Number(value||0),0);
    const classTotal=[...classDistances.values()].reduce((sum,value)=>sum+Number(value||0),0);
    setText('memberSwimMonthTotal',freeSwimBusy?'확인 중…':freeSwimError?'—':`합계 ${(freeTotal+classTotal).toLocaleString('ko-KR')}m`);
    const breakdown=(lesson,free)=>`<span class="swim-kind swim-kind-lesson">수업 ${lesson.toLocaleString('ko-KR')}m</span><span class="swim-kind swim-kind-free">자유수영 ${free.toLocaleString('ko-KR')}m</span>`;
    document.getElementById('memberSwimMonthDays').innerHTML=freeSwimError?'기록을 불러오지 못했습니다.':breakdown(classTotal,freeTotal);
    const dayClass=Number(classDistances.get(selectedDate)||0),dayFree=Number(swimDistances.get(selectedDate)||0);
    document.getElementById('swimClassDistance').innerHTML=freeSwimError?'기록을 불러오지 못했습니다.':`${breakdown(dayClass,dayFree)}<strong class="swim-day-total">합계 ${(dayClass+dayFree).toLocaleString('ko-KR')}m</strong>`;
    const dailySummary=document.getElementById('memberSelectedDistance');
    if(dailySummary)dailySummary.innerHTML=freeSwimBusy?'확인 중…':freeSwimError?'거리를 불러오지 못했습니다.':`<span class="swim-kind swim-kind-lesson">수업 운동량 ${dayClass.toLocaleString('ko-KR')}m</span><span class="swim-kind swim-kind-free">자유수영 ${dayFree.toLocaleString('ko-KR')}m</span><strong>총 ${(dayClass+dayFree).toLocaleString('ko-KR')}m</strong>`;
  }

  document.getElementById('swimDistanceForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(freeSwimBusy||freeSwimError||!calendarMember||selectedDate>dateKey(new Date()))return;
    const distance=Number(document.getElementById('swimDistanceInput').value);
    const message=document.getElementById('swimDistanceMessage');
    if(!Number.isInteger(distance)||distance<=0||distance>2147483647){message.textContent='수영거리를 1m 이상 정수로 입력해주세요.';return;}
    const day=selectedDate;freeSwimBusy=true;renderFreeSwimControl();message.textContent='저장 중입니다.';
    try{
      const {error}=await window.swimDb.client.from('member_free_swims').upsert({member_id:calendarMember.id,swim_date:day,distance_meters:distance},{onConflict:'member_id,swim_date'});
      if(error)throw error;
      await loadFreeSwims();
      if(freeSwimError)throw Error('저장 후 기록을 다시 불러오지 못했습니다.');
      document.getElementById('freeSwimDialog').close();
    }catch(error){freeSwimBusy=false;renderFreeSwimControl();message.textContent=error.message||'저장하지 못했습니다. 다시 시도해주세요.';}
  });
  document.getElementById('freeSwimRetry')?.addEventListener('click', loadFreeSwims);
  document.getElementById('freeSwimToggle')?.addEventListener('click', async () => {
    if (freeSwimBusy || !calendarMember || selectedDate > dateKey(new Date())) return;
    const day = selectedDate;
    const recorded = freeSwimDates.has(day);
    freeSwimBusy = true;
    renderFreeSwimControl();
    try {
      const table = window.swimDb.client.from('member_free_swims');
      const {error} = recorded
        ? await table.delete().eq('member_id', calendarMember.id).eq('swim_date', day)
        : await table.upsert({member_id: calendarMember.id, swim_date: day}, {onConflict:'member_id,swim_date', ignoreDuplicates:true});
      if (error) throw error;
      await loadFreeSwims();
      document.getElementById('freeSwimDialog')?.close();
    } catch (error) {
      freeSwimBusy = false;
      renderFreeSwimControl();
      document.getElementById('freeSwimMessage').textContent = '저장하지 못했습니다. 잠시 후 다시 눌러주세요.';
      console.warn('자유수영 저장 실패', error);
    }
  });
  const calendarMonth = new Date();
  calendarMonth.setDate(1);
  let selectedDate = dateKey(new Date());
  const requestedDate = new URLSearchParams(window.location.search).get('date');
  if (/^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '')) {
    const date = new Date(`${requestedDate}T00:00:00`);
    if (!Number.isNaN(date.getTime()) && dateKey(date) === requestedDate) {
      selectedDate = requestedDate;
      calendarMonth.setFullYear(date.getFullYear(), date.getMonth(), 1);
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

  async function loadLessonComments(lessonId) {
    const section = document.querySelector(
      `[data-lesson-comments="${lessonId}"]`
    );
    const list = section?.querySelector('.lesson-comments-list');
    if (!section || !list) return;
    if (!window.swimDb?.client) {
      list.textContent = '댓글을 불러오려면 연결이 필요합니다.';
      return;
    }

    const lesson = calendarLessons.find((item) => item.id === lessonId);
    if (!lesson) return;
    const noteElement = section.closest('.home-lesson-discussion')?.querySelector('[data-home-lesson-note]');
    Promise.all([
      window.swimDb.client.from('lessons').select('memo').eq('lesson_type',lesson.type || 'personal').eq('lesson_date',lesson.date).eq('lesson_time',lesson.time).order('updated_at',{ascending:false}).limit(1),
      window.swimDb.client.from('daily_workouts').select('workout_plan').eq('workout_date',lesson.date).limit(1),
    ]).then(([note,daily])=>{
      if(noteElement&&!note.error)noteElement.textContent=note.data?.[0]?.memo || '아직 작성된 수업 내용이 없습니다.';
      const target=section.closest('.home-lesson-discussion')?.querySelector('[data-home-workout]');
      if(target)target.innerHTML=lesson.type==='personal'?'':daily.error?'운동량을 불러오지 못했습니다.':window.workoutPlan.render(daily.data?.[0]?.workout_plan);
    }).catch(()=>{});
    const { data, error } = await window.swimDb.client.rpc('get_member_lesson_thread', {
      p_lesson_type: lesson.type || 'personal', p_lesson_date: lesson.date, p_lesson_time: lesson.time,
    });

    if (error) {
      list.innerHTML = `
        <p class="lesson-comments-error">
          댓글을 불러오지 못했습니다. ${escapeHTML(error.message)}<br>답글 기능을 처음 사용한다면 수업 댓글 SQL 적용을 확인해주세요.
        </p>
      `;
      return;
    }

    list.innerHTML = window.lessonThreads.render(data || [], lessonId);
  }


  const discussionList = document.getElementById('upcomingLessonList');
  discussionList?.addEventListener('click',async event=>{
    const button=event.target.closest('[data-workout-participation]');
    if(!button||button.disabled||participationBusy||!calendarMember)return;
    const day=selectedDate;
    if(day>dateKey(new Date())||day<participationStartsOn)return;
    participationBusy=true;button.disabled=true;
    try{
      const removing=participationDates.has(day);
      for(let attempt=0;attempt<2;attempt++){
        try {
          const table=window.swimDb.client.from('member_workout_participations');
          const result=removing
            ? await table.delete().eq('member_id',calendarMember.id).eq('workout_date',day)
            : await table.upsert({member_id:calendarMember.id,workout_date:day},{onConflict:'member_id,workout_date',ignoreDuplicates:true});
          if(result.error)throw result.error;
          break;
        }catch(error){
          if(attempt===1||!/failed to fetch|networkerror|load failed|network request failed/i.test(error.message||''))throw error;
        }
      }
      await loadFreeSwims();
    }catch(error){const message=discussionList.querySelector('[data-participation-message]');if(message)message.textContent=/failed to fetch|networkerror|load failed/i.test(error.message||'')?'서버 연결이 끊겨 참여 여부를 확인하지 못했습니다. 연결을 확인한 뒤 다시 눌러주세요.':`참여 기록을 저장하지 못했습니다. ${error.message}`;}
    finally{participationBusy=false;const current=discussionList.querySelector('[data-workout-participation]');if(current)current.disabled=freeSwimBusy||Boolean(freeSwimError)||selectedDate>dateKey(new Date());}
  });
  discussionList?.addEventListener('submit', async (event) => {
    const form = event.target.closest('[data-lesson-comment-form]');
    if (!form) return;
    event.preventDefault();
    const input = form.elements.comment;
    const body = input.value.trim();
    const button = form.querySelector('button[type="submit"]');
    if (!body || button.disabled) return;
    const message = form.querySelector('.home-comment-message');
    button.disabled = true;
    button.textContent = '등록 중';
    message.textContent = '';
    try {
      if (!window.swimDb?.client) throw new Error('서버 연결을 확인해주세요.');
      const lesson = calendarLessons.find((item) => item.id === form.dataset.lessonCommentForm);
      if (!lesson) throw new Error('수업을 다시 선택해주세요.');
      const { error } = await window.swimDb.client.rpc('add_member_lesson_comment', {
        p_lesson_type: lesson.type || 'personal', p_lesson_date: lesson.date, p_lesson_time: lesson.time,
        p_body: body, p_parent_comment_id: form.dataset.replyParent || null,
      });
      if (error) throw error;
      form.reset();
      window.lessonThreads.clear(form);
      message.textContent = '댓글을 등록했습니다.';
      await loadLessonComments(form.dataset.lessonCommentForm);
    } catch (error) {
      message.textContent = `댓글 등록 실패: ${error.message}`;
    } finally {
      button.disabled = false;
      button.textContent = '등록';
    }
  });
  discussionList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-comment-delete]');
    if (!button || button.disabled || !confirm('작성한 댓글을 삭제할까요?')) return;
    button.disabled = true;
    try {
      const { error } = await window.swimDb.client.rpc('delete_lesson_comment', { p_comment_id: button.dataset.commentDelete });
      if (error) throw error;
      await loadLessonComments(button.dataset.lessonId);
    } catch (error) {
      alert(`댓글을 삭제하지 못했습니다. ${error.message}`);
      button.disabled = false;
    }
  });

  function dateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function renderHomeCalendar() {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const today = dateKey(new Date());
    setText('homeCalendarMonth', `${year}년 ${month + 1}월`);
    const days = new Date(year, month + 1, 0).getDate();
    const offset = new Date(year, month, 1).getDay();
    const cells = Array.from({ length: offset }, () => '<span class="home-calendar-blank" aria-hidden="true"></span>');
    for (let day = 1; day <= days; day++) {
      const key = dateKey(new Date(year, month, day));
      const lessons = calendarLessons.filter((lesson) => lesson.date === key);
      const scheduled = lessons.some((lesson) => lesson.status !== 'completed');
      const completed = lessons.some((lesson) => lesson.status === 'completed');
      const freeSwim = freeSwimDates.has(key)||Number(classDistances.get(key)||0)>0;
      const distance = Number(swimDistances.get(key)||0)+Number(classDistances.get(key)||0);
      cells.push(`<button type="button" data-home-calendar-date="${key}" class="home-calendar-day${key === selectedDate ? ' selected' : ''}${key === today ? ' today' : ''}" aria-pressed="${key === selectedDate}" ${key === today ? 'aria-current="date"' : ''} aria-label="${month + 1}월 ${day}일, 수업 ${lessons.length}건${freeSwim ? ", 오수완" : ""}${distance ? `, ${distance}미터` : ""}"><span>${day}</span><span class="home-calendar-dots" aria-hidden="true">${scheduled ? '<i></i>' : ''}${completed ? '<i class="completed"></i>' : ''}</span>${freeSwim ? '<span class="home-swim-stamp" aria-hidden="true">오수완</span>' : ''}${distance ? `<small class="home-swim-distance">${Number(classDistances.get(key)||0)>0?'<i class="swim-meter-dot swim-meter-lesson"></i>':''}${Number(swimDistances.get(key)||0)>0?'<i class="swim-meter-dot swim-meter-free"></i>':''}${distance.toLocaleString('ko-KR')}m</small>` : ''}</button>`);
    }
    document.getElementById('homeCalendarGrid').innerHTML = cells.join('');
    setText('homeCalendarSelectedDate', portal.formatDateWithDay(selectedDate));
    renderFreeSwimControl();
    const selected = calendarLessons.filter((lesson) => lesson.date === selectedDate).sort((a, b) => String(a.time).localeCompare(String(b.time)));
    const container = document.getElementById('upcomingLessonList');
    const eligible=selected.some(l=>l.type!=='personal'&&!['cancelled','deleted'].includes(l.status));
    const participation=eligible&&selectedDate<participationStartsOn?'<p class="member-lesson-context">이전 수업 운동량은 자동으로 합산돼요.</p>':eligible?`<div class="member-participation"><button type="button" data-workout-participation aria-pressed="${participationDates.has(selectedDate)}" ${freeSwimBusy||participationBusy||freeSwimError||selectedDate>dateKey(new Date())?'disabled':''}>${participationDates.has(selectedDate)?'참여 완료 · 취소':'완료(참여)'}</button><small>참여를 누르면 오늘 운동량이 내 수영거리에 더해져요.</small><p data-participation-message role="status"></p></div>`:'';
    container.innerHTML = participation + (selected.length ? selected.map((lesson) => `
      <section class="home-lesson-discussion">
        ${selected.length>1?`<p class="member-lesson-context">${escapeHTML(portal.formatLessonTime(lesson.time))} · ${escapeHTML(formatLessonTitle(lesson.title))}</p>`:''}
        ${`
          <div class="home-lesson-note"><strong>수업 내용</strong><p data-home-lesson-note>${escapeHTML(lesson.status === 'completed' ? lesson.memo || '아직 작성된 수업 내용이 없습니다.' : '아직 작성된 수업 내용이 없습니다.')}</p></div>
          <div data-home-workout></div>
          <section class="lesson-comments" data-lesson-comments="${escapeHTML(lesson.id)}">
            <div class="lesson-comments-heading"><strong>수업 댓글</strong><span>함께 수업한 회원에게도 보여요.</span></div>
            <div class="lesson-comments-list" aria-live="polite"><p>댓글을 불러오는 중입니다.</p></div>
            <form class="lesson-comment-form" data-lesson-comment-form="${escapeHTML(lesson.id)}">
              <label class="home-comment-label">댓글 작성<input type="text" name="comment" maxlength="500" placeholder="궁금한 점이나 수업 후기를 남겨주세요." required /></label>
              <button type="submit">등록</button>
              <p class="home-comment-message" role="status"></p>
            </form>
          </section>`}
      </section>`).join('') : '<p class="member-empty">이날은 등록된 수업이 없습니다.</p>');
    for (const lesson of selected) {
      loadLessonComments(lesson.id);
    }
  }

  const homeCalendar = document.getElementById('homeCalendarGrid');
  const freeSwimDialog = document.getElementById('freeSwimDialog');
  let pressTimer = null;
  let pressStart = null;
  let suppressCalendarClickUntil = 0;
  function cancelCalendarPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressStart = null;
  }
  function openFreeSwimMenu(day) {
    selectedDate = day;
    renderHomeCalendar();
    setText('freeSwimDialogDate', portal.formatDateWithDay(day));
    document.getElementById('swimDistanceInput').value=swimDistances.get(day)||'';
    document.getElementById('swimDistanceMessage').textContent=day>dateKey(new Date())?'수영을 다녀온 뒤 기록해주세요.':'수업 전후에 따로 수영한 거리를 입력하세요. 수업과 자동으로 합산돼요.';
    if (!freeSwimDialog.open) freeSwimDialog.showModal();
  }
  homeCalendar?.addEventListener('pointerdown', (event) => {
    cancelCalendarPress();
    const button = event.target.closest('[data-home-calendar-date]');
    if (!button || !event.isPrimary || event.button !== 0) return;
    pressStart = {x:event.clientX, y:event.clientY, pointerId:event.pointerId};
    const day = button.dataset.homeCalendarDate;
    pressTimer = setTimeout(() => {
      cancelCalendarPress();
      suppressCalendarClickUntil = Date.now() + 1000;
      openFreeSwimMenu(day);
    }, 550);
  });
  homeCalendar?.addEventListener('pointermove', (event) => {
    if (pressStart && (Math.abs(event.clientX-pressStart.x)>10 || Math.abs(event.clientY-pressStart.y)>10)) cancelCalendarPress();
  });
  for (const name of ['pointerup','pointercancel','pointerleave']) homeCalendar?.addEventListener(name, cancelCalendarPress);
  window.addEventListener('scroll', cancelCalendarPress, {passive:true,capture:true});
  homeCalendar?.addEventListener('contextmenu', (event) => {
    const button = event.target.closest('[data-home-calendar-date]');
    if (!button) return;
    event.preventDefault();
    cancelCalendarPress();
    suppressCalendarClickUntil = Date.now() + 1000;
    openFreeSwimMenu(button.dataset.homeCalendarDate);
  });
  homeCalendar?.addEventListener('keydown', (event) => {
    const button = event.target.closest('[data-home-calendar-date]');
    if (button && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
      event.preventDefault();
      openFreeSwimMenu(button.dataset.homeCalendarDate);
    }
  });
  document.getElementById('freeSwimDialogClose')?.addEventListener('click', () => freeSwimDialog.close());
  freeSwimDialog?.addEventListener('click', (event) => {
    if (event.target !== freeSwimDialog) return;
    const rect = freeSwimDialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) freeSwimDialog.close();
  });
  freeSwimDialog?.addEventListener('close', () => {
    document.querySelector(`[data-home-calendar-date="${selectedDate}"]`)?.focus();
  });

  document.getElementById('homeCalendarGrid')?.addEventListener('click', (event) => {
    if (event.detail > 0 && Date.now() < suppressCalendarClickUntil) { event.preventDefault(); return; }
    const button = event.target.closest('[data-home-calendar-date]');
    if (!button) return;
    selectedDate = button.dataset.homeCalendarDate;
    renderHomeCalendar();
    document.querySelector(`[data-home-calendar-date="${selectedDate}"]`)?.focus();
  });
  for (const [id, direction] of [['homeCalendarPrevious', -1], ['homeCalendarNext', 1]]) {
    document.getElementById(id)?.addEventListener('click', () => {
      calendarMonth.setMonth(calendarMonth.getMonth() + direction);
      selectedDate = dateKey(calendarMonth);
      renderHomeCalendar();
      loadFreeSwims();
    });
  }
  document.getElementById('homeCalendarToday')?.addEventListener('click', () => {
    const today = new Date();
    calendarMonth.setFullYear(today.getFullYear(), today.getMonth(), 1);
    selectedDate = dateKey(today);
    renderHomeCalendar();
    loadFreeSwims();
  });

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
          <a class="member-comment-link" href="member-lessons.html?view=completed&amp;lesson=${encodeURIComponent(lesson.id)}">수업 내용 · 댓글 보기 →</a>
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
    const { member, user } = await portal.loadCurrentMember();
    calendarMember = member;
    window.swimDb?.client?.rpc('can_view_test_members').then(({data}) => {
      if (data === true) document.getElementById('testAccountLink').hidden = false;
    }).catch(() => {});

    const remaining = portal.getRemainingLessons(member);
    const personalRemaining = document.getElementById('personalLessonRemaining');
    if (personalRemaining) {
      const format = String(member.lesson_format || '').trim();
      const hasPersonalLessons = Number(member.total_lessons || 0) > 0
        && !/단체|group/i.test(format);
      personalRemaining.hidden = !hasPersonalLessons;
    }

    const approvedMakeupLessons = await portal.getApprovedMakeupLessons(member);

    const futureLessons = [
      ...(await portal.getUpcomingLessons(member, 100)),
      ...approvedMakeupLessons,
    ];
    allUpcomingLessons = getLessonsWithinOneMonth(futureLessons).sort((a, b) =>
      `${a.date}_${a.time}`.localeCompare(`${b.date}_${b.time}`)
    );

    const upcomingLessons = allUpcomingLessons.slice(0, 2);

    allCompletedLessons = await portal.getCompletedLessons(member, 100);
    const uniqueLessons = new Map();
    for (const lesson of [...futureLessons, ...allCompletedLessons]) {
      uniqueLessons.set(`${lesson.id}_${lesson.date}_${lesson.time}`, lesson);
    }
    calendarLessons = Array.from(uniqueLessons.values());
    const completedLessons = allCompletedLessons.filter((lesson) => String(lesson.memo || '').trim()).slice(0, 1);

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

    renderHomeCalendar();
    loadFreeSwims();

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
