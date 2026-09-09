// ======================================
// DOM
// ======================================

const currentDate = document.querySelector('.current-date');
const daysTag = document.querySelector('.days');

const prevButton = document.querySelector('#prev');
const nextButton = document.querySelector('#next');

const todayLessonList = document.querySelector('#today-lesson-list');
const todayCount = document.querySelector('#today-count');
const todayDate = document.querySelector('#today-date');

// 수업 추가
const addLessonBtn = document.querySelector('#add-lesson-btn');
const lessonModal = document.querySelector('#lesson-modal');
const closeLessonModal = document.querySelector('#close-lesson-modal');

const lessonType = document.querySelector('#lesson-type');
const lessonDate = document.querySelector('#lesson-date');
const lessonTime = document.querySelector('#lesson-time');
const lessonTitle = document.querySelector('#lesson-title');

const saveLessonBtn = document.querySelector('#save-lesson-btn');

// 수업 상세
const lessonDetailModal = document.querySelector('#lesson-detail-modal');

const closeDetailModal = document.querySelector('#close-detail-modal');

const detailDate = document.querySelector('#detail-date');

const detailTime = document.querySelector('#detail-time');

const detailType = document.querySelector('#detail-type');

const detailTitle = document.querySelector('#detail-title');

const detailStatus = document.querySelector('#detail-status');

const confirmDetailBtn = document.querySelector('#confirm-detail-btn');

const deleteLessonBtn = document.querySelector('#delete-lesson-btn');

// 현재 상세보기 중인 수업
let selectedLesson = null;

// ======================================
// 날짜
// ======================================

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

const weekdays = [
  '일요일',
  '월요일',
  '화요일',
  '수요일',
  '목요일',
  '금요일',
  '토요일',
];

// ======================================
// 공공데이터 API
// ======================================

const API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const SERVICE_KEY = '기존_API_KEY_붙여넣기';

// ======================================
// 개인레슨
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
  { day: 2, time: '19:00' },
  { day: 2, time: '20:00' },
  { day: 2, time: '21:00' },

  // 수요일
  { day: 3, time: '20:00' },
  { day: 3, time: '21:00' },

  // 목요일
  { day: 4, time: '19:00' },
  { day: 4, time: '20:00' },
  { day: 4, time: '21:00' },

  // 금요일
  { day: 5, time: '20:00' },
  { day: 5, time: '21:00' },
];

// ======================================
// localStorage
// ======================================

let completedLessons =
  JSON.parse(localStorage.getItem('completedLessons')) || {};

let cancelledLessons =
  JSON.parse(localStorage.getItem('cancelledLessons')) || {};

let addedLessons = JSON.parse(localStorage.getItem('addedLessons')) || [];

// ======================================
// 공휴일 캐시
// ======================================

const holidayCache = {};

// ======================================
// 공휴일 가져오기
// ======================================

async function getHolidays(year, month) {
  const cacheKey = `${year}-${month}`;

  if (holidayCache[cacheKey]) {
    return holidayCache[cacheKey];
  }

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

    holidayCache[cacheKey] = holidays;

    return holidays;
  } catch (error) {
    console.error('공휴일 정보를 불러오지 못했습니다.', error);

    return {};
  }
}

// ======================================
// 공휴일 범위 만들기
// ======================================

async function getHolidayMap(year, month) {
  const holidaysByDate = {};

  // 현재 달 기준 앞뒤 6개월
  for (let offset = -6; offset <= 6; offset++) {
    const targetDate = new Date(year, month + offset, 1);

    const targetYear = targetDate.getFullYear();

    const targetMonth = targetDate.getMonth();

    const holidayData = await getHolidays(targetYear, targetMonth);

    Object.entries(holidayData).forEach(([day, name]) => {
      const monthNumber = String(targetMonth + 1).padStart(2, '0');

      const dayNumber = String(day).padStart(2, '0');

      const dateKey = `${targetYear}-${monthNumber}-${dayNumber}`;

      holidaysByDate[dateKey] = name;
    });
  }

  return holidaysByDate;
}

// ======================================
// 개인레슨 날짜 계산
// ======================================

