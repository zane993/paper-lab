/* ============================================================
   论文工坊 PaperLab — 准备阶段视图
   项目总览 / 选题推荐与评估 / 资料收集与管理
   ============================================================ */

/* ---------------- 局部工具 ---------------- */
function plKeywords(str) {
  return String(str || '').split(/[,，;；、\s]+/).map(function (x) { return x.trim(); }).filter(Boolean);
}

function plOn(root, sel, ev, fn) {
  root.querySelectorAll(sel).forEach(function (el) {
    el.addEventListener(ev, function (e) { fn(e, el); });
  });
}

function plOptions(list, cur, valueKey, labelKey) {
  return list.map(function (x) {
    const v = valueKey ? x[valueKey] : x;
    const l = labelKey ? x[labelKey] : x;
    return '<option value="' + U.attr(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + U.esc(l) + '</option>';
  }).join('');
}

/* ============================================================
   项目总览
   ============================================================ */
Views.overview = function (root) {
  const s = Store.s;
  const p = Progress.of(s);
  const next = Progress.nextStep(s);
  const overall = Progress.overall(s);
  const words = p.written;
  const fresh = Progress.qualityFresh(s);
  const scoreTxt = s.quality.score == null ? '—' : (fresh ? s.quality.score : s.quality.score + '（待复核）');

  const phases = [
    { view: 'topic', n: '01', name: '选题', desc: '把模糊兴趣收敛为可写的研究问题', p: p.topic },
    { view: 'refs', n: '02', name: '资料', desc: '检索式、文献库与阅读进度', p: p.refs },
    { view: 'outline', n: '03', name: '提纲', desc: '章节树与字数预算', p: p.outline },
    { view: 'writing', n: '04', name: '写作', desc: '分章节引导与实时指标', p: p.writing },
    { view: 'citations', n: '05', name: '引用', desc: '编号、格式与一致性', p: p.citations },
    { view: 'quality', n: '06', name: '检查', desc: '逻辑/语言/格式/重复自查', p: p.quality },
    { view: 'review', n: '07', name: '修改', desc: '问题清单与版本快照', p: p.review },
    { view: 'export', n: '08', name: '导出', desc: '组装成稿与交付', p: p.export }
  ];

  const todoHtml = (s.todos || []).length
    ? s.todos.map(function (t, i) {
      return '<div class="todo-item' + (t.done ? ' done' : '') + '">' +
        '<input type="checkbox" data-todo="' + i + '"' + (t.done ? ' checked' : '') + '>' +
        '<span>' + U.esc(t.text) + '</span>' +
        '<span class="t-tag badge ' + (t.done ? 'ok' : 'plain') + '">' + (t.done ? '已完成' : '待处理') + '</span>' +
        '</div>';
    }).join('')
    : '<div style="font-size:12.5px;color:var(--muted);padding:6px 0">暂无待办。质量检查产生的问题可一键转为待办。</div>';

  root.innerHTML =
    '<div class="hero">' +
    '<div class="h-kicker">善驮论文工坊 · 写作与检查框架</div>' +
    '<h1 id="heroTitle">' + U.esc(s.meta.title || '未命名论文项目') + '</h1>' +
    '<div class="h-desc">' + (s.meta.title
      ? U.esc(s.meta.field || '未填写领域') + ' · ' + U.num(s.meta.targetWords) + ' 字目标 · ' + U.esc(s.meta.degree) + ' · 最后保存 ' + U.fmtTime(s.meta.updatedAt)
      : '从选题到成稿的完整流水线：选题收敛 → 资料管理 → 提纲生成 → 分章节写作 → 引用格式化 → 规则自查 → 版本对比 → 成稿导出。全部数据只保存在本机浏览器。') +
    '</div>' +
    '<div class="h-actions">' +
    '<button class="btn btn-primary" data-nav="' + next.view + '">' + U.esc(next.label) + ' →</button>' +
    '<button class="btn" data-nav="flow">查看模块接口</button>' +
    '<button class="btn" id="btnDemo">载入示例项目</button>' +
    '<button class="btn btn-ghost" id="btnReset">清空项目</button>' +
    '</div>' +
    '</div>' +

    '<div class="grid grid-4" style="margin-bottom:16px">' +
    H.kpi('整体完成度', overall + '<small>%</small>', '八阶段等权平均') +
    H.kpi('正文进度', U.num(words) + '<small>字</small>', '预算 ' + U.num(p.targetTotal) + ' 字') +
    H.kpi('文献库', String((s.refs || []).length) + '<small>篇</small>', '被引用 ' + Cite.order(s).length + ' 篇') +
    H.kpi('检查得分', String(scoreTxt), fresh ? '结论有效' : (s.quality.ranAt ? '文本已变更，需复核' : '尚未运行')) +
    '</div>' +

    '<div class="section-title">流程阶段</div>' +
    '<div class="phase-track">' +
    phases.map(function (x) {
      return '<div class="phase" data-nav="' + x.view + '">' +
        '<div class="p-h"><span class="pn">' + x.n + '</span>' + U.esc(x.name) + '</div>' +
        '<div class="p-d">' + U.esc(x.desc) + '</div>' +
        '<div class="p-f">' + H.bar(x.p.ratio, x.p.done ? 'ok' : x.p.part ? 'warn' : 'bad') +
        '<span style="font-size:10.5px;color:var(--faint);font-variant-numeric:tabular-nums">' + Math.round(x.p.ratio * 100) + '%</span></div>' +
        '</div>';
    }).join('') +
    '</div>' +

    '<div class="grid grid-side" style="margin-top:16px">' +
    '<div>' +
    H.card('项目基本信息',
      '<div class="row">' +
      H.field('论文标题', '<input class="input" data-meta="title" placeholder="例：生成式人工智能在中学教学中的应用边界研究" value="' + U.attr(s.meta.title) + '">', '标题会出现在封面与页脚，可随时修改', true) +
      H.field('作者', '<input class="input" data-meta="author" value="' + U.attr(s.meta.author) + '" placeholder="姓名">') +
      '</div>' +
      '<div class="row">' +
      H.field('单位 / 院系', '<input class="input" data-meta="org" value="' + U.attr(s.meta.org) + '" placeholder="学校 · 学院 · 专业">') +
      H.field('研究领域', '<input class="input" data-meta="field" value="' + U.attr(s.meta.field) + '" placeholder="例：教育技术学">') +
      '</div>' +
      '<div class="row">' +
      H.field('成果类型', '<select class="select" data-meta="degree">' + plOptions(['课程论文', '学士学位论文', '硕士学位论文', '博士学位论文', '期刊投稿', '会议论文'], s.meta.degree) + '</select>') +
      H.field('目标字数', '<input class="input" type="number" min="1000" step="500" data-meta="targetWords" value="' + s.meta.targetWords + '">', '用于提纲字数分配与进度判断') +
      '</div>',
      {
        actions: '<span class="badge plain">自动保存</span>',
        note: '这些字段只写入本机 localStorage，不会上传。修改后其他模块立即可用。'
      }) +
    H.card('项目备份与迁移',
      '<div class="row tight" style="align-items:center">' +
      '<button class="btn btn-sm" id="btnExportJson">导出项目 JSON</button>' +
      '<button class="btn btn-sm" id="btnImportJson">导入项目 JSON</button>' +
      '<button class="btn btn-sm" id="btnPickImport">导入文献 / 正文</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" style="display:none">' +
      '</div>' +
      '<div class="hint" style="margin-top:8px;font-size:11.5px;color:var(--faint)">也可以把文件直接拖进窗口：<b>.json</b> 项目、<b>.bib / .ris</b> 文献、<b>.md / .txt / .docx</b> 正文。换电脑或换浏览器时用 JSON 备份迁移；导入会覆盖当前项目。</div>') +
    '</div>' +

    '<div>' +
    H.card('下一步建议',
      '<div style="font-size:13px;line-height:1.75">' +
      '<b style="color:var(--accent-ink)">' + U.esc(next.label) + '</b><br>' +
      '<span style="color:var(--muted);font-size:12.3px">' + U.esc(next.why) + '</span>' +
      '</div>' +
      '<button class="btn btn-primary btn-block" style="margin-top:12px" data-nav="' + next.view + '">前往该模块</button>',
      { note: '门禁规则：前置模块未完成时不阻断浏览，只影响完成度与导出校验。' }) +
    H.card('待办与修改清单',
      '<div id="todoList">' + todoHtml + '</div>' +
      '<div class="row tight" style="margin-top:10px">' +
      '<input class="input" id="todoInput" placeholder="添加一条待办，回车确认" style="flex:1 1 150px">' +
      '<button class="btn btn-sm" id="todoAdd">添加</button>' +
      '</div>') +
    '</div>' +
    '</div>';

  /* 元信息输入 */
  root.querySelectorAll('[data-meta]').forEach(function (el) {
    el.addEventListener('input', function () {
      const k = el.getAttribute('data-meta');
      s.meta[k] = (k === 'targetWords') ? (Number(el.value) || 0) : el.value;
      Store.save();
      renderChrome();
      const ht = document.getElementById('heroTitle');
      if (ht && k === 'title') ht.textContent = el.value || '未命名论文项目';
    });
  });

  /* 待办 */
  const addTodo = function () {
    const inp = root.querySelector('#todoInput');
    if (!inp || !inp.value.trim()) return;
    s.todos.push({ id: U.uid('t'), text: inp.value.trim(), done: false, at: new Date().toISOString() });
    Store.save();
    PLToast.show('已添加待办', 'ok');
    App.render();
  };
  root.querySelector('#todoAdd').addEventListener('click', addTodo);
  root.querySelector('#todoInput').addEventListener('keydown', function (e) { if (e.key === 'Enter') addTodo(); });
  plOn(root, '[data-todo]', 'change', function (e, el) {
    const i = Number(el.getAttribute('data-todo'));
    s.todos[i].done = el.checked;
    Store.save();
    App.render();
  });

  /* 示例 / 清空 */
  root.querySelector('#btnDemo').addEventListener('click', function () {
    PLModal.confirm({
      title: '载入示例项目',
      body: '将用一份完整的示例论文覆盖当前数据（含选题、6 条示例文献、提纲与部分正文）。当前内容会丢失，建议先导出 JSON 备份。示例文献为演示数据，请替换为真实文献。',
      ok: '覆盖并载入'
    }).then(function (ok) { if (ok) { loadDemoProject(); App.go('overview'); PLToast.show('示例项目已载入', 'ok'); } });
  });

  root.querySelector('#btnReset').addEventListener('click', function () {
    PLModal.confirm({
      title: '清空当前项目',
      body: '将删除本机保存的全部项目数据（选题、文献、正文、版本）。此操作不可撤销。',
      ok: '确认清空', danger: true
    }).then(function (ok) {
      if (!ok) return;
      Store.reset();
      Store.flush();
      App.go('overview');
      PLToast.show('已清空', 'ok');
    });
  });

  /* 备份 */
  root.querySelector('#btnExportJson').addEventListener('click', function () {
    const name = (s.meta.title || 'paperlab-项目').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40);
    U.download(name + '-' + U.fmtDate() + '.json', JSON.stringify(s, null, 2), 'application/json');
  });

  const fileInput = root.querySelector('#importFile');
  root.querySelector('#btnImportJson').addEventListener('click', function () { fileInput.click(); });
  const pickImport = root.querySelector('#btnPickImport');
  if (pickImport) pickImport.addEventListener('click', function () {
    if (typeof Importer === 'object') Importer.pick();
  });
  fileInput.addEventListener('change', function () {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = function () {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || !data.meta || !data.outline) throw new Error('结构不符');
        Store.s = U.mergeDeep(defaultState(), data);
        Store.flush();
        App.go('overview');
        PLToast.show('项目已导入', 'ok');
      } catch (err) {
        PLToast.show('导入失败：不是有效的项目 JSON', 'bad');
      }
    };
    reader.readAsText(f, 'utf-8');
  });
};

