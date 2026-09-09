const currentDate = document.querySelector('.current-date');
const daysTag = document.querySelector('.days');
const todayLessonList = document.querySelector('#today-lesson-list');
const todayCount = document.querySelector('#today-count');
const weekdays = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
];

const prevButton = document.querySelector('#prev');
const nextButton = document.querySelector('#next');

const today = new Date();

let currYear = today.getFullYear();
let currMonth = today.getMonth();

const months = [
  '1월',
  '2월',
  '3월',
  '4월',
  '5월',
  '6월',
  '7월',
  '8월',
  '9월',
  '10월',
  '11월',
  '12월',
];

// ======================================
// 공공데이터 API
// ======================================

const API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const SERVICE_KEY =
  'ZScN%2FL8QzX1fL1Q6srrL4ThrDGCUSI4yQG2bAlnNdhOs4e0R2TIsSZoLxkoZRkpuQ9iSHn87EmjjnAdkeOmgmA%3D%3D';

// ======================================
// 개인레슨
//
// day
// 0 = 일요일
// 1 = 월요일
// 2 = 화요일
// 3 = 수요일
// 4 = 목요일
// 5 = 금요일
// 6 = 토요일
// ======================================

const personalSchedule = [
  {
    id: 1,
    name: '이은하, 최예서',
    day: 6,
    time: '08:00',
    startDate: '2026-09-05',
    totalCount: 4,
  },

  {
    id: 2,
    name: '김혜민',
    day: 6,
    time: '09:00',
    startDate: '2026-09-12',
    totalCount: 4,
  },

  {
    id: 3,
    name: '문지영, 전효원',
    day: 6,
    time: '10:00',
    startDate: '2026-09-05',
    totalCount: 4,
  },
];

// ======================================
// 반복 단체강습
// ======================================

const recurringSchedule = [
  // 화요일
  {
    day: 2,
    time: '19:00',
  },
  {
    day: 2,
    time: '20:00',
  },
  {
    day: 2,
    time: '21:00',
  },

  // 수요일
  {
    day: 3,
    time: '20:00',
  },
  {
    day: 3,
    time: '21:00',
  },

  // 목요일
  {
    day: 4,
    time: '19:00',
  },
  {
    day: 4,
    time: '20:00',
  },
  {
    day: 4,
    time: '21:00',
  },

  // 금요일
  {
    day: 5,
    time: '20:00',
  },
  {
    day: 5,
    time: '21:00',
  },
];

// ======================================
// 완료한 수업 불러오기
// ======================================

let completedLessons =
  JSON.parse(localStorage.getItem('completedLessons')) || {};

// ======================================
// 공휴일 가져오기
// ======================================

async function getHolidays(year, month) {
  const formattedMonth = String(month + 1).padStart(2, '0');

  const url =
    `${API_URL}/getRestDeInfo` +
    `?ServiceKey=${SERVICE_KEY}` +
    `&solYear=${year}` +
    `&solMonth=${formattedMonth}` +
    `&numOfRows=50`;

  try {
    const response = await fetch(url);

    const text = await response.text();

    const parser = new DOMParser();

    const xml = parser.parseFromString(text, 'text/xml');

    const items = xml.querySelectorAll('item');

    const holidays = {};

    items.forEach((item) => {
      const date = item.querySelector('locdate')?.textContent;

      const name = item.querySelector('dateName')?.textContent;

      if (date) {
        const day = Number(date.slice(-2));

        holidays[day] = name;
      }
    });

    return holidays;
  } catch (error) {
    console.error('공휴일 정보를 불러오지 못했습니다.', error);

    return {};
  }
}

// ======================================
// 개인레슨 날짜 계산
// ======================================

function getPersonalLessonDates(lesson, holidaysByDate) {
  const lessonDates = [];

  const startDate = new Date(lesson.startDate + 'T00:00:00');

  let currentDate = new Date(startDate);

  // 시작일이 해당 수업 요일이 아니라면
  // 가장 가까운 해당 요일까지 이동
  while (currentDate.getDay() !== lesson.day) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 총 수업 횟수만큼 생성
  while (lessonDates.length < lesson.totalCount) {
    const year = currentDate.getFullYear();

    const month = String(currentDate.getMonth() + 1).padStart(2, '0');

    const day = String(currentDate.getDate()).padStart(2, '0');

    const dateKey = `${year}-${month}-${day}`;

    // 공휴일이 아니면 수업 추가
    if (!holidaysByDate[dateKey]) {
      lessonDates.push(dateKey);
    }

    // 다음 주로 이동
    currentDate.setDate(currentDate.getDate() + 7);
  }

  return lessonDates;
}

// ======================================
// 달력 그리기
// ======================================

