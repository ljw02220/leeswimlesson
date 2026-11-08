/* ==================================================
  1. 설정
================================================== */

const GROUP_LESSON_RATE = 27000;
const PERSONAL_LESSON_SHARE = 0.7;
const TAX_RATE = 0.033;
const NET_RATE = 1 - TAX_RATE;

const RECURRING_GROUP_SCHEDULE = [
  { day: 2, time: '19:00' },
  { day: 2, time: '20:00' },
  { day: 2, time: '21:00' },
  { day: 3, time: '20:00' },
  { day: 3, time: '21:00' },
  { day: 4, time: '19:00' },
  { day: 4, time: '20:00' },
  { day: 4, time: '21:00' },
  { day: 5, time: '20:00' },
  { day: 5, time: '21:00' },
];

const MEMBER_STORAGE_KEY = 'personalLessonMembers';
const REPORT_STORAGE_KEY = 'personalLessonReports';
const salaryGuideButton = document.getElementById('salaryGuideButton');
const salaryGuideContent = document.getElementById('salaryGuideContent');
salaryGuideButton?.addEventListener('click', () => {
  showMonthlySalaryGuide(currentYear, currentMonth);
});
document
  .getElementById('closeSalaryGuide')
  ?.addEventListener('click', () => salaryGuideContent?.close());
salaryGuideContent?.addEventListener('close', () =>
  salaryGuideButton?.setAttribute('aria-expanded', 'false')
);
salaryGuideContent?.addEventListener('click', (event) => {
  if (event.target !== salaryGuideContent) return;
  const bounds = salaryGuideContent.getBoundingClientRect();
  if (
    event.clientX < bounds.left ||
    event.clientX > bounds.right ||
    event.clientY < bounds.top ||
    event.clientY > bounds.bottom
  )
    salaryGuideContent.close();
});
const HOLIDAY_API_URL =
  'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService';
const HOLIDAY_SERVICE_KEY = window.SWIM_CONFIG?.HOLIDAY_API_KEY || '';

const HOLIDAY_OVERRIDES = {
  '2026-09-24': '추석 연휴',
  '2026-09-25': '추석',
  '2026-09-26': '추석 연휴',
};

const holidayCache = {};

/* ==================================================
  2. DOM
================================================== */

const financeMonth = document.getElementById('financeMonth');
const prevMonthButton = document.getElementById('prevMonthButton');
const nextMonthButton = document.getElementById('nextMonthButton');
const expectedSalaryLabel = document.getElementById('expectedSalaryLabel');
const expectedSalary = document.getElementById('expectedSalary');
const paidSalaryCard = document.getElementById('paidSalaryCard');
const paidSalary = document.getElementById('paidSalary');
const paidSalaryStatus = document.getElementById('paidSalaryStatus');
const groupIncome = document.getElementById('groupIncome');
const groupLessonCount = document.getElementById('groupLessonCount');
const personalIncome = document.getElementById('personalIncome');
const personalMemberCount = document.getElementById('personalMemberCount');
const groupCalculation = document.getElementById('groupCalculation');
const groupCalculationAmount = document.getElementById(
  'groupCalculationAmount'
);
const personalCalculationAmount = document.getElementById(
  'personalCalculationAmount'
);
const grossIncome = document.getElementById('grossIncome');
const taxAmount = document.getElementById('taxAmount');
const netIncome = document.getElementById('netIncome');
const summaryMonth = document.getElementById('summaryMonth');
const summaryGroupCount = document.getElementById('summaryGroupCount');
const summaryGroupIncome = document.getElementById('summaryGroupIncome');
const summaryPersonalIncome = document.getElementById('summaryPersonalIncome');
const summaryGrossIncome = document.getElementById('summaryGrossIncome');
const summaryNetIncome = document.getElementById('summaryNetIncome');
const personalReportSummary = document.getElementById('personalReportSummary');
const monthlyReport = document.getElementById('monthlyReport');
const copyReportButton = document.getElementById('copyReportButton');
const addPersonalReportButton = document.getElementById(
  'addPersonalReportButton'
);
const personalReportModal = document.getElementById('personalReportModal');
const closePersonalReportModal = document.getElementById(
  'closePersonalReportModal'
);
const cancelPersonalReportButton = document.getElementById(
  'cancelPersonalReportButton'
);
const personalReportForm = document.getElementById('personalReportForm');
const personalReportModalTitle = document.getElementById(
  'personalReportModalTitle'
);
const reportMemberName = document.getElementById('reportMemberName');
const reportPaymentAmount = document.getElementById('reportPaymentAmount');
const reportPaymentDate = document.getElementById('reportPaymentDate');
const reportReportedAt = document.getElementById('reportReportedAt');
const reportResidenceType = document.getElementById('reportResidenceType');
const reportPaymentMethod = document.getElementById('reportPaymentMethod');

/* ==================================================
  3. 현재 조회 월
================================================== */

const today = new Date();

let currentYear = today.getFullYear();
let currentMonth = today.getMonth();
let latestReportMembers = [];
let editingReportId = null;

/* ==================================================
  4. 공통 함수
================================================== */

function getSupabaseClient() {
  if (!window.swimDb?.isConfigured() || !window.swimDb?.client) {
    return null;
  }

  return window.swimDb.client;
}

function formatCurrency(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ko-KR')}원`;
}

function parseMoney(value) {
  const numberText = String(value || '').replace(/[^\d]/g, '');

  return Number(numberText) || 0;
}

function formatMoneyInputValue(value) {
  const amount = parseMoney(value);

  return amount > 0 ? amount.toLocaleString('ko-KR') : '';
}

function formatDate(dateValue) {
  if (!dateValue) {
    return '';
  }

  const date = new Date(`${dateValue}T00:00:00`);

  return `${date.getMonth() + 1}월 ${date.getDate()}일`;
}

function formatTime(timeValue) {
  if (!timeValue) {
    return '';
  }

  return String(timeValue).slice(0, 5);
}

function formatDays(days) {
  if (!days) {
    return '';
  }

  return Array.isArray(days) ? days.join(', ') : String(days);
}

function getMonthRange(year, month) {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 1);

  const start = [
    startDate.getFullYear(),
    String(startDate.getMonth() + 1).padStart(2, '0'),
    '01',
  ].join('-');

  const end = [
    endDate.getFullYear(),
    String(endDate.getMonth() + 1).padStart(2, '0'),
    '01',
  ].join('-');

  return { start, end };
}

function getSalarySettlementRange(year, month) {
  // Salary is based on the month actually reported, regardless of payment date.
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  const start = toDateKey(startDate);
  const end = toDateKey(endDate);

  return { start, end };
}

function getSalaryReportMonth(year, month) {
  return new Date(year, month - 1, 1);
}

function getSalaryActivityMonth(year, month) {
  const activityMonth = getSalaryReportMonth(year, month);

  return {
    year: activityMonth.getFullYear(),
    month: activityMonth.getMonth(),
  };
}

function getSalaryActivityMonthLabel(year, month) {
  const activityMonth = getSalaryReportMonth(year, month);

  return `${activityMonth.getMonth() + 1}월 수업`;
}

function getSalaryReportLabel(year, month) {
  const reportMonth = getSalaryReportMonth(year, month);

  return `${reportMonth.getFullYear()}년 ${
    reportMonth.getMonth() + 1
  }월 보고분 · ${year}년 ${month + 1}월 15일 입금`;
}

function getDefaultReportedAt(year, month) {
  return toDateKey(new Date(year, month, 0));
}

function toDateKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

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

function getErrorMessage(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');
}

function normalizeDateInput(value) {
  const trimmedValue = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  const numbers = trimmedValue.replace(/[^\d]/g, '');

  if (numbers.length === 8) {
    return [numbers.slice(0, 4), numbers.slice(4, 6), numbers.slice(6, 8)].join(
      '-'
    );
  }

  return '';
}