/* ============================================================
   选题推荐与评估
   ============================================================ */
const TopicGen = {};

TopicGen.methodMap = {
  '实证检验': ['mech', 'emp', 'frame', 'syn'],
  '案例研究': ['case'],
  '实验研究': ['exp'],
  '文本/政策分析': ['bound', 'policy'],
  '方法/算法改进': ['method'],
  '文献计量': ['review']
};

TopicGen.dataMod = function (data) {
  switch (data) {
    case '公开数据': return 6;
    case '自采问卷/访谈': return 2;
    case '实验数据': return -4;
    case '文本/政策': return 4;
    case '文献题录': return 8;
    default: return -12;
  }
};

TopicGen.generate = function (brief, weights) {
  const kw = plKeywords(brief.keywords);
  const X = kw[0] || (brief.field ? brief.field.replace(/学$/, '') : '核心概念');
  const Yout = kw[1] || '结果变量';               /* 结果侧：用于「影响/关系/作用」句式 */
  const Yctx = brief.object || kw[1] || '目标情境'; /* 情境侧：用于「场景/面向/案例」句式 */
  const Z = kw[2] || '作用机制';
  const M = brief.method === '方法/算法改进' ? '深度学习方法' : brief.method;
  const D = brief.data === '暂无数据' ? '公开数据' : brief.data;
  const C = '典型案例';

  const w = {
    innovation: Number(weights.innovation) >= 0 ? Number(weights.innovation) : 25,
    feasibility: Number(weights.feasibility) >= 0 ? Number(weights.feasibility) : 30,
    value: Number(weights.value) >= 0 ? Number(weights.value) : 25,
    risk: Number(weights.risk) >= 0 ? Number(weights.risk) : 20
  };
  const wSum = w.innovation + w.feasibility + w.value + w.risk || 1;

  const cycleMod = { '3 个月': -10, '6 个月': 0, '12 个月': 6, '18 个月以上': 9 }[brief.cycle] || 0;
  const dataMod = TopicGen.dataMod(brief.data);
  const prefer = TopicGen.methodMap[brief.method] || [];

  const ctxPatterns = ['bound', 'frame', 'method', 'case'];

  const list = PLData.topicPatterns.map(function (pat) {
    const Y = ctxPatterns.indexOf(pat.id) >= 0 ? Yctx : Yout;
    const title = pat.tpl
      .replace(/\{X\}/g, X).replace(/\{Y\}/g, Y).replace(/\{Z\}/g, Z)
      .replace(/\{M\}/g, M).replace(/\{D\}/g, D).replace(/\{C\}/g, C);

    let innovation = pat.innovation + (kw.length >= 3 ? 6 : 0) + (brief.object ? 3 : -6);
    let feasibility = pat.feasibility + cycleMod + dataMod + (brief.object ? 4 : -4);
    let value = pat.value + (brief.field ? 4 : 0) + (kw.length >= 2 ? 2 : 0);
    let risk = pat.risk + (brief.object ? -8 : 8) + (brief.cycle === '3 个月' ? 6 : 0);
    if (prefer.indexOf(pat.id) >= 0) feasibility += 10; else feasibility -= 7;

    innovation = U.clamp(Math.round(innovation), 10, 98);
    feasibility = U.clamp(Math.round(feasibility), 8, 98);
    value = U.clamp(Math.round(value), 10, 98);
    risk = U.clamp(Math.round(risk), 5, 95);

    const total = Math.round((innovation * w.innovation + feasibility * w.feasibility + value * w.value + (100 - risk) * w.risk) / wSum);

    return {
      id: pat.id, patId: pat.id, tag: pat.tag, title: title, why: pat.why, needs: pat.needs,
      scores: { innovation: innovation, feasibility: feasibility, value: value, risk: risk, total: total },
      picked: false
    };
  });

  list.sort(function (a, b) { return b.scores.total - a.scores.total; });
  return list;
};

