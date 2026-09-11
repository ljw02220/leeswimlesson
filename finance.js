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
const monthlyReport = document.getElementById('monthlyReport');
const copyReportButton = document.getElementById('copyReportButton');

/* ==================================================
  3. 현재 조회 월
================================================== */

const today = new Date();

let currentYear = today.getFullYear();
let currentMonth = today.getMonth();
let latestReportMembers = [];

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
  const startDate = new Date(year, month - 1, 15);
  const endDate = new Date(year, month, 15);

  const start = toDateKey(startDate);
  const end = toDateKey(endDate);

  return { start, end };
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

function updateMonthText() {
  const monthNumber = currentMonth + 1;
  const monthText = `${currentYear}년 ${monthNumber}월`;

  if (financeMonth) {
    financeMonth.textContent = monthText;
  }

  if (summaryMonth) {
    summaryMonth.textContent = monthText;
  }

  if (expectedSalaryLabel) {
    expectedSalaryLabel.textContent = `${monthNumber}월 예상 월급`;
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

async function createRecurringGroupLessons() {
  const cancelledLessons = getStorageData('cancelledLessons', {});
  const completedLessons = getStorageData('completedLessons', {});
  const holidaysByDate = await getHolidays(currentYear, currentMonth);
  const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
  const lessons = [];

  for (let day = 1; day <= lastDay; day++) {
    const date = new Date(currentYear, currentMonth, day);
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

      if (cancelledLessons[lessonKey]) {
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

async function getGroupLessons() {
  const client = getSupabaseClient();

  if (!client) {
    return await createRecurringGroupLessons();
  }

  const { start, end } = getMonthRange(currentYear, currentMonth);

  const [holidayData, lessonResult] = await Promise.all([
    getHolidays(currentYear, currentMonth),
    client
      .from('lessons')
      .select('id, lesson_date, lesson_time, lesson_type, status, source')
      .eq('lesson_type', 'group')
      .gte('lesson_date', start)
      .lt('lesson_date', end),
  ]);

  const { data, error } = lessonResult;

  if (error) {
    console.error('Supabase 단체강습 데이터를 불러오지 못했습니다.', error);

    return await createRecurringGroupLessons();
  }

  const lessons = (data || []).filter(
    (lesson) => !holidayData[lesson.lesson_date]
  );

  return lessons.length > 0 ? lessons : await createRecurringGroupLessons();
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
  const localReports = getStorageData('personalLessonReports', []);

  if (localReports.length > 0) {
    const { start, end } = getSalarySettlementRange(
      currentYear,
      currentMonth
    );

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
    name: report.member_name || report.name || '',
    phone: report.phone || '',
    lesson_format: report.lesson_format || '1:1',
    days: report.days || [],
    lesson_time: report.lesson_time || '',
    payment_amount: Number(report.payment_amount || 0),
    payment_date: report.payment_date || '',
    payment_status: report.payment_status || '완납',
    personal_reported_at: report.reported_at || '',
    personal_reported_payment_date: report.payment_date || '',
    status: '보고완료',
  };
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
  const activeGroupLessons = groupLessons.filter(
    (lesson) => lesson.status !== 'cancelled'
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
      `총 ${result.groupCount}회 · 완료 ${result.completedGroupCount}회`;
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
      `${result.groupCount}회 × ` +
      `${GROUP_LESSON_RATE.toLocaleString('ko-KR')}원`;
  }

  if (groupCalculationAmount) {
    groupCalculationAmount.textContent = formatCurrency(result.groupAmount);
  }

  if (personalCalculationAmount) {
    personalCalculationAmount.textContent =
      `${formatCurrency(result.personalAmount)} ` +
      `(수강료 ${formatCurrency(result.personalBaseAmount)} × 70%)`;
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
  const firstLine = [dayText, timeText, member.name].filter(Boolean).join(' ');
  const paymentAmount = Number(member.payment_amount) || 0;
  const lessonLine = [
    member.lesson_format,
    paymentAmount ? `${paymentAmount.toLocaleString('ko-KR')}원` : '',
  ]
    .filter(Boolean)
    .join(' ');
  const paymentLine = [
    member.payment_date ? `${formatDate(member.payment_date)} 입금` : '',
    member.personal_reported_at
      ? `${formatDate(member.personal_reported_at)} 보고`
      : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return [
    firstLine,
    member.phone || '',
    lessonLine,
    paymentLine || member.payment_status || '확인필요',
  ]
    .filter(Boolean)
    .join('\n');
}

function renderMonthlyReport(personalMembers) {
  if (!monthlyReport) {
    return;
  }

  if (personalMembers.length === 0) {
    const { start, end } = getSalarySettlementRange(
      currentYear,
      currentMonth
    );

    monthlyReport.innerHTML = `
      <p class="report-empty">
        ${formatDate(start)}부터 ${formatDate(end)} 전까지 결제된 개인레슨 회차권이 없습니다.
      </p>
    `;

    return;
  }

  monthlyReport.innerHTML = personalMembers
    .map((member) => {
      const dayText = formatDays(member.days);
      const timeText = formatTime(member.lesson_time);
      const paymentAmount = Number(member.payment_amount) || 0;
      const paymentShare = paymentAmount * PERSONAL_LESSON_SHARE;
      const paymentLabel = member.payment_date
        ? `${formatDate(member.payment_date)} 입금`
        : member.payment_status || '확인필요';
      const reportLabel = member.personal_reported_at
        ? `${formatDate(member.personal_reported_at)} 보고`
        : '보고일 미등록';

      return `
        <article class="report-item">
          <strong>
            ${[dayText, timeText, member.name].filter(Boolean).join(' ')}
          </strong>

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
            · 수강료 ${paymentAmount.toLocaleString('ko-KR')}원
            · 정산 ${formatCurrency(paymentShare)}
          </p>

          <p class="report-line">
            ${paymentLabel} · ${reportLabel}
          </p>
        </article>
      `;
    })
    .join('');
}

/* ==================================================
  12. 보고서 복사
================================================== */

async function copyMonthlyReport() {
  try {
    if (latestReportMembers.length === 0) {
      alert('복사할 개인레슨 정보가 없습니다.');

      return;
    }

    const title = `[${currentYear}년 ${currentMonth + 1}월 개인레슨 현황]`;
    const report = latestReportMembers.map(createReportText).join('\n\n');

    await navigator.clipboard.writeText(`${title}\n\n${report}`);

    alert('월말 보고서가 복사되었습니다.');
  } catch (error) {
    console.error('보고서 복사 실패:', error);

    alert('보고서를 복사하지 못했습니다.');
  }
}

/* ==================================================
  13. 실제 월급 입금 등록
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
        memo: `${currentYear}년 ${currentMonth + 1}월 급여`,
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
      memo: `${currentYear}년 ${currentMonth + 1}월 급여`,
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
  14. 전체 데이터 불러오기
================================================== */

async function loadFinance() {
  updateMonthText();

  try {
    const [groupLessons, personalMembers, paidAmount] = await Promise.all([
      getGroupLessons(),
      getPersonalMembers(),
      getPaidSalary(),
    ]);

    latestReportMembers = personalMembers;

    const result = calculateFinance(groupLessons, personalMembers, paidAmount);

    renderFinanceSummary(result);
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
  }
}

/* ==================================================
  15. 이벤트
================================================== */

if (prevMonthButton) {
  prevMonthButton.addEventListener('click', () => {
    currentMonth--;

    if (currentMonth < 0) {
      currentMonth = 11;
      currentYear--;
    }

    loadFinance();
  });
}

if (nextMonthButton) {
  nextMonthButton.addEventListener('click', () => {
    currentMonth++;

    if (currentMonth > 11) {
      currentMonth = 0;
      currentYear++;
    }

    loadFinance();
  });
}

if (copyReportButton) {
  copyReportButton.addEventListener('click', copyMonthlyReport);
}

if (paidSalaryCard) {
  paidSalaryCard.addEventListener('click', registerPaidSalary);
}

/* ==================================================
  16. 처음 실행
================================================== */

loadFinance();
