document.addEventListener('DOMContentLoaded', async () => {
  const client = window.swimDb?.client;
  if (!client) return;

  const memberSummary = document.getElementById('makeupCreditSummary');
  const memberModal = document.getElementById('makeupCreditModal');
  const adminList = document.getElementById('makeup-credit-admin-list');
  let currentMember = null;

  const statusText = {
    pending: '확인 중',
    approved: '승인',
    rejected: '반려',
    cancelled: '취소',
  };

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
    })[character]);
  }

  function formatDate(value) {
    return value ? value.replaceAll('-', '.') : '날짜 미상';
  }

  async function loadMemberCredits() {
    if (!currentMember || !memberSummary) return;

    const { data, error } = await client
      .from('makeup_credits')
      .select('*')
      .eq('member_id', currentMember.id)
      .order('requested_at', { ascending: false });

    if (error) {
      memberSummary.innerHTML = '<p class="member-empty">보강 횟수 기능을 준비 중입니다.</p>';
      return;
    }

    const credits = data || [];
    const available = credits
      .filter((item) => item.status === 'approved')
      .reduce((sum, item) => sum + Number(item.remaining_quantity || 0), 0);
    const pending = credits
      .filter((item) => item.status === 'pending')
      .reduce((sum, item) => sum + Number(item.quantity || 0), 0);

    memberSummary.innerHTML = `
      <div class="makeup-credit-counts">
        <span>사용 가능 <strong>${available}회</strong></span>
        <span>확인 중 <strong>${pending}회</strong></span>
      </div>
      <div class="makeup-credit-history">
        ${credits.slice(0, 3).map((item) => `
          <div>
            <span>${formatDate(item.missed_date)} · ${item.quantity}회</span>
            <em class="${item.status}">${statusText[item.status]}</em>
            ${item.status === 'pending' ? `<button type="button" data-credit-cancel="${item.id}">취소</button>` : ''}
          </div>
        `).join('') || '<p class="member-empty">등록된 보강 내역이 없습니다.</p>'}
      </div>`;
  }

  function openMemberModal() {
    memberModal?.classList.add('open');
    memberModal?.setAttribute('aria-hidden', 'false');
  }

  function closeMemberModal() {
    memberModal?.classList.remove('open');
    memberModal?.setAttribute('aria-hidden', 'true');
  }

  document.getElementById('makeupCreditOpen')?.addEventListener('click', openMemberModal);
  document.getElementById('makeupCreditClose')?.addEventListener('click', closeMemberModal);
  memberModal?.addEventListener('click', (event) => {
    if (event.target === memberModal) closeMemberModal();
  });

  document.getElementById('makeupCreditForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button[type="submit"]');
    const quantity = Number(form.elements.quantity.value);
    button.disabled = true;

    const { error } = await client.from('makeup_credits').insert({
      member_id: currentMember.id,
      missed_date: form.elements.missed_date.value || null,
      quantity,
      remaining_quantity: quantity,
      reason: form.elements.reason.value.trim() || null,
    });

    button.disabled = false;
    if (error) {
      alert(`보강 확인 요청을 저장하지 못했습니다. ${error.message}`);
      return;
    }

    form.reset();
    closeMemberModal();
    await loadMemberCredits();
  });

  memberSummary?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-credit-cancel]');
    if (!button || !confirm('보강 확인 요청을 취소할까요?')) return;
    button.disabled = true;
    const { error } = await client.rpc('cancel_makeup_credit', {
      p_credit_id: button.dataset.creditCancel,
    });
    if (error) alert(error.message);
    await loadMemberCredits();
  });

  async function loadAdminCredits() {
    if (!adminList) return;
    const [{ data: credits, error }, { data: members }] = await Promise.all([
      client.from('makeup_credits').select('*').order('requested_at', { ascending: false }),
      client.from('members').select('id, name'),
    ]);
    if (error) {
      adminList.innerHTML = '<p class="today-empty">보강 권리 SQL을 먼저 실행해주세요.</p>';
      return;
    }
    const names = new Map((members || []).map((member) => [member.id, member.name]));
    adminList.innerHTML = (credits || []).map((item) => `
      <article class="makeup-admin-item">
        <div>
          <strong>${escapeHTML(names.get(item.member_id) || '회원')} · ${item.quantity}회</strong>
          <span>${formatDate(item.missed_date)}${item.reason ? ` · ${escapeHTML(item.reason)}` : ''}</span>
        </div>
        <div class="makeup-admin-actions">
          ${item.status === 'pending' ? `
            <button type="button" data-credit-review="approved" data-credit-id="${item.id}">승인</button>
            <button type="button" class="danger" data-credit-review="rejected" data-credit-id="${item.id}">반려</button>
          ` : `
            <em>${statusText[item.status]}</em>
            ${item.status === 'approved' ? `<button type="button" class="danger" data-credit-cancel-admin="${item.id}">승인 취소</button>` : ''}
          `}
        </div>
      </article>
    `).join('') || '<p class="today-empty">보강 확인 요청이 없습니다.</p>';
  }

  adminList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-credit-review]');
    const cancelButton = event.target.closest('[data-credit-cancel-admin]');
    if (!button && !cancelButton) return;

    if (cancelButton) {
      if (!confirm('승인한 보강 횟수를 취소할까요?')) return;
      cancelButton.disabled = true;
      const { error } = await client.rpc('cancel_makeup_credit', {
        p_credit_id: cancelButton.dataset.creditCancelAdmin,
      });
      if (error) alert(`보강 승인을 취소하지 못했습니다. ${error.message}`);
      await loadAdminCredits();
      return;
    }

    button.disabled = true;
    const { error } = await client.rpc('review_makeup_credit', {
      p_credit_id: button.dataset.creditId,
      p_decision: button.dataset.creditReview,
    });
    if (error) alert(`보강 확인 요청을 처리하지 못했습니다. ${error.message}`);
    await loadAdminCredits();
  });

  document.getElementById('makeupManageButton')?.addEventListener('click', loadAdminCredits);

  if (memberSummary) {
    try {
      ({ member: currentMember } = await window.memberPortal.loadCurrentMember());
      await loadMemberCredits();
    } catch (error) {
      memberSummary.innerHTML = '<p class="member-empty">보강 횟수를 불러오지 못했습니다.</p>';
    }
  }
});
