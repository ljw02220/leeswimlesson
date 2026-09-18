(() => {
/* ==================================================
  1. DOM
================================================== */

const currentDate = document.querySelector('.current-date');
const daysTag = document.querySelector('.days');

const prevButton = document.querySelector('#prev');
const nextButton = document.querySelector('#next');

const todayLessonList = document.querySelector('#today-lesson-list');

const todayCount = document.querySelector('#today-count');

const todayDate = document.querySelector('#today-date');

/* 수업 추가 */

const addLessonBtn = document.querySelector('#add-lesson-btn');

const lessonModal = document.querySelector('#lesson-modal');

const closeLessonModal = document.querySelector('#close-lesson-modal');

const lessonType = document.querySelector('#lesson-type');

const lessonDate = document.querySelector('#lesson-date');

const lessonTime = document.querySelector('#lesson-time');

const lessonTitle = document.querySelector('#lesson-title');

const saveLessonBtn = document.querySelector('#save-lesson-btn');

/* 수업 상세 */

const lessonDetailModal = document.querySelector('#lesson-detail-modal');

const closeDetailModal = document.querySelector('#close-detail-modal');

const detailDate = document.querySelector('#detail-date');

const detailTime = document.querySelector('#detail-time');

const detailType = document.querySelector('#detail-type');

const detailTitle = document.querySelector('#detail-title');

const detailStatus = document.querySelector('#detail-status');

const detailMemo = document.querySelector('#detail-memo');

const confirmDetailBtn = document.querySelector('#confirm-detail-btn');

const deleteLessonBtn = document.querySelector('#delete-lesson-btn');

let selectedLesson = null;

/* ==================================================
  2. 날짜
================================================== */

const today = new Date();

let selectedCalendarDateKey = getDateKey(today);

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

const DAY_INDEX_BY_NAME = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

/* ==================================================
  3. 공공데이터 API
================================================== */

const API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';

const SERVICE_KEY = window.SWIM_CONFIG?.HOLIDAY_API_KEY || '';

const HOLIDAY_OVERRIDES = {
  '2026-01-01': '신정',
  '2026-02-16': '설날 연휴',
  '2026-02-17': '설날',
  '2026-02-18': '설날 연휴',
  '2026-03-01': '삼일절',
  '2026-03-02': '삼일절 대체공휴일',
  '2026-05-05': '어린이날',
  '2026-05-24': '부처님오신날',
  '2026-05-25': '부처님오신날 대체공휴일',
  '2026-06-03': '전국동시지방선거',
  '2026-06-06': '현충일',
  '2026-08-15': '광복절',
  '2026-08-17': '광복절 대체공휴일',
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
  '2026-10-03': '개천절',
  '2026-10-05': '개천절 대체공휴일',
  '2026-10-09': '한글날',
  '2026-12-25': '성탄절',
};

/* ==================================================
  4. 기본 개인레슨
================================================== */

let personalSchedule = [];
let personalScheduleLoaded = false;
let lessonRecordStateLoaded = false;

/* ==================================================
  5. 반복 단체강습
================================================== */

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

/* ==================================================
  6. 저장 데이터
================================================== */

function getStorageData(key, fallback) {
  try {
    const savedData = localStorage.getItem(key);

    return savedData ? JSON.parse(savedData) : fallback;
  } catch (error) {
    console.error(`${key} 데이터를 불러오지 못했습니다.`, error);

    return fallback;
  }
}

function saveStorageData(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}

function hasSupabaseConnection() {
  return Boolean(window.swimDb?.isConfigured() && window.swimDb?.client);
}

function getErrorText(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');
}

function normalizeTimeValue(value) {
  return value ? String(value).slice(0, 5) : '';
}

function normalizeLessonDays(days) {
  if (Array.isArray(days)) {
    return days;
  }

  if (typeof days === 'string') {
    return days
      .replace(/[{}"]/g, '')
      .split(',')
      .map((day) => day.trim())
      .filter(Boolean);
  }

  return [];
}

function getMemberLessonDayIndexes(days) {
  return normalizeLessonDays(days)
    .map((day) => DAY_INDEX_BY_NAME[day])
    .filter((day) => Number.isInteger(day));
}

function isNewPersonalLessonCycle(member) {
  const startDate = member.lesson_start_date || member.lessonStartDate || '';
  const lastLessonDate =
    member.last_lesson_date || member.lastLessonDate || '';

  return Boolean(
    startDate && lastLessonDate && startDate > lastLessonDate
  );
}

function getEffectiveUsedLessonCount(member) {
  if (isNewPersonalLessonCycle(member)) {
    return 0;
  }

  return Number(member.used_lessons || member.usedLessons || 0);
}

function mapDatabaseMemberToPersonalSchedule(member) {
  const dayIndexes = getMemberLessonDayIndexes(member.days);
  const time = normalizeTimeValue(member.lesson_time);
  const registeredCount = Number(member.total_lessons || 0) || 8;
  const usedCount = Math.min(
    getEffectiveUsedLessonCount(member),
    registeredCount
  );
  const remainingCount = Math.max(registeredCount - usedCount, 0);
  const hasProgress = usedCount > 0;
  const startDate =
    (hasProgress && member.last_lesson_date
      ? getNextDateKey(member.last_lesson_date)
      : member.lesson_start_date) ||
    member.payment_date ||
    getDateKey(today);
  const totalCount = hasProgress ? remainingCount : registeredCount;

  if (!member.id || !member.name || dayIndexes.length === 0 || !time) {
    return null;
  }

  if (member.status === '종료' || totalCount <= 0) {
    return null;
  }

  return {
    id: member.id,
    memberId: member.id,
    memberIds: [member.id],
    name: member.name,
    names: [member.name],
    days: dayIndexes,
    time,
    startDate,
    totalCount,
  };
}

function getPersonalScheduleGroupKey(lesson) {
  return [
    lesson.startDate,
    lesson.time,
    lesson.totalCount,
    lesson.days.join(','),
  ].join('|');
}

function mergePersonalScheduleEntries(entries) {
  const grouped = new Map();

  entries.forEach((lesson) => {
    const key = getPersonalScheduleGroupKey(lesson);
    const existing = grouped.get(key);

    if (!existing) {
      grouped.set(key, {
        ...lesson,
        memberIds: [...lesson.memberIds],
        names: [...lesson.names],
      });

      return;
    }

    existing.memberIds.push(...lesson.memberIds);
    existing.names.push(...lesson.names);
    existing.id = existing.memberIds.join('+');
    existing.memberId = existing.memberIds[0];
    existing.name = existing.names.join(', ');
  });

  return Array.from(grouped.values()).map((lesson) => ({
    ...lesson,
    id: lesson.memberIds.join('+'),
    memberId: lesson.memberIds[0],
    name: lesson.names.join(', '),
  }));
}

function mapLocalMemberToPersonalSchedule(member) {
  return mapDatabaseMemberToPersonalSchedule({
    id: member.id,
    name: member.name,
    days: member.days || [],
    lesson_time: member.time || member.lesson_time,
    lesson_start_date: member.lessonStartDate || member.lesson_start_date,
    payment_date: member.paymentDate || member.payment_date,
    last_lesson_date: member.lastLessonDate || member.last_lesson_date,
    total_lessons: member.totalLessons ?? member.total_lessons,
  });
}

async function loadPersonalSchedule() {
  if (personalScheduleLoaded) {
    return personalSchedule;
  }

  if (hasSupabaseConnection()) {
    const { data, error } = await window.swimDb.client
      .from('members')
      .select('*');

    if (error) {
      throw error;
    }

    personalSchedule = mergePersonalScheduleEntries((data || [])
      .map(mapDatabaseMemberToPersonalSchedule)
      .filter(Boolean));

    console.info(
      `회원관리 개인레슨 ${personalSchedule.length}건을 수업관리 달력에 반영했습니다.`
    );
    personalScheduleLoaded = true;

    return personalSchedule;
  }

  personalSchedule = mergePersonalScheduleEntries(getStorageData('personalLessonMembers', [])
    .map(mapLocalMemberToPersonalSchedule)
    .filter(Boolean));
  personalScheduleLoaded = true;

  return personalSchedule;
}

async function loadLessonRecordState() {
  if (lessonRecordStateLoaded || !hasSupabaseConnection()) {
    return;
  }

  let { data, error } = await window.swimDb.client
    .from('lessons')
    .select(
      'member_id, lesson_date, lesson_time, title, lesson_type, status, source, memo'
    )
    .in('status', ['completed', 'cancelled']);

  if (error && getErrorText(error).includes('memo')) {
    const fallbackResult = await window.swimDb.client
      .from('lessons')
      .select(
        'member_id, lesson_date, lesson_time, title, lesson_type, status, source'
      )
      .in('status', ['completed', 'cancelled']);

    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (error) {
    throw error;
  }

  const databaseCompletedLessons = {};
  const databaseCancelledLessons = {};

  (data || []).forEach((row) => {
    const time = normalizeTimeValue(row.lesson_time);
    let lessonKey = '';

    if (row.source === 'added') {
      const addedLesson = addedLessons.find((item) => {
        return (
          item.date === row.lesson_date &&
          item.type === row.lesson_type &&
          normalizeTimeValue(item.time) === time &&
          (!row.title || getLessonName(item) === row.title)
        );
      });

      if (addedLesson) {
        lessonKey = getLessonKey(row.lesson_date, addedLesson);
      }
    }

    if (!lessonKey && row.lesson_type === 'group') {
      lessonKey = `${row.lesson_date}_group_${time}`;
    } else if (!lessonKey && row.lesson_type === 'personal') {
      const schedule = personalSchedule.find((item) => {
        return (
          (item.memberIds || []).map(String).includes(String(row.member_id)) &&
          normalizeTimeValue(item.time) === time
        );
      });

      if (schedule) {
        lessonKey = `${row.lesson_date}_personal_${schedule.id}_${time}`;
        recordedPersonalLessons[lessonKey] = {
          date: row.lesson_date,
          id: schedule.id,
          memberId: schedule.memberId,
          memberIds:
            schedule.memberIds || [schedule.memberId].filter(Boolean),
          time,
          title: schedule.name,
          type: 'personal',
          source: 'personal',
        };
      }
    }

    if (!lessonKey) {
      return;
    }

    if (row.status === 'completed') {
      databaseCompletedLessons[lessonKey] = true;
    }

    if (row.status === 'cancelled') {
      databaseCancelledLessons[lessonKey] = true;
    }

    if (row.memo) {
      lessonFeedback[lessonKey] = row.memo;
    }
  });

  completedLessons = databaseCompletedLessons;
  cancelledLessons = databaseCancelledLessons;

  saveStorageData('completedLessons', completedLessons);
  saveStorageData('cancelledLessons', cancelledLessons);
  saveStorageData('lessonFeedback', lessonFeedback);

  lessonRecordStateLoaded = true;
}

function getLessonMemberNames(lesson) {
  const title = getLessonName(lesson).trim();

  if (!title || title === '개인레슨') {
    return [];
  }

  return title
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean);
}

let completedLessons = getStorageData('completedLessons', {});

let cancelledLessons = getStorageData('cancelledLessons', {});

let addedLessons = getStorageData('addedLessons', []);

let lessonFeedback = getStorageData('lessonFeedback', {});

let recordedPersonalLessons = {};

/* ==================================================
  7. 공휴일
================================================== */

const holidayCache = {};

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
      holidays[holidayDate.getDate()] = name;
    }
  });

  if (!SERVICE_KEY) {
    holidayCache[cacheKey] = holidays;

    return holidays;
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

    items.forEach((item) => {
      const date = item.querySelector('locdate')?.textContent;

      const name = item.querySelector('dateName')?.textContent;

      if (!date) return;

      const day = Number(date.slice(-2));

      holidays[day] = name;
    });

    holidayCache[cacheKey] = holidays;

    return holidays;
  } catch (error) {
    console.error('공휴일 정보를 불러오지 못했습니다.', error);

    return {};
  }
}

