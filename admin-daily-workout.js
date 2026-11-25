/* Date-level workout editor, independent of lesson notes and comment threads. */
document.addEventListener('DOMContentLoaded', () => {
  const panel=document.getElementById('homeDailyWorkout');
  const form=document.getElementById('homeWorkoutForm');
  const editor=document.getElementById('homeWorkoutEditor');
  const message=document.getElementById('homeWorkoutMessage');
  const savedView=document.getElementById('homeWorkoutSavedView');
  function renderSaved(plan){savedView.innerHTML=window.workoutPlan.render(plan)||'<p class="home-empty">아직 저장된 운동량이 없어요. 아래에서 작성해주세요.</p>';}
  const button=form?.querySelector('[type=submit]');
  if(!panel||!form)return;
  // Validate the saved rows in JS; hidden distance fields and unused blank rows
  // must not silently block the browser's submit event.
  form.noValidate=true;
  const drafts=new Map();
  const saved=new Map();
  const status=document.getElementById('homeWorkoutStatus');
  const written=new Set();
  let monthVersion=0;
  function showStatus(label,kind){status.textContent=label;status.dataset.state=kind;}
  function updateStatus(){
    if(drafts.has(day))showStatus('저장 안 됨','dirty');
    else showStatus(saved.get(day)?.rows?.length?'작성 완료':'미작성',saved.get(day)?.rows?.length?'saved':'empty');
  }
  function markCalendar(){
    for(const cell of document.querySelectorAll('[data-admin-calendar-date]')){
      cell.querySelector('.admin-workout-mark')?.remove();
      const date=cell.dataset.adminCalendarDate;
      const dirty=drafts.has(date);
      if(written.has(date)||dirty){
        const mark=document.createElement('small');mark.className='admin-workout-mark';
        mark.textContent=dirty?'수정 중':'✓ 운동량';mark.dataset.state=dirty?'dirty':'saved';
        cell.appendChild(mark);
      }
    }
  }
  async function loadMonth(date){
    markCalendar();const current=++monthVersion;
    const start=date.slice(0,7)+'-01';
    const [y,m]=date.split('-').map(Number);
    const next=new Date(y,m,1),end=`${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-01`;
    try{
      const {data,error}=await window.swimDb.client.from('daily_workouts').select('workout_date,workout_plan').gte('workout_date',start).lt('workout_date',end);
      if(current!==monthVersion)return;
      if(error)throw error;
      for(const day of [...written])if(day>=start&&day<end)written.delete(day);
      for(const row of data||[])if(row.workout_plan?.rows?.length)written.add(row.workout_date);
      markCalendar();
    }catch(error){if(current===monthVersion)message.textContent=`달력의 운동량 작성 여부를 확인하지 못했습니다. ${error.message}`;}
  }
  let day='',version=0,ready=false;
  async function showDate(date){
    day=date;const current=++version;ready=false;button.disabled=true;
    document.getElementById('homeWorkoutDate').textContent=date;
    showStatus('확인 중','loading');
    savedView.textContent='운동량을 불러오는 중입니다.';
    editor.innerHTML='';message.textContent='운동량을 불러오는 중입니다.';
    try{
      if(!window.swimDb?.client)throw Error('서버 연결을 확인해주세요.');
      const {data,error}=await window.swimDb.client.from('daily_workouts').select('workout_plan').eq('workout_date',date).limit(1);
      if(current!==version)return;
      if(error)throw error;
      saved.set(date,data?.[0]?.workout_plan||null);
      renderSaved(saved.get(date));
      window.workoutPlan.mount(editor,drafts.has(date)?drafts.get(date):data?.[0]?.workout_plan);
      ready=true;button.disabled=false;updateStatus();
      message.textContent='선택한 날짜의 공통 운동량이에요. 수업 내용·댓글은 아래에서 따로 작성하세요.';
    }catch(error){if(current===version){showStatus('확인 실패','error');savedView.textContent='운동량을 불러오지 못했습니다. 날짜를 다시 선택해주세요.';message.textContent=`불러오지 못했습니다. ${error.message}`;}}
  }
  window.addEventListener('swim-admin-date',event=>{if(day!==event.detail)showDate(event.detail);loadMonth(event.detail);});
  editor.addEventListener('input',()=>{if(!ready)return;const plan=window.workoutPlan.read(editor);if(window.workoutPlan.signature(plan)===window.workoutPlan.signature(saved.get(day)))drafts.delete(day);else drafts.set(day,plan);updateStatus();markCalendar();});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||button.disabled)return;
    const savingDay=day,current=version;
    button.disabled=true;showStatus('저장 중','loading');message.textContent='저장 중입니다.';
    try{
      const plan=window.workoutPlan.read(editor,true);
      const {error}=await window.swimDb.client.from('daily_workouts').upsert({workout_date:savingDay,workout_plan:plan,distance_meters:plan?window.workoutPlan.total(plan):0,updated_at:new Date().toISOString()},{onConflict:'workout_date'});
      if(error)throw error;
      drafts.delete(savingDay);saved.set(savingDay,plan);
      if(plan?.rows?.length)written.add(savingDay);else written.delete(savingDay);
      markCalendar();
      if(current===version){updateStatus();renderSaved(plan);}
      if(current===version)message.textContent='운동량을 저장했습니다.';
    }catch(error){if(current===version){showStatus('저장 실패','error');message.textContent=`저장하지 못했습니다. ${error.message}`;}}
    finally{if(current===version)button.disabled=false;}
  });
});