TopicGen.verdict = function (total) {
  if (total >= 78) return { cls: 'ok', text: '推荐推进', why: '综合得分较高，可进入开题与资料收集。' };
  if (total >= 62) return { cls: 'warn', text: '可行，需收敛范围', why: '把研究对象、时间窗口、数据来源各限定一次，风险会明显下降。' };
  return { cls: 'bad', text: '建议更换或重设', why: '可行性或价值维度偏弱，先用「范围收敛」清单逐项排查。' };
};

Views.topic = function (root) {
  const s = Store.s;
  const t = s.topic;
  const brief = t.brief;
  const sel = t.selected;
  const evalDone = Progress.evalComplete(s);
  const picked = t.candidates.filter(function (c) { return c.id === sel || c.title === sel; })[0];
  const pickedScore = picked ? picked.scores.total : (t.candidates[0] ? t.candidates[0].scores.total : 0);
  const selTitle = picked ? picked.title : (typeof sel === 'string' ? sel : (sel && sel.title) || '');

  const checkItems = [
    { k: 'data', name: '数据/资料可获得', d: '已确认数据来源、获取方式与伦理要求' },
    { k: 'method', name: '方法已掌握或有支持', d: '会用统计/编码/实验流程，或有人可指导' },
    { k: 'time', name: '周期可覆盖', d: '收集 + 分析 + 写作在截止日期内可完成' },
    { k: 'literature', name: '文献量足够', d: '核心文献 ≥ 30 篇，近三年占一定比例' },
    { k: 'ethics', name: '伦理与合规风险可控', d: '涉及人类被试、隐私数据时已有审批路径' }
  ];
  const checked = checkItems.filter(function (x) { return t.eval.checklist[x.k]; }).length;

  const fieldsFilled = [t.eval.question, t.eval.gap, t.eval.contribution, t.eval.vars.x, t.eval.vars.y].filter(Boolean).length;
  const evalRatio = Math.round((fieldsFilled / 5 * 0.7 + checked / 5 * 0.3) * 100);

  const candHtml = t.candidates.length
    ? '<div class="topic-grid">' + t.candidates.map(function (c, i) {
      const isPicked = sel && (sel === c.id || sel === c.title) ? ' picked' : '';
      const v = TopicGen.verdict(c.scores.total);
      return '<div class="topic-card' + isPicked + '" data-cand="' + c.id + '">' +
        '<span class="tc-rank">' + (i + 1) + ' / ' + t.candidates.length + '</span>' +
        '<span class="tc-tag">' + U.esc(c.tag) + '</span>' +
        '<h4>' + U.esc(c.title) + '</h4>' +
        '<div class="tc-why">' + U.esc(c.why) + '</div>' +
        '<div class="tc-bars">' +
        ['innovation:创新性', 'feasibility:可行性', 'value:价值', 'risk:风险'].map(function (pair) {
          const k = pair.split(':')[0], n = pair.split(':')[1];
          const val = c.scores[k];
          const ratio = k === 'risk' ? val / 100 : val / 100;
          const cls = k === 'risk' ? (val > 60 ? 'bad' : val > 40 ? 'warn' : 'ok') : (val >= 70 ? 'ok' : val >= 50 ? 'warn' : 'bad');
          return '<div class="tc-bar"><span>' + n + '</span><div class="bar ' + cls + '"><i style="width:' + ratio * 100 + '%"></i></div><b>' + val + '</b></div>';
        }).join('') +
        '</div>' +
        '<div class="tc-foot">' +
        '<span class="score">' + c.scores.total + '<small>/100</small></span>' +
        '<span class="badge ' + (v.cls === 'ok' ? 'ok' : v.cls === 'warn' ? 'warn' : 'bad') + '">' + v.text + '</span>' +
        '<span style="flex:1"></span>' +
        '<button class="btn btn-sm' + (isPicked ? ' btn-primary' : '') + '" data-pick="' + c.id + '">' + (isPicked ? '已选定' : '选定') + '</button>' +
        '</div>' +
        '<div class="chips" style="margin-top:2px">' + c.needs.map(function (n) { return '<span class="badge plain">' + U.esc(n) + '</span>'; }).join('') + '</div>' +
        '</div>';
    }).join('') + '</div>'
    : H.empty('还没有候选选题', '填写左侧研究简报（领域 + 关键词最关键），然后生成候选。规则来自 10 类常见论文范式，仅作为启发，不替代导师判断。', '<span class="badge plain">提示：关键词用中文逗号分隔</span>');

  root.innerHTML =
    H.head('模块 01 · 准备',
      '选题推荐与评估',
      '输入研究简报 → 生成候选题目与四维评分 → 选定一个并补齐研究问题与可行性清单。本模块只做收敛，不写综述、不写正文。',
      (sel ? '<button class="btn btn-primary" data-nav="refs">带着题目去收集资料 →</button>' : '')) +

    '<div class="grid grid-side">' +
    '<div>' +
    H.card('研究简报',
      '<div class="row">' +
      H.field('研究领域', '<input class="input" data-brief="field" value="' + U.attr(brief.field) + '" placeholder="例：教育技术学 / 信息系统 / 公共政策">', '', true) +
      H.field('核心关键词', '<input class="input" data-brief="keywords" value="' + U.attr(brief.keywords) + '" placeholder="例：生成式人工智能，教学效能，认知负荷">', '第 1 个词作为主变量，第 2 个作为对象') +
      '</div>' +
      '<div class="row">' +
      H.field('研究对象 / 场景', '<input class="input" data-brief="object" value="' + U.attr(brief.object) + '" placeholder="例：初中数学课堂 / 县域医院">') +
      H.field('方法偏好', '<select class="select" data-brief="method">' + plOptions(['实证检验', '案例研究', '实验研究', '文本/政策分析', '方法/算法改进', '文献计量'], brief.method) + '</select>') +
      '</div>' +
      '<div class="row">' +
      H.field('数据类型', '<select class="select" data-brief="data">' + plOptions(['公开数据', '自采问卷/访谈', '实验数据', '文本/政策', '文献题录', '暂无数据'], brief.data) + '</select>') +
      H.field('可用周期', '<select class="select" data-brief="cycle">' + plOptions(['3 个月', '6 个月', '12 个月', '18 个月以上'], brief.cycle) + '</select>') +
      '</div>' +
      '<div class="section-title" style="margin-top:8px">评分权重（按你的评审标准调整）</div>' +
      '<div class="grid grid-4">' +
      ['innovation:创新性', 'feasibility:可行性', 'value:价值', 'risk:风险规避'].map(function (pair) {
        const k = pair.split(':')[0], n = pair.split(':')[1];
        return '<div class="field"><label>' + n + ' <b data-wv="' + k + '">' + t.weights[k] + '</b></label>' +
          '<input type="range" min="0" max="60" step="5" value="' + t.weights[k] + '" data-weight="' + k + '" style="width:100%;accent-color:var(--accent)"></div>';
      }).join('') +
      '</div>' +
      '<div class="row tight" style="margin-top:4px">' +
      '<button class="btn btn-primary" id="btnGen">生成候选选题</button>' +
      '<button class="btn" id="btnAddOwn">手工添加题目</button>' +
      '</div>',
      { note: '评分 = 四维加权（风险按「100 − 风险值」计入）。规则基于范式先验 + 简报匹配度，用于横向比较，不是学术评价。' }) +

    '<div class="section-title" style="margin-top:18px">候选选题</div>' +
    candHtml +
    '</div>' +

    '<div>' +
    H.card('选题评估',
      (sel
        ? '<div style="font-size:12.5px;margin-bottom:12px"><span class="badge info">已选定</span> <b>' + U.esc(selTitle) + '</b></div>'
        : '<div style="font-size:12.2px;color:var(--muted);margin-bottom:12px">先在左侧选定一个候选题目，这里会绑定研究问题与变量。</div>') +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
      '<span style="font-size:11.5px;color:var(--muted)">评估完整度</span>' +
      '<div class="bar" style="flex:1"><i style="width:' + evalRatio + '%"></i></div>' +
      '<b style="font-size:12px">' + evalRatio + '%</b></div>' +
      H.field('研究问题（一句话）', '<textarea class="textarea" data-eval="question" placeholder="例：在初中数学课堂中，生成式 AI 辅助讲解如何影响学生的认知负荷与迁移成绩？">' + U.esc(t.eval.question) + '</textarea>', '', true) +
      H.field('研究缺口', '<textarea class="textarea" data-eval="gap" placeholder="既有研究做了什么、遗漏了什么，你的切入点在哪">' + U.esc(t.eval.gap) + '</textarea>') +
      H.field('预期贡献', '<textarea class="textarea" data-eval="contribution" placeholder="理论贡献 / 方法贡献 / 实践价值，各一句">' + U.esc(t.eval.contribution) + '</textarea>') +
      '<div class="section-title" style="margin-top:6px">变量与机制</div>' +
      '<div class="grid grid-2">' +
      H.field('自变量 / 核心概念', '<input class="input" data-var="x" value="' + U.attr(t.eval.vars.x) + '">') +
      H.field('因变量 / 结果', '<input class="input" data-var="y" value="' + U.attr(t.eval.vars.y) + '">') +
      H.field('中介 / 机制', '<input class="input" data-var="m" value="' + U.attr(t.eval.vars.m) + '">') +
      H.field('调节 / 边界', '<input class="input" data-var="z" value="' + U.attr(t.eval.vars.z) + '">') +
      '</div>' +
      '<div class="row tight" style="margin:6px 0 12px">' +
      '<button class="btn btn-xs" id="btnAutoQ">生成研究问题草稿</button>' +
      '<button class="btn btn-xs" id="btnAutoVar">带入变量</button>' +
      '</div>' +
      '<div class="section-title" style="margin-top:4px">可行性清单（逐项确认）</div>' +
      checkItems.map(function (x) {
        return '<label class="check' + (t.eval.checklist[x.k] ? ' on' : '') + '" style="margin-bottom:6px">' +
          '<input type="checkbox" data-chk="' + x.k + '"' + (t.eval.checklist[x.k] ? ' checked' : '') + '>' +
          '<span>' + U.esc(x.name) + '<small>' + U.esc(x.d) + '</small></span></label>';
      }).join('') +
      '<div style="margin-top:12px;padding:11px 13px;border-radius:8px;background:' +
      (checked >= 4 && pickedScore >= 70 ? 'var(--ok-soft);color:var(--ok)' : checked >= 3 ? 'var(--warn-soft);color:var(--warn)' : 'var(--bad-soft);color:var(--bad)') +
      ';font-size:12.3px;line-height:1.7">' +
      '<b>可行性结论：' + (checked >= 4 && pickedScore >= 70 ? '可推进' : checked >= 3 ? '有条件推进' : '暂不推进') + '</b><br>' +
      '清单通过 ' + checked + '/5 项；候选最高分 ' + pickedScore + '。' +
      (checked < 3 ? '先把缺少的条件补上（数据、方法或周期），否则写作中途会卡住。' : checked < 5 ? '未通过项需在开题前落实，并写进研究局限。' : '条件齐备，可进入资料收集与提纲。') +
      '</div>',
      { note: '评估结果写入 state.topic.eval，供提纲、引言写作与导出选择器复用。' }) +
    '</div>' +
    '</div>';

  /* 简报输入 */
  root.querySelectorAll('[data-brief]').forEach(function (el) {
    el.addEventListener('input', function () {
      brief[el.getAttribute('data-brief')] = el.value;
      Store.save();
    });
    el.addEventListener('change', function () {
      brief[el.getAttribute('data-brief')] = el.value;
      Store.save();
      if (t.candidates.length) {
        t.candidates = TopicGen.generate(brief, t.weights);
        Store.save();
        App.render();
      }
    });
  });

  /* 权重 */
  root.querySelectorAll('[data-weight]').forEach(function (el) {
    el.addEventListener('input', function () {
      const k = el.getAttribute('data-weight');
      t.weights[k] = Number(el.value);
      const lab = root.querySelector('[data-wv="' + k + '"]');
      if (lab) lab.textContent = el.value;
      Store.save();
    });
    el.addEventListener('change', function () {
      if (t.candidates.length) {
        t.candidates = TopicGen.generate(brief, t.weights);
        Store.save();
        App.render();
      }
    });
  });

  root.querySelector('#btnGen').addEventListener('click', function () {
    if (!brief.field.trim() && !brief.keywords.trim()) {
      PLToast.show('请先填写研究领域或关键词', 'warn');
      return;
    }
    t.candidates = TopicGen.generate(brief, t.weights);
    Store.save();
    App.render();
    PLToast.show('已生成 ' + t.candidates.length + ' 个候选', 'ok');
  });

  root.querySelector('#btnAddOwn').addEventListener('click', function () {
    PLModal.open({
      title: '手工添加题目',
      body: '<div class="field"><label>题目</label><textarea class="textarea" id="ownTitle" placeholder="输入你自己的选题"></textarea></div>' +
        '<div class="hint" style="font-size:11.5px;color:var(--muted)">手工题目不参与规则评分，评分取四项中位数，仅用于排序展示。</div>',
      footer: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" id="ownOk">添加</button>',
      onMount: function (m) {
        m.querySelector('#ownOk').addEventListener('click', function () {
          const v = m.querySelector('#ownTitle').value.trim();
          if (!v) { PLToast.show('题目不能为空', 'warn'); return; }
          t.candidates.push({
            id: U.uid('c'), patId: 'own', tag: '自定义', title: v, why: '手工添加的题目。',
            needs: ['自行评估数据与方法'], scores: { innovation: 60, feasibility: 60, value: 60, risk: 45, total: 60 }, picked: false
          });
          Store.save();
          PLModal.close();
          App.render();
        });
      }
    });
  });

  /* 选定 */
  plOn(root, '[data-pick]', 'click', function (e, el) {
    const id = el.getAttribute('data-pick');
    const c = t.candidates.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    t.selected = id;
    if (!t.eval.vars.x) t.eval.vars.x = plKeywords(brief.keywords)[0] || '';
    if (!t.eval.vars.y) t.eval.vars.y = plKeywords(brief.keywords)[1] || brief.object || '';
    c.picked = true;
    t.candidates.forEach(function (x) { if (x.id !== id) x.picked = false; });
    Store.save();
    App.render();
    PLToast.show('已选定，继续补全研究问题', 'ok');
  });

  /* 评估字段 */
  root.querySelectorAll('[data-eval]').forEach(function (el) {
    el.addEventListener('input', function () {
      t.eval[el.getAttribute('data-eval')] = el.value;
      Store.save();
      renderChrome();
    });
  });
  root.querySelectorAll('[data-var]').forEach(function (el) {
    el.addEventListener('input', function () {
      t.eval.vars[el.getAttribute('data-var')] = el.value;
      Store.save();
    });
  });
  root.querySelectorAll('[data-chk]').forEach(function (el) {
    el.addEventListener('change', function () {
      t.eval.checklist[el.getAttribute('data-chk')] = el.checked;
      Store.save();
      App.render();
    });
  });

  const autoQ = root.querySelector('#btnAutoQ');
  if (autoQ) autoQ.addEventListener('click', function () {
    const kw = plKeywords(brief.keywords);
    const X = t.eval.vars.x || kw[0] || '核心变量';
    const Y = t.eval.vars.y || kw[1] || brief.object || '结果变量';
    const obj = brief.object || '特定情境';
    t.eval.question = '在' + obj + '中，' + X + '如何影响' + Y + '？其作用机制与边界条件是什么？';
    if (!t.eval.gap) t.eval.gap = '既有研究多关注' + X + '与' + Y + '的整体关联，对机制与情境差异的检验不足。';
    Store.save();
    App.render();
    PLToast.show('已生成草稿，请改写为你的表述', 'ok');
  });

  const autoVar = root.querySelector('#btnAutoVar');
  if (autoVar) autoVar.addEventListener('click', function () {
    const kw = plKeywords(brief.keywords);
    t.eval.vars.x = t.eval.vars.x || kw[0] || '';
    t.eval.vars.y = t.eval.vars.y || kw[1] || '';
    t.eval.vars.m = t.eval.vars.m || kw[2] || '';
    Store.save();
    App.render();
  });
};