async function getHolidayMap(year, month) {
  const holidaysByDate = {};

  for (let offset = -6; offset <= 6; offset++) {
    const targetDate = new Date(year, month + offset, 1);

    const targetYear = targetDate.getFullYear();

    const targetMonth = targetDate.getMonth();

    const holidayData = await getHolidays(targetYear, targetMonth);

    Object.entries(holidayData).forEach(([day, name]) => {
      const monthNumber = String(targetMonth + 1).padStart(2, '0');

      const dayNumber = String(day).padStart(2, '0');

      const dateKey = `${targetYear}-` + `${monthNumber}-` + `${dayNumber}`;

      holidaysByDate[dateKey] = name;
    });
  }

  return holidaysByDate;
}

/* ==================================================
  8. 날짜 공통 함수
================================================== */

function getDateKey(date) {
  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, '0');

  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getNextDateKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00`);

  date.setDate(date.getDate() + 1);

  return getDateKey(date);
}

/* ==================================================
  9. 개인레슨 날짜 계산
================================================== */

function getPersonalLessonDates(lesson, holidaysByDate) {
  const lessonDates = [];

  const startDate = new Date(`${lesson.startDate}T00:00:00`);

  const currentDate = new Date(startDate);
  const dayIndexes = Array.isArray(lesson.days) ? lesson.days : [lesson.day];
  let guard = 0;

  while (lessonDates.length < lesson.totalCount && guard < 700) {
    const dateKey = getDateKey(currentDate);

    if (dayIndexes.includes(currentDate.getDay()) && !holidaysByDate[dateKey]) {
      lessonDates.push(dateKey);
    }

    currentDate.setDate(currentDate.getDate() + 1);
    guard += 1;
  }

  return lessonDates;
}

/* ==================================================
  10. 개인레슨 날짜별 정리
================================================== */

function createPersonalLessonsByDate(holidaysByDate) {
  const personalLessonsByDate = {};

  personalSchedule.forEach((lesson) => {
    const lessonDates = getPersonalLessonDates(lesson, holidaysByDate);

    lessonDates.forEach((dateKey) => {
      if (!personalLessonsByDate[dateKey]) {
        personalLessonsByDate[dateKey] = [];
      }

      personalLessonsByDate[dateKey].push({
        id: lesson.id,
        memberId: lesson.memberId,
        memberIds: lesson.memberIds || [lesson.memberId].filter(Boolean),
        time: lesson.time,
        title: lesson.name,
        type: 'personal',
        source: 'personal',
      });
    });
  });

  Object.entries(recordedPersonalLessons).forEach(([lessonKey, lesson]) => {
    const lessonsForDate = personalLessonsByDate[lesson.date] || [];
    const alreadyIncluded = lessonsForDate.some(
      (item) => getLessonKey(lesson.date, item) === lessonKey
    );

    if (!alreadyIncluded) {
      lessonsForDate.push(lesson);
    }

    personalLessonsByDate[lesson.date] = lessonsForDate;
  });

  return personalLessonsByDate;
}

/* ==================================================
  11. 수업 고유 키
================================================== */

function getLessonKey(dateKey, item) {
  if (item.source === 'added') {
    return `${dateKey}_${item.type}_` + `${item.id}_${item.time}`;
  }

  if (item.type === 'personal') {
    return `${dateKey}_personal_` + `${item.id}_${item.time}`;
  }

  return `${dateKey}_group_` + `${item.time}`;
}

/* ==================================================
  12. 수업 종류 이름
================================================== */

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

/* ==================================================
  13. 수업 이름
================================================== */

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

/* ==================================================
  14. HTML 문자 처리
================================================== */

function escapeHTML(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getLessonFeedbackKey(lesson) {
  return `${lesson.date}_${normalizeTimeValue(lesson.time)}`;
}

function getLessonFeedbackBlock(lesson, feedback) {
  const key = getLessonFeedbackKey(lesson);

  return `[수업내용|${key}]\n${feedback.trim()}\n[/수업내용]`;
}

function upsertLessonFeedbackMemo(currentMemo, lesson, feedback) {
  const memo = String(currentMemo || '').trim();
  const key = getLessonFeedbackKey(lesson);
  const startMarker = `[수업내용|${key}]`;
  const endMarker = '[/수업내용]';
  const block = getLessonFeedbackBlock(lesson, feedback);
  const pattern = new RegExp(
    `${escapeRegExp(startMarker)}[\\s\\S]*?${escapeRegExp(endMarker)}`
  );

  if (pattern.test(memo)) {
    return memo.replace(pattern, block);
  }

  return [memo, block].filter(Boolean).join('\n\n');
}

/* ==================================================
  15. 개인레슨 완료 횟수 반영
================================================== */

function getNextUsedLessonCount(member, change) {
  const totalLessons = Number(member.total_lessons || member.totalLessons || 0);
  const usedLessons = getEffectiveUsedLessonCount(member);
  const nextUsedLessons = Math.max(usedLessons + change, 0);

  return totalLessons > 0
    ? Math.min(nextUsedLessons, totalLessons)
    : nextUsedLessons;
}

async function findDatabaseMembersForLesson(lesson) {
  if (!hasSupabaseConnection()) {
    return [];
  }

  const title = getLessonName(lesson).trim();
  const memberNames = getLessonMemberNames(lesson);
  const client = window.swimDb.client;

  if (Array.isArray(lesson.memberIds) && lesson.memberIds.length > 0) {
    const { data, error } = await client
      .from('members')
      .select(
        'id, name, lesson_start_date, total_lessons, used_lessons, last_lesson_date, memo'
      )
      .in('id', lesson.memberIds);

    if (error) {
      throw error;
    }

    if (data.length > 0) {
      return data;
    }
  }

  if (lesson.memberId) {
    const { data, error } = await client
      .from('members')
      .select(
        'id, name, lesson_start_date, total_lessons, used_lessons, last_lesson_date, memo'
      )
      .eq('id', lesson.memberId);

    if (error) {
      throw error;
    }

    if (data.length > 0) {
      return data;
    }
  }

  if (title) {
    const { data, error } = await client
      .from('members')
      .select(
        'id, name, lesson_start_date, total_lessons, used_lessons, last_lesson_date, memo'
      )
      .eq('name', title);

    if (error) {
      throw error;
    }

    if (data.length > 0) {
      return data;
    }
  }

  if (memberNames.length === 0) {
    return [];
  }

  const { data, error } = await client
    .from('members')
    .select(
      'id, name, lesson_start_date, total_lessons, used_lessons, last_lesson_date, memo'
    )
    .in('name', memberNames);

  if (error) {
    throw error;
  }

  return data || [];
}

async function updateDatabaseMemberLessonCounts(lesson, change) {
  const matchedMembers = await findDatabaseMembersForLesson(lesson);

  if (matchedMembers.length === 0) {
    return;
  }

  await Promise.all(
    matchedMembers.map(async (member) => {
      const updateData = {
        used_lessons: getNextUsedLessonCount(member, change),
      };

      if (change > 0 && lesson.date) {
        updateData.last_lesson_date = lesson.date;
      } else if (change < 0) {
        const { data: latestRecords, error: latestError } =
          await window.swimDb.client
            .from('lessons')
            .select('lesson_date')
            .eq('member_id', member.id)
            .eq('lesson_type', 'personal')
            .eq('status', 'completed')
            .order('lesson_date', { ascending: false })
            .limit(1);

        if (latestError) {
          throw latestError;
        }

        updateData.last_lesson_date = latestRecords?.[0]?.lesson_date || null;
      }

      return window.swimDb.client
        .from('members')
        .update(updateData)
        .eq('id', member.id);
    })
  ).then((results) => {
    const failedResult = results.find((result) => result.error);

    if (failedResult) {
      throw failedResult.error;
    }
  });
}

function updateLocalMemberLessonCounts(lesson, change) {
  const savedMembers = getStorageData('personalLessonMembers', []);

  if (!Array.isArray(savedMembers) || savedMembers.length === 0) {
    return;
  }

  const title = getLessonName(lesson).trim();
  const memberNames = getLessonMemberNames(lesson);
  const exactMatches = savedMembers.filter((member) => member.name === title);
  const lessonMemberIds = Array.isArray(lesson.memberIds)
    ? lesson.memberIds.map(String)
    : [lesson.memberId].filter(Boolean).map(String);
  const idMatches = savedMembers.filter((member) =>
    lessonMemberIds.includes(String(member.id))
  );
  const matchedMembers =
    idMatches.length > 0
      ? idMatches
      : exactMatches.length > 0
      ? exactMatches
      : savedMembers.filter((member) => memberNames.includes(member.name));

  if (matchedMembers.length === 0) {
    return;
  }

  const matchedIds = new Set(matchedMembers.map((member) => member.id));
  const updatedMembers = savedMembers.map((member) => {
    if (!matchedIds.has(member.id)) {
      return member;
    }

    const usedLessons = getNextUsedLessonCount(member, change);

    return {
      ...member,
      usedLessons,
      lastLessonDate:
        change > 0 && lesson.date ? lesson.date : member.lastLessonDate,
    };
  });

  saveStorageData('personalLessonMembers', updatedMembers);
}

async function syncPersonalLessonCount(lesson, change) {
  if (!lesson || lesson.type !== 'personal') {
    return;
  }

  if (hasSupabaseConnection()) {
    await updateDatabaseMemberLessonCounts(lesson, change);

    return;
  }

  updateLocalMemberLessonCounts(lesson, change);
}

async function upsertLessonRecord(payload, match) {
  const basePayload = {
    ...payload,
    updated_at: new Date().toISOString(),
  };

  let query = window.swimDb.client.from('lessons').select('id');

  Object.entries(match).forEach(([key, value]) => {
    query = value === null ? query.is(key, null) : query.eq(key, value);
  });

  const { data: existingRows, error: selectError } = await query.limit(1);

  if (selectError) {
    throw selectError;
  }

  const existingId = existingRows?.[0]?.id;

  async function writePayload(nextPayload) {
    if (existingId) {
      return window.swimDb.client
        .from('lessons')
        .update(nextPayload)
        .eq('id', existingId);
    }

    return window.swimDb.client.from('lessons').insert(nextPayload);
  }

  let result = await writePayload(basePayload);

  if (result.error && getErrorText(result.error).includes('memo')) {
    const { memo, ...fallbackPayload } = basePayload;

    result = await writePayload(fallbackPayload);
  }

  if (result.error) {
    throw result.error;
  }
}

async function savePersonalLessonRecord(lesson, status, feedback) {
  if (!hasSupabaseConnection() || !lesson || lesson.type !== 'personal') {
    return;
  }

  const matchedMembers = await findDatabaseMembersForLesson(lesson);

  if (matchedMembers.length === 0) {
    return;
  }

  const cleanFeedback = feedback.trim();

  await Promise.all(
    matchedMembers.map((member) =>
      upsertLessonRecord(
        {
          member_id: member.id,
          lesson_date: lesson.date,
          lesson_time: lesson.time,
          title: getLessonName(lesson),
          lesson_type: 'personal',
          status,
          source: lesson.source || 'personal',
          memo: cleanFeedback || null,
        },
        {
          member_id: member.id,
          lesson_date: lesson.date,
          lesson_time: lesson.time,
          lesson_type: 'personal',
        }
      )
    )
  );
}

async function saveGroupLessonRecord(lesson, status, feedback) {
  if (!hasSupabaseConnection() || !lesson || lesson.type !== 'group') {
    return;
  }

  await upsertLessonRecord(
    {
      member_id: null,
      lesson_date: lesson.date,
      lesson_time: lesson.time,
      title: '단체수업',
      lesson_type: 'group',
      status,
      source: 'recurring',
      memo: feedback.trim() || null,
    },
    {
      member_id: null,
      lesson_date: lesson.date,
      lesson_time: lesson.time,
      lesson_type: 'group',
      source: 'recurring',
    }
  );
}

async function saveLessonRecord(lesson, status, feedback) {
  const cleanFeedback = feedback.trim();

  if (!lesson) {
    return;
  }

  if (cleanFeedback) {
    lessonFeedback[lesson.lessonKey || getLessonFeedbackKey(lesson)] =
      cleanFeedback;

    saveStorageData('lessonFeedback', lessonFeedback);
  }

  if (lesson.type === 'personal') {
    await savePersonalLessonRecord(lesson, status, cleanFeedback);

    return;
  }

  if (lesson.type === 'group') {
    await saveGroupLessonRecord(lesson, status, cleanFeedback);
  }
}

async function deleteLessonRecord(lesson) {
  if (!hasSupabaseConnection() || !lesson) {
    return;
  }

  if (lesson.type === 'personal') {
    const matchedMembers = await findDatabaseMembersForLesson(lesson);

    await Promise.all(
      matchedMembers.map(async (member) => {
        const { error } = await window.swimDb.client
          .from('lessons')
          .delete()
          .eq('member_id', member.id)
          .eq('lesson_date', lesson.date)
          .eq('lesson_time', lesson.time)
          .eq('lesson_type', 'personal');

        if (error) {
          throw error;
        }
      })
    );

    return;
  }

  if (lesson.type === 'group') {
    const { error } = await window.swimDb.client
      .from('lessons')
      .delete()
      .is('member_id', null)
      .eq('lesson_date', lesson.date)
      .eq('lesson_time', lesson.time)
      .eq('lesson_type', 'group');

    if (error) {
      throw error;
    }
  }
}

/* ==================================================
  16. 날짜별 수업 만들기
================================================== */

function getDaySchedule(date, dateKey, holidayName, personalLessonsByDate) {
  const daySchedule = [];

  // 공휴일에는 기본 수업 없음
  if (!holidayName) {
    if (personalLessonsByDate[dateKey]) {
      daySchedule.push(...personalLessonsByDate[dateKey]);
    }

    recurringSchedule.forEach((item) => {
      if (date.getDay() === item.day) {
        daySchedule.push({
          ...item,
          type: 'group',
          source: 'recurring',
        });
      }
    });
  }

  // 직접 추가한 수업은 날짜 기준으로 표시
  addedLessons.forEach((item) => {
    if (item.date === dateKey) {
      daySchedule.push(item);
    }
  });

  daySchedule.sort((a, b) => a.time.localeCompare(b.time));

  return daySchedule;
}

/* ==================================================
  16. 오늘 수업 계산
================================================== */

async function getTodaySchedule() {
  await loadPersonalSchedule();

  const year = today.getFullYear();

  const month = today.getMonth();

  const dateKey = getDateKey(today);

  const holidaysByDate = await getHolidayMap(year, month);

  const personalLessonsByDate = createPersonalLessonsByDate(holidaysByDate);

  const holidayName = holidaysByDate[dateKey];

  return getDaySchedule(today, dateKey, holidayName, personalLessonsByDate);
}

/* ==================================================
  17. 달력 그리기
================================================== */

async function renderCalendar() {
  if (!currentDate || !daysTag) {
    return;
  }

  try {
    personalScheduleLoaded = false;
    await loadPersonalSchedule();
    await loadLessonRecordState();
  } catch (error) {
    console.error('회원관리 개인레슨 일정을 불러오지 못했습니다.', error);
  }

  const firstDayOfMonth = new Date(currYear, currMonth, 1).getDay();

  const lastDateOfMonth = new Date(currYear, currMonth + 1, 0).getDate();

  const previousLastDate = new Date(currYear, currMonth, 0).getDate();

  const holidaysByDate = await getHolidayMap(currYear, currMonth);

  const personalLessonsByDate = createPersonalLessonsByDate(holidaysByDate);

  const scheduleByDate = {};

  let calendarHTML = '';

  // 이전 달 날짜
  for (let i = firstDayOfMonth; i > 0; i--) {
    const previousDate = previousLastDate - i + 1;

    calendarHTML += `
      <li class="inactive">
        <span class="day-number">
          ${previousDate}
        </span>
      </li>
    `;
  }

  // 현재 달 날짜
  for (let day = 1; day <= lastDateOfMonth; day++) {
    const date = new Date(currYear, currMonth, day);

    const dateKey = getDateKey(date);

    const isToday = dateKey === getDateKey(today);

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

    if (dateKey === selectedCalendarDateKey) {
      classes.push('selected');
    }

    const daySchedule = getDaySchedule(
      date,
      dateKey,
      holidayName,
      personalLessonsByDate
    );

    scheduleByDate[dateKey] = daySchedule;

    const scheduleHTML = daySchedule
      .map((item) => {
        const lessonKey = getLessonKey(dateKey, item);

        const isCompleted = completedLessons[lessonKey] === true;

        const isCancelled = cancelledLessons[lessonKey] === true;

        const displayType = isCancelled ? 'cancelled' : item.type;

        return `
            <div
              class="
                schedule-item
                ${displayType}
                ${isCompleted ? 'completed' : ''}
              "
              data-lesson-key="${lessonKey}"
              onclick="
                openLessonDetail(
                  '${dateKey}',
                  '${lessonKey}'
                )
              "
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
                  ${escapeHTML(item.time)}
                </span>
                <span class="schedule-name">
                  ${escapeHTML(getLessonName(item))}
                </span>
              </div>
            </div>
          `;
      })
      .join('');

    calendarHTML += `
      <li class="${classes.join(' ')}" data-date-key="${dateKey}">
        <span class="day-number">
          ${day}
        </span>

        ${
          holidayName
            ? `
              <span class="holiday-name">
                ${escapeHTML(holidayName)}
              </span>
            `
            : ''
        }

        <div class="schedule-list">
          ${scheduleHTML}
        </div>
      </li>
    `;
  }

  // 다음 달 날짜
  const totalCells = firstDayOfMonth + lastDateOfMonth;

  const remainingCells = (7 - (totalCells % 7)) % 7;

  for (let day = 1; day <= remainingCells; day++) {
    calendarHTML += `
      <li class="inactive">
        <span class="day-number">
          ${day}
        </span>
      </li>
    `;
  }

  currentDate.textContent = `${currYear}년 ` + `${months[currMonth]}`;

  daysTag.innerHTML = calendarHTML;

  const monthPrefix = `${currYear}-${String(currMonth + 1).padStart(2, '0')}`;

  if (!selectedCalendarDateKey.startsWith(monthPrefix)) {
    selectedCalendarDateKey = `${monthPrefix}-01`;
    return renderCalendar();
  }

  daysTag.querySelectorAll('[data-date-key]').forEach((dayElement) => {
    dayElement.addEventListener('click', () => {
      selectedCalendarDateKey = dayElement.dataset.dateKey;

      daysTag.querySelectorAll('[data-date-key]').forEach((element) => {
        element.classList.toggle(
          'selected',
          element.dataset.dateKey === selectedCalendarDateKey
        );
      });

      const selectedDate = new Date(`${selectedCalendarDateKey}T00:00:00`);

      renderTodayLessons(
        scheduleByDate[selectedCalendarDateKey] || [],
        selectedDate,
        holidaysByDate[selectedCalendarDateKey]
      );
    });
  });

  const selectedDate = new Date(`${selectedCalendarDateKey}T00:00:00`);
  const selectedSchedule = scheduleByDate[selectedCalendarDateKey] || [];

  renderTodayLessons(
    selectedSchedule,
    selectedDate,
    holidaysByDate[selectedCalendarDateKey]
  );

  if (selectedCalendarDateKey !== getDateKey(today)) {
    const todaySchedule = await getTodaySchedule();

    saveHomeTodaySchedule(todaySchedule);
  }
}

/* ==================================================
  18. 오늘 수업
================================================== */

function saveHomeTodaySchedule(schedule) {
  const dateKey = getDateKey(today);
  const homeTodaySchedule = schedule.map((item) => {
    const lessonKey = getLessonKey(dateKey, item);
    const isCompleted = completedLessons[lessonKey] === true;
    const isCancelled = cancelledLessons[lessonKey] === true;
    const displayType = isCancelled ? 'cancelled' : item.type;

    return {
      lessonKey,
      time: item.time,
      name: getLessonName(item),
      type: displayType,
      typeName: getLessonTypeName(displayType),
      completed: isCompleted,
      cancelled: isCancelled,
    };
  });

  saveStorageData('homeTodayLessons', homeTodaySchedule);
  localStorage.setItem('todayLessonCount', String(schedule.length));
}

function renderTodayLessons(schedule, targetDate = today, holidayName = '') {
  if (todayDate) {
    todayDate.textContent =
      `${targetDate.getMonth() + 1}월 ` +
      `${targetDate.getDate()}일 ` +
      `${weekdays[targetDate.getDay()]}`;
  }

  if (todayCount) {
    todayCount.textContent = `${schedule.length}건`;
  }

  const dateKey = getDateKey(targetDate);

  if (dateKey === getDateKey(today)) {
    saveHomeTodaySchedule(schedule);
  }

  if (!todayLessonList) {
    return;
  }

  if (schedule.length === 0) {
    todayLessonList.innerHTML = `
      <p class="today-empty">
        ${
          holidayName
            ? `<strong>${escapeHTML(holidayName)}</strong><br />공휴일이라 예정된 수업이 없습니다.`
            : '예정된 수업이 없습니다.'
        }
      </p>
    `;

    return;
  }

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
            onclick="openLessonDetail('${dateKey}', '${lessonKey}')"
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
              ${escapeHTML(item.time)}
            </span>

            <span class="today-lesson-name">
              ${escapeHTML(name)}
            </span>

            <span
              class="
                today-lesson-type
                ${displayType}
              "
            >
              ${escapeHTML(typeName)}
            </span>
          </div>
        `;
    })
    .join('');
}

