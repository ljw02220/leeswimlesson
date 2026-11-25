/* A visible reload control for standalone home-screen web apps. */
document.addEventListener('DOMContentLoaded', () => {
  const header=document.querySelector('.member-header, .top-nav');
  if(!header||header.querySelector('[data-app-refresh]'))return;
  const button=document.createElement('button');
  button.type='button';button.className='app-refresh-button';
  button.dataset.appRefresh='';button.title='새로고침';button.setAttribute('aria-label','페이지 새로고침');
  button.innerHTML='<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 7v5h-5"/><path d="M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.5-1L20 9M4 15l2.4 3A7 7 0 0 0 17.9 17"/></svg>';
  button.addEventListener('click',()=>{button.disabled=true;window.location.reload();});
  const target=header.querySelector('.member-notification-button, .admin-account');
  header.insertBefore(button,target||null);
  const style=document.createElement('style');
  style.textContent='.app-refresh-button{display:inline-flex;align-items:center;justify-content:center;flex:0 0 36px;width:36px;height:40px;padding:0;border:1px solid #d5e3f2;border-radius:9px;background:#fff;color:#3972ad;cursor:pointer;touch-action:manipulation}.app-refresh-button:disabled{opacity:.5}.member-header .app-refresh-button{margin-left:auto;margin-right:8px}.top-nav .app-refresh-button{margin-left:auto}.app-refresh-button:focus-visible{outline:2px solid #2563eb;outline-offset:2px}@media(max-width:480px){.top-nav .app-refresh-button{flex-basis:30px;width:30px;height:36px}.member-header .app-refresh-button{flex-basis:34px;width:34px}}';
  document.head.appendChild(style);
});
