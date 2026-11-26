document.addEventListener('DOMContentLoaded', () => {
  const client = window.swimDb?.client;
  try{const session=JSON.parse(sessionStorage.getItem('loginSession')||localStorage.getItem('loginSession')||'{}');if(session.role!=='member'){const back=document.getElementById('overviewReturn');back.href='home.html';back.textContent='관리자 홈';}}catch(error){}
  const select = document.getElementById('testMemberSelect');
  const message = document.getElementById('testViewMessage');
  const details = document.getElementById('testMemberDetails');
  const retry = document.getElementById('testViewRetry');
  const escape = (v) => String(v ?? '—').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const money = (v) => `${Number(v || 0).toLocaleString('ko-KR')}원`;
  const card = (title, body) => `<section class="member-card test-view-card"><h2>${escape(title)}</h2>${body}</section>`;
  const rows = (data, render) => data.length ? data.map(render).join('') : '<p class="test-view-help">등록된 내역이 없습니다.</p>';
  let version = 0;
  async function load(memberId = null) {
    const request = ++version;
    select.disabled = true; details.innerHTML = ''; retry.hidden = true;
    message.textContent = '회원 자료를 불러오는 중입니다.';
    try {
      if (!client) throw new Error('서버 연결이 필요합니다.');
      const {data, error} = await client.rpc('get_test_member_overview', {p_member_id:memberId});
      if (request !== version) return;
      if (error) throw error;
      const {data:daily,error:dailyError}=await client.from('daily_workouts').select('workout_date,workout_plan');
      if(request!==version)return;
      if(dailyError)throw dailyError;
      const plans=new Map((daily||[]).map(r=>[r.workout_date,r.workout_plan]));
      const m = data.member;
      select.innerHTML = data.members.map(v => `<option value="${escape(v.id)}">${escape(v.name)}</option>`).join('');
      select.value = m.id;
      details.innerHTML = card('회원 정보', `<dl>${[
        ['이름',m.name],['전화번호',m.phone],['상태',m.status],['수업',m.lesson_format],['요일',(m.days||[]).join(' · ')],['시간',m.lesson_time],['등록 / 진행',`${m.total_lessons} / ${m.used_lessons}회`],['입금 상태',m.payment_status],['입금일',m.payment_date],['수강료',money(m.payment_amount)],['메모',m.memo],
      ].map(([k,v]) => `<div><dt>${escape(k)}</dt><dd>${escape(v)}</dd></div>`).join('')}</dl>`)
      + card('수업 기록 · 단체수업은 공통 기록', rows(data.lessons, l => `<details class="test-view-row"><summary>${escape(l.lesson_date)} ${escape(String(l.lesson_time).slice(0,5))} · ${escape(l.title||l.lesson_type)} · ${escape(({completed:'완료',scheduled:'예정',cancelled:'취소',deleted:'삭제'})[l.status]||l.status)}</summary><p>${escape(l.memo || '수업 내용 없음')}</p>${l.lesson_type==='personal'?'':window.workoutPlan.render(plans.get(l.lesson_date))}<div class="test-view-comments">${window.lessonThreads.render(data.comments.filter(c=>c.lesson_type===l.lesson_type&&c.lesson_date===l.lesson_date&&c.lesson_time===l.lesson_time).map(c=>({...c,is_mine:false,is_deleted:Boolean(c.deleted_at)})), l.id)}</div></details>`))
      + card('입금 알림', rows(data.payments, p => `<p class="test-view-row">${escape(p.payment_date)} · ${money(p.payment_amount)} · ${p.status==='confirmed'?'확인 완료':'확인 대기'}</p>`))
      + card('개인레슨 보고', rows(data.reports, r=>`<p class="test-view-row">${escape(r.reported_at)} 보고 · ${money(r.payment_amount)}<br>입금일 ${escape(r.payment_date)}</p>`))
      + card('수영 기록', rows(data.freeSwims, f=>`<p class="test-view-row">${escape(f.swim_date)} · 오수완${f.distance_meters ? ' · '+Number(f.distance_meters).toLocaleString('ko-KR')+'m' : ''}</p>`));
      message.textContent = `${m.name} 회원 · 조회 전용`;
      select.disabled = false;
    } catch (error) {
      if (request !== version) return;
      message.textContent = `불러오지 못했습니다. ${error.message} (기본 DB 스키마 SQL 적용과 계정 권한을 확인해주세요.)`;
      retry.hidden = false;
    }
  }
  select.addEventListener('change',()=>load(select.value));
  retry.addEventListener('click',()=>load(select.value||null));
  load();
});