/* ==================================================
  19. 수업 찾기
================================================== */

function findLesson(dateKey, lessonKey) {
  const addedLesson = addedLessons.find(
    (item) => getLessonKey(dateKey, item) === lessonKey
  );

  if (addedLesson) {
    return addedLesson;
  }

  if (lessonKey.includes('_personal_')) {
    const personalLesson = personalSchedule.find((item) => {
      const key = `${dateKey}_personal_` + `${item.id}_${item.time}`;

      return key === lessonKey;
    });

    if (personalLesson) {
      return {
        id: personalLesson.id,
        memberId: personalLesson.memberId,
        memberIds:
          personalLesson.memberIds || [personalLesson.memberId].filter(Boolean),
        date: dateKey,
        time: personalLesson.time,
        title: personalLesson.name,
        type: 'personal',
        source: 'personal',
      };
    }
  }

  if (lessonKey.includes('_group_')) {
    const groupLesson = recurringSchedule.find((item) => {
      const key = `${dateKey}_group_` + `${item.time}`;

      return key === lessonKey;
    });

    if (groupLesson) {
      return {
        date: dateKey,
        time: groupLesson.time,
        title: '단체수업',
        type: 'group',
        source: 'recurring',
      };
    }
  }

  return null;
}

/* ==================================================
  20. 수업 상세보기
================================================== */