function updateMonthText() {
  const monthNumber = currentMonth + 1;
  const monthText = `${currentYear}년 ${monthNumber}월 급여`;
  const salaryLabel = getSalaryReportLabel(currentYear, currentMonth);

  if (financeMonth) {
    financeMonth.textContent = monthText;
  }

  if (summaryMonth) {
    summaryMonth.textContent = salaryLabel;
  }
  const reportMonthLabel = document.getElementById('reportMonthLabel');
  const reportMonth = getSalaryReportMonth(currentYear, currentMonth);
  if (reportMonthLabel)
    reportMonthLabel.textContent = `${reportMonth.getFullYear()}년 ${
      reportMonth.getMonth() + 1
    }월 보고`;
  const reportPeriod = document.getElementById('reportSettlementRange');
  if (reportPeriod) {
    const { start, end } = getSalarySettlementRange(currentYear, currentMonth);
    const lastDate = new Date(`${end}T00:00:00`);
    lastDate.setDate(lastDate.getDate() - 1);
    reportPeriod.textContent = `${start} ~ ${toDateKey(lastDate)} 보고분 · ${currentYear}.${monthNumber}.15 급여 반영`;
  }

  if (expectedSalaryLabel) {
    expectedSalaryLabel.textContent = salaryLabel;
  }
}

/* ==================================================
  5. 공휴일
================================================== */

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

/* ==================================================
  6. 단체강습 조회
================================================== */

async function createRecurringGroupLessons(year, month, useStoredState = true) {
  const cancelledLessons = useStoredState ? getStorageData('cancelledLessons', {}) : {};
  const completedLessons = useStoredState ? getStorageData('completedLessons', {}) : {};
  const deletedLessons = useStoredState ? getStorageData('deletedLessons', {}) : {};
  const holidaysByDate = await getHolidays(year, month);
  const lastDay = new Date(year, month + 1, 0).getDate();
  const lessons = [];

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(year, month, day);
    const dateKey = toDateKey(date);

    if (holidaysByDate[dateKey]) {
      continue;
    }

    RECURRING_GROUP_SCHEDULE.forEach((item) => {
      if (date.getDay() !== item.day) {
        return;
      }

      const lessonKey = `${dateKey}_group_${item.time}`;
      let status = 'scheduled';

      if (deletedLessons[lessonKey]) {
        status = 'deleted';
      } else if (cancelledLessons[lessonKey]) {
        status = 'cancelled';
      } else if (completedLessons[lessonKey]) {
        status = 'completed';
      }

      lessons.push({
        id: lessonKey,
        lesson_date: dateKey,
        lesson_time: item.time,
        lesson_type: 'group',
        status,
        source: 'recurring',
      });
    });
  }

  return lessons;
}

function mergeGroupLessonRecords(recurring, records) {
  const key = (lesson) => `${lesson.lesson_date}_${String(lesson.lesson_time).slice(0, 5)}`;
  const merged = new Map(recurring.map((lesson) => [key(lesson), lesson]));
  const latest = new Map();
  records.forEach((record) => {
    const previous = latest.get(key(record));
    if (!previous || String(record.updated_at || record.created_at || '') >=
        String(previous.updated_at || previous.created_at || '')) latest.set(key(record), record);
  });
  latest.forEach((record, recordKey) => merged.set(recordKey, record));
  return Array.from(merged.values());
}

async function getGroupLessons(year = currentYear, month = currentMonth) {
  const client = getSupabaseClient();
  const activityMonth = getSalaryActivityMonth(year, month);
  if (!client) return createRecurringGroupLessons(activityMonth.year, activityMonth.month);
  const { start, end } = getMonthRange(activityMonth.year, activityMonth.month);
  const [recurring, result] = await Promise.all([
    createRecurringGroupLessons(activityMonth.year, activityMonth.month, false),
    client.from('lessons')
      .select('id, lesson_date, lesson_time, lesson_type, status, source, created_at, updated_at')
      .eq('lesson_type', 'group').gte('lesson_date', start).lt('lesson_date', end),
  ]);
  if (result.error) throw result.error;
  return mergeGroupLessonRecords(recurring, result.data || []);
}

/* ==================================================
  7. 개인레슨 회원 조회
================================================== */

function mapLocalMember(member) {
  return {
    id: member.id,
    name: member.name || '',
    phone: member.phone || '',
    lesson_format: member.lessonFormat || member.lesson_format || '1:1',
    days: member.days || [],
    lesson_time: member.time || member.lesson_time || '',
    total_lessons: Number(member.totalLessons ?? member.total_lessons ?? 0),
    used_lessons: Number(member.usedLessons ?? member.used_lessons ?? 0),
    payment_amount: Number(member.paymentAmount ?? member.payment_amount ?? 0),
    payment_date: member.paymentDate || member.payment_date || '',
    payment_status: member.paymentStatus || member.payment_status || '확인필요',
    residence_type: member.residenceType || member.residence_type || '7단지',
    payment_method: member.paymentMethod || member.payment_method || '계좌이체',
    personal_reported_at:
      member.personalReportedAt || member.personal_reported_at || '',
    personal_reported_payment_date:
      member.personalReportedPaymentDate ||
      member.personal_reported_payment_date ||
      '',
    last_lesson_date: member.lastLessonDate || member.last_lesson_date || '',
    status: member.status || '수강중',
  };
}

function isPersonalSettlementMember(member) {
  const { start, end } = getSalarySettlementRange(currentYear, currentMonth);
  const amount = Number(member.payment_amount) || 0;
  const paymentDate = member.payment_date || '';
  const reportedAt = member.personal_reported_at || '';
  const reportedPaymentDate = member.personal_reported_payment_date || '';

  if (amount <= 0 || member.payment_status === '미납') {
    return false;
  }

  if (!paymentDate) {
    return false;
  }

  if (reportedPaymentDate !== paymentDate) {
    return false;
  }

  return reportedAt >= start && reportedAt < end;
}

function getLocalPersonalMembers() {
  const localReports = getStorageData(REPORT_STORAGE_KEY, []);

  if (localReports.length > 0) {
    const { start, end } = getSalarySettlementRange(currentYear, currentMonth);

    return localReports
      .filter(
        (report) => report.reported_at >= start && report.reported_at < end
      )
      .map(mapPersonalReport);
  }

  const localMembers = getStorageData(MEMBER_STORAGE_KEY, []);
  return localMembers.map(mapLocalMember).filter(isPersonalSettlementMember);
}

function mapPersonalReport(report) {
  return {
    id: report.id,
    member_id: report.member_id || null,
    name: report.member_name || report.name || '',
    phone: report.phone || '',
    lesson_format: report.lesson_format || '1:1',
    days: report.days || [],
    lesson_time: report.lesson_time || '',
    payment_amount: Number(report.payment_amount || 0),
    payment_date: report.payment_date || '',
    payment_status: report.payment_status || '완납',
    residence_type: report.residence_type || '',
    payment_method: report.payment_method || '',
    personal_reported_at: report.reported_at || '',
    personal_reported_payment_date: report.payment_date || '',
    status: '보고완료',
  };
}

function mapMemberToManualReport(member, fallbackName) {
  return {
    member_id: member?.id || null,
    member_name: member?.name || fallbackName,
    phone: member?.phone || null,
    lesson_format: member?.lesson_format || member?.lessonFormat || '개인레슨',
    days: member?.days || [],
    lesson_time: member?.lesson_time || member?.time || null,
    payment_status: '완납',
    residence_type: member?.residence_type || member?.residenceType || '7단지',
    payment_method:
      member?.payment_method || member?.paymentMethod || '계좌이체',
    memo: '재무 화면에서 직접 추가',
  };
}

function saveLocalPersonalReport(report) {
  const reports = getStorageData(REPORT_STORAGE_KEY, []);
  const existingIndex = reports.findIndex(
    (item) =>
      item.member_name === report.member_name &&
      item.payment_date === report.payment_date &&
      item.reported_at === report.reported_at
  );

  if (existingIndex !== -1) {
    reports[existingIndex] = {
      ...reports[existingIndex],
      ...report,
    };
  } else {
    reports.push({
      id: Date.now(),
      ...report,
    });
  }

  saveStorageData(REPORT_STORAGE_KEY, reports);
}

