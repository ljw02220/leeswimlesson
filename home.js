document.addEventListener('DOMContentLoaded', () => {
  renderHomeDashboard();
});

/* ==================================================
  1. 홈 대시보드
================================================== */

function renderHomeDashboard() {
  renderMemberSummary();
  renderTodayLessonSummary();
  renderTwoWeekSchedule();
  renderMonthlyIncome();
}

/* ==================================================
  2. 회원 데이터 불러오기
================================================== */

function getMembers() {
  try {
    const savedMembers = localStorage.getItem('personalLessonMembers');

    return savedMembers ? JSON.parse(savedMembers) : [];
  } catch (error) {
    console.error('회원 데이터를 불러오지 못했습니다.', error);

    return [];
  }
}

/* ==================================================
  3. 전체 회원 / 재등록 예정
================================================== */

function renderMemberSummary() {
  const members = getMembers();

  const totalMemberCount = document.getElementById('totalMemberCount');

  const renewalMemberCount = document.getElementById('renewalMemberCount');

  if (totalMemberCount) {
    totalMemberCount.textContent = `${members.length}명`;
  }

  const renewalMembers = members.filter((member) => {
    const totalLessons = Number(member.totalLessons || 0);

    const usedLessons = Number(member.usedLessons || 0);

    const remaining = Math.max(totalLessons - usedLessons, 0);

    return member.status === '수강중' && remaining <= 1;
  });

  if (renewalMemberCount) {
    renewalMemberCount.textContent = `${renewalMembers.length}명`;
  }
}

/* ==================================================
  4. 오늘 수업 데이터 불러오기
================================================== */

function getTodayLessons() {
  try {
    const savedLessons = localStorage.getItem('homeTodayLessons');

    return savedLessons ? JSON.parse(savedLessons) : [];
  } catch (error) {
    console.error('오늘 수업 데이터를 불러오지 못했습니다.', error);

    return [];
  }
}

function getCompletedLessons() {
  try {
    return JSON.parse(localStorage.getItem('completedLessons')) || {};
  } catch (error) {
    console.error('완료 수업 데이터를 불러오지 못했습니다.', error);

    return {};
  }
}

function getCancelledLessons() {
  try {
    return JSON.parse(localStorage.getItem('cancelledLessons')) || {};
  } catch (error) {
    console.error('취소 수업 데이터를 불러오지 못했습니다.', error);

    return {};
  }
}

/* ==================================================
  5. 오늘 수업
================================================== */

function renderTodayLessonSummary() {
  const todayLessonCount = document.getElementById('todayLessonCount');

  const homeTodayLessons = document.getElementById('homeTodayLessons');

  const lessons = getTodayLessons();

  const completedLessons = getCompletedLessons();

  const cancelledLessons = getCancelledLessons();

  if (todayLessonCount) {
    todayLessonCount.textContent = `${lessons.length}건`;
  }

  if (!homeTodayLessons) return;

  if (lessons.length === 0) {
    homeTodayLessons.innerHTML = `
      <div class="home-empty">
        오늘 예정된 수업이 없습니다.
      </div>
    `;

    return;
  }

  homeTodayLessons.innerHTML = lessons
    .map((lesson) => {
      const lessonKey = lesson.lessonKey;

      const isCompleted = completedLessons[lessonKey] === true;

      const isCancelled = cancelledLessons[lessonKey] === true;

      let statusText = '예정';
      let statusClass = 'scheduled';

      if (isCancelled) {
        statusText = '취소';
        statusClass = 'cancelled';
      } else if (isCompleted) {
        statusText = '완료';
        statusClass = 'completed';
      }

      return `
        <div class="home-lesson-item">
          <span class="home-lesson-time">
            ${lesson.time}
          </span>

          <span class="home-lesson-name">
            ${lesson.name}
          </span>

          <span
            class="
              home-lesson-status
              ${statusClass}
            "
          >
            ${statusText}
          </span>
        </div>
      `;
    })
    .join('');
}

/* ==================================================
  6. 2주 수업 스케줄
================================================== */

function renderTwoWeekSchedule() {
  const homeTwoWeekSchedule = document.getElementById('homeTwoWeekSchedule');

  if (!homeTwoWeekSchedule) return;

  homeTwoWeekSchedule.innerHTML = `
    <div class="home-empty">
      2주 수업 스케줄 연결 예정입니다.
    </div>
  `;
}

/* ==================================================
  7. 이번 달 수입
================================================== */

function renderMonthlyIncome() {
  const monthlyIncome = document.getElementById('monthlyIncome');

  if (!monthlyIncome) return;

  monthlyIncome.textContent = '0원';
}
