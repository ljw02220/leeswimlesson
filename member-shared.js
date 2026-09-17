(() => {
  const MEMBER_STORAGE_KEY = 'personalLessonMembers';

  const DAY_INDEX_BY_NAME = {
    일: 0,
    월: 1,
    화: 2,
    수: 3,
    목: 4,
    금: 5,
    토: 6,
  };

  const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

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

  function getClient() {
    return window.swimDb?.isConfigured() ? window.swimDb.client : null;
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

  function toDateKey(date) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function getTodayKey() {
    return toDateKey(new Date());
  }

  function normalizePhone(value) {
    return String(value || '').replace(/[^\d]/g, '');
  }

  function getNameParts(value) {
    return String(value || '')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
  }

  function normalizeGroupLessons(value) {
    const lessons = Array.isArray(value) ? value : [];

    return lessons
      .map((lesson) => {
        const day = Number(lesson?.day);
        const time = String(lesson?.time || '').slice(0, 5);

        if (!Number.isInteger(day) || !DAY_LABELS[day] || !time) {
          return null;
        }

        return {
          day,
          dayName: lesson.dayName || DAY_LABELS[day],
          time,
        };
      })
      .filter(Boolean);
  }

  function isMatchingMemberName(memberName, requestName) {
    const normalizedRequestName = String(requestName || '').trim();

    if (!normalizedRequestName) {
      return false;
    }

    return getNameParts(memberName).includes(normalizedRequestName);
  }

  function formatMoney(value) {
    return `${Number(value || 0).toLocaleString('ko-KR')}원`;
  }

  function parseMoney(value) {
    return Number(String(value || '').replace(/[^\d]/g, '')) || 0;
  }

  function formatShortDate(dateKey) {
    if (!dateKey) {
      return '-';
    }

    const date = new Date(`${dateKey}T00:00:00`);

    return `${date.getMonth() + 1}월 ${date.getDate()}일`;
  }

  function formatDateWithDay(dateKey) {
    if (!dateKey) {
      return '-';
    }

    const date = new Date(`${dateKey}T00:00:00`);

    return `${date.getMonth() + 1}월 ${date.getDate()}일 (${DAY_LABELS[date.getDay()]})`;
  }

  function formatFullDate(dateKey) {
    if (!dateKey) {
      return '-';
    }

    return dateKey.replaceAll('-', '.');
  }

  function formatTime(timeValue) {
    if (!timeValue) {
      return '-';
    }

    return String(timeValue).slice(0, 5);
  }

  function formatLessonTime(timeValue) {
    const time = formatTime(timeValue);

    if (time === '-') {
      return '-';
    }

    const [hourText, minuteText] = time.split(':');
    const hour = Number(hourText);
    const meridiem = hour < 12 ? '오전' : '오후';
    const displayHour = hour % 12 || 12;

    return `${meridiem} ${displayHour}:${minuteText}`;
  }

  function getHolidayName(dateKey) {
    return HOLIDAY_OVERRIDES[dateKey] || '';
  }

  function formatDays(days) {
    if (!days || days.length === 0) {
      return '-';
    }

    return Array.isArray(days) ? days.join(', ') : String(days);
  }

  function getRemainingLessons(member) {
    const total = Number(member.total_lessons || 0);
    const used = Number(member.used_lessons || 0);

    return Math.max(total - used, 0);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function getLessonFeedback(member, dateKey, timeValue) {
    const key = `${dateKey}_${formatTime(timeValue)}`;
    const startMarker = `[수업내용|${key}]`;
    const endMarker = '[/수업내용]';
    const pattern = new RegExp(
      `${escapeRegExp(startMarker)}\\s*([\\s\\S]*?)\\s*${escapeRegExp(endMarker)}`
    );
    const match = String(member.memo || '').match(pattern);

    return match?.[1]?.trim() || '';
  }

  function mapMember(row) {
    return {
      id: row.id,
      auth_user_id: row.auth_user_id || '',
      name: row.name || '',
      phone: row.phone || '',
      lesson_format: row.lesson_format || '1:1',
      days: row.days || [],
      lesson_time: row.lesson_time || '',
      lesson_start_date: row.lesson_start_date || '',
      group_lessons: normalizeGroupLessons(row.group_lessons),
      total_lessons: Number(row.total_lessons || 0),
      used_lessons: Number(row.used_lessons || 0),
      payment_amount: Number(row.payment_amount || 0),
      payment_date: row.payment_date || '',
      payment_status: row.payment_status || '확인필요',
      last_lesson_date: row.last_lesson_date || '',
      status: row.status || '수강중',
      memo: row.memo || '',
    };
  }

  function mapLocalMember(row) {
    return mapMember({
      id: row.id,
      name: row.name,
      phone: row.phone,
      lesson_format: row.lessonFormat || row.lesson_format,
      days: row.days,
      lesson_time: row.time || row.lesson_time,
      lesson_start_date: row.lessonStartDate || row.lesson_start_date,
      group_lessons: row.groupLessons || row.group_lessons,
      total_lessons: row.totalLessons ?? row.total_lessons,
      used_lessons: row.usedLessons ?? row.used_lessons,
      payment_amount: row.paymentAmount ?? row.payment_amount,
      payment_date: row.paymentDate || row.payment_date,
      payment_status: row.paymentStatus || row.payment_status,
      last_lesson_date: row.lastLessonDate || row.last_lesson_date,
      status: row.status,
      memo: row.memo,
    });
  }

  async function getCurrentUser() {
    const client = getClient();

    if (!client) {
      return null;
    }

    const { data } = await client.auth.getUser();

    return data?.user || null;
  }

  async function linkMemberAuthUser(member, user) {
    if (!member?.id || !user?.id || member.auth_user_id === user.id) {
      return member;
    }

    if (member.auth_user_id && member.auth_user_id !== user.id) {
      return member;
    }

    const client = getClient();
    const { data, error } = await client
      .from('members')
      .update({ auth_user_id: user.id })
      .eq('id', member.id)
      .select('*')
      .single();

    if (error) {
      console.warn('회원 로그인 계정 연결을 저장하지 못했습니다.', error);

      return member;
    }

    return data || member;
  }

  function findMatchingMember(rows, request) {
    const requestPhone = normalizePhone(request?.phone);
    const requestName = String(request?.name || '').trim();

    return (
      (rows || []).find((member) => {
        const memberPhone = normalizePhone(member.phone);
        if (requestPhone && memberPhone === requestPhone) {
          return true;
        }

        return isMatchingMemberName(member.name, requestName);
      }) || null
    );
  }

  async function loadApprovedSignupMember(user) {
    const client = getClient();
    const userEmail = user?.email || '';

    if (!user?.id && !userEmail) {
      return null;
    }

    let requestQuery = client
      .from('signup_requests')
      .select('*')
      .eq('status', 'approved')
      .limit(1);

    if (user?.id && userEmail) {
      requestQuery = requestQuery.or(
        `auth_user_id.eq.${user.id},login_email.eq.${userEmail}`
      );
    } else if (user?.id) {
      requestQuery = requestQuery.eq('auth_user_id', user.id);
    } else {
      requestQuery = requestQuery.eq('login_email', userEmail);
    }

    const { data: requestData, error: requestError } = await requestQuery;

    if (requestError) {
      throw requestError;
    }

    const signupRequest = requestData?.[0];

    if (!signupRequest) {
      return null;
    }

    const { data: membersData, error: membersError } = await client
      .from('members')
      .select('*')
      .limit(1000);

    if (membersError) {
      throw membersError;
    }

    const matchedMember = findMatchingMember(membersData, signupRequest);
    const linkedMember = await linkMemberAuthUser(matchedMember, user);

    return linkedMember ? mapMember(linkedMember) : null;
  }

  async function loadMemberFromSupabase(user) {
    const client = getClient();
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get('memberId');
    const metadata = user?.user_metadata || {};
    const name = metadata.name || metadata.full_name || '';
    const phone = metadata.phone || '';

    let query = client.from('members').select('*');

    if (memberId) {
      query = query.eq('id', memberId).limit(1);
    } else if (user?.id) {
      const { data, error } = await client
        .from('members')
        .select('*')
        .eq('auth_user_id', user.id)
        .limit(1);

      if (error) {
        throw error;
      }

      if (data?.[0]) {
        return mapMember(data[0]);
      }

      const approvedSignupMember = await loadApprovedSignupMember(user);

      if (approvedSignupMember) {
        return approvedSignupMember;
      }

      if (phone) {
        const { data: phoneData, error: phoneError } = await client
          .from('members')
          .select('*');

        if (phoneError) {
          throw phoneError;
        }

        const normalizedPhone = normalizePhone(phone);
        const matchedMember = (phoneData || []).find(
          (member) => normalizePhone(member.phone) === normalizedPhone
        );

        return matchedMember ? mapMember(matchedMember) : null;
      }
    } else if (phone) {
      const { data, error } = await client.from('members').select('*');

      if (error) {
        throw error;
      }

      const normalizedPhone = normalizePhone(phone);
      const matchedMember = (data || []).find(
        (member) => normalizePhone(member.phone) === normalizedPhone
      );

      return matchedMember ? mapMember(matchedMember) : null;
    } else if (name) {
      query = query.eq('name', name).limit(1);
    } else {
      query = query.order('created_at', { ascending: false }).limit(1);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data?.[0] ? mapMember(data[0]) : null;
  }

  function loadMemberFromLocal(user) {
    const params = new URLSearchParams(window.location.search);
    const memberId = params.get('memberId');
    const metadata = user?.user_metadata || {};
    const name = metadata.name || metadata.full_name || '';
    const phone = normalizePhone(metadata.phone);
    const members = getStorageData(MEMBER_STORAGE_KEY, []).map(mapLocalMember);

    if (memberId) {
      return members.find((member) => String(member.id) === memberId) || null;
    }

    if (phone) {
      return (
        members.find((member) => normalizePhone(member.phone) === phone) || null
      );
    }

    if (name) {
      return members.find((member) => member.name === name) || null;
    }

    return members[0] || null;
  }

  async function loadCurrentMember() {
    const user = await getCurrentUser();

    if (getClient() && !user) {
      window.location.href = 'index.html';

      throw new Error('로그인이 필요합니다.');
    }

    if (getClient()) {
      const member = await loadMemberFromSupabase(user);

      if (member) {
        return { member, user };
      }
    }

    const member = loadMemberFromLocal(user);

    if (member) {
      return { member, user };
    }

    throw new Error('회원 정보를 찾지 못했습니다.');
  }

  function getLessonDayIndexes(member) {
    return (member.days || [])
      .map((day) => DAY_INDEX_BY_NAME[day])
      .filter((day) => Number.isInteger(day));
  }

  function createLessonDatePlan(member) {
    const totalLessons = Number(member.total_lessons || 0);
    const dayIndexes = getLessonDayIndexes(member);
    const startKey =
      member.lesson_start_date || member.payment_date || getTodayKey();

    if (totalLessons <= 0 || dayIndexes.length === 0) {
      return [];
    }

    const dates = [];
    const currentDate = new Date(`${startKey}T00:00:00`);

    while (dates.length < totalLessons) {
      const dateKey = toDateKey(currentDate);

      if (
        dayIndexes.includes(currentDate.getDay()) &&
        !HOLIDAY_OVERRIDES[dateKey]
      ) {
        dates.push(dateKey);
      }

      currentDate.setDate(currentDate.getDate() + 1);
    }

    const todayKey = getTodayKey();

    return dates.map((dateKey, index) => {
      const isCompleted =
        dateKey < todayKey && index < Number(member.used_lessons || 0);

      return {
        id: `${member.id}-${dateKey}-${member.lesson_time || index}`,
        date: dateKey,
        time: member.lesson_time,
        status: isCompleted ? 'completed' : 'scheduled',
        title: member.lesson_format || '개인레슨',
        memo: isCompleted ? '' : '예정된 개인레슨입니다.',
      };
    });
  }

  function createLessonSchedule(member) {
    const totalLessons = Number(member.total_lessons || 0);
    const usedLessons = Number(member.used_lessons || 0);
    const dayIndexes = getLessonDayIndexes(member);
    const startKey =
      member.lesson_start_date || member.payment_date || getTodayKey();

    if (totalLessons <= 0 || dayIndexes.length === 0) {
      return [];
    }

    const lessons = [];
    const currentDate = new Date(`${startKey}T00:00:00`);
    let lessonIndex = 0;
    let guard = 0;

    while (lessonIndex < totalLessons && guard < 700) {
      const dateKey = toDateKey(currentDate);
      const holidayName = getHolidayName(dateKey);

      if (dayIndexes.includes(currentDate.getDay())) {
        if (holidayName) {
          lessons.push({
            id: `${member.id}-${dateKey}-holiday`,
            date: dateKey,
            time: member.lesson_time,
            status: 'holiday',
            title: holidayName,
            memo: '휴일이라 수업이 없고 다음 수업일로 자동 연기됩니다.',
            holidayName,
          });
        } else {
          const isCompleted =
            dateKey < getTodayKey() && lessonIndex < usedLessons;

          lessons.push({
            id: `${member.id}-${dateKey}-${member.lesson_time || lessonIndex}`,
            date: dateKey,
            time: member.lesson_time,
            status: isCompleted ? 'completed' : 'scheduled',
            title: member.lesson_format || '개인레슨',
            memo: isCompleted ? '' : '예정된 개인레슨입니다.',
          });

          lessonIndex += 1;
        }
      }

      currentDate.setDate(currentDate.getDate() + 1);
      guard += 1;
    }

    return lessons;
  }

  function createGroupLessonSchedule(member, options = {}) {
    const groupLessons = normalizeGroupLessons(member.group_lessons);

    if (groupLessons.length === 0) {
      return [];
    }

    const includeHolidays = Boolean(options.includeHolidays);
    const maxScheduled = Number(options.maxScheduled || 12);
    const lessons = [];
    const currentDate = new Date(`${getTodayKey()}T00:00:00`);
    let scheduledCount = 0;
    let guard = 0;

    while (scheduledCount < maxScheduled && guard < 240) {
      const dateKey = toDateKey(currentDate);
      const day = currentDate.getDay();
      const holidayName = getHolidayName(dateKey);
      const lessonsForDay = groupLessons
        .filter((lesson) => lesson.day === day)
        .sort((a, b) => a.time.localeCompare(b.time));

      lessonsForDay.forEach((lesson) => {
        if (scheduledCount >= maxScheduled) {
          return;
        }

        if (holidayName) {
          if (includeHolidays) {
            lessons.push({
              id: `${member.id}-group-${dateKey}-${lesson.time}-holiday`,
              date: dateKey,
              time: lesson.time,
              type: 'group',
              status: 'holiday',
              title: holidayName,
              memo: '휴일이라 단체수업이 없습니다.',
              holidayName,
            });
          }

          return;
        }

        lessons.push({
          id: `${member.id}-group-${dateKey}-${lesson.time}`,
          date: dateKey,
          time: lesson.time,
          type: 'group',
          status: 'scheduled',
          title: '단체수업',
          memo: `${lesson.dayName}요일 ${formatLessonTime(lesson.time)} 단체수업입니다.`,
        });
        scheduledCount += 1;
      });

      currentDate.setDate(currentDate.getDate() + 1);
      guard += 1;
    }

    return lessons;
  }

  function sortLessonsByDateTime(lessons) {
    return [...lessons].sort((a, b) => {
      const dateCompare = String(a.date).localeCompare(String(b.date));

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return formatTime(a.time).localeCompare(formatTime(b.time));
    });
  }

  function sortLessonsByDateTimeDesc(lessons) {
    return sortLessonsByDateTime(lessons).reverse();
  }

  function isMatchingGroupLesson(member, row) {
    const groupLessons = normalizeGroupLessons(member.group_lessons);
    const date = new Date(`${row.lesson_date}T00:00:00`);
    const rowDay = date.getDay();
    const rowTime = formatTime(row.lesson_time);

    return groupLessons.some((lesson) => {
      return lesson.day === rowDay && lesson.time === rowTime;
    });
  }

  function mapCompletedGroupLesson(row) {
    return {
      id: row.id,
      date: row.lesson_date,
      time: row.lesson_time,
      type: 'group',
      status: 'completed',
      title: '단체수업',
      memo: row.memo || '',
    };
  }

  function mapCompletedPersonalLesson(row) {
    return {
      id: row.id,
      date: row.lesson_date,
      time: row.lesson_time,
      type: 'personal',
      status: 'completed',
      title: '개인레슨',
      memo: row.memo || '',
    };
  }

  async function loadCompletedPersonalLessonRecords(member) {
    const client = getClient();

    if (!client || !member.id) {
      return [];
    }

    async function runQuery(selectColumns) {
      return client
        .from('lessons')
        .select(selectColumns)
        .eq('member_id', member.id)
        .eq('lesson_type', 'personal')
        .eq('status', 'completed')
        .lte('lesson_date', getTodayKey())
        .order('lesson_date', { ascending: false })
        .order('lesson_time', { ascending: false })
        .limit(100);
    }

    let { data, error } = await runQuery(
      'id, lesson_date, lesson_time, title, lesson_type, status, memo'
    );

    if (error && String(error.message || '').includes('memo')) {
      const fallbackResult = await runQuery(
        'id, lesson_date, lesson_time, title, lesson_type, status'
      );

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.warn('개인레슨 완료 기록을 불러오지 못했습니다.', error);

      return [];
    }

    return data || [];
  }

  async function loadCompletedGroupLessons(member, limit = 6) {
    const client = getClient();

    if (!client || normalizeGroupLessons(member.group_lessons).length === 0) {
      return [];
    }

    async function runQuery(selectColumns) {
      return client
        .from('lessons')
        .select(selectColumns)
        .eq('lesson_type', 'group')
        .eq('status', 'completed')
        .lte('lesson_date', getTodayKey())
        .order('lesson_date', { ascending: false })
        .order('lesson_time', { ascending: false })
        .limit(100);
    }

    let { data, error } = await runQuery(
      'id, lesson_date, lesson_time, title, lesson_type, status, memo'
    );

    if (error && String(error.message || '').includes('memo')) {
      const fallbackResult = await runQuery(
        'id, lesson_date, lesson_time, title, lesson_type, status'
      );

      data = fallbackResult.data;
      error = fallbackResult.error;
    }

    if (error) {
      console.warn('단체수업 완료 기록을 불러오지 못했습니다.', error);

      return [];
    }

    return (data || [])
      .filter((row) => isMatchingGroupLesson(member, row))
      .map(mapCompletedGroupLesson)
      .slice(0, limit);
  }

  function getMergedUpcomingLessons(member, options = {}) {
    const todayKey = getTodayKey();
    const includeHolidays = Boolean(options.includeHolidays);
    const limit = Number(options.limit || 4);
    const personalLessons = (includeHolidays
      ? createLessonSchedule(member)
      : createLessonDatePlan(member)
    ).filter(
      (lesson) => lesson.date >= todayKey && lesson.status !== 'completed'
    );
    const groupLessons = createGroupLessonSchedule(member, {
      includeHolidays,
      maxScheduled: Math.max(limit, 6),
    });
    const mergedLessons = sortLessonsByDateTime([
      ...personalLessons,
      ...groupLessons,
    ]);

    if (!includeHolidays) {
      return mergedLessons.slice(0, limit);
    }

    const limitedLessons = [];
    let scheduledCount = 0;

    for (const lesson of mergedLessons) {
      if (lesson.status === 'scheduled' && scheduledCount >= limit) {
        break;
      }

      limitedLessons.push(lesson);

      if (lesson.status === 'scheduled') {
        scheduledCount += 1;
      }
    }

    return limitedLessons;
  }

  function getUpcomingLessons(member, limit = 4) {
    return getMergedUpcomingLessons(member, { limit });
  }

  function getUpcomingLessonsWithHolidays(member, limit = 4) {
    return getMergedUpcomingLessons(member, {
      includeHolidays: true,
      limit,
    });
  }

  async function getCompletedLessons(member, limit = 4, options = {}) {
    const personalRecords = await loadCompletedPersonalLessonRecords(member);
    const personalLessons = personalRecords.map(mapCompletedPersonalLesson);
    const groupLessons = await loadCompletedGroupLessons(member, limit);
    const completedLessons = sortLessonsByDateTimeDesc([
      ...personalLessons,
      ...groupLessons,
    ]);
    const visibleLessons = options.onlyWithMemo
      ? completedLessons.filter((lesson) => String(lesson.memo || '').trim())
      : completedLessons;

    return visibleLessons.slice(0, limit);
  }

  function getThisMonthCompletedCount(member) {
    const today = new Date();
    const monthPrefix = `${today.getFullYear()}-${String(
      today.getMonth() + 1
    ).padStart(2, '0')}`;

    return createLessonDatePlan(member).filter(
      (lesson) =>
        lesson.status === 'completed' && lesson.date.startsWith(monthPrefix)
    ).length;
  }

  async function updateMemberPayment(member, paymentData) {
    const client = getClient();

    if (!client) {
      throw new Error('Supabase 연결이 필요합니다.');
    }

    const { data, error } = await client
      .from('members')
      .update({
        payment_date: paymentData.paymentDate,
        payment_amount: paymentData.paymentAmount,
        payment_status: '확인필요',
      })
      .eq('id', member.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return mapMember(data);
  }

  async function updateMemberMemo(member, message) {
    const client = getClient();

    if (!client) {
      throw new Error('Supabase 연결이 필요합니다.');
    }

    const previousMemo = member.memo ? `${member.memo}\n\n` : '';
    const memo = `${previousMemo}[회원 전달] ${message}`;

    const { data, error } = await client
      .from('members')
      .update({ memo })
      .eq('id', member.id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return mapMember(data);
  }

  async function logout() {
    const client = getClient();

    if (client) {
      await client.auth.signOut();
    }

    localStorage.removeItem('loginSession');
    sessionStorage.removeItem('loginSession');
    window.location.href = 'index.html';
  }

  function renderIcons() {
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  window.memberPortal = {
    formatDateWithDay,
    formatDays,
    formatFullDate,
    formatLessonTime,
    formatMoney,
    formatShortDate,
    getCompletedLessons,
    getHolidayName,
    getRemainingLessons,
    getThisMonthCompletedCount,
    getUpcomingLessons,
    getUpcomingLessonsWithHolidays,
    loadCurrentMember,
    logout,
    parseMoney,
    renderIcons,
    updateMemberMemo,
    updateMemberPayment,
  };
})();
