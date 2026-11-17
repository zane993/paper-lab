/* ============================================================
   论文工坊 PaperLab — 内核
   工具函数 / 状态与持久化 / 引用编号 / 流程门禁 / 壳层渲染 / 弹窗与提示
   ============================================================ */

/* ---------------- 工具 ---------------- */
const U = {};

U.esc = function (s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};

U.attr = function (s) { return U.esc(s).replace(/`/g, '&#96;'); };

U.uid = function (p) {
  return (p || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
};

U.clamp = function (n, a, b) { return Math.max(a, Math.min(b, n)); };

U.num = function (n) {
  n = Number(n) || 0;
  return n.toLocaleString('zh-CN');
};

/* 中文按字计，英文/数字按词计 —— 与多数学校的"字数"口径接近 */
U.countWords = function (t) {
  if (!t) return 0;
  const cjk = (t.match(/[\u3400-\u9fff\u3040-\u30ff]/g) || []).length;
  const en = (t.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length;
  return cjk + en;
};

U.countParas = function (t) {
  return (String(t || '').split(/\n+/).filter(function (x) { return x.trim().length > 0; })).length;
};

U.wordsOf = function (sec) { return U.countWords(sec && sec.text); };

/* 字数预算：一级章节的目标字数 = 其子节之和；总量只统计一级章节，避免父子重复计数 */
U.budget = function (secs) {
  const byChapter = {}, order = [], hasChild = {};
  let cur = null;
  (secs || []).forEach(function (x) {
    const t = Number(x.target) || 0;
    if (x.level === 1) {
      cur = x.id;
      order.push(cur);
      byChapter[cur] = 0;
    } else if (cur) {
      hasChild[cur] = true;
      byChapter[cur] += t;
    }
  });
  order.forEach(function (id) {
    if (!hasChild[id]) {
      const sec = (secs || []).filter(function (x) { return x.id === id; })[0];
      byChapter[id] = sec ? (Number(sec.target) || 0) : 0;
    }
  });
  let total = 0;
  order.forEach(function (id) { total += byChapter[id]; });
  return { byChapter: byChapter, total: total, order: order };
};

/* 按模板权重把总字数分配到叶子章节，再把父章节设为子节之和 */
U.assignTargets = function (secs, tpl, total) {
  const n = secs.length;
  const weights = secs.map(function (x) {
    if (tpl) {
      const m = tpl.sections.filter(function (t) { return t.title === x.title && t.level === x.level; })[0];
      if (m) return m.w;
    }
    return x.level === 1 ? 4 : 2;
  });
  const isLeaf = secs.map(function (x, i) {
    return x.level === 2 || !(secs[i + 1] && secs[i + 1].level === 2);
  });
  let sumW = 0;
  for (let i = 0; i < n; i++) if (isLeaf[i]) sumW += weights[i];
  if (!sumW) sumW = 1;
  secs.forEach(function (x, i) {
    if (isLeaf[i]) x.target = Math.max(100, Math.round((total || 0) * weights[i] / sumW / 10) * 10);
    else x.target = 0;
  });
  let cur = null;
  secs.forEach(function (x) {
    if (x.level === 1) cur = x;
    else if (cur) cur.target += Number(x.target) || 0;
  });
};

U.pct = function (a, b) { return b > 0 ? U.clamp(Math.round(a / b * 100), 0, 100) : 0; };

U.fmtDate = function (d) {
  const x = d ? new Date(d) : new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return x.getFullYear() + '-' + p(x.getMonth() + 1) + '-' + p(x.getDate());
};

U.fmtTime = function (d) {
  const x = d ? new Date(d) : new Date();
  const p = function (n) { return String(n).padStart(2, '0'); };
  return U.fmtDate(x) + ' ' + p(x.getHours()) + ':' + p(x.getMinutes());
};

U.mergeDeep = function (base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const o = (over && typeof over === 'object' && !Array.isArray(over)) ? over : {};
    const out = {};
    Object.keys(base).forEach(function (k) { out[k] = U.mergeDeep(base[k], o[k]); });
    Object.keys(o).forEach(function (k) { if (!(k in out)) out[k] = o[k]; });
    return out;
  }
  return over === undefined ? base : over;
};

U.debounce = function (fn, wait) {
  let t = null;
  return function () {
    const args = arguments, ctx = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(ctx, args); }, wait || 300);
  };
};

U.hash = function (str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

U.download = function (filename, content, mime) {
  const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
};

U.copy = function (text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(function () { PLToast.show('已复制到剪贴板', 'ok'); })
      .catch(function () { U.copyFallback(text); });
  } else {
    U.copyFallback(text);
  }
};

U.copyFallback = function (text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand('copy'); PLToast.show('已复制到剪贴板', 'ok'); }
  catch (e) { PLToast.show('复制失败，请手动选择', 'bad'); }
  document.body.removeChild(ta);
};

U.typeName = function (id) {
  const t = PLData.refTypes.filter(function (x) { return x.id === id; })[0];
  return t ? t.name : '文献';
};

U.typeCode = function (id) {
  const t = PLData.refTypes.filter(function (x) { return x.id === id; })[0];
  return t ? t.code : 'Z';
};

/* ---------------- 默认状态 ---------------- */
function defaultState() {
  return {
    schema: 1,
    meta: {
      title: '', author: '', org: '', field: '', degree: '硕士学位论文',
      targetWords: 12000, abstract: '', keywords: '',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      exportedAt: null
    },
    ui: { view: 'overview', secId: null, refFilter: 'all', refQuery: '', refTag: '' },
    topic: {
      brief: { field: '', keywords: '', object: '', method: '实证检验', data: '公开数据', cycle: '6 个月' },
      candidates: [],
      selected: null,
      weights: { innovation: 25, feasibility: 30, value: 25, risk: 20 },
      eval: {
        question: '', gap: '', contribution: '',
        vars: { x: '', y: '', m: '', z: '' },
        checklist: { data: false, method: false, time: false, literature: false, ethics: false }
      }
    },
    refs: [],
    outline: { template: '', sections: [] },
    quality: {
      ranAt: null, score: null, stamp: '',
      dims: {}, issues: [], ignored: []
    },
    versions: [],
    todos: [],
    exportOpts: {
      cover: true, abstract: true, toc: true, refs: true, checkReport: false,
      style: 'gbt', format: 'md', acknowledged: false
    },
    ai: {
      provider: 'deepseek',
      baseURL: 'https://api.deepseek.com/v1',
      model: 'deepseek-chat',
      temperature: 0.4,
      maxTokens: 1200,
      timeout: 60,
      stream: true,
      keyMode: 'encrypted',
      include: { section: true, outline: true, refs: true },
      messages: [],
      stats: { calls: 0, lastMs: null, lastTokens: null },
      modelsFound: [],
      lastTest: null,
      lastError: null,
      lastAction: '',
      pending: null
    }
  };
}

/* ---------------- 状态与持久化 ---------------- */
const Store = {
  KEY: 'paperlab.v1',
  s: null,
  timer: null,
  dirty: false,

  load: function () {
    let parsed = null;
    try {
      const raw = localStorage.getItem(Store.KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) { parsed = null; }
    Store.s = U.mergeDeep(defaultState(), parsed || {});
    if (!Store.s.ui.view) Store.s.ui.view = 'overview';
    return Store.s;
  },

  save: function () {
    Store.dirty = true;
    setSaveState('dirty', '正在保存…');
    clearTimeout(Store.timer);
    Store.timer = setTimeout(function () { Store.flush(); }, 500);
  },

  flush: function () {
    clearTimeout(Store.timer);
    try {
      Store.s.meta.updatedAt = new Date().toISOString();
      localStorage.setItem(Store.KEY, JSON.stringify(Store.s));
      Store.dirty = false;
      Store.failed = false;
      setSaveState('', '已保存');
    } catch (e) {
      Store.failed = true;
      setSaveState('error', '本机存储不可用');
      if (!Store.warned) {
        Store.warned = true;
        PLToast.show('浏览器禁止本机存储：请用「项目总览 → 导出 JSON」备份', 'bad');
      }
    }
  },

  reset: function () {
    try { localStorage.removeItem(Store.KEY); } catch (e) { }
    Store.s = defaultState();
  }
};

function setSaveState(cls, text) {
  const el = document.getElementById('saveState');
  if (!el) return;
  el.className = 'save-state' + (cls ? ' ' + cls : '');
  el.innerHTML = '<i></i>' + U.esc(text);
}

/* ---------------- 引用编号与格式化 ---------------- */
const Cite = {};

Cite.TOKEN = /\[@([A-Za-z0-9_\-]+)\]/g;

/* 按正文出现顺序返回文献 ID 列表 */
Cite.order = function (s) {
  const seen = {}, order = [];
  (s.outline.sections || []).forEach(function (sec) {
    const text = sec.text || '';
    Cite.TOKEN.lastIndex = 0;
    let m;
    while ((m = Cite.TOKEN.exec(text))) {
      const id = m[1];
      if (!seen[id]) { seen[id] = 1; order.push(id); }
    }
  });
  return order;
};

Cite.numberMap = function (s) {
  const map = {};
  Cite.order(s).forEach(function (id, i) { map[id] = i + 1; });
  return map;
};

Cite.refById = function (s, id) {
  return (s.refs || []).filter(function (r) { return r.id === id; })[0] || null;
};

/* 参考文献表：仅包含被正文引用的，按编号排序 */
Cite.bibliography = function (s) {
  const order = Cite.order(s);
  const out = [];
  order.forEach(function (id) {
    const r = Cite.refById(s, id);
    if (r) out.push(r);
  });
  return out;
};

Cite.undefinedIds = function (s) {
  return Cite.order(s).filter(function (id) { return !Cite.refById(s, id); });
};

Cite.uncited = function (s) {
  const used = {};
  Cite.order(s).forEach(function (id) { used[id] = 1; });
  return (s.refs || []).filter(function (r) { return !used[r.id]; });
};

Cite.countIn = function (text, id) {
  const re = new RegExp('\\[@' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'g');
  return (String(text || '').match(re) || []).length;
};

Cite.authorStr = function (r) {
  let a = String((r && r.authors) || '').trim();
  if (!a) return '佚名';
  a = a.replace(/[;；、]/g, ',').replace(/\s+/g, ' ').trim();
  const parts = a.split(',').map(function (x) { return x.trim(); }).filter(Boolean);
  if (parts.length > 3) return parts.slice(0, 3).join(', ') + ', 等';
  return parts.join(', ');
};

Cite.firstAuthor = function (r) {
  const a = String((r && r.authors) || '').trim();
  if (!a) return '佚名';
  return a.split(/[,;；、]/)[0].trim();
};

/* GB/T 7714-2015 顺序编码制 */
Cite.formatGBT = function (r, n) {
  if (!r) return '';
  const authors = Cite.authorStr(r);
  const year = r.year ? r.year : '出版年不详';
  const t = r.title || '（题名缺失）';
  const code = U.typeCode(r.type);
  const src = r.source || '（来源缺失）';
  const tail = [];
  if (r.vol) tail.push(r.vol + (r.issue ? '(' + r.issue + ')' : ''));
  let s = '';
  switch (r.type) {
    case 'journal':
      s = authors + '. ' + t + '[J]. ' + src + ', ' + year;
      if (tail.length) s += ', ' + tail.join('');
      if (r.pages) s += ': ' + r.pages;
      s += '.';
      break;
    case 'book':
      s = authors + '. ' + t + '[M]. ' + (r.place ? r.place + ': ' : '') + src + ', ' + year + '.';
      break;
    case 'chapter':
    case 'conf':
      s = authors + '. ' + t + '[' + code + ']//' + src + '. ' + (r.place ? r.place + ': ' : '') + year;
      if (r.pages) s += ': ' + r.pages;
      s += '.';
      break;
    case 'thesis':
      s = authors + '. ' + t + '[D]. ' + (r.place ? r.place + ': ' : '') + src + ', ' + year + '.';
      break;
    case 'web':
      s = authors + '. ' + t + '[EB/OL]. (' + year + ')[' + U.fmtDate() + ']. ' + (r.url || '（URL 缺失）') + '.';
      break;
    case 'standard':
      s = t + '[S]. ' + (r.place ? r.place + ': ' : '') + src + ', ' + year + '.';
      break;
    default:
      s = authors + '. ' + t + '[' + code + ']. ' + src + ', ' + year + '.';
  }
  if (r.doi) s += ' DOI: ' + r.doi + '.';
  return (n ? '[' + n + '] ' : '') + s;
};

/* 作者-年制（简明版）：参考文献表不编号，与正文 (作者, 年) 对应 */
Cite.formatAuthorYear = function (r) {
  if (!r) return '';
  const a = Cite.authorStr(r);
  return a + ' (' + (r.year || 'n.d.') + '). ' + (r.title || '') +
    '. ' + (r.source || '') + (r.vol ? ', ' + r.vol : '') + (r.issue ? '(' + r.issue + ')' : '') +
    (r.pages ? ': ' + r.pages : '') + '.';
};

Cite.formatRef = function (r, n, style) {
  return style === 'ay' ? Cite.formatAuthorYear(r, n) : Cite.formatGBT(r, n);
};

/* 正文渲染：把 [@id] 换成 [n] 或 (作者, 年) */
Cite.renderText = function (text, s) {
  const map = Cite.numberMap(s);
  const style = (s.exportOpts && s.exportOpts.style) || 'gbt';
  return String(text || '').replace(Cite.TOKEN, function (all, id) {
    const n = map[id];
    if (!n) return '[?]';
    if (style === 'ay') {
      const r = Cite.refById(s, id);
      return '(' + Cite.firstAuthor(r) + ', ' + (r.year || 'n.d.') + ')';
    }
    return '[' + n + ']';
  });
};

/* ---------------- 流程门禁 ---------------- */
const Progress = {};

Progress.evalComplete = function (s) {
  const e = s.topic.eval;
  const varsOk = !!(e.vars && e.vars.x && e.vars.y);
  return !!(e.question && e.gap && s.topic.selected && varsOk);
};

Progress.filledSections = function (s) {
  return (s.outline.sections || []).filter(function (x) { return U.wordsOf(x) > 0; });
};

Progress.of = function (s) {
  const secs = s.outline.sections || [];
  const targetTotal = U.budget(secs).total;
  const written = secs.reduce(function (a, b) { return a + U.wordsOf(b); }, 0);

  const topic = (s.topic.selected ? 0.55 : 0) + (Progress.evalComplete(s) ? 0.45 : 0);

  const refsRatio = U.clamp((s.refs || []).length / 8, 0, 1);

  const outlineRatio = U.clamp(secs.length / 8, 0, 1);

  let writing = 0;
  if (secs.length) {
    const cover = Progress.filledSections(s).length / secs.length;
    const volume = targetTotal > 0 ? U.clamp(written / targetTotal, 0, 1) : 0;
    writing = cover * 0.6 + volume * 0.4;
  }

  const cited = Cite.order(s).length;
  const undef = Cite.undefinedIds(s).length;
  let citations = 0;
  if (cited > 0) citations = undef === 0 ? 1 : 0.6;

  let quality = 0;
  if (s.quality.ranAt) quality = Progress.qualityFresh(s) ? 1 : 0.6;

  const review = (s.versions || []).length > 0 ? 1 : 0;
  const exported = s.meta.exportedAt ? 1 : 0;

  return {
    topic: { ratio: topic, done: topic >= 1, part: topic > 0 },
    refs: { ratio: refsRatio, done: refsRatio >= 1, part: refsRatio > 0 },
    outline: { ratio: outlineRatio, done: outlineRatio >= 1, part: outlineRatio > 0 },
    writing: { ratio: writing, done: writing >= 0.999, part: writing > 0 },
    citations: { ratio: citations, done: citations >= 1, part: citations > 0 },
    quality: { ratio: quality, done: quality >= 1, part: quality > 0 },
    review: { ratio: review, done: review >= 1, part: review > 0 },
    export: { ratio: exported, done: exported >= 1, part: exported > 0 },
    written: written, targetTotal: targetTotal
  };
};

Progress.qualityFresh = function (s) {
  return !!s.quality.ranAt && s.quality.stamp === Progress.stamp(s);
};

Progress.stamp = function (s) {
  const parts = [];
  (s.outline.sections || []).forEach(function (x) {
    parts.push(x.id + '|' + x.title + '|' + (x.text || '').length + '|' + (x.target || 0));
  });
  parts.push('abs:' + (s.meta.abstract || '').length);
  parts.push('refs:' + (s.refs || []).length);
  return U.hash(parts.join('~'));
};

Progress.overall = function (s) {
  const p = Progress.of(s);
  const keys = ['topic', 'refs', 'outline', 'writing', 'citations', 'quality', 'review', 'export'];
  const sum = keys.reduce(function (a, k) { return a + p[k].ratio; }, 0);
  return Math.round(sum / keys.length * 100);
};

Progress.nextStep = function (s) {
  const p = Progress.of(s);
  if (!s.meta.title) return { view: 'overview', label: '先填写项目基本信息', why: '标题与领域是后续所有模块的上下文。' };
  if (!s.topic.selected) return { view: 'topic', label: '生成并选定一个选题', why: '没有选定题目，资料与提纲缺少基准。' };
  if (!Progress.evalComplete(s)) return { view: 'topic', label: '补全研究问题与可行性评估', why: '研究问题是提纲与引言的主线。' };
  if (p.refs.ratio < 0.5) return { view: 'refs', label: '整理核心文献（建议 ≥ 8 篇）', why: '文献支撑综述与引用，也是查重的对照物。' };
  if (!p.outline.part) return { view: 'outline', label: '生成提纲并调整字数预算', why: '章节树决定写作顺序与检查口径。' };
  if (p.writing.ratio < 0.35) return { view: 'writing', label: '按章节推进正文', why: '先完成主体章节，再统一处理引用与格式。' };
  if (p.citations.ratio < 1) return { view: 'citations', label: '处理引用编号与未定义引用', why: '参考文献表依赖正文标记。' };
  if (!p.quality.done) return { view: 'quality', label: '运行一次完整质量检查', why: '导出前需要一份可解释的问题清单。' };
  if (!p.review.done) return { view: 'review', label: '保存一个版本快照', why: '便于回滚与对比修改效果。' };
  if (!p.export.done) return { view: 'export', label: '组装并导出成稿', why: '完成交付。' };
  return { view: 'quality', label: '再跑一次检查，确认无回归', why: '导出后仍可继续迭代。' };
};

/* ---------------- 壳层导航配置 ---------------- */
const NAV = [
  {
    group: '准备', items: [
      { view: 'overview', name: '项目总览', ico: '◱', stage: null },
      { view: 'topic', name: '选题推荐与评估', ico: '◎', stage: 'topic' },
      { view: 'refs', name: '资料收集与管理', ico: '▤', stage: 'refs' }
    ]
  },
  {
    group: '构建', items: [
      { view: 'outline', name: '提纲与结构', ico: '☰', stage: 'outline' },
      { view: 'writing', name: '正文写作', ico: '✎', stage: 'writing' },
      { view: 'citations', name: '引用与参考文献', ico: '❞', stage: 'citations' }
    ]
  },
  {
    group: '收尾', items: [
      { view: 'quality', name: '质量检查', ico: '✓', stage: 'quality' },
      { view: 'review', name: '修改与版本', ico: '⟲', stage: 'review' },
      { view: 'export', name: '成稿导出', ico: '↧', stage: 'export' }
    ]
  },
  {
    group: '协作', items: [
      { view: 'ai', name: 'AI 写作协作', ico: '✧', stage: null }
    ]
  },
  {
    group: '参考', items: [
      { view: 'flow', name: '流程与接口', ico: '⌗', stage: null }
    ]
  }
];

const STEPS = [
  { view: 'topic', name: '选题', stage: 'topic' },
  { view: 'refs', name: '资料', stage: 'refs' },
  { view: 'outline', name: '提纲', stage: 'outline' },
  { view: 'writing', name: '写作', stage: 'writing' },
  { view: 'citations', name: '引用', stage: 'citations' },
  { view: 'quality', name: '检查', stage: 'quality' },
  { view: 'review', name: '修改版本', stage: 'review' },
  { view: 'export', name: '导出', stage: 'export' }
];

function stageStatus(s, key) {
  const p = Progress.of(s)[key];
  if (!p) return 'todo';
  if (p.done) return 'done';
  if (p.part) return 'part';
  return 'todo';
}

/* ---------------- 壳层渲染 ---------------- */
function renderChrome() {
  const s = Store.s;

  const proj = document.getElementById('appbarProject');
  if (proj) {
    proj.innerHTML = s.meta.title
      ? '<b>' + U.esc(s.meta.title) + '</b><span class="pdot">/</span>' + U.esc(s.meta.field || '未填写领域') +
        '<span class="pdot">/</span>' + U.num(U.countWords((s.outline.sections || []).map(function (x) { return x.text; }).join(''))) + ' 字'
      : '未命名项目 — 在「项目总览」填写标题后开始';
  }

  const st = document.getElementById('stepper');
  if (st) {
    const p = Progress.of(s);
    st.innerHTML = STEPS.map(function (x, i) {
      const stt = stageStatus(s, x.stage);
      const active = s.ui.view === x.view ||
        (x.view === 'topic' && s.ui.view === 'overview') ||
        (x.view === 'writing' && s.ui.view === 'outline');
      return '<button class="step' + (active ? ' is-active' : '') + (stt === 'done' ? ' is-done' : stt === 'part' ? ' is-part' : '') +
        '" data-nav="' + x.view + '" title="' + U.attr(x.name + ' · 完成度 ' + Math.round(p[x.stage].ratio * 100) + '%') + '">' +
        '<span class="idx">' + (stt === 'done' ? '✓' : (i + 1)) + '</span>' +
        '<span class="lbl">' + U.esc(x.name) + '</span></button>';
    }).join('');
  }

  const sb = document.getElementById('sidebar');
  if (sb) {
    const p = Progress.of(s);
    let html = '';
    NAV.forEach(function (g) {
      html += '<div class="nav-group"><h4>' + U.esc(g.group) + '</h4>';
      g.items.forEach(function (it) {
        const cls = 'nav-item' + (s.ui.view === it.view ? ' is-active' : '');
        const stt = it.stage ? stageStatus(s, it.stage) : '';
        html += '<button class="' + cls + '" data-nav="' + it.view + '">' +
          '<span class="nv-ico">' + it.ico + '</span>' +
          '<span class="nv-txt">' + U.esc(it.name) + '</span>' +
          (stt ? '<span class="nv-dot ' + stt + '"></span>' : '') +
          '</button>';
      });
      html += '</div>';
    });
    const overall = Progress.overall(s);
    const next = Progress.nextStep(s);
    html += '<div class="side-progress">' +
      '<h5>整体完成度</h5>' +
      '<div class="num">' + overall + '<span>%</span></div>' +
      '<div class="bar thin" style="margin:8px 0 10px"><i style="width:' + overall + '%"></i></div>' +
      '<div style="font-size:11.5px;color:var(--muted);line-height:1.6">下一步：' + U.esc(next.label) + '</div>' +
      '<button class="btn btn-sm btn-block" style="margin-top:8px" data-nav="' + next.view + '">前往</button>' +
      '</div>';
    sb.innerHTML = html;
  }
}

/* ---------------- 提示与弹窗 ---------------- */
const PLToast = {
  show: function (msg, type) {
    const root = document.getElementById('toastRoot');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = msg;
    root.appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 240);
    }, 2200);
  }
};

const PLModal = {
  open: function (opt) {
    const root = document.getElementById('modalRoot');
    if (!root) return null;
    const wide = opt.wide ? ' wide' : '';
    root.innerHTML =
      '<div class="modal-mask" data-close="1"></div>' +
      '<div class="modal' + wide + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head"><h3>' + U.esc(opt.title || '') + '</h3>' +
      '<button class="icon-btn" data-close="1" title="关闭">✕</button></div>' +
      '<div class="modal-body">' + (opt.body || '') + '</div>' +
      (opt.footer ? '<div class="modal-foot">' + opt.footer + '</div>' : '') +
      '</div>';
    root.classList.add('open');
    root.querySelectorAll('[data-close]').forEach(function (el) {
      el.addEventListener('click', function () { PLModal.close(); });
    });
    if (typeof opt.onMount === 'function') opt.onMount(root.querySelector('.modal'));
    return root;
  },
  close: function () {
    const root = document.getElementById('modalRoot');
    if (!root) return;
    root.classList.remove('open');
    root.innerHTML = '';
  },
  confirm: function (opt) {
    return new Promise(function (resolve) {
      const root = PLModal.open({
        title: opt.title || '确认操作',
        body: '<div style="font-size:13px;line-height:1.8">' + (opt.body || '') + '</div>',
        footer: '<button class="btn" data-close="1">取消</button>' +
          '<button class="btn ' + (opt.danger ? 'btn-danger' : 'btn-primary') + '" id="plConfirmOk">' + U.esc(opt.ok || '确认') + '</button>'
      });
      if (!root) return resolve(false);
      root.querySelector('#plConfirmOk').addEventListener('click', function () {
        PLModal.close();
        resolve(true);
      });
      root.querySelector('.modal-mask').addEventListener('click', function () { resolve(false); });
    });
  }
};

/* ---------------- 视图注册表 ---------------- */
const Views = {};

/* ---------------- 通用片段 ---------------- */
const H = {};

H.head = function (kicker, title, desc, actions) {
  return '<div class="view-head">' +
    '<div class="vh-main"><div class="kicker">' + U.esc(kicker) + '</div>' +
    '<h1>' + U.esc(title) + '</h1>' +
    (desc ? '<div class="desc">' + desc + '</div>' : '') +
    '</div>' +
    (actions ? '<div class="vh-actions">' + actions + '</div>' : '') +
    '</div>';
};

H.empty = function (title, desc, action) {
  return '<div class="empty"><h4>' + U.esc(title) + '</h4><p>' + U.esc(desc || '') + '</p>' + (action || '') + '</div>';
};

H.card = function (title, body, opts) {
  const o = opts || {};
  return '<div class="card' + (o.flush ? ' flush' : '') + '">' +
    (title ? '<div class="card-head"><h3>' + U.esc(title) + '</h3><div class="spacer"></div>' + (o.actions || '') + '</div>' : '') +
    '<div class="' + (o.flush ? '' : 'card-body') + '">' + body + '</div>' +
    (o.note ? '<div class="card-note">' + o.note + '</div>' : '') +
    '</div>';
};

H.kpi = function (k, v, d) {
  return '<div class="kpi"><span class="k">' + U.esc(k) + '</span><span class="v">' + v + '</span>' +
    (d ? '<span class="d">' + U.esc(d) + '</span>' : '') + '</div>';
};

H.bar = function (ratio, cls) {
  const p = U.clamp(Math.round(ratio * 100), 0, 100);
  return '<div class="bar ' + (cls || (p >= 80 ? 'ok' : p >= 40 ? 'warn' : 'bad')) + '"><i style="width:' + p + '%"></i></div>';
};

H.field = function (label, inner, hint, req) {
  return '<div class="field"><label>' + U.esc(label) + (req ? '<span class="req">*</span>' : '') + '</label>' +
    inner + (hint ? '<span class="hint">' + U.esc(hint) + '</span>' : '') + '</div>';
};

H.sectionTitle = function (t) { return '<div class="section-title">' + U.esc(t) + '</div>'; };
