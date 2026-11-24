/* Shared reply rendering for the member calendar and lesson history. */
window.lessonThreads = (() => {
  const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  function render(comments, lessonId) {
    const one = (comment, reply = false) => `<article class="lesson-comment${comment.is_mine ? ' mine' : ''}${reply ? ' lesson-reply' : ''}">
      <div><span><strong>${comment.is_deleted ? '삭제된 댓글' : escape(comment.author_name)}</strong><time>${new Date(comment.created_at).toLocaleString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</time></span>
      ${comment.is_mine && !comment.is_deleted ? `<button type="button" class="lesson-comment-delete" data-comment-delete="${escape(comment.id)}" data-lesson-id="${escape(lessonId)}">삭제</button>` : ''}</div>
      <p>${comment.is_deleted ? '삭제된 댓글입니다.' : escape(comment.body)}</p>
      ${!reply && !comment.is_deleted ? `<button type="button" class="lesson-reply-button" data-reply-to="${escape(comment.id)}" data-reply-author="${escape(comment.author_name)}">답글</button>` : ''}
    </article>`;
    const roots = comments.filter((c) => !c.parent_comment_id);
    return roots.map((root) => `<div class="lesson-comment-thread">${one(root)}${comments.filter((c) => c.parent_comment_id === root.id).map((c) => one(c, true)).join('')}</div>`).join('') || '<p class="lesson-comments-empty">아직 댓글이 없습니다.</p>';
  }
  function clear(form) {
    delete form.dataset.replyParent;
    form.querySelector('.lesson-reply-context')?.remove();
    const input = form.elements.comment;
    if (input) input.placeholder = '수업에 대한 댓글을 남겨주세요.';
  }
  document.addEventListener('click', (event) => {
    const cancel = event.target.closest('[data-reply-cancel]');
    if (cancel) { clear(cancel.closest('form')); return; }
    const button = event.target.closest('[data-reply-to]');
    if (!button) return;
    const form = button.closest('[data-lesson-comments]')?.querySelector('[data-lesson-comment-form]');
    if (!form) return;
    clear(form);
    form.dataset.replyParent = button.dataset.replyTo;
    const context = document.createElement('div');
    context.className = 'lesson-reply-context';
    context.innerHTML = `<span>${escape(button.dataset.replyAuthor)}님에게 답글</span><button type="button" data-reply-cancel>취소</button>`;
    form.prepend(context);
    form.elements.comment.placeholder = '답글을 남겨주세요.';
    form.elements.comment.focus();
  });
  return {render, clear};
})();
