async function requireAuthSession() {
  const path = window.location.pathname;
  const isLoginPage = path.endsWith('/') || path.endsWith('/index.html');

  if (isLoginPage || !window.swimDb?.client) {
    return;
  }

  const { data } = await window.swimDb.client.auth.getSession();

  if (!data.session) {
    localStorage.removeItem('loginSession');
    sessionStorage.removeItem('loginSession');

    window.location.href = 'index.html';

    return;
  }

  const savedSession =
    sessionStorage.getItem('loginSession') || localStorage.getItem('loginSession');

  if (savedSession) {
    try {
      const parsedSession = JSON.parse(savedSession);

      if (parsedSession.role === 'member') {
        window.location.href = 'member-home.html';
      }
    } catch (error) {
      console.error('로그인 세션 정보를 확인하지 못했습니다.', error);
    }
  }
}

function setupLogout() {
  const logoutButton = document.getElementById('logoutButton');

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener('click', async () => {
    if (window.swimDb?.client) {
      await window.swimDb.client.auth.signOut();
    }

    localStorage.removeItem('loginSession');
    sessionStorage.removeItem('loginSession');

    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuthSession();
  setupLogout();
});
