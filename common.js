function setupLogout() {
  const logoutButton = document.getElementById('logoutButton');

  if (!logoutButton) {
    return;
  }

  logoutButton.addEventListener('click', () => {
    localStorage.removeItem('loginSession');
    sessionStorage.removeItem('loginSession');

    window.location.href = 'index.html';
  });
}

document.addEventListener('DOMContentLoaded', setupLogout);