async function findMemberForManualReport(name) {
  const client = getSupabaseClient();

  if (client) {
    const { data, error } = await client
      .from('members')
      .select(
        'id, name, phone, lesson_format, days, lesson_time, payment_amount, payment_date, residence_type, payment_method'
      )
      .eq('name', name)
      .limit(1);

    if (error) {
      console.error('보고 추가용 회원 조회 실패:', error);
    }

    return data?.[0] || null;
  }

  const localMembers = getStorageData(MEMBER_STORAGE_KEY, []);

  return localMembers.find((member) => member.name === name) || null;
}

async function saveManualPersonalReport(report) {
  const client = getSupabaseClient();

  if (!client) {
    saveLocalPersonalReport(report);

    return;
  }

  const existing = await client
    .from('personal_lesson_reports')
    .select('id')
    .eq('member_name', report.member_name)
    .eq('payment_date', report.payment_date)
    .eq('reported_at', report.reported_at)
    .limit(1);

  if (existing.error) {
    throw existing.error;
  }

  if (existing.data && existing.data.length > 0) {
    const { error } = await client
      .from('personal_lesson_reports')
      .update(report)
      .eq('id', existing.data[0].id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await client.from('personal_lesson_reports').insert(report);

  if (error) {
    throw error;
  }
}

async function getPersonalMembers() {
  const client = getSupabaseClient();

  if (!client) {
    return getLocalPersonalMembers();
  }

  const { start, end } = getSalarySettlementRange(currentYear, currentMonth);

  const { data, error } = await client
    .from('personal_lesson_reports')
    .select('*')
    .gte('reported_at', start)
    .lt('reported_at', end)
    .order('reported_at', { ascending: false });

  if (error) {
    console.error('Supabase 개인레슨 보고 내역을 불러오지 못했습니다.', error);

    const membersResult = await client
      .from('members')
      .select('*')
      .order('created_at', { ascending: false });

    if (membersResult.error) {
      console.error(
        'Supabase 회원 데이터를 불러오지 못했습니다.',
        membersResult.error
      );

      return getLocalPersonalMembers();
    }

    return (membersResult.data || []).filter(isPersonalSettlementMember);
  }

  return (data || []).map(mapPersonalReport);
}

/* ==================================================
  8. 실제 급여 입금 조회
================================================== */

async function getPaidSalary() {
  const client = getSupabaseClient();

  if (!client) {
    return 0;
  }

  const { start, end } = getMonthRange(currentYear, currentMonth);

  const { data, error } = await client
    .from('transactions')
    .select('id, transaction_date, type, category, amount, memo')
    .eq('type', 'salary')
    .gte('transaction_date', start)
    .lt('transaction_date', end);

  if (error) {
    console.error('Supabase 입금 데이터를 불러오지 못했습니다.', error);

    return 0;
  }

  return (data || []).reduce(
    (sum, item) => sum + (Number(item.amount) || 0),
    0
  );
}

/* ==================================================
  9. 급여 계산
================================================== */

function calculateFinance(groupLessons, personalMembers, paidAmount) {
  const groupActivityLabel = getSalaryActivityMonthLabel(
    currentYear,
    currentMonth
  );
  const activeGroupLessons = groupLessons.filter(
    (lesson) => !['cancelled', 'deleted'].includes(lesson.status)
  );
  const completedGroupLessons = activeGroupLessons.filter(
    (lesson) => lesson.status === 'completed'
  );
  const groupCount = activeGroupLessons.length;
  const completedGroupCount = completedGroupLessons.length;
  const groupAmount = groupCount * GROUP_LESSON_RATE;
  const personalBaseAmount = personalMembers.reduce(
    (sum, member) => sum + (Number(member.payment_amount) || 0),
    0
  );
  const personalAmount = personalBaseAmount * PERSONAL_LESSON_SHARE;
  const grossAmount = groupAmount + personalAmount;
  const tax = grossAmount * TAX_RATE;
  const netAmount = grossAmount * NET_RATE;

  return {
    groupCount,
    completedGroupCount,
    groupAmount,
    personalBaseAmount,
    personalAmount,
    grossAmount,
    tax,
    netAmount,
    paidAmount,
    personalMemberCount: personalMembers.length,
    groupActivityLabel,
  };
}

/* ==================================================
  10. 급여 화면 출력
================================================== */

function renderFinanceSummary(result) {
  if (expectedSalary) {
    expectedSalary.textContent = formatCurrency(result.netAmount);
  }

  if (paidSalary) {
    paidSalary.textContent = formatCurrency(result.paidAmount);
  }

  if (paidSalaryStatus) {
    paidSalaryStatus.textContent =
      result.paidAmount > 0 ? '입금 완료' : '미입금';
  }

  if (groupIncome) {
    groupIncome.textContent = formatCurrency(result.groupAmount);
  }

  if (groupLessonCount) {
    groupLessonCount.textContent =
      `${result.groupActivityLabel} 총 ${result.groupCount}회` +
      ` · 완료 ${result.completedGroupCount}회`;
  }

  if (personalIncome) {
    personalIncome.textContent = formatCurrency(result.personalAmount);
  }

  if (personalMemberCount) {
    personalMemberCount.textContent =
      `정산 ${result.personalMemberCount}건 · 수강료 ` +
      `${formatCurrency(result.personalBaseAmount)}`;
  }

  if (groupCalculation) {
    groupCalculation.textContent =
      `${result.groupActivityLabel} ${result.groupCount}회 × ` +
      `${GROUP_LESSON_RATE.toLocaleString('ko-KR')}원`;
  }

  if (groupCalculationAmount) {
    groupCalculationAmount.textContent = formatCurrency(result.groupAmount);
  }

  if (personalCalculationAmount) {
    personalCalculationAmount.textContent = formatCurrency(
      result.personalAmount
    );
  }

  if (grossIncome) {
    grossIncome.textContent = formatCurrency(result.grossAmount);
  }

  if (taxAmount) {
    taxAmount.textContent = `-${formatCurrency(result.tax)}`;
  }

  if (netIncome) {
    netIncome.textContent = formatCurrency(result.netAmount);
  }

  if (summaryGroupCount) {
    summaryGroupCount.textContent = `${result.groupCount}회`;
  }

  if (summaryGroupIncome) {
    summaryGroupIncome.textContent = formatCurrency(result.groupAmount);
  }

  if (summaryPersonalIncome) {
    summaryPersonalIncome.textContent = formatCurrency(result.personalAmount);
  }

  if (summaryGrossIncome) {
    summaryGrossIncome.textContent = formatCurrency(result.grossAmount);
  }

  if (summaryNetIncome) {
    summaryNetIncome.textContent = formatCurrency(result.netAmount);
  }
}

/* ==================================================
  11. 개인레슨 월말 보고
================================================== */

function createReportText(member) {
  const dayText = formatDays(member.days);
  const timeText = formatTime(member.lesson_time);
  const firstLine = [dayText, timeText, member.name, member.residence_type]
    .filter(Boolean)
    .join(' ');
  const paymentAmount = Number(member.payment_amount) || 0;
  const paymentMethod =
    member.payment_method === '계좌이체' ? '계좌' : member.payment_method || '';
  const lessonLine = [
    member.lesson_format,
    paymentAmount ? `${paymentAmount.toLocaleString('ko-KR')}원` : '',
    paymentMethod ? `(${paymentMethod})` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const paymentLine = member.payment_date
    ? `${formatDate(member.payment_date)} 입금`
    : member.payment_status || '확인필요';

  return [firstLine, member.phone || '', lessonLine, paymentLine]
    .filter(Boolean)
    .join('\n');
}

function renderMonthlyReport(personalMembers) {
  const count = document.getElementById('completedReportCount');
  if (count) count.textContent = String(personalMembers.length);
  if (!monthlyReport) {
    return;
  }

  if (personalMembers.length === 0) {
    const { start, end } = getSalarySettlementRange(currentYear, currentMonth);

    monthlyReport.innerHTML = `
      <p class="report-empty">
        ${formatDate(start)}부터 ${formatDate(
      end
    )} 전까지 보고 완료된 개인레슨 내역이 없습니다.
      </p>
    `;

    return;
  }

  monthlyReport.innerHTML = personalMembers
    .map((member) => {
      const dayText = formatDays(member.days);
      const timeText = formatTime(member.lesson_time);
      const paymentAmount = Number(member.payment_amount) || 0;
      const paymentMethod =
        member.payment_method === '계좌이체'
          ? '계좌'
          : member.payment_method || '';
      const paymentLabel = member.payment_date
        ? `${formatDate(member.payment_date)} 입금`
        : member.payment_status || '확인필요';

      return `
        <article class="report-item">
          <div class="report-item-header">
            <strong>
              ${[dayText, timeText, member.name, member.residence_type]
                .filter(Boolean)
                .join(' ')}
            </strong>

            <button
              type="button"
              class="report-edit-button"
              data-report-edit-id="${member.id}"
            >
              수정
            </button>

            <button
              type="button"
              class="report-delete-button"
              data-report-delete-id="${member.id}"
            >
              삭제
            </button>
          </div>

          ${
            member.phone
              ? `
                <p class="report-line">
                  ${member.phone}
                </p>
              `
              : ''
          }

          <p class="report-line">
            ${member.lesson_format || '수업 형태 미등록'}
            ${paymentAmount.toLocaleString('ko-KR')}원
            ${paymentMethod ? `(${paymentMethod})` : ''}
          </p>

          <p class="report-line">
            ${paymentLabel}
          </p>
        </article>
      `;
    })
    .join('');
}

async function deletePersonalReport(reportId) {
  const report = latestReportMembers.find(
    (item) => String(item.id) === String(reportId)
  );

  if (!report) {
    return;
  }

  if (!confirm(`${report.name} 회원의 개인레슨 보고를 삭제할까요?`)) {
    return;
  }

  const client = getSupabaseClient();

  try {
    if (client) {
      const { error } = await client
        .from('personal_lesson_reports')
        .delete()
        .eq('id', report.id);

      if (error) {
        throw error;
      }

      if (report.member_id) {
        const { error: memberError } = await client
          .from('members')
          .update({
            personal_reported_at: null,
            personal_reported_payment_date: null,
          })
          .eq('id', report.member_id)
          .eq('personal_reported_at', report.personal_reported_at)
          .eq(
            'personal_reported_payment_date',
            report.personal_reported_payment_date
          );

        if (memberError) {
          throw memberError;
        }
      }
    } else {
      const reports = getStorageData(REPORT_STORAGE_KEY, []).filter(
        (item) => String(item.id) !== String(report.id)
      );
      const members = getStorageData(MEMBER_STORAGE_KEY, []).map((member) => {
        const memberId = member.id;
        const reportedAt =
          member.personalReportedAt || member.personal_reported_at || '';
        const reportedPaymentDate =
          member.personalReportedPaymentDate ||
          member.personal_reported_payment_date ||
          '';

        if (
          String(memberId) !== String(report.member_id) ||
          reportedAt !== report.personal_reported_at ||
          reportedPaymentDate !== report.personal_reported_payment_date
        ) {
          return member;
        }

        return {
          ...member,
          personalReportedAt: '',
          personalReportedPaymentDate: '',
          personal_reported_at: null,
          personal_reported_payment_date: null,
        };
      });

      saveStorageData(REPORT_STORAGE_KEY, reports);
      saveStorageData(MEMBER_STORAGE_KEY, members);
    }

    await loadFinance();
  } catch (error) {
    console.error('개인레슨 보고 삭제 실패:', error);
    alert(`개인레슨 보고를 삭제하지 못했습니다.\n${getErrorMessage(error)}`);
  }
}

function renderPersonalReportSummary(personalMembers, result) {
  if (!personalReportSummary) {
    return;
  }

  if (personalMembers.length === 0) {
    const { start, end } = getSalarySettlementRange(currentYear, currentMonth);

    personalReportSummary.innerHTML = `
      <p class="report-empty">
        ${formatDate(start)}부터 ${formatDate(
      end
    )} 전까지 보고 완료된 개인레슨이 없습니다.
      </p>
    `;

    return;
  }

  personalReportSummary.innerHTML = `
    <div class="report-summary-total">
      <span>정산 ${personalMembers.length}건</span>
      <strong>${formatCurrency(result.personalAmount)}</strong>
      <small>수강료 ${formatCurrency(result.personalBaseAmount)} × 70%</small>
    </div>

  `;
}

/* ==================================================
  12. 개인레슨 보고 직접 추가
================================================== */

function openPersonalReportModal() {
  if (!personalReportModal || !personalReportForm) {
    return;
  }

  personalReportForm.reset();
  editingReportId = null;

  if (personalReportModalTitle) {
    personalReportModalTitle.textContent = '개인레슨 보고 추가';
  }

  if (reportMemberName) {
    reportMemberName.readOnly = false;
  }

  if (reportPaymentDate) {
    reportPaymentDate.value = getDefaultReportedAt(currentYear, currentMonth);
  }

  if (reportReportedAt) {
    reportReportedAt.value = toDateKey(new Date());
  }

  if (reportResidenceType) {
    reportResidenceType.value = '7단지';
  }

  if (reportPaymentMethod) {
    reportPaymentMethod.value = '계좌이체';
  }

  personalReportModal.classList.add('open');
  personalReportModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';

  reportMemberName?.focus();
}

function openPersonalReportEditModal(reportId) {
  const report = latestReportMembers.find(
    (item) => String(item.id) === String(reportId)
  );

  if (!report || !personalReportModal || !personalReportForm) {
    return;
  }

  editingReportId = report.id;

  if (personalReportModalTitle) {
    personalReportModalTitle.textContent = '개인레슨 보고 수정';
  }

  reportMemberName.value = report.name || '';
  reportMemberName.readOnly = true;
  reportPaymentAmount.value = formatMoneyInputValue(report.payment_amount);
  reportPaymentDate.value = report.payment_date || '';
  reportReportedAt.value = report.personal_reported_at || '';
  reportResidenceType.value = report.residence_type || '7단지';
  reportPaymentMethod.value = report.payment_method || '계좌이체';

  personalReportModal.classList.add('open');
  personalReportModal.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
}

async function fillManualReportMemberDefaults() {
  const memberName = reportMemberName?.value.trim() || '';

  if (!memberName) {
    return;
  }

  const member = await findMemberForManualReport(memberName);

  if (!member) {
    return;
  }

  if (reportPaymentAmount && !parseMoney(reportPaymentAmount.value)) {
    reportPaymentAmount.value = formatMoneyInputValue(member.payment_amount);
  }

  if (reportResidenceType) {
    reportResidenceType.value = member.residence_type || '7단지';
  }

  if (reportPaymentMethod) {
    reportPaymentMethod.value = member.payment_method || '계좌이체';
  }
}

function closeManualReportModal() {
  if (!personalReportModal) {
    return;
  }

  personalReportModal.classList.remove('open');
  personalReportModal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  editingReportId = null;
}

async function saveEditedPersonalReport(report, previousReport) {
  const client = getSupabaseClient();

  if (!client) {
    const reports = getStorageData(REPORT_STORAGE_KEY, []);
    const index = reports.findIndex(
      (item) => String(item.id) === String(previousReport.id)
    );

    if (index !== -1) {
      reports[index] = { ...reports[index], ...report };
      saveStorageData(REPORT_STORAGE_KEY, reports);
    }

    return;
  }

  const { error } = await client
    .from('personal_lesson_reports')
    .update(report)
    .eq('id', previousReport.id);

  if (error) {
    throw error;
  }

  if (previousReport.member_id) {
    const { error: memberError } = await client
      .from('members')
      .update({
        personal_reported_at: report.reported_at,
        personal_reported_payment_date: report.payment_date,
      })
      .eq('id', previousReport.member_id)
      .eq('personal_reported_at', previousReport.personal_reported_at)
      .eq(
        'personal_reported_payment_date',
        previousReport.personal_reported_payment_date
      );

    if (memberError) {
      throw memberError;
    }
  }
}

async function handleManualReportSubmit(event) {
  event.preventDefault();

  const memberName = reportMemberName?.value.trim() || '';
  const amount = parseMoney(reportPaymentAmount?.value);
  const paymentDate = normalizeDateInput(reportPaymentDate?.value);
  const reportedAt = normalizeDateInput(reportReportedAt?.value);
  const residenceType = reportResidenceType?.value || '';
  const paymentMethod = reportPaymentMethod?.value || '';

  if (!memberName) {
    alert('이름을 입력해주세요.');

    reportMemberName?.focus();

    return;
  }

  if (amount <= 0) {
    alert('가격을 입력해주세요.');

    reportPaymentAmount?.focus();

    return;
  }

  if (!paymentDate) {
    alert('결제일을 입력해주세요.');

    reportPaymentDate?.focus();

    return;
  }

  if (!reportedAt) {
    alert('보고일을 입력해주세요.');

    reportReportedAt?.focus();

    return;
  }

  const { start, end } = getSalarySettlementRange(currentYear, currentMonth);

  if (reportedAt < start || reportedAt >= end) {
    const shouldContinue = confirm(
      `선택한 보고 기간은 ${start}부터 ${end} 전까지입니다.\n` +
        '그래도 이 보고 내역을 추가할까요?'
    );

    if (!shouldContinue) {
      return;
    }
  }

  try {
    const previousReport = latestReportMembers.find(
      (item) => String(item.id) === String(editingReportId)
    );

    if (previousReport) {
      await saveEditedPersonalReport(
        {
          member_name: previousReport.name,
          phone: previousReport.phone || null,
          lesson_format: previousReport.lesson_format || '개인레슨',
          days: previousReport.days || [],
          lesson_time: previousReport.lesson_time || null,
          payment_amount: amount,
          payment_date: paymentDate,
          payment_status: previousReport.payment_status || '완납',
          reported_at: reportedAt,
          residence_type: residenceType,
          payment_method: paymentMethod,
        },
        previousReport
      );
    } else {
      const matchedMember = await findMemberForManualReport(memberName);
      const baseReport = mapMemberToManualReport(matchedMember, memberName);

      await saveManualPersonalReport({
        ...baseReport,
        payment_amount: amount,
        payment_date: paymentDate,
        reported_at: reportedAt,
        residence_type: residenceType,
        payment_method: paymentMethod,
      });
    }

    closeManualReportModal();

    await loadFinance();
  } catch (error) {
    console.error('개인레슨 보고 내역 추가 실패:', error);

    alert(
      `개인레슨 보고 내역을 추가하지 못했습니다.\n${getErrorMessage(error)}`
    );
  }
}

/* ==================================================
  13. 보고서 복사
================================================== */

async function copyMonthlyReport() {
  try {
    if (latestReportMembers.length === 0) {
      alert('복사할 개인레슨 정보가 없습니다.');

      return;
    }

    const title = `[${getSalaryReportLabel(
      currentYear,
      currentMonth
    )} 개인레슨 보고 내역]`;
    const report = latestReportMembers.map(createReportText).join('\n\n');

    await navigator.clipboard.writeText(`${title}\n\n${report}`);

    alert('월말 보고서가 복사되었습니다.');
  } catch (error) {
    console.error('보고서 복사 실패:', error);

    alert('보고서를 복사하지 못했습니다.');
  }
}

/* ==================================================
  14. 실제 월급 입금 등록
================================================== */

async function registerPaidSalary() {
  const client = getSupabaseClient();

  if (!client) {
    alert('Supabase 연결 후 입금 금액을 저장할 수 있습니다.');

    return;
  }

  const input = prompt('실제로 입금된 월급을 입력해주세요.\n예: 1250000');

  if (input === null) {
    return;
  }

  const amount = Number(input.replaceAll(',', ''));

  if (!Number.isFinite(amount) || amount < 0) {
    alert('올바른 금액을 입력해주세요.');

    return;
  }

  const { start, end } = getMonthRange(currentYear, currentMonth);

  const existing = await client
    .from('transactions')
    .select('id')
    .eq('type', 'salary')
    .gte('transaction_date', start)
    .lt('transaction_date', end);

  if (existing.error) {
    console.error('입금 내역 확인 실패:', existing.error);

    alert('입금 정보를 확인하지 못했습니다.');

    return;
  }

  if (existing.data && existing.data.length > 0) {
    const { error } = await client
      .from('transactions')
      .update({
        amount,
        category: '급여',
        memo: getSalaryReportLabel(currentYear, currentMonth),
      })
      .eq('id', existing.data[0].id);

    if (error) {
      console.error('입금 수정 실패:', error);

      alert('입금 금액을 수정하지 못했습니다.');

      return;
    }
  } else {
    const paymentDate = new Date();
    const dateString = toDateKey(paymentDate);

    const { error } = await client.from('transactions').insert({
      transaction_date: dateString,
      type: 'salary',
      category: '급여',
      amount,
      memo: getSalaryReportLabel(currentYear, currentMonth),
    });

    if (error) {
      console.error('입금 등록 실패:', error);

      alert('입금 금액을 저장하지 못했습니다.');

      return;
    }
  }

  await loadFinance();
}

/* ==================================================
  15. 전체 데이터 불러오기
================================================== */

function escapePaymentText(value) {
  return String(value ?? '').replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      }[character])
  );
}