/* ============================================================
   资料收集与管理
   ============================================================ */
const Refs = {};

Refs.all = function () { return Store.s.refs || []; };

Refs.citationCount = function (id) {
  const s = Store.s;
  return (s.outline.sections || []).reduce(function (a, x) { return a + Cite.countIn(x.text, id); }, 0);
};

Refs.blank = function () {
  return {
    id: U.uid('r'), type: 'journal', authors: '', title: '', source: '', year: '',
    vol: '', issue: '', pages: '', place: '', doi: '', url: '', tags: [], read: 0, note: ''
  };
};

Refs.buildSearch = function (s) {
  const kw = plKeywords(s.topic.brief.keywords);
  const obj = s.topic.brief.object;
  if (!kw.length) return { ready: false, cnki: '', wos: '', scholar: '' };
  const terms = kw.slice(0, 4);
  const cnki = terms.map(function (k) { return 'SU=(' + k + ')'; }).join(' AND ') + (obj ? ' AND SU=(' + obj + ')' : '');
  const wos = terms.map(function (k) { return 'TS=("' + k + '")'; }).join(' AND ') + (obj ? ' AND TS=("' + obj + '")' : '');
  const scholar = terms.map(function (k) { return '"' + k + '"'; }).join(' ') + (obj ? ' "' + obj + '"' : '');
  return { ready: true, cnki: cnki, wos: wos, scholar: scholar };
};

