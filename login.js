function setupPasswordToggle(inputId, buttonId) {
  const input = document.getElementById(inputId);

  const button = document.getElementById(buttonId);

  if (!input || !button) {
    return;
  }

  button.addEventListener('click', () => {
    const isPassword = input.type === 'password';

    input.type = isPassword ? 'text' : 'password';

    button.textContent = isPassword ? '숨기기' : '보기';

    button.setAttribute(
      'aria-label',
      isPassword ? '비밀번호 숨기기' : '비밀번호 보기'
    );
  });
}

function setupAuthViewSwitch() {
  const loginView = document.getElementById('loginView');

  const signupView = document.getElementById('signupView');

  const showSignupButton = document.getElementById('showSignupButton');

  const showLoginButton = document.getElementById('showLoginButton');

  if (!loginView || !signupView) {
    return;
  }

  if (showSignupButton) {
    showSignupButton.addEventListener('click', () => {
      loginView.classList.add('auth-view-hidden');

      signupView.classList.remove('auth-view-hidden');

      document.getElementById('signupName')?.focus();
    });
  }

  if (showLoginButton) {
    showLoginButton.addEventListener('click', () => {
      signupView.classList.add('auth-view-hidden');

      loginView.classList.remove('auth-view-hidden');

      document.getElementById('loginId')?.focus();
    });
  }
}

function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

function getMemberLoginEmail(phone) {
  return `${normalizePhone(phone)}@members.leeswimlesson.com`;
}

function getAdminLoginEmail(loginId) {
  const configuredAdminId = window.SWIM_CONFIG?.ADMIN_ID || 'admin';
  const configuredAdminEmail = window.SWIM_CONFIG?.ADMIN_EMAIL;

  if (configuredAdminEmail && loginId.toLowerCase() === configuredAdminId.toLowerCase()) {
    return configuredAdminEmail;
  }

  return `${loginId}@admins.leeswimlesson.com`;
}

function getConfiguredAdminEmail() {
  return window.SWIM_CONFIG?.ADMIN_EMAIL || 'admin@admins.leeswimlesson.com';
}

function isAdminLogin(loginId, email) {
  const configuredAdminId = window.SWIM_CONFIG?.ADMIN_ID || 'admin';
  const normalizedLoginId = String(loginId || '').trim().toLowerCase();
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const adminEmail = getConfiguredAdminEmail().toLowerCase();

  return (
    normalizedLoginId === configuredAdminId.toLowerCase() ||
    normalizedEmail === adminEmail ||
    normalizedEmail.endsWith('@admins.leeswimlesson.com')
  );
}

function isMemberAuthUser(user) {
  return user?.user_metadata?.role === 'member';
}

function isPhoneLogin(loginId) {
  return normalizePhone(loginId).length >= 10;
}

function getLoginEmail(loginId) {
  if (loginId.includes('@')) {
    return loginId;
  }

  if (isPhoneLogin(loginId)) {
    return getMemberLoginEmail(loginId);
  }

  return getAdminLoginEmail(loginId);
}

function getErrorText(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');
}

function getSignupErrorMessage(error) {
  const errorText = getErrorText(error);

  if (error?.code === '23505') {
    return '이미 가입 신청된 전화번호입니다.';
  }

  if (errorText.includes('signup_requests')) {
    return (
      '가입 신청 테이블이 아직 준비되지 않았습니다. ' +
      'Supabase SQL Editor에서 supabase-approval-migration.sql을 먼저 실행해주세요.'
    );
  }

  if (errorText.includes('Database error saving new user')) {
    return 'Supabase Auth 설정 때문에 회원 계정을 만들지 못했습니다.';
  }

  return `가입 신청을 저장하지 못했습니다. ${errorText || 'Supabase 설정을 확인해주세요.'}`;
}

function isUserAlreadyRegisteredError(error) {
  const errorText = getErrorText(error).toLowerCase();

  return (
    errorText.includes('user already registered') ||
    errorText.includes('user already exists') ||
    errorText.includes('already registered')
  );
}

