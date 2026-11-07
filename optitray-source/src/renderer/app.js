(function () {
  const TOOLS = window.TOOLS;
  const bridge = window.tray || { hide() {}, quit() {}, menu() {}, setPinned() {}, onOpenTool() {}, onPinned() {} };
  const $ = (s) => document.querySelector(s);
  const view = $('#view');
  const STORE = 'optitray.v1';

  // ------------------------------------------------------------ persisted state
  let store = {};
  try { store = JSON.parse(localStorage.getItem(STORE)) || {}; } catch { store = {}; }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(store)); } catch { /* ignore */ } };
  const toolState = (id) => (store[id] = store[id] || { mode: null, v: {}, u: {} });

  let current = null;

  // ------------------------------------------------------------ helpers
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };
  const parseNum = (s) => {
    const t = String(s).trim().replace(/−/g, '-').replace(/,/g, '.').replace(/\s/g, '');
    if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
    return parseFloat(t);
  };
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1100);
  }
  async function copy(text) {
    const clean = text.replace(/\s+·\s+.*/, '').replace(/^× /, '');
    try { await navigator.clipboard.writeText(clean); }
    catch {
      const ta = el('textarea', {}, clean); document.body.append(ta); ta.select();
      document.execCommand('copy'); ta.remove();
    }
    toast(`Copied ${clean}`);
  }
  const cssVars = () => {
    const s = getComputedStyle(document.documentElement);
    return { accent: s.getPropertyValue('--accent').trim(), muted: s.getPropertyValue('--muted').trim(), border: s.getPropertyValue('--border').trim() };
  };

  // ------------------------------------------------------------ home
  function showHome() {
    current = null;
    store.last = null; save();
    $('#back').hidden = true;
    $('#title').textContent = 'OptiTray';
    $('#subtitle').textContent = 'optics calculators';
    $('#hint').textContent = 'Type to filter · Enter to open';
    view.replaceChildren();
    const search = el('input', { class: 'search', placeholder: 'Search tools…', spellcheck: 'false' });
    const list = el('div', { class: 'tool-list', role: 'list' });
    let sel = 0;
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const items = TOOLS.filter((t) => !q || (t.name + ' ' + t.desc + ' ' + t.id).toLowerCase().includes(q));
      sel = Math.min(sel, Math.max(items.length - 1, 0));
      list.replaceChildren(...items.map((t, i) => el('button', {
        class: 'tool-row' + (i === sel ? ' sel' : ''), role: 'listitem', onclick: () => openTool(t.id),
      },
      el('span', { class: 'glyph' }, t.glyph),
      el('span', {}, el('div', { class: 'name' }, t.name), el('div', { class: 'desc' }, t.desc)),
      el('span', { class: 'key' }, String(TOOLS.indexOf(t) + 1)))));
      return items;
    };
    let items = draw();
    search.addEventListener('input', () => { sel = 0; items = draw(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); items = draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); items = draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[sel]) openTool(items[sel].id);
      else if (/^[1-9]$/.test(e.key) && !search.value && TOOLS[+e.key - 1]) { openTool(TOOLS[+e.key - 1].id); e.preventDefault(); }
    });
    view.append(search, list);
    search.focus();
  }

  // ------------------------------------------------------------ tool view
  function openTool(id) {
    const tool = TOOLS.find((t) => t.id === id);
    if (!tool) return showHome();
    current = tool;
    store.last = id; save();
    const st = toolState(id);
    if (!tool.modes) st.mode = null;
    else if (!tool.modes.includes(st.mode)) st.mode = tool.modes[0];
    $('#back').hidden = false;
    $('#title').textContent = tool.name;
    $('#subtitle').textContent = '';
    $('#hint').textContent = 'Click a result to copy · Esc for tools';
    view.replaceChildren();

    if (tool.modes) {
      const seg = el('div', { class: 'seg', role: 'tablist' });
      for (const m of tool.modes) {
        seg.append(el('button', {
          class: m === st.mode ? 'on' : '', role: 'tab', 'aria-selected': String(m === st.mode),
          onclick: () => { st.mode = m; save(); openTool(id); },
        }, m));
      }
      view.append(seg);
    }

    const fields = el('div', { class: 'fields' });
    const results = el('div', { class: 'results' });
    view.append(fields, results);

    // Values are kept per mode so switching modes doesn't clobber inputs.
    const key = (fid) => (st.mode ? st.mode + '/' : '') + fid;
    // inputs() may depend on select values (e.g. "Solve for"), read straight from state.
    const raw = new Proxy({}, { get: (_, p) => st.v[key(p)] });
    const specs = () => {
      // Settle select defaults first, since they can change which fields exist.
      for (let i = 0; i < 3; i++) {
        let changed = false;
        for (const s of tool.inputs(st.mode, raw)) {
          if (s.type === 'sel' && !s.options.includes(st.v[key(s.id)])) { st.v[key(s.id)] = s.value; changed = true; }
        }
        if (!changed) break;
      }
      return tool.inputs(st.mode, raw);
    };

    function buildFields() {
      fields.replaceChildren();
      for (const s of specs()) {
        const k = key(s.id);
        if (s.type === 'sel') {
          if (!s.options.includes(st.v[k])) st.v[k] = s.value;
          const sel = el('select', {
            id: 'f-' + s.id,
            onchange: (e) => { st.v[k] = e.target.value; save(); buildFields(); recompute(); },
          }, s.options.map((o) => el('option', { value: o, selected: o === st.v[k] }, o)));
          fields.append(el('div', { class: 'field wide' }, el('label', { for: 'f-' + s.id }, s.label), sel));
          continue;
        }
        if (st.v[k] == null) st.v[k] = String(s.value);
        const input = el('input', {
          id: 'f-' + s.id, value: st.v[k], inputmode: 'decimal', spellcheck: 'false', autocomplete: 'off',
          oninput: (e) => { st.v[k] = e.target.value; save(); recompute(); },
          onkeydown: (e) => nudge(e, k),
        });
        let unit;
        if (s.units) {
          if (!s.units.includes(st.u[k])) st.u[k] = s.unit;
          unit = el('select', {
            class: 'unit', 'aria-label': s.label + ' unit',
            onchange: (e) => { st.u[k] = e.target.value; save(); recompute(); },
          }, s.units.map((o) => el('option', { value: o, selected: o === st.u[k] }, o)));
        } else unit = el('span', { class: 'nounit' }, s.unitLabel || '');
        fields.append(el('div', { class: 'field' }, el('label', { for: 'f-' + s.id }, s.label), input, unit));
      }
    }

    // Arrow up/down nudges the last significant digit; Shift for ×10.
    function nudge(e, k) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      const x = parseNum(e.target.value);
      if (!Number.isFinite(x)) return;
      const s = String(e.target.value).replace(/−/g, '-');
      const dec = (s.split(/e/i)[0].split('.')[1] || '').length;
      let step = Math.pow(10, -dec) * (e.shiftKey ? 10 : 1);
      if (/e/i.test(s)) step = Math.abs(x) * 0.01 * (e.shiftKey ? 10 : 1);
      const nx = x + (e.key === 'ArrowUp' ? step : -step);
      e.target.value = /e/i.test(s) ? nx.toExponential(3) : nx.toFixed(dec);
      st.v[k] = e.target.value; save(); recompute();
      e.preventDefault();
    }

    function recompute() {
      const v = {}, u = {};
      let bad = false;
      for (const s of specs()) {
        const k = key(s.id);
        if (s.type === 'sel') { v[s.id] = st.v[k]; continue; }
        v[s.id] = parseNum(st.v[k]);
        u[s.id] = st.u[k];
        const input = $('#f-' + s.id);
        const ok = Number.isFinite(v[s.id]);
        if (input) input.classList.toggle('bad', !ok);
        if (!ok) bad = true;
      }
      results.replaceChildren();
      if (bad) { results.append(el('div', { class: 'err' }, 'Enter a number in each field (e.g. 1550, 1.2e-3).')); return; }
      let rows;
      try { rows = tool.compute(st.mode, v, u); }
      catch (err) { results.append(el('div', { class: 'err' }, err.message)); return; }
      if (rows.length && !rows[0].h) results.append(el('h3', {}, 'Results'));
      for (const r of rows) {
        if (Array.isArray(r)) {
          const [k, val, o = {}] = r;
          results.append(el('div', { class: 'row' + (o.main ? ' main' : ''), title: 'Click to copy', onclick: () => copy(val) },
            el('span', { class: 'k' }, k), el('span', { class: 'v' }, val)));
        } else if (r.h) results.append(el('h3', {}, r.h));
        else if (r.note) results.append(el('div', { class: 'note' }, r.note));
        else if (r.plot) {
          const c = el('canvas', { class: 'plot' });
          results.append(el('div', { class: 'plot-wrap' }, c));
          requestAnimationFrame(() => {
            const dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
            c.width = w * dpr; c.height = h * dpr;
            const ctx = c.getContext('2d'); ctx.scale(dpr, dpr);
            r.plot(ctx, w, h, cssVars());
          });
        }
      }
    }

    buildFields();
    recompute();
    const first = fields.querySelector('input');
    if (first) { first.focus(); first.select(); }
  }

  // ------------------------------------------------------------ chrome
  let pinned = false;
  const setPin = (v) => { pinned = v; $('#pin').setAttribute('aria-pressed', String(v)); $('#pin').title = v ? 'Unpin (hide when focus is lost)' : 'Keep open'; };
  $('#back').addEventListener('click', showHome);
  $('#close').addEventListener('click', () => bridge.hide());
  $('#pin').addEventListener('click', () => { setPin(!pinned); bridge.setPinned(pinned); });
  bridge.onPinned(setPin);
  bridge.onOpenTool(openTool);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { current ? showHome() : bridge.hide(); e.preventDefault(); }
  });
  document.addEventListener('contextmenu', (e) => { if (!e.target.closest('input')) e.preventDefault(); });

  if (store.last && TOOLS.some((t) => t.id === store.last)) openTool(store.last);
  else showHome();
})();