Refs.exportBib = function (refs) {
  const typeMap = { journal: 'article', book: 'book', chapter: 'incollection', conf: 'inproceedings', thesis: 'phdthesis', report: 'techreport', standard: 'misc', web: 'misc' };
  return refs.map(function (r) {
    const key = (r.authors || 'anon').split(/[,;、\s]/)[0] + (r.year || 'nd') + r.id.slice(-4);
    const lines = ['@' + (typeMap[r.type] || 'misc') + '{' + key + ','];
    if (r.authors) lines.push('  author = {' + r.authors + '},');
    if (r.title) lines.push('  title = {' + r.title + '},');
    if (r.source) lines.push('  ' + (r.type === 'journal' ? 'journal' : r.type === 'book' ? 'publisher' : 'booktitle') + ' = {' + r.source + '},');
    if (r.year) lines.push('  year = {' + r.year + '},');
    if (r.vol) lines.push('  volume = {' + r.vol + '},');
    if (r.issue) lines.push('  number = {' + r.issue + '},');
    if (r.pages) lines.push('  pages = {' + r.pages + '},');
    if (r.doi) lines.push('  doi = {' + r.doi + '},');
    if (r.url) lines.push('  url = {' + r.url + '},');
    lines.push('}');
    return lines.join('\n');
  }).join('\n\n');
};