async function getSignupRequest(userId, loginEmail) {
  let query = window.swimDb.client
    .from('signup_requests')
    .select('*')
    .limit(1);

  if (userId && loginEmail) {
    query = query.or(`auth_user_id.eq.${userId},login_email.eq.${loginEmail}`);
  } else if (userId) {
    query = query.eq('auth_user_id', userId);
  } else if (loginEmail) {
    query = query.eq('login_email', loginEmail);
  }

  const { data, error } = await query;

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function getMemberByAuthUserId(userId) {
  const { data, error } = await window.swimDb.client
    .from('members')
    .select('id, name, auth_user_id')
    .eq('auth_user_id', userId)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] || null;
}

async function getMemberBySignupRequest(signupRequest) {
  const normalizedPhone = normalizePhone(signupRequest?.phone);
  const requestName = String(signupRequest?.name || '').trim();

  if (!normalizedPhone && !requestName) {
    return null;
  }

  const { data, error } = await window.swimDb.client
    .from('members')
    .select('id, name, phone, auth_user_id')
    .limit(1000);

  if (error) {
    throw error;
  }

  return (
    (data || []).find((member) => {
      const memberPhone = normalizePhone(member.phone);
      const memberName = String(member.name || '').trim();

      if (normalizedPhone && memberPhone === normalizedPhone) {
        return true;
      }

      return requestName && memberName === requestName;
    }) || null
  );
}

async function linkMemberAuthUser(member, userId) {
  if (!member?.id || !userId || member.auth_user_id === userId) {
    return member;
  }

  const { data, error } = await window.swimDb.client
    .from('members')
    .update({ auth_user_id: userId })
    .eq('id', member.id)
    .select('id, name, phone, auth_user_id')
    .single();

  if (error) {
    throw error;
  }

  return data || member;
}

function setupLogin() {
  const loginForm = document.getElementById('loginForm');

  const loginId = document.getElementById('loginId');

  const loginPassword = document.getElementById('loginPassword');

  const rememberLogin = document.getElementById('rememberLogin');

  const loginError = document.getElementById('loginError');

  if (!loginForm || !loginId || !loginPassword) {
    return;
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const rawLoginId = loginId.value.trim();
    const email = getLoginEmail(rawLoginId);

    const password = loginPassword.value;

    if (loginError) {
      loginError.textContent = '';
    }

    if (!window.swimDb?.client) {
      if (loginError) {
        loginError.textContent = 'Supabase 연결 설정을 확인해주세요.';
      }

      return;
    }

    const { data, error } = await window.swimDb.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      if (loginError) {
        loginError.textContent = `로그인 실패: ${error.message || '아이디 또는 비밀번호를 확인해주세요.'}`;
      }

      return;
    }

    try {
      if (
        !isMemberAuthUser(data.user) ||
        isAdminLogin(rawLoginId, data.user.email || email)
      ) {
        const loginData = {
          role: 'admin',
          loginId: data.user.email || email,
          memberId: null,
          loginAt: new Date().toISOString(),
        };

        localStorage.removeItem('loginSession');

        sessionStorage.removeItem('loginSession');

        if (rememberLogin?.checked) {
          localStorage.setItem('loginSession', JSON.stringify(loginData));
        } else {
          sessionStorage.setItem('loginSession', JSON.stringify(loginData));
        }

        window.location.href = 'home.html';

        return;
      }

      const signupRequest = await getSignupRequest(data.user.id, data.user.email || email);
      let member = await getMemberByAuthUserId(data.user.id);

      if (signupRequest && signupRequest.status !== 'approved') {
        await window.swimDb.client.auth.signOut();

        if (loginError) {
          loginError.textContent =
            signupRequest.status === 'rejected'
              ? '가입 신청이 거절되었습니다. 관리자에게 문의해주세요.'
              : '관리자 승인 후 로그인할 수 있습니다.';
        }

        return;
      }

      if (!member && signupRequest?.status === 'approved') {
        member = await getMemberBySignupRequest(signupRequest);
        member = await linkMemberAuthUser(member, data.user.id);
      }

      const loginData = {
        role: member || isMemberAuthUser(data.user) ? 'member' : 'admin',
        loginId: data.user.email || email,
        memberId: member?.id || null,
        loginAt: new Date().toISOString(),
      };

      localStorage.removeItem('loginSession');

      sessionStorage.removeItem('loginSession');

      if (rememberLogin?.checked) {
        localStorage.setItem('loginSession', JSON.stringify(loginData));
      } else {
        sessionStorage.setItem('loginSession', JSON.stringify(loginData));
      }

      window.location.href =
        member || isMemberAuthUser(data.user) ? 'member-home.html' : 'home.html';
    } catch (approvalError) {
      console.error('승인 상태 확인 실패:', approvalError);

      await window.swimDb.client.auth.signOut();

      if (loginError) {
        loginError.textContent =
          '승인 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.';
      }
    }
  });
}