function openLessonDetail(dateKey, lessonKey) {
  const lesson = findLesson(dateKey, lessonKey);

  if (!lesson) {
    console.error('수업 정보를 찾지 못했습니다.');

    return;
  }

  selectedLesson = {
    ...lesson,
    lessonKey,
  };

  const dateObject = new Date(`${dateKey}T00:00:00`);

  if (detailDate) {
    detailDate.textContent =
      `${dateObject.getFullYear()}년 ` +
      `${dateObject.getMonth() + 1}월 ` +
      `${dateObject.getDate()}일 ` +
      `${weekdays[dateObject.getDay()]}`;
  }

  if (detailTime) {
    detailTime.textContent = lesson.time;
  }

  if (detailType) {
    detailType.textContent = getLessonTypeName(lesson.type);
  }

  if (detailTitle) {
    detailTitle.textContent = getLessonName(lesson);
  }

  if (detailStatus) {
    if (cancelledLessons[lessonKey]) {
      detailStatus.value = 'cancelled';
    } else if (completedLessons[lessonKey]) {
      detailStatus.value = 'completed';
    } else {
      detailStatus.value = 'scheduled';
    }
  }

  if (detailMemo) {
    detailMemo.value = lessonFeedback[lessonKey] || '';
  }

  if (deleteLessonBtn) {
    deleteLessonBtn.style.display =
      lesson.source === 'added' ? 'block' : 'none';
  }

  if (lessonDetailModal) {
    lessonDetailModal.classList.add('open');

    lessonDetailModal.setAttribute('aria-hidden', 'false');
  }
}

