document.addEventListener('DOMContentLoaded', () => {
  const portal = window.memberPortal;
  let currentMember = null;
  function setMessage(message, tone = 'success') {
    const element = document.getElementById('paymentReportMessage');

    if (!element) {
      return;
    }

    element.textContent = message;
    element.dataset.tone = tone;
  }

  const localDate = () => { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; };
  const todayKey = localDate();
  const paymentDate = document.getElementById('paymentReportDate');

  if (paymentDate) {
    paymentDate.value = localDate();
  }

  const paymentForm = document.getElementById('paymentReportForm');
  const amountChoice = document.getElementById('paymentReportAmountChoice');
  const customAmount = document.getElementById('paymentReportCustomAmount');
  const amountInput = document.getElementById('paymentReportAmount');

  function syncAmountInput(focus = false) {
    const isCustom = amountChoice?.value === 'custom';
    if (customAmount) customAmount.hidden = !isCustom;
    if (amountInput) {
      amountInput.disabled = !isCustom;
      amountInput.required = isCustom;
      if (isCustom && focus) amountInput.focus();
    }
  }

  amountChoice?.addEventListener('change', () => syncAmountInput(true));
  syncAmountInput();

  if (paymentForm) {
    paymentForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const paymentAmount = portal.parseMoney(
        amountChoice?.value === 'custom' ? amountInput?.value : amountChoice?.value
      );
      const paymentDateValue =
        document.getElementById('paymentReportDate')?.value || '';

      if (!paymentDateValue || paymentAmount <= 0) {
        setMessage('결제일과 결제금액을 입력해주세요.', 'error');

        return;
      }

      const submitButton = paymentForm.querySelector('[type="submit"]');
      if (submitButton?.disabled) return;
      if (submitButton) submitButton.disabled = true;
      try {
        if (!currentMember) currentMember = (await portal.loadCurrentMember()).member;
        if(!portal.hasPersonalLessons(currentMember))throw Error('결제 알리기는 개인레슨 회원만 이용할 수 있어요.');
        currentMember = await portal.updateMemberPayment(currentMember, {
          paymentDate: paymentDateValue,
          paymentAmount,
        });

        paymentForm.reset();
        syncAmountInput();

        if (paymentDate) {
          paymentDate.value = localDate();
        }

        setMessage('결제 알림을 저장했습니다. 관리자 확인 후 반영됩니다.');
        window.dispatchEvent(new CustomEvent('swim-payment-requested'));
      } catch (error) {
        console.error('결제 알림 저장 실패:', error);

        setMessage(error.message || '결제 알림을 저장하지 못했습니다.', 'error');
      } finally {
        const submitButton = paymentForm.querySelector('[type="submit"]');
        if (submitButton) submitButton.disabled = false;
      }
    });
  }

  const paymentReportAmount = document.getElementById('paymentReportAmount');

  if (paymentReportAmount) {
    paymentReportAmount.addEventListener('input', (event) => {
      const numbersOnly = event.target.value.replace(/[^0-9]/g, '');

      if (!numbersOnly) {
        event.target.value = '';

        return;
      }

      event.target.value = Number(numbersOnly).toLocaleString('ko-KR');
    });
  }


  const dialog = document.getElementById('paymentReportDialog');
  document.getElementById('paymentReportOpen')?.addEventListener('click', async () => {
    if(!currentMember)currentMember=(await portal.loadCurrentMember()).member;
    if(!portal.hasPersonalLessons(currentMember))return;
    setMessage('');
    if (paymentDate && !paymentDate.value) paymentDate.value = localDate();
    if (dialog && !dialog.open) dialog.showModal();
  });
  document.getElementById('paymentReportClose')?.addEventListener('click', () => dialog.close());
  dialog?.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog?.addEventListener('close', () => document.getElementById('paymentReportOpen')?.focus());
});