function setupSignup() {
  const signupForm = document.getElementById('signupForm');

  const signupName = document.getElementById('signupName');

  const signupPhone = document.getElementById('signupPhone');

  const signupPassword = document.getElementById('signupPassword');

  const signupPasswordConfirm = document.getElementById(
    'signupPasswordConfirm'
  );

  const signupError = document.getElementById('signupError');

  const signupSuccess = document.getElementById('signupSuccess');

  if (!signupForm) {
    return;
  }

  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    if (signupError) {
      signupError.textContent = '';
    }

    if (signupSuccess) {
      signupSuccess.textContent = '';
    }

    const name = signupName?.value.trim() || '';

    const phone = signupPhone?.value.trim() || '';

    const password = signupPassword?.value || '';

    const passwordConfirm = signupPasswordConfirm?.value || '';

    const normalizedPhone = normalizePhone(phone);

    if (!name || !normalizedPhone || !password || !passwordConfirm) {
      if (signupError) {
        signupError.textContent = '모든 항목을 입력해주세요.';
      }

      return;
    }

    if (password.length < 6) {
      if (signupError) {
        signupError.textContent = '비밀번호는 6자 이상 입력해주세요.';
      }

      return;
    }

    if (password !== passwordConfirm) {
      if (signupError) {
        signupError.textContent = '비밀번호가 일치하지 않습니다.';
      }

      return;
    }

    if (!window.swimDb?.client) {
      if (signupError) {
        signupError.textContent = 'Supabase 연결 설정을 확인해주세요.';
      }

      return;
    }

    try {
      const loginEmail = getMemberLoginEmail(normalizedPhone);
      const { data, error } = await window.swimDb.client.auth.signUp({
        email: loginEmail,
        password,
        options: {
          data: {
            name,
            phone,
            role: 'member',
          },
        },
      });

      if (error && !isUserAlreadyRegisteredError(error)) {
        throw error;
      }

      const { error: requestError } = await window.swimDb.client
        .from('signup_requests')
        .insert({
          auth_user_id: data?.user?.id || null,
          login_email: loginEmail,
          name,
          phone,
          status: 'pending',
          memo: error
            ? '이미 생성된 Auth 계정에서 다시 접수된 가입 신청입니다.'
            : null,
        });

      if (requestError) {
        throw requestError;
      }

      await window.swimDb.client.auth.signOut();

      signupForm.reset();

      if (signupSuccess) {
        signupSuccess.textContent =
          '가입 신청이 접수되었습니다. 관리자 승인 후 로그인할 수 있습니다.';
      }
    } catch (error) {
      console.error('가입 신청 실패:', error);

      if (signupError) {
        signupError.textContent = getSignupErrorMessage(error);
      }
    }
  });
}

function setupPhoneFormat() {
  const signupPhone = document.getElementById('signupPhone');

  if (!signupPhone) {
    return;
  }

  signupPhone.addEventListener('input', (event) => {
    let value = event.target.value.replace(/\D/g, '');

    if (value.length > 11) {
      value = value.slice(0, 11);
    }

    if (value.length <= 3) {
      event.target.value = value;

      return;
    }

    if (value.length <= 7) {
      event.target.value = `${value.slice(0, 3)}-${value.slice(3)}`;

      return;
    }

    event.target.value = `${value.slice(0, 3)}-${value.slice(
      3,
      7
    )}-${value.slice(7)}`;
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setupPasswordToggle('loginPassword', 'togglePassword');

  setupPasswordToggle('signupPassword', 'toggleSignupPassword');

  setupPasswordToggle('signupPasswordConfirm', 'toggleSignupPasswordConfirm');

  setupAuthViewSwitch();

  setupLogin();

  setupSignup();

  setupPhoneFormat();
});
