/* A visible reload control for standalone home-screen web apps. */
document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.member-header, .top-nav');
  if (!header || header.querySelector('[data-app-refresh]')) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'app-refresh-button';
  button.dataset.appRefresh = '';
  button.title = '새로고침';
  button.setAttribute('aria-label', '페이지 새로고침');
  button.textContent = '↻';
  button.addEventListener('click', () => {
    button.disabled = true;
    window.location.reload();
  });
  let target = header.querySelector(
    '.member-notification-button, .swim-notification-trigger, .admin-account'
  );
  // Notifications wrap the bell in a container; insert relative to a direct child.
  while (target && target.parentNode !== header) target = target.parentNode;
  if (header.matches('.member-header') && target) {
    const actions = document.createElement('div');
    actions.className = 'header-notification-actions';
    header.insertBefore(actions, target);
    actions.append(button, target);
  } else {
    header.insertBefore(button, target || null);
  }
  const style = document.createElement('style');
  style.textContent = `
    .app-refresh-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 36px;
      width: 36px;
      height: 38px;
      padding: 0;
      border: 0;
      border-radius: 12px;
      background: #fff;
      color: #163f57;
      font-size: 24px;
      cursor: pointer;
      touch-action: manipulation;
    }

    .app-refresh-button:disabled {
      opacity: 0.5;
    }

    .member-header .header-notification-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-left: auto;
      flex-shrink: 0;
    }

    .member-header .header-notification-actions .app-refresh-button,
    .member-header .header-notification-actions .member-notification-button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 38px;
      width: 38px;
      height: 38px;
      margin: 0;
      padding: 0;
      border: 0;
      border-radius: 12px;
      background: #fff;
      color: #163f57;
      box-shadow: 0 6px 18px rgba(39, 67, 105, 0.08);
      box-sizing: border-box;
    }

    .top-nav .app-refresh-button {
      margin-left: auto;
    }

    .app-refresh-button:focus-visible {
      outline: 2px solid #2563eb;
      outline-offset: 2px;
    }

    @media (max-width: 480px) {
      .top-nav .app-refresh-button {
        flex-basis: 30px;
        width: 30px;
        height: 36px;
      }

      .member-header .header-notification-actions .app-refresh-button,
      .member-header .header-notification-actions .member-notification-button {
        flex-basis: 34px;
        width: 34px;
        height: 34px;
        border-radius: 12px;
      }
    }
  `;
  document.head.appendChild(style);
});
