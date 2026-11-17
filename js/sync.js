/* ============================================================
   论文工坊 PaperLab — 多标签同步
   同一浏览器多标签打开时，用独立的同步记录（paperlab.sync.v1）
   做版本协商：对方先写、本页有未落盘改动 → 拦截并让用户二选一，
   避免「后保存覆盖前者」导致整段正文丢失。
   ============================================================ */

const Sync = {
  KEY: 'paperlab.sync.v1',
  TAB_KEY: 'paperlab.tab',
  TAB: '',
  rev: 0,
  seenRev: 0,
  touched: false,
  lastInput: 0,
  conflict: null,
  barEl: null,
  enabled: true,

  init: function () {
    Sync.TAB = Sync.tabId();
    const rec = Sync.readRecord();
    Sync.rev = rec ? (Number(rec.rev) || 0) : 0;
    Sync.seenRev = Sync.rev;
    Sync.lastInput = 0;
    window.addEventListener('storage', Sync.onStorage);
    document.addEventListener('input', function () { Sync.lastInput = Date.now(); Sync.touched = true; }, true);
    document.addEventListener('keydown', function () { Sync.lastInput = Date.now(); }, true);
  },

  tabId: function () {
    let id = '';
    try { id = sessionStorage.getItem(Sync.TAB_KEY) || ''; } catch (e) { id = ''; }
    if (!id) {
      id = 'tab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      try { sessionStorage.setItem(Sync.TAB_KEY, id); } catch (e) { }
    }
    return id;
  },

  readRecord: function () {
    try {
      const raw = localStorage.getItem(Sync.KEY);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      return (rec && typeof rec === 'object') ? rec : null;
    } catch (e) { return null; }
  },

  beginLocalEdit: function () {
    Sync.touched = true;
    Sync.lastInput = Date.now();
  },

  touch: function () {
    Sync.touched = true;
  },

  /* 对方写在我之后：返回对方记录，否则 null */
  remoteAhead: function () {
    const rec = Sync.readRecord();
    if (!rec) return null;
    if (rec.tab === Sync.TAB) return null;
    if ((Number(rec.rev) || 0) <= Sync.seenRev) return null;
    return rec;
  },

  canAutoAdopt: function () {
    if (Store.dirty || Sync.touched) return false;
    if (Date.now() - Sync.lastInput < 1500) return false;
    const el = document.activeElement;
    const tag = el ? String(el.tagName || '').toLowerCase() : '';
    if (tag === 'textarea' || tag === 'input') return false;
    return true;
  },

  onStorage: function (e) {
    if (!Sync.enabled) return;
    if (e.key !== Sync.KEY || !e.newValue) return;
    let rec = null;
    try { rec = JSON.parse(e.newValue); } catch (err) { return; }
    Sync.onRemote(rec);
  },

  onRemote: function (rec) {
    if (!rec || rec.tab === Sync.TAB) return;
    const rev = Number(rec.rev) || 0;
    if (rev <= Sync.seenRev) return;
    if (Sync.conflict) { Sync.conflict = rec; Sync.showBar(); return; }
    if (Sync.canAutoAdopt()) {
      Sync.adopt(rec, true);
      return;
    }
    Sync.raise(rec);
  },

  raise: function (rec) {
    Sync.conflict = rec;
    setSaveState('warn', '另一标签页已更新');
    Sync.showBar();
  },

  /* 采纳对方版本：内存与存储对齐，不回写，避免互相触发 */
  adopt: function (rec, silent) {
    const view = Store.s.ui.view;
    const secId = Store.s.ui.secId;
    const refFilter = Store.s.ui.refFilter;
    const refQuery = Store.s.ui.refQuery;
    let next = null;
    try {
      const raw = localStorage.getItem(Store.KEY);
      if (raw) next = JSON.parse(raw);
    } catch (e) { next = null; }
    if (!next) { Sync.conflict = null; Sync.hideBar(); return; }
    Store.s = U.mergeDeep(defaultState(), next);
    Store.s.ui.view = view || Store.s.ui.view;
    Store.s.ui.secId = secId;
    if (refFilter) Store.s.ui.refFilter = refFilter;
    if (refQuery) Store.s.ui.refQuery = refQuery;
    clearTimeout(Store.timer);
    Store.dirty = false;
    Sync.seenRev = Number(rec && rec.rev) || Sync.seenRev;
    Sync.touched = false;
    Sync.conflict = null;
    Sync.hideBar();
    setSaveState('', '已同步');
    App.render();
    if (!silent) PLToast.show('已载入另一标签页的版本', 'ok');
    else PLToast.show('另一标签页的修改已同步到本页', 'ok');
  },

  /* 保留本页：把对方版本「看过」，再写自己的版本（rev+1） */
  force: function () {
    if (!Sync.conflict) { Store.flush(); return; }
    Sync.seenRev = Math.max(Sync.seenRev, Number(Sync.conflict.rev) || 0);
    Sync.conflict = null;
    Sync.hideBar();
    Store.dirty = true;
    Store.flush();
    PLToast.show('已用本页内容覆盖', 'warn');
  },

  /* 写入成功后推进版本号 */
  commit: function () {
    const rec = Sync.readRecord();
    const base = Math.max(Sync.rev, Sync.seenRev, rec && rec.tab === Sync.TAB ? Number(rec.rev) || 0 : 0);
    Sync.rev = base + 1;
    Sync.seenRev = Sync.rev;
    Sync.touched = false;
    try {
      localStorage.setItem(Sync.KEY, JSON.stringify({ rev: Sync.rev, tab: Sync.TAB, at: new Date().toISOString() }));
    } catch (e) { }
  },

  showBar: function () {
    if (!Sync.barEl) {
      const el = document.createElement('div');
      el.id = 'syncBar';
      el.className = 'sync-bar';
      el.innerHTML =
        '<div class="sb-main">' +
        '<b>另一标签页保存了修改</b>' +
        '<span id="sbText"></span>' +
        '</div>' +
        '<div class="sb-actions">' +
        '<button class="btn btn-sm" id="sbAdopt">载入对方版本</button>' +
        '<button class="btn btn-sm btn-primary" id="sbKeep">保留本页并覆盖</button>' +
        '<button class="icon-btn" id="sbLater" title="稍后处理">✕</button>' +
        '</div>';
      document.body.appendChild(el);
      el.querySelector('#sbAdopt').addEventListener('click', function () {
        if (Sync.conflict) Sync.adopt(Sync.conflict, false);
      });
      el.querySelector('#sbKeep').addEventListener('click', function () { Sync.force(); });
      el.querySelector('#sbLater').addEventListener('click', function () {
        Sync.hideBar();
        setSaveState('warn', '未处理同步冲突');
      });
      Sync.barEl = el;
    }
    const t = Sync.barEl.querySelector('#sbText');
    if (t) {
      t.textContent = Sync.conflict
        ? '（' + U.fmtTime(Sync.conflict.at) + '）本页未同步的编辑可能被覆盖，请选择保留哪一份。'
        : '';
    }
    requestAnimationFrame(function () { if (Sync.barEl) Sync.barEl.classList.add('on'); });
  },

  hideBar: function () {
    if (Sync.barEl) Sync.barEl.classList.remove('on');
  }
};