function getPersonalLessonDates(lesson, holidaysByDate) {
  const lessonDates = [];

  const startDate = new Date(`${lesson.startDate}T00:00:00`);

  const currentDate = new Date(startDate);

  // 지정된 요일까지 이동
  while (currentDate.getDay() !== lesson.day) {
    currentDate.setDate(currentDate.getDate() + 1);
  }

  // 수업 횟수만큼 생성
  while (lessonDates.length < lesson.totalCount) {
    const year = currentDate.getFullYear();

    const month = String(currentDate.getMonth() + 1).padStart(2, '0');

    const day = String(currentDate.getDate()).padStart(2, '0');

    const dateKey = `${year}-${month}-${day}`;

    // 공휴일이면 건너뜀
    if (!holidaysByDate[dateKey]) {
      lessonDates.push(dateKey);
    }

    currentDate.setDate(currentDate.getDate() + 7);
  }

  return lessonDates;
}

// ======================================
// 수업 고유 키
// ======================================

function getLessonKey(dateKey, item) {
  // 직접 추가한 수업
  if (item.source === 'added') {
    return `${dateKey}_${item.type}_` + `${item.id}_${item.time}`;
  }

  // 개인레슨
  if (item.type === 'personal') {
    return `${dateKey}_personal_` + `${item.id}_${item.time}`;
  }

  // 반복 단체수업
  return `${dateKey}_group_${item.time}`;
}

// ======================================
// 수업 종류 이름
// ======================================

function getLessonTypeName(type) {
  if (type === 'personal') {
    return '개인';
  }

  if (type === 'group') {
    return '단체';
  }

  if (type === 'makeup') {
    return '보강';
  }

  if (type === 'cancelled') {
    return '취소';
  }

  return '';
}

// ======================================
// 수업 이름
// ======================================

function getLessonName(item) {
  if (item.title) {
    return item.title;
  }

  if (item.type === 'personal') {
    return '개인레슨';
  }

  if (item.type === 'group') {
    return '단체수업';
  }

  if (item.type === 'makeup') {
    return '보강';
  }

  return '';
}

// ======================================
// 날짜별 수업 만들기
// ======================================

function getDaySchedule(date, dateKey, holidayName, personalLessonsByDate) {
  const daySchedule = [];

  // 공휴일에는 수업 없음
  if (holidayName) {
    return daySchedule;
  }

  // 개인레슨
  if (personalLessonsByDate[dateKey]) {
    daySchedule.push(...personalLessonsByDate[dateKey]);
  }

  // 반복 단체강습
  recurringSchedule.forEach((item) => {
    if (date.getDay() === item.day) {
      daySchedule.push({
        ...item,
        type: 'group',
        source: 'recurring',
      });
    }
  });

  // 직접 추가한 수업
  addedLessons.forEach((item) => {
    if (item.date === dateKey) {
      daySchedule.push(item);
    }
  });

  // 시간순 정렬
  daySchedule.sort((a, b) => a.time.localeCompare(b.time));

  return daySchedule;
}

// ======================================
// 달력 그리기
// ======================================

