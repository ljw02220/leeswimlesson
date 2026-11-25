// Personal lesson start/end dates, moved from the member list without changing the date calculation.
(() => {
const HOLIDAY_API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';
const HOLIDAY_SERVICE_KEY = window.SWIM_CONFIG?.HOLIDAY_API_KEY || '';

const HOLIDAY_OVERRIDES = {
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-09': '한글날',
};

const DAY_INDEX_BY_NAME = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};


const holidayCache = {};
function isNewPersonalLessonCycle(member) {
  return Boolean(
    member.lessonStartDate &&
      member.lastLessonDate &&
      member.lessonStartDate > member.lastLessonDate
  );
}

function getEffectiveUsedLessons(member) {
  return isNewPersonalLessonCycle(member)
    ? 0
    : Number(member.usedLessons || 0);
}

function getDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function getNextDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);

  date.setDate(date.getDate() + 1);

  return getDateKey(date);
}

function formatKoreanDate(dateValue) {
  if (!dateValue) {
    return '';
  }

  const date = new Date(`${dateValue}T00:00:00`);

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

async function getHolidays(year, month) {
  const cacheKey = `${year}-${month}`;

  if (holidayCache[cacheKey]) {
    return holidayCache[cacheKey];
  }

  const holidays = {};

  Object.entries(HOLIDAY_OVERRIDES).forEach(([dateKey, name]) => {
    const holidayDate = new Date(`${dateKey}T00:00:00`);

    if (
      holidayDate.getFullYear() === year &&
      holidayDate.getMonth() === month
    ) {
      holidays[dateKey] = name;
    }
  });

  if (!HOLIDAY_SERVICE_KEY) {
    holidayCache[cacheKey] = holidays;

    return holidays;
  }

  const formattedMonth = String(month + 1).padStart(2, '0');
  const url =
    `${HOLIDAY_API_URL}/getRestDeInfo` +
    `?ServiceKey=${HOLIDAY_SERVICE_KEY}` +
    `&solYear=${year}` +
    `&solMonth=${formattedMonth}` +
    `&numOfRows=50`;

  try {
    const response = await fetch(url);
    const text = await response.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const items = xml.querySelectorAll('item');

    items.forEach((item) => {
      const date = item.querySelector('locdate')?.textContent;
      const name = item.querySelector('dateName')?.textContent;

      if (!date) {
        return;
      }

      const dateKey = [
        date.slice(0, 4),
        date.slice(4, 6),
        date.slice(6, 8),
      ].join('-');

      holidays[dateKey] = name || '공휴일';
    });
  } catch (error) {
    console.error('공휴일 정보를 불러오지 못했습니다.', error);
  }

  holidayCache[cacheKey] = holidays;

  return holidays;
}

async function getPersonalLessonDates(member,moves=[],states=new Map()) {
  const totalLessons = Number(member.totalLessons || 0);
  const usedLessons = Math.min(
    getEffectiveUsedLessons(member),
    totalLessons
  );
  const remainingLessons = Math.max(totalLessons - usedLessons, 0);
  const startDate =
    (usedLessons > 0 && member.lastLessonDate
      ? getNextDateKey(member.lastLessonDate)
      : member.lessonStartDate) ||
    member.lastLessonDate ||
    '';
  const lessonDays = Array.isArray(member.days) ? member.days : [];
  const dayIndexes = lessonDays
    .map((day) => DAY_INDEX_BY_NAME[day])
    .filter((day) => day !== undefined);
  const lessonDates = [];

  if (!startDate || remainingLessons <= 0 || dayIndexes.length === 0) {
    return lessonDates;
  }

  const currentDate = new Date(`${startDate}T00:00:00`);
  let guard = 0;

  while (lessonDates.length < remainingLessons && guard < 500) {
    const dateKey = getDateKey(currentDate);
    const holidays = await getHolidays(
      currentDate.getFullYear(),
      currentDate.getMonth()
    );

    if (dayIndexes.includes(currentDate.getDay()) && !holidays[dateKey]) {
      const move=moves.find(m=>m.member_id===member.id&&m.original_date===dateKey&&String(m.original_time).slice(0,5)===String(member.lessonTime).slice(0,5));
      const movedStatus=move?states.get(`${member.id}_${move.new_date}_${String(move.new_time).slice(0,5)}`):'';
      if(movedStatus!=='completed'&&movedStatus!=='cancelled'&&movedStatus!=='deleted')lessonDates.push(dateKey);
    }

    currentDate.setDate(currentDate.getDate() + 1);
    guard++;
  }

  return lessonDates;
}


const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
let loading = false;
async function render() {
 const list = document.getElementById('personalLessonPeriods');
 if (!list || loading) return;
 loading=true;
 list.innerHTML='<p class="lesson-period-empty">개인레슨 일정을 계산하는 중입니다.</p>';
 try {
  let rows;
  if(window.swimDb?.isConfigured()) {
   const {data,error}=await window.swimDb.client.from('members').select('*');
   if(error)throw error;rows=data||[];
  }else rows=JSON.parse(localStorage.getItem('personalLessonMembers')||'[]');
  const members=rows.map(m=>({...m,totalLessons:m.total_lessons??m.totalLessons,usedLessons:m.used_lessons??m.usedLessons,lessonStartDate:m.lesson_start_date??m.lessonStartDate,lastLessonDate:m.last_lesson_date??m.lastLessonDate,lessonTime:m.lesson_time??m.lessonTime}));
  const moves=window.lessonMoves&&window.swimDb?.isConfigured()?await window.lessonMoves.load(window.swimDb.client):[];
  let stateRows=[];
  if(window.swimDb?.isConfigured()){
    const result=await window.swimDb.client.from('lessons').select('member_id,lesson_date,lesson_time,status').eq('lesson_type','personal').in('status',['completed','cancelled','deleted']);
    if(result.error)throw result.error;stateRows=result.data||[];
  }
  const states=new Map(stateRows.map(r=>[`${r.member_id}_${r.lesson_date}_${String(r.lesson_time).slice(0,5)}`,r.status]));
  const schedules=await Promise.all(members.filter(m=>m.status!=='종료'&&Number(m.totalLessons)>0).map(async member=>{
    const active=moves.filter(m=>m.member_id===member.id&&(m.cycle_start_date||null)===(member.lessonStartDate||null));
    const dates=await getPersonalLessonDates(member,active,states);
    const items=dates.map(date=>({id:member.id,memberId:member.id,memberIds:[member.id],date,time:member.lessonTime,type:'personal'}));
    const mapped=window.lessonMoves?window.lessonMoves.apply(items,active,{templates:items,statusFor:(date,time)=>states.get(`${member.id}_${date}_${time}`)||'scheduled'}):items;
    return {member,dates:mapped.map(row=>row.date)};
  }));
  schedules.sort((a,b)=>(a.dates.at(-1)||'9999').localeCompare(b.dates.at(-1)||'9999'));
  document.getElementById('personalLessonPeriodCount').textContent=`${schedules.length}명`;
  list.innerHTML=schedules.length?schedules.map(({member,dates})=>{
   const start=dates[0]||member.lessonStartDate;
   const end=dates.at(-1);
   const remaining=Math.max(Number(member.totalLessons||0)-getEffectiveUsedLessons(member),0);
   return `<details class="lesson-period-item"><summary><strong>${escape(member.name)}</strong><span>잔여 ${remaining}회</span><time>${escape(formatKoreanDate(end)||(remaining?'계산 필요':'수업 종료'))}</time></summary><div class="lesson-period-detail"><p>시작 ${escape(formatKoreanDate(start)||'미등록')} · 예상 마감 ${escape(formatKoreanDate(end)||'미정')}</p><small>${escape(dates.slice(0,4).map(formatKoreanDate).join(' · ')||'남은 예정 수업이 없습니다.')}</small></div></details>`;
  }).join(''):'<p class="lesson-period-empty">개인레슨 회원을 등록하면 시작·마감 일정이 표시됩니다.</p>';
 }catch(error){list.textContent='개인레슨 일정을 불러오지 못했습니다. 다시 불러오기를 눌러주세요.';console.warn('개인레슨 일정 조회 실패',error);}
 finally{loading=false;}
}
document.addEventListener('DOMContentLoaded',()=>{
 const panel=document.getElementById('personalPeriodPanel');
 const toggle=document.getElementById('togglePersonalPeriods');
 toggle?.addEventListener('click',()=>{
  panel.hidden=!panel.hidden;
  toggle.setAttribute('aria-expanded',String(!panel.hidden));
  if(!panel.hidden)render();
 });
 document.getElementById('reloadPersonalLessonPeriods')?.addEventListener('click',render);
});
window.addEventListener('focus',()=>{if(!document.getElementById('personalPeriodPanel')?.hidden)render();});
})();
