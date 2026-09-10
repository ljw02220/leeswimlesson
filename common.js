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
