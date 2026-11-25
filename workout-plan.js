/* One-lane workout editor and a shared, escaped member-facing view. */
window.workoutPlan = (() => {
  const phases = {
    warmup: 'w-up',
    drill: 'drill',
    preset: 'pre-set',
    main: 'main',
    cooldown: 'down',
  };
  // 종목 선택지는 여기서 수정하세요.
  const strokes = ['fr', 'bk', 'br', 'fly', 'IM', 'MS.'];
  const distances = Array.from({ length: 8 }, (_, i) => (i + 1) * 25);
  const intensities = ['REC', 'EN1', 'EN2', 'EN3', 'SP1', 'SP2', 'SP3'];
  const escape = (v) =>
    String(v ?? '').replace(
      /[&<>"']/g,
      (c) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        }[c])
    );
  const blank = (phase) => ({
    phase,
    description: '',
    stroke: '',
    method: '',
    intensity: '',
    distance: 0,
    repeats: 1,
    sets: 1,
    interval: '',
    duration: '',
    duration_override: '',
  });
  const methods = {swim:'Swim',kick:'K',pull:'P',drill:'Drill'};
  function strokeLabel(row) {
    return [row.stroke, methods[row.method]].filter(Boolean).join(' ');
  }
  function formatInterval(value) {
    const text = String(value ?? '').trim();
    if (!/^\d+$/.test(text)) return text;
    return text.length < 3 ? `${text}"` : `${text.slice(0, -2)}'${text.slice(-2)}`;
  }
  function manualSeconds(value) {
    const text=String(value??'').trim();
    if(!text)return null;
    if(/^\d+(?:\.\d+)?$/.test(text))return Math.round(Number(text)*60);
    const match=text.match(/^(?:(\d+)\s*분)?\s*(?:(\d+)\s*초)?$/);
    return match&&(match[1]||match[2]) ? Number(match[1]||0)*60+Number(match[2]||0) : null;
  }
  function durationSeconds(row) {
    const manual = String(row.duration_override ?? '').trim();
    if(manual){const seconds=manualSeconds(manual);return seconds===null?null:seconds*Number(row.group_sets||1);}
    if(!String(row.interval??'').trim() && row.duration){const seconds=manualSeconds(row.duration);return seconds===null?null:seconds*Number(row.group_sets||1);}
    const cycle = formatInterval(row.interval).replace(/[′’]/g, "'").replace(/[″”]/g, '"');
    const minutes = cycle.match(/^(\d+)'(\d{1,2})(?:")?$/);
    const seconds = cycle.match(/^(\d+)"$/);
    const perRepeat = minutes ? Number(minutes[1]) * 60 + Number(minutes[2]) : seconds ? Number(seconds[1]) : null;
    if (perRepeat === null) return null;
    const secondsTotal = perRepeat * Number(row.repeats) * Number(row.sets) * Number(row.group_sets||1);
    return Number.isSafeInteger(secondsTotal) && secondsTotal >= 0 ? secondsTotal : null;
  }
  function timeLabel(seconds) {
    const m = Math.floor(seconds / 60), sec = seconds % 60;
    return [m ? `${m}분` : '', sec ? `${sec}초` : ''].filter(Boolean).join(' ') || '0초';
  }
  function durationLabel(row) {
    const seconds = durationSeconds(row);
    return seconds === null ? '' : timeLabel(seconds);
  }
  function totalTimeLabel(plan) {
    const times = plan.rows.map(durationSeconds);
    const known = times.filter(t => t !== null);
    if (!known.length) return '—';
    return timeLabel(known.reduce((sum,t)=>sum+t,0)) + (known.length < times.length ? ' (일부)' : '');
  }
  function normalize(plan) {
    if (!plan || !Array.isArray(plan.rows)) return null;
    return {
      version: 1,
      lane: 1,
      duration_minutes: Number(plan.duration_minutes) || 50,
      rows: plan.rows
        .slice(0, 60)
        .map((r) => ({ ...blank(phases[r.phase] ? r.phase : 'main'), ...r })),
    };
  }
  function signature(value) {
    return JSON.stringify(value, (_key, v) =>
      v && typeof v === 'object' && !Array.isArray(v)
        ? Object.fromEntries(
            Object.entries(v).sort(([a], [b]) => a.localeCompare(b))
          )
        : v
    );
  }
  function total(plan) {
    return (plan?.rows || []).reduce(
      (sum, r) =>
        sum +
        Number(r.distance || 0) * Number(r.repeats || 0) * Number(r.sets || 0) * Number(r.group_sets||1),
      0
    );
  }
  function render(input) {
    const plan = normalize(input);
    if (!plan?.rows.length) return '';
    const body=plan.rows.map((row,index)=>{
      const grouped=Boolean(row.group_id);
      const start=grouped&&plan.rows[index-1]?.group_id!==row.group_id;
      const end=grouped&&plan.rows[index+1]?.group_id!==row.group_id;
      const sets=Number(row.sets)*Number(row.group_sets||1);
      const meters=Number(row.distance)*Number(row.repeats)*sets;
      return `<tr class="${grouped?'workout-group-row':''}${start?' workout-group-start':''}${end?' workout-group-end':''}"><td>${!grouped||start?`<small class="workout-phase">${escape(phases[row.phase]||'')}</small>`:''}<strong>${escape(row.description||phases[row.phase]||'훈련')}</strong>${strokeLabel(row)?`<span class="workout-stroke">${escape(strokeLabel(row))}</span>`:''}</td><td>${escape(row.distance)}m × ${escape(row.repeats)} × ${escape(sets)}</td><td>${escape(row.intensity||'—')}</td><td>${escape(formatInterval(row.interval)||'—')}</td><td>${escape(durationLabel(row)||'—')}</td><td>${meters.toLocaleString('ko-KR')}m</td></tr>`;
    }).join('');
    return `<section class="workout-read"><header><strong>오늘의 운동량</strong><span>1레인 · ${escape(plan.duration_minutes)}분</span></header><table><thead><tr><th>훈련 내용</th><th>거리 × 개수 × 세트</th><th>강도</th><th>사이클</th><th>소요시간</th><th>거리</th></tr></thead><tbody>${body}</tbody><tfoot><tr><th colspan="4">total</th><td>${escape(totalTimeLabel(plan))}</td><td>${total(plan).toLocaleString('ko-KR')}m</td></tr></tfoot></table></section>`;
  }

  function rowMarkup(row) {
    const text = (key, label, placeholder = '') =>
      `<label>${label}<input data-workout-field="${key}" value="${escape(
        row[key]
      )}" maxlength="${
        key === 'description' ? 200 : 40
      }" placeholder="${placeholder}" /></label>`;
    const number = (key, label) =>
      `<label>${label}<input data-workout-field="${key}" type="number" min="${
        key === 'distance' ? 0 : 1
      }" step="1" value="${escape(row[key])}" inputmode="numeric" /></label>`;
    row = {...row, duration_override: row.duration_override || (!row.interval ? row.duration : '') || ''};
    const customDistance =
      Number(row.distance) > 0 && !distances.includes(Number(row.distance));
    const distance = `<label>거리(m)<select data-workout-distance-choice aria-label="훈련 거리"><option value="0">선택</option>${distances
      .map(
        (v) =>
          `<option value="${v}" ${
            Number(row.distance) === v ? 'selected' : ''
          }>${v}m</option>`
      )
      .join('')}<option value="custom" ${
      customDistance ? 'selected' : ''
    }>직접 입력</option></select><input data-workout-field="distance" type="number" min="1" step="1" value="${escape(
      row.distance
    )}" inputmode="numeric" aria-label="직접 입력 거리(m)" ${
      customDistance ? '' : 'hidden'
    } /></label>`;
    const legacyIntensity =
      row.intensity && !intensities.includes(row.intensity);
    const intensity = `<label>강도<select data-workout-field="intensity"><option value="">선택 안 함</option>${
      legacyIntensity
        ? `<option value="${escape(row.intensity)}" selected>${escape(
            row.intensity
          )} (기존 값)</option>`
        : ''
    }${intensities
      .map(
        (v) =>
          `<option value="${v}" ${
            row.intensity === v ? 'selected' : ''
          }>${v}</option>`
      )
      .join('')}</select></label>`;
    return `<div class="workout-edit-row" data-group-id="${escape(row.group_id||'')}" data-group-sets="${escape(row.group_sets||1)}"><div data-workout-group-control></div><div class="workout-row-heading"><label class="workout-pick"><input type="checkbox" data-workout-pick aria-label="세트로 묶을 훈련 선택" />선택</label><select data-workout-field="phase" aria-label="훈련 종류">${Object.entries(
      phases
    )
      .map(
        ([v, label]) =>
          `<option value="${v}" ${
            row.phase === v ? 'selected' : ''
          }>${label}</option>`
      )
      .join(
        ''
      )}</select><div class="workout-row-actions"><button type="button" data-workout-up aria-label="훈련 위로 이동">↑</button><button type="button" data-workout-down aria-label="훈련 아래로 이동">↓</button><button type="button" data-workout-remove aria-label="이 훈련 줄 삭제">삭제</button></div></div>${text(
      'description',
      '훈련 내용',
      '예: 스노클 자유형'
    )}<label>종목<select data-workout-field="stroke"><option value="">선택 안 함</option>${row.stroke&&!strokes.includes(row.stroke)?`<option value="${escape(row.stroke)}" selected>${escape(row.stroke)} (기존 값)</option>`:''}${strokes.map(v=>`<option value="${v}" ${row.stroke===v?'selected':''}>${v}</option>`).join('')}</select></label><label>방식<select data-workout-field="method"><option value="">선택 안 함</option>${Object.entries(methods).map(([value,label])=>`<option value="${value}" ${row.method===value?'selected':''}>${value} (${label})</option>`).join('')}</select></label><div class="workout-number-grid">${distance}${number(
      'repeats',
      '개수'
    )}${number(
      'sets',
      '세트'
    )}</div><div class="workout-extra-grid">${intensity}${text(
      'interval',
      '사이클',
      '1′30'
    )}${text('duration_override','시간 직접 입력 (선택)','예: 5분 또는 1분 30초')}</div><p class="workout-row-duration" data-workout-row-duration></p></div>`;
  }
  function read(editor, strict = false) {
    const rows = [...editor.querySelectorAll('.workout-edit-row')]
      .map((row) => {
        const data = {group_id:row.dataset.groupId||undefined,group_sets:Number(row.dataset.groupSets??1)};
        for (const field of row.querySelectorAll('[data-workout-field]'))
          data[field.dataset.workoutField] = field.value;
        return data;
      })
      .filter(
        (r) =>
          r.description?.trim() ||
          Number(r.distance) > 0 ||
          r.stroke?.trim() ||
          r.method?.trim() ||
          r.intensity?.trim() ||
          r.interval?.trim() ||
          r.duration_override?.trim()
      );
    if (!rows.length) return null;
    const duration = Number(
      editor.querySelector('[data-workout-duration]').value
    );
    const plan = {
      version: 1,
      lane: 1,
      duration_minutes: duration,
      rows: rows.map((r) => ({
        ...r,
        description: r.description.trim(),
        interval: formatInterval(r.interval),
        duration: '',
        duration_override: (r.duration_override || '').trim(),
        distance: Number(r.distance),
        repeats: Number(r.repeats),
        sets: Number(r.sets),
      })),
    };
    if (strict) {
      if (!Number.isInteger(duration) || duration < 1 || duration > 1440)
        throw Error('수업시간을 1~1440분 사이로 입력해주세요.');
      if (plan.rows.some(r=>r.duration_override && manualSeconds(r.duration_override)===null))throw Error('소요시간은 5분 또는 1분 30초처럼 입력해주세요. 숫자만 입력하면 분으로 계산해요.');
      const seenGroups=new Set();let previousGroup=null;
      for(const r of plan.rows){
        if(!Number.isInteger(r.group_sets)||r.group_sets<1)throw Error('묶음 반복 횟수는 1 이상 정수로 입력해주세요.');
        if(r.group_id){if(r.group_id!==previousGroup&&seenGroups.has(r.group_id))throw Error('같은 묶음의 훈련을 연속으로 배치해주세요.');seenGroups.add(r.group_id);}
        previousGroup=r.group_id;
      }
      if (rows.length > 60)
        throw Error('운동량은 60줄까지 입력할 수 있습니다.');
      for (const r of plan.rows)
        if (
          !Number.isInteger(r.distance) ||
          r.distance < 0 ||
          !Number.isInteger(r.repeats) ||
          r.repeats < 1 ||
          !Number.isInteger(r.sets) ||
          r.sets < 1
        )
          throw Error(
            '거리·개수·세트를 정수로 입력해주세요. 개수와 세트는 1 이상이어야 합니다.'
          );
      if (!Number.isSafeInteger(total(plan)) || total(plan) > 2147483647)
        throw Error('계획 총거리가 너무 큽니다. 입력값을 확인해주세요.');
    }
    return plan;
  }
  const example = {
    version: 1,
    lane: 1,
    duration_minutes: 50,
    rows: [
      {
        ...blank('warmup'),
        description: 'choice',
        intensity: '',
        distance: 200,
        duration: '5분',
      },
      {
        ...blank('drill'),
        description: 'skull w snorkel',
        intensity: 'EN1',
        distance: 100,
        repeats: 2,
        duration: '10분',
      },
      {
        ...blank('drill'),
        description: 'w snorkel',
        stroke: 'fr',
        intensity: 'EN1',
        distance: 50,
        repeats: 6,
        interval: '1′30',
        duration: '9분',
      },
      {
        ...blank('main'),
        description: 'dive',
        stroke: 'fr',
        intensity: 'EN2',
        distance: 50,
        repeats: 3,
        sets: 3,
        interval: '1′20',
        duration: '12분',
      },
      {
        ...blank('main'),
        description: 'dive',
        stroke: 'M.S',
        intensity: 'SP1',
        distance: 25,
        repeats: 2,
        interval: '3′00',
        duration: '6분',
      },
      {
        ...blank('cooldown'),
        description: 'choice',
        intensity: '',
        distance: 100,
        duration: '3분',
      },
    ],
  };
  function mount(editor, input) {
    const plan = normalize(input) || {
      duration_minutes: 50,
      rows: [blank('warmup')],
    };
    editor.innerHTML = `<div class="workout-editor-heading"><strong>오늘 공통 운동량 · 1레인</strong><label>수업시간(분)<input data-workout-duration type="number" min="1" max="1440" value="${escape(
      plan.duration_minutes
    )}" /></label></div><div data-workout-rows>${plan.rows
      .map(rowMarkup)
      .join(
        ''
      )}</div><div class="workout-editor-actions"><button type="button" data-workout-add>＋ 훈련 추가</button><button type="button" data-workout-group>선택한 훈련 세트로 묶기</button><span data-workout-group-message role="status"></span></div><p class="workout-editor-total" data-workout-total></p><p class="workout-editor-hint">저장한 운동량 표의 총거리가 회원 달력과 월 합계에 반영돼요.</p><details class="workout-preview"><summary>회원에게 보이는 표 미리보기</summary><div data-workout-preview></div></details>`;
    function update() {
      for (const row of editor.querySelectorAll('.workout-edit-row')) {
        const data = {group_sets:Number(row.dataset.groupSets??1)};
        for (const field of row.querySelectorAll('[data-workout-field]')) data[field.dataset.workoutField] = field.value;
        const grouped=Boolean(row.dataset.groupId);
        row.classList.toggle('workout-edit-grouped',grouped);
        row.querySelector('[data-workout-field="sets"]').disabled=grouped;
        const siblings=[...row.parentNode.children];
        const block=grouped?siblings.filter(r=>r.dataset.groupId===row.dataset.groupId):[row];
        row.querySelector('[data-workout-up]').disabled=block[0]===siblings[0];
        row.querySelector('[data-workout-down]').disabled=block.at(-1)===siblings.at(-1);
        const controls=row.querySelector('[data-workout-group-control]');
        const first=grouped&&row.previousElementSibling?.dataset.groupId!==row.dataset.groupId;
        if(first&&!controls.firstChild)controls.innerHTML=`<label>묶음 반복(세트)<input type="number" data-workout-group-repeat min="1" step="1" value="${escape(row.dataset.groupSets)}" /></label><button type="button" data-workout-ungroup>묶음 해제</button><small>아래 훈련을 순서대로 반복해요. 직접 입력 시간은 1세트 기준이에요.</small>`;
        if(!first)controls.innerHTML='';
        row.querySelector('[data-workout-row-duration]').textContent = `소요시간 ${durationLabel(data) || '—'}`;
      }
      const p = read(editor);
      editor.querySelector(
        '[data-workout-total]'
      ).textContent = `계획 총거리 ${total(p).toLocaleString('ko-KR')}m`;
      editor.querySelector('[data-workout-preview]').innerHTML = render(p);

    }
    editor.oninput = event=>{
      if(event.target.matches('[data-workout-group-repeat]')){
        const id=event.target.closest('.workout-edit-row').dataset.groupId;
        for(const row of editor.querySelectorAll('.workout-edit-row'))if(row.dataset.groupId===id)row.dataset.groupSets=event.target.value;
      }
      update();
    };
    editor.onchange = (event) => {
      if (event.target.matches('[data-workout-field="interval"]')) {
        event.target.value = formatInterval(event.target.value);
      }
      if (event.target.matches('[data-workout-distance-choice]')) {
        const field = event.target
          .closest('label')
          .querySelector('[data-workout-field="distance"]');
        const custom = event.target.value === 'custom';
        field.hidden = !custom;
        if (!custom) field.value = event.target.value;
        else {
          if (Number(field.value) === 0) field.value = '';
          field.focus();
        }
      }
      update();
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    };
    editor.onclick = (event) => {
      if(event.target.closest('[data-workout-group]')){
        const rows=[...editor.querySelectorAll('.workout-edit-row')];
        const picked=rows.filter(r=>r.querySelector('[data-workout-pick]').checked);
        const message=editor.querySelector('[data-workout-group-message]');
        if(picked.length<2||picked.some(r=>r.dataset.groupId)||rows.indexOf(picked.at(-1))-rows.indexOf(picked[0])+1!==picked.length){message.textContent='연속된 훈련을 2줄 이상 선택해주세요. 기존 묶음은 먼저 해제해주세요.';return;}
        const id=`group-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const sets=picked[0].querySelector('[data-workout-field="sets"]').value||'1';
        for(const row of picked){row.dataset.groupId=id;row.dataset.groupSets=sets;row.querySelector('[data-workout-field="sets"]').value='1';row.querySelector('[data-workout-pick]').checked=false;}
        message.textContent='묶음 반복 횟수를 입력해주세요.';update();editor.dispatchEvent(new Event('input',{bubbles:true}));return;
      }
      if(event.target.closest('[data-workout-ungroup]')){
        const id=event.target.closest('.workout-edit-row').dataset.groupId;
        for(const row of editor.querySelectorAll('.workout-edit-row'))if(row.dataset.groupId===id){row.querySelector('[data-workout-field="sets"]').value=row.dataset.groupSets;row.dataset.groupId='';row.dataset.groupSets='1';}
        update();editor.dispatchEvent(new Event('input',{bubbles:true}));return;
      }
      const move = event.target.closest('[data-workout-up], [data-workout-down]');
      if (move) {
        const row = move.closest('.workout-edit-row');
        if(move.disabled)return;
        const parent=row.parentNode;
        const siblings=[...parent.children];
        const block=row.dataset.groupId?siblings.filter(r=>r.dataset.groupId===row.dataset.groupId):[row];
        const up=move.hasAttribute('data-workout-up');
        const neighbor=up?block[0].previousElementSibling:block.at(-1).nextElementSibling;
        if(!neighbor)return;
        const adjacent=neighbor.dataset.groupId?siblings.filter(r=>r.dataset.groupId===neighbor.dataset.groupId):[neighbor];
        const anchor=up?adjacent[0]:adjacent.at(-1).nextElementSibling;
        for(const item of block)parent.insertBefore(item,anchor);
        update();
        move.focus();
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      if (event.target.closest('[data-workout-add]')) {
        if (editor.querySelectorAll('.workout-edit-row').length >= 60) return;
        editor
          .querySelector('[data-workout-rows]')
          .insertAdjacentHTML('beforeend', rowMarkup(blank('main')));
      } else if (event.target.closest('[data-workout-remove]'))
        event.target.closest('.workout-edit-row').remove();
      else if (event.target.closest('[data-workout-example]')) {
        mount(editor, example);
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      } else return;
      update();
      editor.dispatchEvent(new Event('input', { bubbles: true }));
    };
    update();
  }
  return { render, mount, read, total, signature, example, formatInterval, durationLabel, strokeLabel };
})();