/* ==================================================
  21. 수업 상세 팝업
================================================== */

function closeLessonDetailModal() {
  if (!lessonDetailModal) return;

  lessonDetailModal.classList.remove('open');

  lessonDetailModal.setAttribute('aria-hidden', 'true');

  selectedLesson = null;
}

if (closeDetailModal && lessonDetailModal) {
  closeDetailModal.addEventListener('click', closeLessonDetailModal);

  lessonDetailModal.addEventListener('click', (event) => {
    if (event.target === lessonDetailModal) {
      closeLessonDetailModal();
    }
  });
}

/* ==================================================
  22. 수업 상태 저장
================================================== */

if (confirmDetailBtn && detailStatus) {
  confirmDetailBtn.addEventListener('click', async () => {
    if (!selectedLesson) {
      return;
    }

    const lessonKey = selectedLesson.lessonKey;

    const status = detailStatus.value;
    const feedback = detailMemo?.value.trim() || '';
    const wasCompleted = completedLessons[lessonKey] === true;
    const wasCancelled = cancelledLessons[lessonKey] === true;
    const previousCompletedLessons = { ...completedLessons };
    const previousCancelledLessons = { ...cancelledLessons };

    // 기존 상태 초기화
    delete completedLessons[lessonKey];

    delete cancelledLessons[lessonKey];

    // 완료
    if (status === 'completed') {
      completedLessons[lessonKey] = true;
    }

    // 취소
    if (status === 'cancelled') {
      cancelledLessons[lessonKey] = true;
    }

    const isCompleted = completedLessons[lessonKey] === true;
    const isCancelled = cancelledLessons[lessonKey] === true;

    try {
      if (
        wasCompleted !== isCompleted ||
        wasCancelled !== isCancelled ||
        feedback ||
        selectedLesson.type === 'group'
      ) {
        await saveLessonRecord(selectedLesson, status, feedback);
      }

      if (wasCompleted !== isCompleted) {
        await syncPersonalLessonCount(selectedLesson, isCompleted ? 1 : -1);
      }

      saveStorageData('completedLessons', completedLessons);

      saveStorageData('cancelledLessons', cancelledLessons);

      closeLessonDetailModal();

      renderCalendar();
    } catch (error) {
      completedLessons = previousCompletedLessons;

      cancelledLessons = previousCancelledLessons;

      console.error('회원 진행 횟수를 변경하지 못했습니다.', error);

      alert(
        `회원 진행 횟수 변경 중 오류가 발생했습니다.\n${getErrorText(error)}`
      );
    }
  });
}

