document.addEventListener('DOMContentLoaded',()=>{
  const tabs=[document.getElementById('iosTab'),document.getElementById('androidTab')];
  function select(index,focus=false){tabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;document.getElementById(tab.getAttribute('aria-controls')).hidden=i!==index});if(focus)tabs[index].focus();}
  tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>select(index));tab.addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();select(event.key==='Home'?0:event.key==='End'?1:1-index,true);}})});
  select(/android/i.test(navigator.userAgent)?1:0);
  document.getElementById('guideBack').addEventListener('click',event=>{if(document.referrer&&new URL(document.referrer).origin===window.location.origin){event.preventDefault();window.history.back();}});
});