async function renderCalendar() {
  const firstDayOfMonth = new Date(currYear, currMonth, 1).getDay();

  const lastDateOfMonth = new Date(currYear, currMonth + 1, 0).getDate();

  const previousLastDate = new Date(currYear, currMonth, 0).getDate();

  // ======================================
  // 공휴일 정보
  //
  // 현재 달부터 앞으로 4개월까지 불러오기
  // 개인레슨 4회가 다음 달로 넘어갈 수 있기 때문
  // ======================================

  const holidaysByDate = {};

  // 현재 달의 이전 6개월부터
  // 이후 6개월까지 공휴일을 가져옴
  for (let offset = -6; offset <= 6; offset++) {
    const targetDate = new Date(currYear, currMonth + offset, 1);

    const year = targetDate.getFullYear();

    const month = targetDate.getMonth();

    const holidayData = await getHolidays(year, month);

    Object.entries(holidayData).forEach(([day, name]) => {
      const monthNumber = String(month + 1).padStart(2, '0');

      const dayNumber = String(day).padStart(2, '0');

      const dateKey = `${year}-${monthNumber}-${dayNumber}`;

      holidaysByDate[dateKey] = name;
    });
  }

  for (let offset = 0; offset < 4; offset++) {
    const targetDate = new Date(currYear, currMonth + offset, 1);

    const year = targetDate.getFullYear();

    const month = targetDate.getMonth();

    const holidayData = await getHolidays(year, month);

    Object.entries(holidayData).forEach(([day, name]) => {
      const monthNumber = String(month + 1).padStart(2, '0');

      const dayNumber = String(day).padStart(2, '0');

      const dateKey = `${year}-${monthNumber}-${dayNumber}`;

      holidaysByDate[dateKey] = name;
    });
  }

  // ======================================
  // 개인레슨 날짜 계산
  // ======================================

  const personalLessonsByDate = {};

  personalSchedule.forEach((lesson) => {
    const lessonDates = getPersonalLessonDates(lesson, holidaysByDate);

    lessonDates.forEach((dateKey) => {
      if (!personalLessonsByDate[dateKey]) {
        personalLessonsByDate[dateKey] = [];
      }

      personalLessonsByDate[dateKey].push({
        id: lesson.id,
        time: lesson.time,
        title: lesson.name,
        type: 'personal',
      });
    });
  });

  let liTag = '';
  let todayScheduleData = [];

  // ======================================
  // 이전 달 날짜
  // ======================================

  for (let i = firstDayOfMonth; i > 0; i--) {
    const previousDate = previousLastDate - i + 1;

    liTag += `
      <li class="inactive">

        <span class="day-number">
          ${previousDate}
        </span>

      </li>
    `;
  }

  // ======================================
  // 현재 달 날짜
  // ======================================

  for (let i = 1; i <= lastDateOfMonth; i++) {
    const date = new Date(currYear, currMonth, i);

    // --------------------------------------
    // 날짜 키 만들기
    // --------------------------------------

    const monthNumber = String(currMonth + 1).padStart(2, '0');

    const dayNumber = String(i).padStart(2, '0');

    const dateKey = `${currYear}-${monthNumber}-${dayNumber}`;

    // --------------------------------------
    // 오늘인지 확인
    // --------------------------------------

    const isToday =
      i === today.getDate() &&
      currMonth === today.getMonth() &&
      currYear === today.getFullYear();

    // --------------------------------------
    // 일요일
    // --------------------------------------

    const isSunday = date.getDay() === 0;

    // --------------------------------------
    // 공휴일
    // --------------------------------------

    const holidayName = holidaysByDate[dateKey];

    // --------------------------------------
    // CSS 클래스
    // --------------------------------------

    const classes = [];

    if (isToday) {
      classes.push('active');
    }

    if (isSunday) {
      classes.push('sunday');
    }

    if (holidayName) {
      classes.push('holiday');
    }

    // ======================================
    // 오늘의 수업
    // ======================================

    let daySchedule = [];

    // 공휴일에는 모든 수업 없음
    if (!holidayName) {
      // --------------------------------------
      // 개인레슨
      // --------------------------------------

      if (personalLessonsByDate[dateKey]) {
        daySchedule.push(...personalLessonsByDate[dateKey]);
      }

      // --------------------------------------
      // 반복 단체강습
      // --------------------------------------

      recurringSchedule.forEach((item) => {
        if (date.getDay() === item.day) {
          daySchedule.push({
            ...item,
            type: 'group',
          });
        }
      });
    }

    // ======================================
    // 시간순 정렬
    // ======================================

    daySchedule.sort((a, b) => a.time.localeCompare(b.time));
    if (isToday) {
      todayScheduleData = daySchedule;
    }

    // ======================================
    // 수업 HTML 만들기
    // ======================================

    let scheduleHtml = '';

    daySchedule.forEach((item) => {
      // --------------------------------------
      // 수업 고유키
      // --------------------------------------

      const lessonKey =
        item.type === 'personal'
          ? `${dateKey}_personal_${item.id}_${item.time}`
          : `${dateKey}_group_${item.time}`;

      // --------------------------------------
      // 완료 여부
      // --------------------------------------

      const isCompleted = completedLessons[lessonKey] === true;

      // --------------------------------------
      // HTML 생성
      // --------------------------------------

      scheduleHtml += `
          <div
            class="
              schedule-item
              ${item.type}
              ${isCompleted ? 'completed' : ''}
            "
            data-lesson-key="${lessonKey}"
          >

            <span
              class="check-circle"
              onclick="toggleComplete(
                event,
                '${lessonKey}',
                this
              )"
            >
              ✓
            </span>


            <div class="schedule-text">
              <span class="schedule-time">
                ${item.time}
              </span>
            </div>

          </div>
        `;
    });

    // ======================================
    // 날짜 칸 만들기
    // ======================================

    liTag += `
      <li class="${classes.join(' ')}">

        <span class="day-number">
          ${i}
        </span>


        ${
          holidayName
            ? `
              <span class="holiday-name">
                ${holidayName}
              </span>
            `
            : ''
        }


        <div class="schedule-list">
          ${scheduleHtml}
        </div>

      </li>
    `;
  }

  // ======================================
  // 다음 달 날짜
  // ======================================

  const totalCells = firstDayOfMonth + lastDateOfMonth;

  const remainingCells = (7 - (totalCells % 7)) % 7;

  for (let i = 1; i <= remainingCells; i++) {
    liTag += `
      <li class="inactive">

        <span class="day-number">
          ${i}
        </span>

      </li>
    `;
  }

  // ======================================
  // 달력 출력
  // ======================================

  currentDate.innerText = `${currYear}년 ${months[currMonth]}`;

  daysTag.innerHTML = liTag;
  renderTodayLessons(todayScheduleData);
}