Refs.parseBib = function (text) {
  const out = [];
  const chunks = String(text).split(/(?=@\w+\s*\{)/g);
  chunks.forEach(function (ch) {
    const head = ch.match(/@(\w+)\s*\{\s*([^,]+),/);
    if (!head) return;
    const kind = head[1].toLowerCase();
    const body = ch.slice(head[0].length);
    const f = {};
    const re = /(\w+)\s*=\s*\{([\s\S]*?)\}\s*,?/g;
    let m;
    while ((m = re.exec(body))) f[m[1].toLowerCase()] = m[2].replace(/\s+/g, ' ').trim();
    const type = kind === 'article' ? 'journal' : kind === 'book' ? 'book' :
      (kind === 'inproceedings' || kind === 'conference') ? 'conf' :
        kind === 'incollection' ? 'chapter' : kind === 'phdthesis' || kind === 'mastersthesis' ? 'thesis' : 'web';
    out.push({
      id: U.uid('r'), type: type, authors: f.author || '', title: f.title || '',
      source: f.journal || f.booktitle || f.publisher || f.school || '', year: f.year || '',
      vol: f.volume || '', issue: f.number || '', pages: f.pages || '', place: f.address || '',
      doi: f.doi || '', url: f.url || '', tags: [], read: 0, note: f.note || ''
    });
  });
  return out;
};

Views.refs = function (root) {
  const s = Store.s;
  const q = (s.ui.refQuery || '').toLowerCase();
  const filter = s.ui.refFilter || 'all';
  const all = Refs.all();
  const search = Refs.buildSearch(s);

  const citedMap = {};
  Cite.order(s).forEach(function (id) { citedMap[id] = 1; });

  let list = all.filter(function (r) {
    if (q && (r.title + ' ' + r.authors + ' ' + r.source + ' ' + (r.tags || []).join(' ')).toLowerCase().indexOf(q) < 0) return false;
    if (filter === 'read') return r.read >= 2;
    if (filter === 'unread') return r.read === 0;
    if (filter === 'cited') return !!citedMap[r.id];
    if (filter === 'uncited') return !citedMap[r.id];
    return true;
  });

  const readCount = all.filter(function (r) { return r.read >= 2; }).length;
  const citedCount = all.filter(function (r) { return citedMap[r.id]; }).length;

  const rows = list.length ? list.map(function (r) {
    const c = Refs.citationCount(r.id);
    return '<tr>' +
      '<td style="width:40px"><button class="icon-btn" data-edit="' + r.id + '" title="编辑">✎</button></td>' +
      '<td><div class="t-main">' + U.esc(r.title || '（无题名）') + '</div>' +
      '<div class="t-sub">' + U.esc(r.authors || '佚名') + ' · ' + U.esc(r.source || '来源未填') + ' · ' + U.esc(r.year || '年份未填') + '</div>' +
      ((r.tags || []).length ? '<div class="chips" style="margin-top:4px">' + r.tags.map(function (tg) { return '<span class="badge plain">' + U.esc(tg) + '</span>'; }).join('') + '</div>' : '') +
      '</td>' +
      '<td style="width:66px"><span class="badge plain">' + U.esc(U.typeName(r.type)) + '</span></td>' +
      '<td style="width:56px" class="num">' + U.esc(r.year || '—') + '</td>' +
      '<td style="width:82px">' + '<span class="badge ' + (r.read >= 2 ? 'ok' : r.read === 1 ? 'info' : 'plain') + '">' + PLData.readStates[r.read || 0].name + '</span></td>' +
      '<td style="width:56px" class="num">' + (c ? c + ' 处' : '—') + '</td>' +
      '<td style="width:80px">' +
      '<button class="icon-btn" data-cite="' + r.id + '" title="复制引用标记">❝</button>' +
      '<button class="icon-btn danger" data-del="' + r.id + '" title="删除">✕</button>' +
      '</td>' +
      '</tr>';
  }).join('')
    : '<tr><td colspan="7"><div style="padding:22px;text-align:center;color:var(--muted);font-size:12.5px">没有符合条件的文献。' +
    (all.length ? '试试切换筛选条件。' : '先添加文献，或从 BibTeX 批量导入。') + '</div></td></tr>';

  root.innerHTML =
    H.head('模块 02 · 准备',
      '资料收集与管理',
      '生成检索式 → 录入/导入文献 → 标注阅读状态与笔记 → 输出可引用的文献 ID。本模块不做全文抓取，也不替代 Zotero 等文献管理工具。',
      '<button class="btn btn-primary" data-ref-add="1">+ 新增文献</button>' +
      '<button class="btn" id="btnBibImport">BibTeX 粘贴导入</button>' +
      '<button class="btn" id="btnFileImport">导入文件</button>' +
      '<button class="btn" data-nav="outline">下一步：提纲 →</button>') +

    '<div class="grid grid-4" style="margin-bottom:16px">' +
    H.kpi('文献总数', String(all.length) + '<small>篇</small>', '建议核心文献 ≥ 30 篇') +
    H.kpi('精读及以上', String(readCount) + '<small>篇</small>', all.length ? Math.round(readCount / all.length * 100) + '% 已精读' : '—') +
    H.kpi('已被正文引用', String(citedCount) + '<small>篇</small>', '未引用 ' + (all.length - citedCount) + ' 篇') +
    H.kpi('待读', String(all.filter(function (r) { return r.read === 0; }).length) + '<small>篇</small>', '先精读核心 10 篇再动笔') +
    '</div>' +

    (search.ready
      ? H.card('检索式（由选题关键词自动生成）',
        '<div class="grid" style="gap:10px">' +
        [['CNKI 专业检索', search.cnki], ['Web of Science', search.wos], ['Google Scholar', search.scholar]].map(function (pair) {
          return '<div style="display:flex;gap:10px;align-items:flex-start">' +
            '<div style="flex:0 0 118px;font-size:11.5px;color:var(--muted);padding-top:6px">' + pair[0] + '</div>' +
            '<code style="flex:1;font-family:var(--mono);font-size:11.8px;background:var(--surface-3);padding:6px 9px;border-radius:6px;word-break:break-all;line-height:1.6">' + U.esc(pair[1]) + '</code>' +
            '<button class="btn btn-xs" data-copy="' + U.attr(pair[1]) + '">复制</button></div>';
        }).join('') +
        '</div>',
        { note: '检索式随选题关键词变化。若检索结果过少，减少 AND 条件；过多则增加时间或文献类型限制。' })
      : H.card('检索式', '<div style="font-size:12.5px;color:var(--muted)">先去「选题推荐与评估」填写核心关键词，这里会自动生成三套检索式。</div>')) +

    H.card('文献库',
      '<div class="row tight" style="margin-bottom:12px;align-items:center">' +
      '<input class="input" id="refQuery" placeholder="搜索题名 / 作者 / 来源 / 标签" value="' + U.attr(s.ui.refQuery) + '" style="flex:1 1 200px">' +
      '<div class="btn-group">' +
      [['all', '全部'], ['unread', '待读'], ['read', '精读+'], ['cited', '已引用'], ['uncited', '未引用']].map(function (pair) {
        return '<button class="btn btn-sm' + (filter === pair[0] ? ' on' : '') + '" data-filter="' + pair[0] + '">' + pair[1] + '</button>';
      }).join('') +
      '</div>' +
      '<button class="btn btn-sm" id="btnBibExport">导出 BibTeX</button>' +
      '</div>' +
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th></th><th>题名 / 作者 / 来源</th><th>类型</th><th class="num">年份</th><th>阅读</th><th class="num">被引</th><th></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>',
      {
        flush: false,
        note: '「被引」统计正文中 [@ID] 出现次数。序号由正文首次出现顺序决定，不在此处维护。'
      });

  /* 搜索与筛选 */
  const qi = root.querySelector('#refQuery');
  qi.addEventListener('input', U.debounce(function () {
    s.ui.refQuery = qi.value;
    Store.save();
    const pos = qi.selectionStart;
    App.render();
    const nq = document.getElementById('refQuery');
    if (nq) { nq.focus(); nq.setSelectionRange(pos, pos); }
  }, 350));

  plOn(root, '[data-filter]', 'click', function (e, el) {
    s.ui.refFilter = el.getAttribute('data-filter');
    Store.save();
    App.render();
  });

  plOn(root, '[data-copy]', 'click', function (e, el) { U.copy(el.getAttribute('data-copy')); });

  /* 新增 / 编辑 */
  const openForm = function (ref) {
    const isNew = !ref.id || !all.some(function (x) { return x.id === ref.id; });
    PLModal.open({
      title: isNew ? '新增文献' : '编辑文献',
      wide: true,
      body:
        '<div class="row">' +
        H.field('文献类型', '<select class="select" id="fType">' + PLData.refTypes.map(function (x) { return '<option value="' + x.id + '"' + (x.id === ref.type ? ' selected' : '') + '>' + x.name + '</option>'; }).join('') + '</select>') +
        H.field('作者', '<input class="input" id="fAuthors" value="' + U.attr(ref.authors) + '" placeholder="张三, 李四（英文用 Last, First）">', '超过 3 位作者按「前 3 位, 等」输出') +
        '</div>' +
        H.field('题名', '<input class="input" id="fTitle" value="' + U.attr(ref.title) + '">', '', true) +
        '<div class="row">' +
        H.field('来源（刊名/出版社/学校）', '<input class="input" id="fSource" value="' + U.attr(ref.source) + '">') +
        H.field('年份', '<input class="input" id="fYear" value="' + U.attr(ref.year) + '" placeholder="2024">') +
        '</div>' +
        '<div class="row">' +
        H.field('卷', '<input class="input" id="fVol" value="' + U.attr(ref.vol) + '">') +
        H.field('期', '<input class="input" id="fIssue" value="' + U.attr(ref.issue) + '">') +
        H.field('页码', '<input class="input" id="fPages" value="' + U.attr(ref.pages) + '" placeholder="45-58">') +
        '</div>' +
        '<div class="row">' +
        H.field('出版地', '<input class="input" id="fPlace" value="' + U.attr(ref.place) + '">') +
        H.field('DOI', '<input class="input" id="fDoi" value="' + U.attr(ref.doi) + '">') +
        '</div>' +
        H.field('URL', '<input class="input" id="fUrl" value="' + U.attr(ref.url) + '">') +
        '<div class="row">' +
        H.field('标签（逗号分隔）', '<input class="input" id="fTags" value="' + U.attr((ref.tags || []).join(', ')) + '" placeholder="核心, 机制, 中文">') +
        H.field('阅读状态', '<select class="select" id="fRead">' + PLData.readStates.map(function (x) { return '<option value="' + x.v + '"' + (x.v === (ref.read || 0) ? ' selected' : '') + '>' + x.name + '</option>'; }).join('') + '</select>') +
        '</div>' +
        H.field('笔记 / 可引用观点（带页码）', '<textarea class="textarea" id="fNote" placeholder="摘录原文关键句 + 页码，写作时可直接调用">' + U.esc(ref.note) + '</textarea>'),
      footer: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" id="fOk">保存</button>',
      onMount: function (m) {
        m.querySelector('#fOk').addEventListener('click', function () {
          const val = function (id) { return m.querySelector('#' + id).value.trim(); };
          if (!val('fTitle')) { PLToast.show('题名不能为空', 'warn'); return; }
          const target = isNew ? Refs.blank() : ref;
          const dup = all.filter(function (x) { return x.id !== target.id && x.title && x.title === val('fTitle'); })[0];
          if (dup && isNew) { PLToast.show('已存在同题名文献，请直接编辑', 'warn'); return; }
          target.type = val('fType');
          target.authors = val('fAuthors');
          target.title = val('fTitle');
          target.source = val('fSource');
          target.year = val('fYear');
          target.vol = val('fVol');
          target.issue = val('fIssue');
          target.pages = val('fPages');
          target.place = val('fPlace');
          target.doi = val('fDoi');
          target.url = val('fUrl');
          target.tags = val('fTags').split(/[,，;；]/).map(function (x) { return x.trim(); }).filter(Boolean);
          target.read = Number(val('fRead')) || 0;
          target.note = m.querySelector('#fNote').value.trim();
          if (isNew) s.refs.unshift(target);
          Store.save();
          PLModal.close();
          App.render();
          PLToast.show(isNew ? '已添加文献' : '已更新', 'ok');
        });
      }
    });
  };

  plOn(root, '[data-ref-add]', 'click', function () { openForm(Refs.blank()); });
  plOn(root, '[data-edit]', 'click', function (e, el) {
    const r = all.filter(function (x) { return x.id === el.getAttribute('data-edit'); })[0];
    if (r) openForm(r);
  });

  plOn(root, '[data-cite]', 'click', function (e, el) {
    U.copy('[@' + el.getAttribute('data-cite') + ']');
    PLToast.show('已复制引用标记，粘贴到正文对应位置', 'ok');
  });

  plOn(root, '[data-del]', 'click', function (e, el) {
    const id = el.getAttribute('data-del');
    const n = Refs.citationCount(id);
    PLModal.confirm({
      title: '删除文献',
      body: n
        ? '该文献在正文中被引用 ' + n + ' 次。删除后正文标记会变成未定义引用，并在检查中报错。建议先处理引用。'
        : '确认从文献库删除该条目？此操作不影响正文。',
      ok: '删除', danger: true
    }).then(function (ok) {
      if (!ok) return;
      s.refs = s.refs.filter(function (x) { return x.id !== id; });
      Store.save();
      App.render();
      PLToast.show('已删除', 'ok');
    });
  });

  root.querySelector('#btnBibExport').addEventListener('click', function () {
    if (!all.length) { PLToast.show('文献库为空', 'warn'); return; }
    U.download('refs-' + U.fmtDate() + '.bib', Refs.exportBib(all), 'application/x-bibtex');
  });

  const btnFileImport = root.querySelector('#btnFileImport');
  if (btnFileImport) btnFileImport.addEventListener('click', function () {
    if (typeof Importer === 'object') Importer.pick('.bib,.ris');
  });

  root.querySelector('#btnBibImport').addEventListener('click', function () {
    PLModal.open({
      title: 'BibTeX 批量导入',
      wide: true,
      body: '<div class="field"><label>粘贴 .bib 内容</label><textarea class="textarea tall" id="bibText" style="font-family:var(--mono);font-size:12px" placeholder="@article{key2024,\n  author = {…},\n  title = {…},\n  journal = {…},\n  year = {2024}\n}"></textarea></div>' +
        '<div class="hint" style="font-size:11.5px;color:var(--muted)">支持 @article / @book / @inproceedings / @phdthesis 等常见类型；解析结果会追加到文献库，可再逐条编辑。</div>',
      footer: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" id="bibOk">解析并导入</button>',
      onMount: function (m) {
        m.querySelector('#bibOk').addEventListener('click', function () {
          const txt = m.querySelector('#bibText').value;
          const parsed = Refs.parseBib(txt);
          if (!parsed.length) { PLToast.show('未解析到条目，请检查格式', 'bad'); return; }
          parsed.forEach(function (r) { s.refs.unshift(r); });
          Store.save();
          PLModal.close();
          App.render();
          PLToast.show('已导入 ' + parsed.length + ' 条', 'ok');
        });
      }
    });
  });
};

/* ============================================================
   示例项目
   ============================================================ */
function loadDemoProject() {
  const s = defaultState();
  s.meta.title = '生成式人工智能在初中数学教学中的应用边界与风险治理研究';
  s.meta.author = '示例作者';
  s.meta.org = '示例大学 · 教育学院 · 教育技术学';
  s.meta.field = '教育技术学';
  s.meta.degree = '硕士学位论文';
  s.meta.targetWords = 12000;
  s.meta.keywords = '生成式人工智能；教学效能；认知负荷；应用边界';
  s.meta.abstract = '生成式人工智能正快速进入课堂，但"能用"与"该用"之间存在明显落差。本文以初中数学为场景，采用单案例研究，结合课堂观察、教师访谈与作业数据分析，考察生成式 AI 辅助讲解对学生认知负荷与迁移成绩的影响过程。研究发现：第一，AI 承担"即时讲解"角色时，学生的程序性任务完成效率提升，但概念性理解未见同步改善；第二，教师对 AI 输出的二次加工是影响效果的关键中介，缺乏加工时学生出现"答案依赖"；第三，学校层面的使用规范与评价方式构成边界条件。本文据此提出"任务分层—教师加工—规范约束"的三层治理框架，并讨论其在学科教学中的适用限度。';
  s.topic.brief = { field: '教育技术学', keywords: '生成式人工智能，教学效能，认知负荷', object: '初中数学课堂', method: '案例研究', data: '自采问卷/访谈', cycle: '6 个月' };
  s.topic.selected = 'case';
  s.topic.weights = { innovation: 25, feasibility: 30, value: 25, risk: 20 };
  s.topic.candidates = TopicGen.generate(s.topic.brief, s.topic.weights);
  s.topic.candidates.forEach(function (c) { c.picked = (c.id === 'case'); });
  s.topic.eval = {
    question: '在初中数学课堂中，生成式 AI 辅助讲解如何影响学生的认知负荷与迁移成绩？教师加工在其中起什么作用？',
    gap: '既有研究多测量"使用 vs 不使用"的成绩差异，对教师如何加工 AI 输出、以及学科任务类型带来的差异关注不足。',
    contribution: '理论上补充"技术—教师—任务"的互动解释；实践上给出可操作的任务分层与治理建议。',
    vars: { x: '生成式 AI 辅助讲解', y: '迁移成绩', m: '教师二次加工', z: '任务类型 / 学校使用规范' },
    checklist: { data: true, method: true, time: true, literature: true, ethics: false }
  };

  const tpl = PLData.outlineTemplates.filter(function (x) { return x.id === 'case'; })[0];
  let idc = 0;
  s.outline.template = 'case';
  s.outline.sections = tpl.sections.map(function (x) {
    idc++;
    return {
      id: 'sec_' + idc, level: x.level, title: x.title,
      target: 0, text: '', guide: x.guide || ''
    };
  });
  U.assignTargets(s.outline.sections, tpl, s.meta.targetWords);

  const refs = [
    { authors: '李明, 王芳', title: '生成式人工智能教育应用的研究进展与风险议题（示例文献）', source: '开放教育研究', year: '2024', vol: '30', issue: '2', pages: '45-56', type: 'journal', tags: ['综述', '风险'], read: 3, note: '示例：综述类，可替换为真实文献。' },
    { authors: '张华', title: '认知负荷理论视角下的多媒体学习设计（示例文献）', source: '教育研究', year: '2021', vol: '42', issue: '7', pages: '88-99', type: 'journal', tags: ['理论'], read: 3, note: '示例：认知负荷三类划分。' },
    { authors: '陈晓, 刘洋, 赵敏', title: '智能辅导系统对初中数学成绩影响的准实验研究（示例文献）', source: '中国电化教育', year: '2023', vol: '', issue: '5', pages: '101-108', type: 'journal', tags: ['实证', '数学'], read: 2, note: '示例：准实验设计可参考。' },
    { authors: 'Swanson, D.', title: 'Teacher mediation in AI-supported classrooms (sample)', source: 'Computers & Education', year: '2023', vol: '198', issue: '', pages: '104-121', type: 'journal', tags: ['机制', '英文'], read: 2, note: '示例：教师中介作用。' },
    { authors: '教育部', title: '关于加强中小学人工智能教育的指导意见（示例）', source: '教育部官网', year: '2024', url: 'https://www.example.edu.cn/ai-guideline', type: 'web', tags: ['政策'], read: 1, note: '示例：政策文本，注意替换为真实链接。' },
    { authors: '王强', title: '质性研究中的案例选择与编码策略（示例文献）', source: '示例出版社', year: '2020', place: '北京', type: 'book', tags: ['方法'], read: 3, note: '示例：方法章参考。' }
  ];
  s.refs = refs.map(function (r, i) {
    return Object.assign(Refs.blank(), r, { id: 'r' + (i + 1), addedAt: new Date().toISOString() });
  });

  const find = function (kw) {
    return s.outline.sections.filter(function (x) { return x.title.indexOf(kw) >= 0; })[0];
  };

  const s1 = find('研究背景与问题提出');
  if (s1) s1.text = '近年来，生成式人工智能以极低的门槛进入教学现场。据《中国教育信息化发展报告》相关调查，超过四成的中学教师在备课环节使用过生成式工具，其中数学学科的讲解类使用最为集中。这类工具能够在数秒内给出解题步骤与多种解法，缓解了教师在差异化辅导上的时间压力。\n\n然而，"能用"并不等于"该用"。数学学习的目标不只是得到正确答案，更在于形成概念理解与迁移能力。当 AI 直接给出完整解法时，学生可能跳过必要的表征转换与错误修正过程，反而削弱深层加工[@r2]。已有研究多比较"使用与不使用"的成绩差异，结论并不一致：部分研究报告了显著提升[@r3]，也有研究提示效果依赖教师如何组织使用[@r4]。\n\n据此，本文提出核心问题：在初中数学课堂中，生成式 AI 辅助讲解如何影响学生的认知负荷与迁移成绩？教师在其中的二次加工起什么作用？本文采用单案例研究，结合课堂观察、教师访谈与作业数据分析，尝试刻画这一过程机制，并为学校层面的使用规范提供依据。';
  const s2 = find('研究思路与方法');
  if (s2) s2.text = '本文遵循"现象—机制—边界"的分析路径。首先通过课堂观察记录 AI 介入的时机、任务类型与教师行为；其次对 12 名数学教师与 24 名学生进行半结构化访谈，了解其使用动机与困难；最后收集两个单元的作业与测验数据，比较程序性任务与概念性任务的表现差异。资料采用主题编码，编码框架来自认知负荷理论与教师中介理论[@r2][@r4]，并通过双人编码与成员校验控制主观偏差[@r6]。';
  const s3 = find('分析框架构建');
  if (s3) s3.text = '本文的分析框架由三个层次构成。第一层是任务特征：程序性任务强调步骤复现，概念性任务强调表征转换与迁移。第二层是教师中介：教师对 AI 输出进行筛选、改写与追问，这一过程决定了学生接触到的信息结构。第三层是组织条件：学校的使用规范、评价方式与课堂时间安排共同界定了"可用的边界"。三者交互，构成本文解释效果差异的基本框架[@r1][@r4]。';
  const s4 = find('案例选择依据');
  if (s4) s4.text = '研究选取华东地区一所公办初中的八年级两个平行班作为案例。选择依据有三：其一，该校自 2024 年起在数学组试点 AI 辅助备课，具备真实使用情境；其二，两个班级在师资、课时与生源结构上高度可比，便于对照；其三，研究者获准进入课堂并获取作业数据。案例的典型性优于代表性，本文的结论定位于机制解释，而非总体推断[@r6]。';
  const s5 = find('维度一：动因分析');
  if (s5) s5.text = '访谈显示，教师使用生成式工具的直接动因是备课时间压力与差异化辅导需求。一位教龄八年的教师提到："一个班四十多人，讲完新课还要顾两头，AI 至少能先把基础题的分层方案给出来。"（访谈记录 T03）这一动因在单元复习阶段尤为突出，此时练习题量大、变式多，教师更倾向让 AI 生成分层题单，而非自行编制。';

  s.versions = [{
    id: U.uid('v'), label: '示例初始版本', at: new Date(Date.now() - 86400000).toISOString(),
    stats: { words: 0, sections: s.outline.sections.length, refs: s.refs.length, issues: null, score: null },
    snapshot: null, note: '示例项目自动生成'
  }];
  s.versions[0].stats.words = s.outline.sections.reduce(function (a, b) { return a + U.countWords(b.text); }, 0);
  s.versions[0].snapshot = JSON.stringify({ meta: s.meta, outline: s.outline, refs: s.refs });

  s.todos = [
    { id: U.uid('t'), text: '补齐伦理审批说明（示例中未通过）', done: false, at: new Date().toISOString() },
    { id: U.uid('t'), text: '替换 6 条示例文献为真实文献', done: false, at: new Date().toISOString() },
    { id: U.uid('t'), text: '完成案例分析其余维度', done: false, at: new Date().toISOString() }
  ];

  Store.s = s;
  Store.flush();
  renderChrome();
}
