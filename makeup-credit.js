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

    const [creditResult, usageResult] = await Promise.all([
      client.from('makeup_credits').select('*')
        .eq('member_id', currentMember.id)
        .order('requested_at', { ascending: false }),
      client.from('makeup_credit_usages').select('*')
        .eq('member_id', currentMember.id)
        .order('used_at', { ascending: false }),
    ]);

    const { data, error } = creditResult;

    if (error) {
      memberSummary.innerHTML = '<p class="member-empty">보강 횟수 기능을 준비 중입니다.</p>';
      return;
    }

    const credits = data || [];
    const usages = usageResult.error ? [] : usageResult.data || [];
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
            <span>${formatDate(item.missed_date)} · ${item.status === 'approved' ? `남음 ${item.remaining_quantity}/${item.quantity}회` : `${item.quantity}회`}</span>
            <em class="${item.status}">${statusText[item.status]}</em>
            ${item.status === 'pending' ? `<button type="button" data-credit-cancel="${item.id}">취소</button>` : ''}
          </div>
        `).join('') || '<p class="member-empty">등록된 보강 내역이 없습니다.</p>'}
        ${usages.slice(0, 3).map((item) => `
          <div>
            <span>${item.usage_type === 'payment_discount' ? '다음 결제 차감' : '보강 수업 사용'} · ${item.quantity}회</span>
            <em class="used">사용 완료</em>
          </div>
        `).join('')}
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
    const [{ data: credits, error }, { data: members }, usageResult] = await Promise.all([
      client.from('makeup_credits').select('*').order('requested_at', { ascending: false }),
      client.from('members').select('id, name'),
      client.from('makeup_credit_usages').select('*').order('used_at', { ascending: false }),
    ]);
    if (error) {
      adminList.innerHTML = '<p class="today-empty">보강 권리 SQL을 먼저 실행해주세요.</p>';
      return;
    }
    const names = new Map((members || []).map((member) => [member.id, member.name]));
    adminList.innerHTML = (credits || []).map((item) => `
      <article class="makeup-admin-item">
        <div>
          <strong>${escapeHTML(names.get(item.member_id) || '회원')} · ${item.status === 'approved' ? `남음 ${item.remaining_quantity}/${item.quantity}회` : `${item.quantity}회`}</strong>
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
        ${item.status === 'approved' && item.remaining_quantity > 0 ? `
          <div class="makeup-credit-use-actions">
            <input type="number" min="1" max="${item.remaining_quantity}" value="${item.remaining_quantity}" aria-label="처리 횟수" />
            <button type="button" data-credit-use="lesson" data-credit-id="${item.id}">보강 사용</button>
            <button type="button" data-credit-use="payment_discount" data-credit-id="${item.id}">결제 차감</button>
          </div>
        ` : ''}
      </article>
    `).join('') || '<p class="today-empty">보강 확인 요청이 없습니다.</p>';

    if (!usageResult.error && usageResult.data?.length) {
      adminList.insertAdjacentHTML('beforeend', `
        <div class="makeup-credit-usage-list">
          <strong>최근 사용 내역</strong>
          ${usageResult.data.slice(0, 10).map((usage) => `
            <div>
              <span>${escapeHTML(names.get(usage.member_id) || '회원')} · ${usage.usage_type === 'payment_discount' ? '결제 차감' : '보강 사용'} ${usage.quantity}회</span>
              <button type="button" data-credit-usage-undo="${usage.id}">되돌리기</button>
            </div>
          `).join('')}
        </div>`);
    }
  }

  adminList?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-credit-review]');
    const cancelButton = event.target.closest('[data-credit-cancel-admin]');
    const useButton = event.target.closest('[data-credit-use]');
    const undoButton = event.target.closest('[data-credit-usage-undo]');
    if (!button && !cancelButton && !useButton && !undoButton) return;

    if (useButton) {
      const input = useButton.closest('.makeup-credit-use-actions')?.querySelector('input');
      const quantity = Number(input?.value || 0);
      const label = useButton.dataset.creditUse === 'payment_discount' ? '다음 결제 차감' : '보강 수업 사용';
      if (!quantity || !confirm(`${quantity}회를 ${label}으로 처리할까요?`)) return;
      useButton.disabled = true;
      const { error } = await client.rpc('use_makeup_credit', {
        p_credit_id: useButton.dataset.creditId,
        p_quantity: quantity,
        p_usage_type: useButton.dataset.creditUse,
      });
      if (error) alert(`보강 횟수를 처리하지 못했습니다. ${error.message}`);
      await loadAdminCredits();
      return;
    }

    if (undoButton) {
      if (!confirm('이 사용 내역을 되돌릴까요?')) return;
      undoButton.disabled = true;
      const { error } = await client.rpc('undo_makeup_credit_usage', {
        p_usage_id: undoButton.dataset.creditUsageUndo,
      });
      if (error) alert(`사용 내역을 되돌리지 못했습니다. ${error.message}`);
      await loadAdminCredits();
      return;
    }

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
