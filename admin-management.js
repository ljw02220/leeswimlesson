/* Keep navigation working independently of dashboard data loading. */
document.addEventListener('DOMContentLoaded', () => {
  function showManagement(view) {
    for (const [name,id] of Object.entries({teaching:'homeTeaching',members:'homeMembers',finance:'homeFinance'})) {
      document.getElementById(id).hidden = view !== name;
    }
    document.querySelectorAll('[data-management-view]').forEach(link=>{
      if(link.dataset.managementView===view)link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
    const frame=view==='members'?document.getElementById('homeMembersFrame'):null;
    if(frame&&!frame.getAttribute('src'))frame.src=frame.dataset.src;
  }
  document.querySelectorAll('[data-management-view]').forEach(link=>link.addEventListener('click',event=>{
    event.preventDefault();showManagement(link.dataset.managementView);
  }));

  const initial={ '#homeMembers':'members', '#homeFinance':'finance', '#paymentRequests':'finance' }[location.hash] || 'teaching';
  showManagement(initial);
});