/* ==================================================
  23. 직접 추가한 수업 삭제
================================================== */

if (deleteLessonBtn) {
  deleteLessonBtn.addEventListener('click', async () => {
    if (!selectedLesson) {
      return;
    }

    if (selectedLesson.source !== 'added') {
      return;
    }

    const shouldDelete = confirm('이 수업을 삭제할까요?');

    if (!shouldDelete) {
      return;
    }

    const wasCompleted = completedLessons[selectedLesson.lessonKey] === true;

    try {
      await deleteLessonRecord(selectedLesson);

      if (wasCompleted) {
        await syncPersonalLessonCount(selectedLesson, -1);
      }
    } catch (error) {
      console.error('회원 진행 횟수를 되돌리지 못했습니다.', error);

      alert(
        `회원 진행 횟수 변경 중 오류가 발생했습니다.\n${getErrorText(error)}`
      );

      return;
    }

    addedLessons = addedLessons.filter((item) => item.id !== selectedLesson.id);

    delete completedLessons[selectedLesson.lessonKey];

    delete cancelledLessons[selectedLesson.lessonKey];

    saveStorageData('addedLessons', addedLessons);

    saveStorageData('completedLessons', completedLessons);

    saveStorageData('cancelledLessons', cancelledLessons);

    closeLessonDetailModal();

    renderCalendar();
  });
}