let paymentDateMembers = [];
const paymentDateForm = document.getElementById('memberPaymentDateForm');
const paymentDateMember = document.getElementById('paymentDateMember');
const financePaymentDate = document.getElementById('financePaymentDate');
const paymentDateMessage = document.getElementById('paymentDateMessage');

async function loadPaymentDateMembers() {
  if (!paymentDateMember) return;
  const client = getSupabaseClient();
  if (!client) return;
  try {
    const { data, error } = await client
      .from('members')
      .select('id, name, phone, payment_date, payment_amount')
      .order('name');
    if (error) throw error;
    paymentDateMembers = data || [];
    const selectedId = paymentDateMember.value;
    paymentDateMember.innerHTML =
      '<option value="">회원을 선택해주세요</option>' +
      paymentDateMembers
        .map(
          (member) =>
            `<option value="${escapePaymentText(
              member.id
            )}">${escapePaymentText(member.name)}${
              member.phone ? ` · ${escapePaymentText(member.phone)}` : ''
            }</option>`
        )
        .join('');
    paymentDateMember.value = selectedId;
  } catch (error) {
    if (paymentDateMessage)
      paymentDateMessage.textContent =
        '입금일 관리용 회원을 불러오지 못했습니다.';
  }
}

paymentDateMember?.addEventListener('change', () => {
  const member = paymentDateMembers.find(
    (item) => String(item.id) === paymentDateMember.value
  );
  financePaymentDate.value = member?.payment_date || '';
  paymentDateMessage.textContent = '';
});

paymentDateForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = paymentDateForm.querySelector('[type="submit"]');
  if (button.disabled) return;
  const memberId = paymentDateMember.value;
  const paymentDate = financePaymentDate.value;
  if (!memberId || !paymentDate) return;
  button.disabled = true;
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase 연결이 필요합니다.');
    const member = paymentDateMembers.find((item) => String(item.id) === memberId);
    if (!member || Number(member.payment_amount) <= 0) throw new Error('회원의 수강료를 먼저 입력해주세요.');
    const { error } = await client.rpc('admin_confirm_member_payment', {
      p_member_id: memberId,
      p_payment_date: paymentDate,
      p_payment_amount: Number(member.payment_amount),
    });
    if (error) throw error;
    paymentDateMessage.textContent = '입금을 확인했습니다. 보고 예정에서 확인해주세요.';
    setPersonalReportView('pending');
    await loadFinance();
  } catch (error) {
    paymentDateMessage.textContent =
      error.message || '입금일을 저장하지 못했습니다.';
  } finally {
    button.disabled = false;
  }
});

let paymentRequestStatus = 'pending';
let paymentRequestLoadVersion = 0;
document.querySelectorAll('[data-payment-status]').forEach((button) => {
  button.addEventListener('click', () => {
    paymentRequestStatus = button.dataset.paymentStatus;
    document.querySelectorAll('[data-payment-status]').forEach((tab) => {
      const active = tab.dataset.paymentStatus === paymentRequestStatus;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    loadPaymentRequests();
  });
});

function getPaymentRequestDisplayRows(requests, status) {
  const seenMembers = new Set();
  return requests.map((request) => {
    if (
      status !== 'confirmed' ||
      !request.member_id ||
      seenMembers.has(request.member_id)
    )
      return request;
    seenMembers.add(request.member_id);
    const member = request.members;
    // The latest confirmed payment uses the same current values as Finance's
    // deposit editor. Earlier payment cycles retain their own dates and amounts.
    return {
      ...request,
      payment_date: member?.payment_date || request.payment_date,
      payment_amount: member?.payment_amount ?? request.payment_amount,
    };
  });
}

async function loadPaymentRequests() {
  const version = ++paymentRequestLoadVersion;
  const status = paymentRequestStatus;
  const list = document.getElementById('paymentRequestList');
  if (!list) return;
  const client = window.swimDb?.client;
  if (!client) {
    list.innerHTML =
      '<p class="report-empty">입금 확인은 Supabase 연결 후 사용할 수 있습니다.</p>';
    return;
  }
  try {
    const { data, error } = await client
      .from('payment_requests')
      .select(
        'id, member_id, payment_date, payment_amount, requested_at, reviewed_at, members!payment_requests_member_id_fkey(name, payment_date, payment_amount)'
      )
      .eq('status', status)
      .order(status === 'confirmed' ? 'reviewed_at' : 'requested_at', {
        ascending: false,
      })
      .order('requested_at', { ascending: false })
      .order('id', { ascending: false });
    if (version !== paymentRequestLoadVersion) return;
    if (error) throw error;
    const displayRows = getPaymentRequestDisplayRows(data || [], status);
    list.innerHTML = displayRows.length
      ? displayRows
          .map(
            (request) => `
      <article class="payment-request-item">
        <div><strong>${escapePaymentText(
          request.members?.name || '회원'
        )}</strong>
          <span>${escapePaymentText(request.payment_date)} · ${formatCurrency(
              request.payment_amount
            )}</span>
        </div>
        ${
          status === 'pending'
            ? `<button type="button" class="secondary-action" data-confirm-payment="${escapePaymentText(
                request.id
              )}">확인</button>`
            : '<span class="payment-confirmed-label">입금 확인 완료</span>'
        }
      </article>
    `
          )
          .join('')
      : `<p class="report-empty">${
          status === 'pending'
            ? '확인 대기 중인 입금이 없습니다.'
            : '확인 완료한 입금이 없습니다.'
        }</p>`;
  } catch (error) {
    if (version !== paymentRequestLoadVersion) return;
    console.error('입금 알림 조회 실패:', error);
    list.innerHTML =
      '<p class="report-empty">입금 알림을 불러오지 못했습니다.</p><button type="button" class="secondary-action" data-retry-payments>다시 불러오기</button>';
  }
}

let confirmingPayment = false;
document
  .getElementById('paymentRequestList')
  ?.addEventListener('click', async (event) => {
    if (event.target.closest('[data-retry-payments]'))
      return loadPaymentRequests();
    const button = event.target.closest('[data-confirm-payment]');
    if (!button || confirmingPayment) return;
    confirmingPayment = true;
    button.disabled = true;
    button.textContent = '확인 중…';
    try {
      const { error } = await window.swimDb.client.rpc(
        'confirm_member_payment',
        {
          p_request_id: button.dataset.confirmPayment,
        }
      );
      if (error) throw error;
      button.closest('.payment-request-item')?.remove();
      setPersonalReportView('pending');
      window.dispatchEvent(new CustomEvent('swim-payment-confirmed'));
    } catch (error) {
      alert(error.message || '입금을 확인하지 못했습니다.');
    } finally {
      confirmingPayment = false;
      button.disabled = false;
      button.textContent = '확인';
    }
  });

function setPersonalReportView(view) {
  document.getElementById('pendingReportPanel').hidden = view !== 'pending';
  document.getElementById('completedPersonalReports').hidden =
    view !== 'completed';
  document.querySelectorAll('[data-report-view]').forEach((tab) => {
    const active = tab.dataset.reportView === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
}

document.querySelectorAll('[data-report-view]').forEach((tab) => {
  tab.addEventListener('click', () =>
    setPersonalReportView(tab.dataset.reportView)
  );
});

function isPendingPersonalReport(member) {
  return Boolean(
    member.payment_date &&
      Number(member.payment_amount) > 0 &&
      member.payment_status === '완납' &&
      !(
        member.personal_reported_at &&
        member.personal_reported_payment_date === member.payment_date
      )
  );
}

function getUnreportedPayments(members, reports) {
  return members.filter((member) => member.payment_date && Number(member.payment_amount) > 0 &&
    member.payment_status === '완납' && !reports.some((report) =>
      String(report.member_id) === String(member.id) && report.payment_date === member.payment_date &&
      Number(report.payment_amount) === Number(member.payment_amount)));
}

function buildPendingPaymentRows(members, requests, reports) {
  const memberMap = new Map(members.map((member) => [String(member.id), member]));
  const reportedIds = new Set(reports.map((report) => report.payment_request_id).filter(Boolean));
  const confirmed = requests.filter((request) => request.status === 'confirmed');
  const pending = confirmed.filter((request) => !reportedIds.has(request.id)).map((request) => ({
    ...memberMap.get(String(request.member_id)),
    id: request.member_id,
    reportKey: `request:${request.id}`,
    payment_request_id: request.id,
    payment_date: request.payment_date,
    payment_amount: request.payment_amount,
    name: memberMap.get(String(request.member_id))?.name || '회원',
  }));
  // Support old manually entered payments which predate the request ledger.
  const legacy = getUnreportedPayments(members, reports).filter((member) =>
    !confirmed.some((request) => String(request.member_id) === String(member.id) &&
      request.payment_date === member.payment_date && Number(request.payment_amount) === Number(member.payment_amount))
  ).map((member) => ({ ...member, reportKey: `member:${member.id}` }));
  return [...pending, ...legacy];
}

let pendingReportLoadVersion = 0;
let pendingReportMembers = [];
async function loadPendingPersonalReports() {
  const version = ++pendingReportLoadVersion;
  const list = document.getElementById('pendingPersonalReports');
  if (!list) return;
  try {
    const client = getSupabaseClient();
    if (!client) throw new Error('Supabase 연결이 필요합니다.');
    const [membersResult, requestsResult, reportsResult] = await Promise.all([
      client.from('members').select('*').order('name'),
      client.from('payment_requests').select('id, member_id, payment_date, payment_amount, status').eq('status', 'confirmed').order('reviewed_at'),
      client.from('personal_lesson_reports').select('member_id, payment_date, payment_amount, payment_request_id'),
    ]);
    if (version !== pendingReportLoadVersion) return;
    const error = membersResult.error || requestsResult.error || reportsResult.error;
    if (error) throw error;
    pendingReportMembers = buildPendingPaymentRows(membersResult.data || [], requestsResult.data || [], reportsResult.data || []);

    document.getElementById('pendingReportCount').textContent = String(pendingReportMembers.length);
    document.getElementById('pendingReportAmount').textContent = formatCurrency(
      pendingReportMembers.reduce((sum, member) => sum + Number(member.payment_amount || 0), 0)
    );
    list.innerHTML = pendingReportMembers.length
      ? pendingReportMembers
          .map(
            (member) => `
      <article class="payment-request-item">
        <div><strong>${escapePaymentText(member.name)}</strong>
          <span>${escapePaymentText(member.payment_date)} · ${formatCurrency(
              member.payment_amount
            )}</span>
        </div>
        <button type="button" class="secondary-action" data-complete-report="${escapePaymentText(
          member.reportKey
        )}">보고 완료</button>
      </article>
    `
          )
          .join('')
      : '<p class="report-empty">보고 예정인 입금이 없습니다. 입금 확인을 마친 건이 여기에 표시됩니다.</p>';
  } catch (error) {
    if (version !== pendingReportLoadVersion) return;
    document.getElementById('pendingReportCount').textContent = '—';
    document.getElementById('pendingReportAmount').textContent = '—';
    list.innerHTML =
      '<p class="report-empty">보고 예정을 불러오지 못했습니다. 최신 05 입금·보고·동기화 SQL이 적용됐는지 확인해주세요.</p>';
    console.error('보고 예정 조회 실패:', error);
  }
}

let completingPersonalReport = false;
document
  .getElementById('pendingPersonalReports')
  ?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-complete-report]');
    if (!button || completingPersonalReport) return;
    const member = pendingReportMembers.find(
      (item) => item.reportKey === button.dataset.completeReport
    );
    if (!member) return;
    completingPersonalReport = true;
    button.disabled = true;
    button.textContent = '처리 중…';
    try {
      const reportedAt = toDateKey(new Date());
      const { error } = member.payment_request_id
        ? await getSupabaseClient().rpc('complete_confirmed_payment_report', {
            p_request_id: member.payment_request_id, p_reported_at: reportedAt,
          })
        : await getSupabaseClient().rpc('complete_personal_payment_report', {
            p_member_id: member.id, p_payment_date: member.payment_date,
            p_payment_amount: member.payment_amount, p_reported_at: reportedAt,
          });
      if (error) throw error;
      // Show the report just created, even if the user was browsing an older month.
      const salaryMonth = new Date(`${reportedAt}T00:00:00`);
      salaryMonth.setDate(1);
      salaryMonth.setMonth(salaryMonth.getMonth() + 1);
      currentYear = salaryMonth.getFullYear();
      currentMonth = salaryMonth.getMonth();
      await loadFinance();
      setPersonalReportView('completed');
    } catch (error) {
      alert(error.message || '보고 완료 처리에 실패했습니다.');
    } finally {
      completingPersonalReport = false;
      button.disabled = false;
      button.textContent = '보고 완료';
    }
  });

function calculateMonthlyIncome(groupLessons, reports) {
  const groupAmount =
    groupLessons.filter(
      (lesson) => !['cancelled', 'deleted'].includes(lesson.status)
    ).length * GROUP_LESSON_RATE;
  const personalAmount =
    reports.reduce(
      (sum, report) => sum + Number(report.payment_amount || 0),
      0
    ) * PERSONAL_LESSON_SHARE;
  const total = groupAmount + personalAmount;
  return {
    groupAmount,
    personalAmount,
    total,
    tax: total * TAX_RATE,
    netSalary: total * NET_RATE,
  };
}

const monthlySalaryGuides = new Map();
let salaryGuideMonth = null;

function renderMonthlySalaryGuide(year, month) {
  const income = monthlySalaryGuides.get(`${year}-${month}`);
  const title = document.getElementById('salaryGuideTitle');
  if (title) title.textContent = `${year}년 ${month + 1}월 급여 안내`;
  const values = income
    ? {
        groupCalculation: `${
          income.groupAmount / GROUP_LESSON_RATE
        }회 × ${formatCurrency(GROUP_LESSON_RATE)}`,
        groupCalculationAmount: formatCurrency(income.groupAmount),
        personalCalculationAmount: formatCurrency(income.personalAmount),
        grossIncome: formatCurrency(income.total),
        taxAmount: `-${formatCurrency(income.tax)}`,
        netIncome: formatCurrency(income.netSalary),
      }
    : {};
  for (const id of [
    'groupCalculation',
    'groupCalculationAmount',
    'personalCalculationAmount',
    'grossIncome',
    'taxAmount',
    'netIncome',
  ]) {
    const element = document.getElementById(id);
    if (element) element.textContent = values[id] || '불러오는 중…';
  }
  const input = document.getElementById('actualSalaryAmount');
  if (input)
    input.value =
      income?.paidAmount != null
        ? Number(income.paidAmount).toLocaleString('ko-KR')
        : '';
  const comparison = document.getElementById('actualSalaryComparison');
  if (comparison)
    comparison.textContent =
      income?.paidAmount != null
        ? `예상 ${formatCurrency(income.netSalary)} · 실제 ${formatCurrency(
            income.paidAmount
          )} · ${salaryDifferenceText(income.paidAmount, income.netSalary)}`
        : '실제 급여를 입력하면 예상 금액과 비교할 수 있어요.';
}

function salaryDifferenceText(actual, expected) {
  const difference = Math.round(actual) - Math.round(expected);
  return difference === 0 ? '0원' : `${difference > 0 ? '+' : '−'}${formatCurrency(Math.abs(difference))}`;
}

function salaryEntryId(year, month) {
  return `00000000-0000-4000-8000-${String(year).padStart(8, '0')}${String(
    month + 1
  ).padStart(2, '0')}00`;
}

document
  .getElementById('actualSalaryAmount')
  ?.addEventListener('input', (event) => {
    const digits = event.target.value.replace(/[^0-9]/g, '');
    event.target.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
  });

document
  .getElementById('actualSalaryForm')
  ?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!salaryGuideMonth) return;
    const button = event.target.querySelector('[type="submit"]');
    if (button.disabled) return;
    const input = document.getElementById('actualSalaryAmount');
    const text = input.value.replace(/,/g, '').trim();
    const amount = Number(text);
    const message = document.getElementById('actualSalaryMessage');
    if (
      !/^\d+$/.test(text) ||
      !Number.isSafeInteger(amount) ||
      amount > 2147483647
    ) {
      message.textContent = '올바른 급여 금액을 입력해주세요.';
      return;
    }
    const { year, month } = salaryGuideMonth;
    button.disabled = true;
    try {
      const client = getSupabaseClient();
      if (!client) throw new Error('Supabase 연결이 필요합니다.');
      const { start, end } = getMonthRange(year, month);
      const id = salaryEntryId(year, month);
      const { data, error } = await client
        .from('transactions')
        .select('id, amount')
        .eq('type', 'salary')
        .gte('transaction_date', start)
        .lt('transaction_date', end);
      if (error) throw error;
      // Keep any previously recorded salary installments. A stable monthly entry
      // adjusts their sum to the entered total, so repeated saves never add twice.
      const previousAmount = (data || [])
        .filter((row) => row.id !== id)
        .reduce((sum, row) => sum + Number(row.amount || 0), 0);
      const result = await client.from('transactions').upsert(
        {
          id,
          type: 'salary',
          category: '급여 정산',
          transaction_date: toDateKey(new Date(year, month, 15)),
          amount: amount - previousAmount,
          memo: `${year}년 ${month + 1}월 실제 급여 총액 ${amount}원`,
        },
        { onConflict: 'id' }
      );
      if (result.error) throw result.error;
      message.textContent = '실제 급여를 저장했습니다.';
      await loadFinance();
    } catch (error) {
      message.textContent = error.message || '실제 급여 저장에 실패했습니다.';
    } finally {
      button.disabled = false;
    }
  });

function showMonthlySalaryGuide(year, month) {
  if (!salaryGuideContent) return;
  salaryGuideMonth = { year, month };
  const message = document.getElementById('actualSalaryMessage');
  if (message) message.textContent = '';
  renderMonthlySalaryGuide(year, month);
  if (!salaryGuideContent.open) salaryGuideContent.showModal();
  salaryGuideButton?.setAttribute('aria-expanded', 'true');
}

let incomeHistoryVersion = 0;
async function loadIncomeHistory() {
  const body = document.getElementById('incomeHistoryBody');
  if (!body) return;
  const version = ++incomeHistoryVersion;
  const months = Array.from(
    { length: 5 },
    (_, index) => new Date(currentYear, currentMonth - index, 1)
  );
  try {
    const client = getSupabaseClient();
    let reports = [];
    let salaries = [];
    if (client) {
      const salaryRange = getMonthRange(
        months[0].getFullYear(),
        months[0].getMonth()
      );
      const salaryStart = getMonthRange(
        months[4].getFullYear(),
        months[4].getMonth()
      ).start;
      const salaryResult = await client
        .from('transactions')
        .select('id, transaction_date, amount')
        .eq('type', 'salary')
        .gte('transaction_date', salaryStart)
        .lt('transaction_date', salaryRange.end);
      if (salaryResult.error) throw salaryResult.error;
      salaries = salaryResult.data || [];
      const start = getSalarySettlementRange(
        months[4].getFullYear(),
        months[4].getMonth()
      ).start;
      const end = getSalarySettlementRange(
        months[0].getFullYear(),
        months[0].getMonth()
      ).end;
      for (let offset = 0; ; offset += 500) {
        const result = await client
          .from('personal_lesson_reports')
          .select('id, payment_amount, reported_at')
          .gte('reported_at', start)
          .lt('reported_at', end)
          .order('id')
          .range(offset, offset + 499);
        if (result.error) throw result.error;
        reports.push(...(result.data || []));
        if ((result.data || []).length < 500) break;
      }
    } else {
      reports = getStorageData(REPORT_STORAGE_KEY, []);
    }
    const rows = await Promise.all(
      months.map(async (date) => {
        const year = date.getFullYear();
        const month = date.getMonth();
        const { start, end } = getSalarySettlementRange(year, month);
        const groupLessons = await getGroupLessons(year, month);
        const income = calculateMonthlyIncome(
          groupLessons,
          reports.filter(
            (report) => report.reported_at >= start && report.reported_at < end
          )
        );
        const salaryRange = getMonthRange(year, month);
        const salaryRows = salaries.filter(
          (row) =>
            row.transaction_date >= salaryRange.start &&
            row.transaction_date < salaryRange.end
        );
        income.paidAmount = salaryRows.length
          ? salaryRows.reduce((sum, row) => sum + Number(row.amount || 0), 0)
          : null;
        if (version === incomeHistoryVersion)
          monthlySalaryGuides.set(`${year}-${month}`, income);
        return `<tr><td><button type="button" class="income-month-button" data-income-year="${year}" data-income-month="${month}">${year}.${String(
          month + 1
        ).padStart(
          2,
          '0'
        )}</button></td><td data-label="단체강습">${formatCurrency(
          income.groupAmount
        )}</td><td data-label="개인레슨">${formatCurrency(
          income.personalAmount
        )}</td><td data-label="세금">-${formatCurrency(
          income.tax
        )}</td><td data-label="합계"><strong>${formatCurrency(
          income.netSalary
        )}</strong></td><td><button type="button" class="income-month-button" data-income-year="${year}" data-income-month="${month}">${
          income.paidAmount == null ? '입력' : formatCurrency(income.paidAmount)
        }</button></td><td>${
          income.paidAmount == null
            ? '미입력'
            : salaryDifferenceText(income.paidAmount, income.netSalary)
        }</td></tr>`;
      })
    );
    if (version === incomeHistoryVersion) body.innerHTML = rows.join('');
  } catch (error) {
    if (version === incomeHistoryVersion)
      body.innerHTML =
        '<tr><td colspan="7">수입 내역을 불러오지 못했습니다. 새로고침 후 다시 확인해주세요.</td></tr>';
    console.error('최근 5개월 수입 조회 실패:', error);
  }
}

document
  .getElementById('incomeHistoryBody')
  ?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-income-year]');
    if (!button) return;
    showMonthlySalaryGuide(
      Number(button.dataset.incomeYear),
      Number(button.dataset.incomeMonth)
    );
  });

async function loadFinance() {
  updateMonthText();

  try {
    const [groupLessons, personalMembers, paidAmount] = await Promise.all([
      getGroupLessons(),
      getPersonalMembers(),
      getPaidSalary(),
      loadPaymentRequests(),
      loadPaymentDateMembers(),
      loadPendingPersonalReports(),
      loadIncomeHistory(),
    ]);

    latestReportMembers = personalMembers;

    const result = calculateFinance(groupLessons, personalMembers, paidAmount);

    renderFinanceSummary(result);
    if (salaryGuideContent?.open && salaryGuideMonth) {
      renderMonthlySalaryGuide(salaryGuideMonth.year, salaryGuideMonth.month);
    }
    renderPersonalReportSummary(personalMembers, result);
    renderMonthlyReport(personalMembers);
  } catch (error) {
    console.error('재무 정보를 불러오지 못했습니다.', error);

    if (monthlyReport) {
      monthlyReport.innerHTML = `
        <p class="report-empty">
          재무 정보를 불러오지 못했습니다.
        </p>
      `;
    }

    if (personalReportSummary) {
      personalReportSummary.innerHTML = `
        <p class="report-empty">
          보고 완료 내역을 불러오지 못했습니다.
        </p>
      `;
    }
  }
}

window.addEventListener('swim-payment-confirmed', loadFinance);
window.addEventListener('focus', loadFinance);

/* ==================================================
  16. 이벤트
================================================== */

function moveFinanceMonth(change) {
  const date = new Date(currentYear, currentMonth + change, 1);
  currentYear = date.getFullYear();
  currentMonth = date.getMonth();
  loadFinance();
}

prevMonthButton?.addEventListener('click', () => moveFinanceMonth(-1));
nextMonthButton?.addEventListener('click', () => moveFinanceMonth(1));
document
  .getElementById('prevReportMonth')
  ?.addEventListener('click', () => moveFinanceMonth(-1));
document
  .getElementById('nextReportMonth')
  ?.addEventListener('click', () => moveFinanceMonth(1));

if (copyReportButton) {
  copyReportButton.addEventListener('click', copyMonthlyReport);
}

if (monthlyReport) {
  monthlyReport.addEventListener('click', (event) => {
    const editButton = event.target.closest('[data-report-edit-id]');

    if (editButton) {
      openPersonalReportEditModal(editButton.dataset.reportEditId);
      return;
    }

    const deleteButton = event.target.closest('[data-report-delete-id]');

    if (!deleteButton) {
      return;
    }

    deletePersonalReport(deleteButton.dataset.reportDeleteId);
  });
}

if (addPersonalReportButton) {
  addPersonalReportButton.addEventListener('click', openPersonalReportModal);
}

if (reportMemberName) {
  reportMemberName.addEventListener('change', fillManualReportMemberDefaults);
  reportMemberName.addEventListener('blur', fillManualReportMemberDefaults);
}

if (closePersonalReportModal) {
  closePersonalReportModal.addEventListener('click', closeManualReportModal);
}

if (cancelPersonalReportButton) {
  cancelPersonalReportButton.addEventListener('click', closeManualReportModal);
}

if (personalReportModal) {
  personalReportModal.addEventListener('click', (event) => {
    if (event.target === personalReportModal) {
      closeManualReportModal();
    }
  });
}

if (personalReportForm) {
  personalReportForm.addEventListener('submit', handleManualReportSubmit);
}

if (reportPaymentAmount) {
  reportPaymentAmount.addEventListener('input', (event) => {
    event.target.value = formatMoneyInputValue(event.target.value);
  });
}

if (paidSalaryCard) {
  paidSalaryCard.addEventListener('click', registerPaidSalary);
}

/* ==================================================
  17. 처음 실행
================================================== */

loadFinance();
