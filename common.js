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

function setupAdminMenu() {
  const account = document.querySelector('.admin-account');
  if (!account) return;
  document.addEventListener('click', (event) => {
    if (!account.contains(event.target)) account.open = false;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && account.open) {
      account.open = false;
      account.querySelector('summary')?.focus();
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  requireAuthSession();
  setupLogout();
  setupAdminMenu();
});