function renderTodayLessons(schedule) {
  const todayDate = document.querySelector('#today-date');

  todayDate.textContent = `${today.getMonth() + 1}월 ${today.getDate()}일 ${
    weekdays[today.getDay()]
  }`;

  todayCount.textContent = `${schedule.length}건`;

  if (schedule.length === 0) {
    todayLessonList.innerHTML = `
      <p class="today-empty">
        오늘 예정된 수업이 없습니다.
      </p>
    `;
    return;
  }

  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');

  const dateKey = `${year}-${month}-${day}`;

  todayLessonList.innerHTML = schedule
    .map((item) => {
      const lessonKey =
        item.type === 'personal'
          ? `${dateKey}_personal_${item.id}_${item.time}`
          : `${dateKey}_group_${item.time}`;

      const isCompleted = completedLessons[lessonKey] === true;

      const name = item.type === 'personal' ? item.title : '단체수업';

      const typeName = item.type === 'personal' ? '개인' : '단체';

      return `
        <div
          class="
            today-lesson-item
            ${item.type}
            ${isCompleted ? 'completed' : ''}
          "
          data-lesson-key="${lessonKey}"
        >

          <span
            class="today-lesson-check"
            onclick="toggleComplete(
              event,
              '${lessonKey}',
              this
            )"
          >
            ✓
          </span>

          <span class="today-lesson-time">
            ${item.time}
          </span>

          <span class="today-lesson-name">
            ${name}
          </span>

          <span class="today-lesson-type ${item.type}">
            ${typeName}
          </span>

        </div>
      `;
    })
    .join('');
}

// ======================================
// 완료 체크
// ======================================

function toggleComplete(event, lessonKey, checkElement) {
  event.stopPropagation();

  const newState = !completedLessons[lessonKey];

  completedLessons[lessonKey] = newState;

  localStorage.setItem('completedLessons', JSON.stringify(completedLessons));

  const lessonItems = document.querySelectorAll(
    `[data-lesson-key="${lessonKey}"]`
  );

  lessonItems.forEach((item) => {
    item.classList.toggle('completed', newState);
  });
}

// ======================================
// 이전 달
// ======================================

prevButton.addEventListener('click', () => {
  currMonth--;

  if (currMonth < 0) {
    currMonth = 11;
    currYear--;
  }

  renderCalendar();
});

// ======================================
// 다음 달
// ======================================

nextButton.addEventListener('click', () => {
  currMonth++;

  if (currMonth > 11) {
    currMonth = 0;
    currYear++;
  }

  renderCalendar();
});

// ======================================
// 처음 실행
// ======================================

renderCalendar();