/* ==================================================
  24. 완료 체크
================================================== */

async function toggleComplete(event, lessonKey) {
  event.stopPropagation();

  const dateKey = lessonKey.slice(0, 10);
  const lesson = findLesson(dateKey, lessonKey);
  const isCompleted = completedLessons[lessonKey] === true;
  const previousCompletedLessons = { ...completedLessons };
  const previousCancelledLessons = { ...cancelledLessons };

  if (isCompleted) {
    delete completedLessons[lessonKey];
  } else {
    completedLessons[lessonKey] = true;

    delete cancelledLessons[lessonKey];
  }

  try {
    await saveLessonRecord(
      lesson,
      isCompleted ? 'scheduled' : 'completed',
      lessonFeedback[lessonKey] || ''
    );

    await syncPersonalLessonCount(lesson, isCompleted ? -1 : 1);

    saveStorageData('completedLessons', completedLessons);

    saveStorageData('cancelledLessons', cancelledLessons);

    renderCalendar();
  } catch (error) {
    completedLessons = previousCompletedLessons;

    cancelledLessons = previousCancelledLessons;

    console.error('회원 진행 횟수를 변경하지 못했습니다.', error);

    alert(
      `회원 진행 횟수 변경 중 오류가 발생했습니다.\n${getErrorText(error)}`
    );
  }
}

