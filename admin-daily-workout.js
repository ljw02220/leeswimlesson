/* Date-level workout editor, independent of lesson notes and comment threads. */
document.addEventListener('DOMContentLoaded', () => {
  const panel=document.getElementById('homeDailyWorkout');
  const form=document.getElementById('homeWorkoutForm');
  const editor=document.getElementById('homeWorkoutEditor');
  const message=document.getElementById('homeWorkoutMessage');
  const button=form?.querySelector('[type=submit]');
  if(!panel||!form)return;
  const drafts=new Map();
  let day='',version=0,ready=false;
  async function showDate(date){
    day=date;const current=++version;ready=false;button.disabled=true;
    document.getElementById('homeWorkoutDate').textContent=date;
    editor.innerHTML='';message.textContent='운동량을 불러오는 중입니다.';
    try{
      if(!window.swimDb?.client)throw Error('서버 연결을 확인해주세요.');
      const {data,error}=await window.swimDb.client.from('daily_workouts').select('workout_plan').eq('workout_date',date).limit(1);
      if(current!==version)return;
      if(error)throw error;
      window.workoutPlan.mount(editor,drafts.has(date)?drafts.get(date):data?.[0]?.workout_plan);
      ready=true;button.disabled=false;
      message.textContent='선택한 날짜의 공통 운동량이에요. 수업 내용·댓글은 아래에서 따로 작성하세요.';
    }catch(error){if(current===version)message.textContent=`불러오지 못했습니다. ${error.message}`;}
  }
  window.addEventListener('swim-admin-date',event=>{if(day!==event.detail)showDate(event.detail);});
  editor.addEventListener('input',()=>{if(ready)drafts.set(day,window.workoutPlan.read(editor));});
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||button.disabled)return;
    const savingDay=day,current=version;
    button.disabled=true;message.textContent='저장 중입니다.';
    try{
      const plan=window.workoutPlan.read(editor,true);
      const {error}=await window.swimDb.client.from('daily_workouts').upsert({workout_date:savingDay,workout_plan:plan,distance_meters:plan?window.workoutPlan.total(plan):0,updated_at:new Date().toISOString()},{onConflict:'workout_date'});
      if(error)throw error;
      drafts.delete(savingDay);
      if(current===version)message.textContent='운동량을 저장했습니다.';
    }catch(error){if(current===version)message.textContent=`저장하지 못했습니다. ${error.message}`;}
    finally{if(current===version)button.disabled=false;}
  });
});
