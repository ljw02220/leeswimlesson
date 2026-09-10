document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginId = document.getElementById('loginId');
  const loginPassword = document.getElementById('loginPassword');
  const rememberLogin = document.getElementById('rememberLogin');
  const togglePassword = document.getElementById('togglePassword');
  const loginError = document.getElementById('loginError');

  const adminConfig = {
    id: window.SWIM_CONFIG?.ADMIN_ID || '',
    password: window.SWIM_CONFIG?.ADMIN_PASSWORD || '',
    role: 'admin',
  };

  togglePassword.addEventListener('click', () => {
    const isPassword = loginPassword.type === 'password';

    loginPassword.type = isPassword ? 'text' : 'password';

    togglePassword.textContent = isPassword ? '숨기기' : '보기';

    togglePassword.setAttribute(
      'aria-label',
      isPassword ? '비밀번호 숨기기' : '비밀번호 보기'
    );
  });

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    const id = loginId.value.trim();
    const password = loginPassword.value;

    loginError.textContent = '';

    if (id === adminConfig.id && password === adminConfig.password) {
      const loginData = {
        role: adminConfig.role,
        loginId: adminConfig.id,
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

      return;
    }

    loginError.textContent = '아이디 또는 비밀번호가 틀렸습니다.';
  });
});