/* ==================================================
  25. 이전 달 / 다음 달
================================================== */

if (prevButton) {
  prevButton.addEventListener('click', () => {
    currMonth--;

    if (currMonth < 0) {
      currMonth = 11;
      currYear--;
    }

    renderCalendar();
  });
}

if (nextButton) {
  nextButton.addEventListener('click', () => {
    currMonth++;

    if (currMonth > 11) {
      currMonth = 0;
      currYear++;
    }

    renderCalendar();
  });
}

/* ==================================================
  26. 수업 추가 팝업
================================================== */

function openLessonModal() {
  if (!lessonModal) return;

  if (lessonDate) {
    lessonDate.value = getDateKey(today);
  }

  if (lessonType) {
    lessonType.value = 'personal';
  }

  if (lessonTime) {
    lessonTime.value = '';
  }

  if (lessonTitle) {
    lessonTitle.value = '';
  }

  lessonModal.classList.add('open');

  lessonModal.setAttribute('aria-hidden', 'false');
}

function closeAddLessonModal() {
  if (!lessonModal) return;

  lessonModal.classList.remove('open');

  lessonModal.setAttribute('aria-hidden', 'true');
}

if (addLessonBtn && lessonModal) {
  addLessonBtn.addEventListener('click', openLessonModal);
}

if (closeLessonModal && lessonModal) {
  closeLessonModal.addEventListener('click', closeAddLessonModal);

  lessonModal.addEventListener('click', (event) => {
    if (event.target === lessonModal) {
      closeAddLessonModal();
    }
  });
}

/* ==================================================
  27. 수업 추가 저장
================================================== */

if (saveLessonBtn && lessonType && lessonDate && lessonTime && lessonTitle) {
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

    saveStorageData('addedLessons', addedLessons);

    closeAddLessonModal();

    renderCalendar();
  });
}

/* ==================================================
  28. 처음 실행
================================================== */

window.openLessonDetail = openLessonDetail;
window.toggleComplete = toggleComplete;

renderCalendar();
})();