async function renderCalendar() {
  const firstDayOfMonth = new Date(currYear, currMonth, 1).getDay();

  const lastDateOfMonth = new Date(currYear, currMonth + 1, 0).getDate();

  const previousLastDate = new Date(currYear, currMonth, 0).getDate();

  // 공휴일
  const holidaysByDate = await getHolidayMap(currYear, currMonth);

  // 개인레슨 날짜별 정리
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
        source: 'personal',
      });
    });
  });

  let liTag = '';
  let todayScheduleData = [];

  // ======================================
  // 이전 달
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
  // 현재 달
  // ======================================

  for (let i = 1; i <= lastDateOfMonth; i++) {
    const date = new Date(currYear, currMonth, i);

    const monthNumber = String(currMonth + 1).padStart(2, '0');

    const dayNumber = String(i).padStart(2, '0');

    const dateKey = `${currYear}-${monthNumber}-${dayNumber}`;

    const isToday =
      i === today.getDate() &&
      currMonth === today.getMonth() &&
      currYear === today.getFullYear();

    const isSunday = date.getDay() === 0;

    const holidayName = holidaysByDate[dateKey];

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

    // 날짜별 수업
    const daySchedule = getDaySchedule(
      date,
      dateKey,
      holidayName,
      personalLessonsByDate
    );

    if (isToday) {
      todayScheduleData = daySchedule;
    }

    // 수업 HTML
    let scheduleHtml = '';

    daySchedule.forEach((item) => {
      const lessonKey = getLessonKey(dateKey, item);

      const isCompleted = completedLessons[lessonKey] === true;

      const isCancelled = cancelledLessons[lessonKey] === true;

      const displayType = isCancelled ? 'cancelled' : item.type;

      scheduleHtml += `
        <div
          class="
            schedule-item
            ${displayType}
            ${isCompleted ? 'completed' : ''}
          "
          data-lesson-key="${lessonKey}"
          onclick="openLessonDetail('${dateKey}', '${lessonKey}')"
        >

          <span
            class="check-circle"
            onclick="
              toggleComplete(
                event,
                '${lessonKey}'
              )
            "
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
  // 다음 달
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
  // 출력
  // ======================================

  currentDate.textContent = `${currYear}년 ${months[currMonth]}`;

  daysTag.innerHTML = liTag;

  renderTodayLessons(todayScheduleData);
}

// ======================================
// 오늘 수업
// ======================================

function renderTodayLessons(schedule) {
  if (todayDate) {
    todayDate.textContent =
      `${today.getMonth() + 1}월 ` +
      `${today.getDate()}일 ` +
      `${weekdays[today.getDay()]}`;
  }

  if (todayCount) {
    todayCount.textContent = `${schedule.length}건`;
  }

  if (!todayLessonList) {
    return;
  }

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
      const lessonKey = getLessonKey(dateKey, item);

      const isCompleted = completedLessons[lessonKey] === true;

      const isCancelled = cancelledLessons[lessonKey] === true;

      const displayType = isCancelled ? 'cancelled' : item.type;

      const name = getLessonName(item);

      const typeName = getLessonTypeName(displayType);

      return `
          <div
            class="
              today-lesson-item
              ${displayType}
              ${isCompleted ? 'completed' : ''}
            "
            data-lesson-key="${lessonKey}"
          >

            <span
              class="today-lesson-check"
              onclick="
                toggleComplete(
                  event,
                  '${lessonKey}'
                )
              "
            >
              ✓
            </span>

            <span class="today-lesson-time">
              ${item.time}
            </span>

            <span class="today-lesson-name">
              ${name}
            </span>

            <span
              class="
                today-lesson-type
                ${item.type}
              "
            >
              ${typeName}
            </span>

          </div>
        `;
    })
    .join('');
}

// ======================================
// 수업 상세보기
// ======================================

function openLessonDetail(dateKey, lessonKey) {
  let lesson = null;

  // --------------------------------------
  // 1. 직접 추가한 수업 찾기
  // --------------------------------------

  lesson = addedLessons.find(
    (item) => getLessonKey(dateKey, item) === lessonKey
  );

  // --------------------------------------
  // 2. 기본 개인레슨 찾기
  // --------------------------------------

  if (!lesson && lessonKey.includes('_personal_')) {
    const personalLesson = personalSchedule.find((item) => {
      const key = `${dateKey}_personal_` + `${item.id}_${item.time}`;

      return key === lessonKey;
    });

    if (personalLesson) {
      lesson = {
        id: personalLesson.id,
        date: dateKey,
        time: personalLesson.time,
        title: personalLesson.name,
        type: 'personal',
        source: 'personal',
      };
    }
  }

  // --------------------------------------
  // 3. 반복 단체강습 찾기
  // --------------------------------------

  if (!lesson && lessonKey.includes('_group_')) {
    const groupLesson = recurringSchedule.find((item) => {
      const key = `${dateKey}_group_${item.time}`;

      return key === lessonKey;
    });

    if (groupLesson) {
      lesson = {
        date: dateKey,
        time: groupLesson.time,
        title: '단체수업',
        type: 'group',
        source: 'recurring',
      };
    }
  }

  // 수업을 못 찾은 경우
  if (!lesson) {
    console.error('수업 정보를 찾지 못했습니다.');
    return;
  }

  // 현재 선택한 수업 저장
  selectedLesson = {
    ...lesson,
    lessonKey,
  };

  // --------------------------------------
  // 상세 팝업 내용 표시
  // --------------------------------------

  const dateObject = new Date(`${dateKey}T00:00:00`);

  detailDate.textContent =
    `${dateObject.getFullYear()}년 ` +
    `${dateObject.getMonth() + 1}월 ` +
    `${dateObject.getDate()}일 ` +
    `${weekdays[dateObject.getDay()]}`;

  detailTime.textContent = lesson.time;

  detailType.textContent = getLessonTypeName(lesson.type);

  detailTitle.textContent = getLessonName(lesson);

  if (cancelledLessons[lessonKey]) {
    detailStatus.value = 'cancelled';
  } else if (completedLessons[lessonKey]) {
    detailStatus.value = 'completed';
  } else {
    detailStatus.value = 'scheduled';
  }

  // --------------------------------------
  // 직접 추가한 수업만 삭제 가능
  // --------------------------------------

  if (lesson.source === 'added') {
    deleteLessonBtn.style.display = 'block';
  } else {
    deleteLessonBtn.style.display = 'none';
  }

  // 팝업 열기
  lessonDetailModal.classList.add('open');
}

// ======================================
// 수업 상세 팝업 닫기
// ======================================

closeDetailModal.addEventListener('click', () => {
  lessonDetailModal.classList.remove('open');
});

// ======================================
// 수업 상태 저장
// ======================================

confirmDetailBtn.addEventListener('click', () => {
  if (!selectedLesson) {
    return;
  }

  const lessonKey = selectedLesson.lessonKey;
  const status = detailStatus.value;

  /// 예정
  if (status === 'scheduled') {
    delete completedLessons[lessonKey];
    delete cancelledLessons[lessonKey];
  }

  // 완료
  if (status === 'completed') {
    completedLessons[lessonKey] = true;
    delete cancelledLessons[lessonKey];
  }

  // 취소
  if (status === 'cancelled') {
    cancelledLessons[lessonKey] = true;
    delete completedLessons[lessonKey];
  }

  localStorage.setItem('completedLessons', JSON.stringify(completedLessons));

  localStorage.setItem('cancelledLessons', JSON.stringify(cancelledLessons));

  // 상태 변경 후 선택값 초기화
  selectedLesson = null;

  // 상세 팝업 닫기
  lessonDetailModal.classList.remove('open');

  // 달력 다시 그리기
  renderCalendar();
});

// 팝업 바깥을 누르면 닫기
lessonDetailModal.addEventListener('click', (event) => {
  if (event.target === lessonDetailModal) {
    lessonDetailModal.classList.remove('open');
  }
});

// ======================================
// 직접 추가한 수업 삭제
// ======================================

deleteLessonBtn.addEventListener('click', () => {
  // 선택된 수업이 없으면 종료
  if (!selectedLesson) {
    return;
  }

  // 직접 추가한 수업이 아니면 삭제 금지
  if (selectedLesson.source !== 'added') {
    return;
  }

  const shouldDelete = confirm('이 수업을 삭제할까요?');

  if (!shouldDelete) {
    return;
  }

  // addedLessons에서 삭제
  addedLessons = addedLessons.filter((item) => item.id !== selectedLesson.id);

  // localStorage 저장
  localStorage.setItem('addedLessons', JSON.stringify(addedLessons));

  // 완료 / 취소 상태가 있었다면 같이 삭제
  delete completedLessons[selectedLesson.lessonKey];
  delete cancelledLessons[selectedLesson.lessonKey];

  localStorage.setItem('completedLessons', JSON.stringify(completedLessons));

  localStorage.setItem('cancelledLessons', JSON.stringify(cancelledLessons));

  // 선택 상태 초기화
  selectedLesson = null;

  // 팝업 닫기
  lessonDetailModal.classList.remove('open');

  // 달력 다시 그리기
  renderCalendar();
});

// ======================================
// 완료 체크
// ======================================

function toggleComplete(event, lessonKey) {
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
// 수업 추가 팝업
// ======================================

if (
  addLessonBtn &&
  lessonModal &&
  closeLessonModal &&
  lessonType &&
  lessonDate &&
  lessonTime &&
  lessonTitle &&
  saveLessonBtn
) {
  // 열기
  addLessonBtn.addEventListener('click', () => {
    const year = today.getFullYear();

    const month = String(today.getMonth() + 1).padStart(2, '0');

    const day = String(today.getDate()).padStart(2, '0');

    lessonDate.value = `${year}-${month}-${day}`;

    lessonType.value = 'personal';

    lessonTime.value = '';
    lessonTitle.value = '';

    lessonModal.classList.add('open');
  });

  // X 버튼
  closeLessonModal.addEventListener('click', () => {
    lessonModal.classList.remove('open');
  });

  // 바깥 영역 클릭
  lessonModal.addEventListener('click', (event) => {
    if (event.target === lessonModal) {
      lessonModal.classList.remove('open');
    }
  });

  // 저장
  saveLessonBtn.addEventListener('click', () => {
    const type = lessonType.value;

    const date = lessonDate.value;

    const time = lessonTime.value;

    const title = lessonTitle.value.trim();

    if (!date || !time) {
      alert('날짜와 시간을 입력해주세요.');
      return;
    }

    const newLesson = {
      id: Date.now(),
      date,
      time,
      title,
      type,
      source: 'added',
    };

    addedLessons.push(newLesson);

    localStorage.setItem('addedLessons', JSON.stringify(addedLessons));

    lessonModal.classList.remove('open');

    renderCalendar();
  });
}

// ======================================
// 처음 실행
// ======================================

renderCalendar();
