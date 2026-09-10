document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginId = document.getElementById('loginId');
  const loginPassword = document.getElementById('loginPassword');

  console.log('login.js 연결됨');

  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();

    console.log('submit 실행됨');

    const id = loginId.value.trim();
    const password = loginPassword.value;

    if (id === 'admin' && password === '1234') {
      console.log('로그인 성공');
      window.location.href = 'lessons.html';
    } else {
      alert('아이디 또는 비밀번호가 틀렸습니다.');
    }
  });
});
