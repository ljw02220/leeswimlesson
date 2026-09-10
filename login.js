document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginId = document.getElementById('loginId');
  const loginPassword = document.getElementById('loginPassword');
  const rememberLogin = document.getElementById('rememberLogin');
  const togglePassword = document.getElementById('togglePassword');
  const loginError = document.getElementById('loginError');

  togglePassword.addEventListener('click', () => {
    const isPassword = loginPassword.type === 'password';

    loginPassword.type = isPassword ? 'text' : 'password';

    togglePassword.textContent = isPassword ? '숨기기' : '보기';

    togglePassword.setAttribute(
      'aria-label',
      isPassword ? '비밀번호 숨기기' : '비밀번호 보기'
    );
  });

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = loginId.value.trim();
    const password = loginPassword.value;

    loginError.textContent = '';

    if (!window.swimDb?.client) {
      loginError.textContent = 'Supabase 연결 설정을 확인해주세요.';

      return;
    }

    const { data, error } = await window.swimDb.client.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      loginError.textContent = '이메일 또는 비밀번호가 틀렸습니다.';

      return;
    }

    const loginData = {
      role: 'admin',
      loginId: data.user.email,
      loginAt: new Date().toISOString(),
    };

    localStorage.removeItem('loginSession');
    sessionStorage.removeItem('loginSession');

    if (rememberLogin.checked) {
      localStorage.setItem('loginSession', JSON.stringify(loginData));
    } else {
      sessionStorage.setItem('loginSession', JSON.stringify(loginData));
    }

    window.location.href = 'home.html';
  });
});
