/* ============================================================
   论文工坊 PaperLab — 收尾与交付视图
   质量检查 / 修改与版本 / 成稿导出 / 流程与接口说明
   ============================================================ */

function sevBadge(sev) {
  return sev === 'high' ? '<span class="badge bad">高</span>' :
    sev === 'mid' ? '<span class="badge warn">中</span>' : '<span class="badge plain">低</span>';
}

function recalcQuality(s) {
  const dims = {};
  Object.keys(CheckEngine.dims).forEach(function (k) { dims[k] = 100; });
  const ign = s.quality.ignored || [];
  (s.quality.issues || []).forEach(function (it) {
    if (ign.indexOf(it.id) < 0 && dims[it.dim] != null) dims[it.dim] -= it.pen;
  });
  Object.keys(dims).forEach(function (k) { dims[k] = U.clamp(Math.round(dims[k]), 0, 100); });
  let score = 0;
  Object.keys(CheckEngine.weights).forEach(function (k) { score += dims[k] * CheckEngine.weights[k]; });
  s.quality.dims = dims;
  s.quality.score = Math.round(score);
}

/* ============================================================
   质量检查
   ============================================================ */
Views.quality = function (root) {
  const s = Store.s;
  const q = s.quality;
  const fresh = Progress.qualityFresh(s);
  const opts = s.ui.checkOpts || { logic: true, language: true, format: true, citation: true, dup: true };
  const ign = q.ignored || [];
  const active = (q.issues || []).filter(function (x) { return ign.indexOf(x.id) < 0; });
  const shown = active.filter(function (x) {
    if ((s.ui.qDim || 'all') !== 'all' && x.dim !== s.ui.qDim) return false;
    if ((s.ui.qSev || 'all') !== 'all' && x.sev !== s.ui.qSev) return false;
    return true;
  });

  const score = q.score == null ? 0 : q.score;
  const ringColor = q.score == null ? '#d9d4c9' : score >= 80 ? '#2f7457' : score >= 60 ? '#b0732c' : '#a8443b';
  const C = 2 * Math.PI * 52;
  const off = C * (1 - score / 100);

  const dimRows = Object.keys(CheckEngine.dims).map(function (k) {
    const v = q.dims && q.dims[k] != null ? q.dims[k] : 100;
    return '<div class="dim"><div class="dh"><span>' + CheckEngine.dims[k] + '</span><b>' + (q.ranAt ? v : '—') + '</b></div>' +
      H.bar(q.ranAt ? v / 100 : 0, v >= 80 ? 'ok' : v >= 60 ? 'warn' : 'bad') + '</div>';
  }).join('');

  const issueHtml = shown.length ? shown.map(function (x) {
    return '<div class="issue ' + x.sev + (ign.indexOf(x.id) >= 0 ? ' ignored' : '') + '">' +
      '<div class="i-sev">' + sevBadge(x.sev) + '<div style="font-size:10px;color:var(--faint);margin-top:4px">' + U.esc(CheckEngine.dims[x.dim] || '') + '</div></div>' +
      '<div class="i-main"><div class="i-title">' + U.esc(x.title) + '</div>' +
      '<div class="i-desc">' + U.esc(x.desc) + '</div>' +
      '<div class="i-fix"><b>修复建议：</b>' + U.esc(x.fix) + '</div>' +
      '<div class="i-loc">' +
      (x.secId ? '<span>位置：<code>' + U.esc((secByIndex(s, x.secId) || {}).title || '') + '</code></span>' : '<span>位置：全局</span>') +
      (x.quote ? '<span>片段：<code>' + U.esc(x.quote) + '</code></span>' : '') +
      '</div></div>' +
      '<div class="i-act">' +
      (x.secId ? '<button class="btn btn-xs" data-jump="' + x.secId + '">去修改</button>' : '') +
      '<button class="btn btn-xs" data-todo="' + x.id + '">转待办</button>' +
      '<button class="btn btn-xs btn-ghost" data-ignore="' + x.id + '">' + (ign.indexOf(x.id) >= 0 ? '恢复' : '忽略') + '</button>' +
      '</div></div>';
  }).join('') : '<div class="empty"><h4>' + (q.ranAt ? '当前筛选下没有问题' : '尚未运行检查') + '</h4>' +
    '<p>' + (q.ranAt ? '调整筛选条件，或重新运行检查。' : '检查会读取全部章节、摘要与文献库，生成可定位、可修复的问题清单。') + '</p>' +
    (q.ranAt ? '' : '<button class="btn btn-primary" data-run="1">运行质量检查</button>') + '</div>';

  root.innerHTML =
    H.head('模块 06 · 收尾',
      '写作质量检查',
      '五类规则自查：逻辑一致性、语言表达、格式规范、引用规范、重复与原创。每条问题都带定位与修复建议；结论是自查参考，不等同于官方查重或评审意见。',
      '<button class="btn" id="btnReport">导出检查报告</button>' +
      '<button class="btn btn-primary" data-run="1">' + (q.ranAt ? '重新运行检查' : '运行质量检查') + '</button>') +

    (!fresh && q.ranAt
      ? '<div class="card" style="border-color:#ecdcbd;background:var(--warn-soft);padding:12px 16px;font-size:12.5px;color:var(--warn)">' +
      '<b>文本已变更，当前结论待复核。</b> 上次检查：' + U.fmtTime(q.ranAt) + '，得分 ' + q.score + '。重新运行后才能用于导出。</div>'
      : '') +

    H.card('',
      '<div class="score-hero">' +
      '<div class="score-ring"><svg width="118" height="118">' +
      '<circle cx="59" cy="59" r="52" fill="none" stroke="#eee8dc" stroke-width="9"></circle>' +
      '<circle cx="59" cy="59" r="52" fill="none" stroke="' + ringColor + '" stroke-width="9" stroke-linecap="round" ' +
      'stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '"></circle></svg>' +
      '<div class="val"><b>' + (q.ranAt ? q.score : '—') + '</b><small>综合得分</small></div></div>' +
      '<div style="flex:1 1 300px">' +
      '<div style="font-family:var(--serif);font-size:16px;margin-bottom:4px">' + U.esc(CheckEngine.scoreLabel(q.ranAt ? q.score : null)) + '</div>' +
      '<div style="font-size:12.3px;color:var(--muted);line-height:1.7">' +
      (q.ranAt
        ? '共 ' + active.length + ' 条待处理问题（高 ' + active.filter(function (x) { return x.sev === 'high'; }).length +
        ' / 中 ' + active.filter(function (x) { return x.sev === 'mid'; }).length +
        ' / 低 ' + active.filter(function (x) { return x.sev === 'low'; }).length + '）；' +
        '已忽略 ' + ign.length + ' 条。检查时间 ' + U.fmtTime(q.ranAt) + '。'
        : '尚未运行。建议在完成主体章节后运行一次，作为修改起点。') +
      '</div>' +
      '<div style="display:flex;gap:12px;margin-top:10px;font-size:11.5px;color:var(--muted);flex-wrap:wrap">' +
      '<span>字数 <b style="color:var(--ink-2)">' + U.num(U.countWords(CheckEngine.textOf(s))) + '</b></span>' +
      '<span>自重复率 <b style="color:var(--ink-2)">' + (q.stats ? (q.stats.repeated * 100).toFixed(1) + '%' : '—') + '</b></span>' +
      '<span>文献 <b style="color:var(--ink-2)">' + (s.refs || []).length + '</b></span>' +
      '<span>引用点 <b style="color:var(--ink-2)">' + Cite.order(s).length + '</b></span>' +
      '</div></div>' +
      '<div class="dim-grid">' + dimRows + '</div>' +
      '</div>',
      { note: '得分 = 各维度加权（逻辑 30% / 语言 22% / 格式 18% / 引用 15% / 原创 15%），每命中一条规则按严重度扣分。' }) +

    H.card('检查范围',
      '<div class="row" style="gap:8px">' +
      [['logic', '逻辑一致性'], ['language', '语言表达'], ['format', '格式规范'], ['citation', '引用规范'], ['dup', '重复与原创']].map(function (pair) {
        return '<label class="check' + (opts[pair[0]] ? ' on' : '') + '" style="flex:1 1 150px">' +
          '<input type="checkbox" data-opt="' + pair[0] + '"' + (opts[pair[0]] ? ' checked' : '') + '><span>' + pair[1] + '</span></label>';
      }).join('') +
      '</div>',
      { note: '可按需关闭某类规则。关闭后该类不产生问题，也不参与扣分。' }) +

    (q.ranAt
      ? H.card('问题清单',
        '<div class="row tight" style="margin-bottom:12px;align-items:center">' +
        '<select class="select" id="qDim" style="width:auto">' +
        '<option value="all"' + ((s.ui.qDim || 'all') === 'all' ? ' selected' : '') + '>全部维度</option>' +
        Object.keys(CheckEngine.dims).map(function (k) {
          return '<option value="' + k + '"' + (s.ui.qDim === k ? ' selected' : '') + '>' + CheckEngine.dims[k] + '</option>';
        }).join('') + '</select>' +
        '<select class="select" id="qSev" style="width:auto">' +
        [['all', '全部严重度'], ['high', '仅高'], ['mid', '仅中'], ['low', '仅低']].map(function (p) {
          return '<option value="' + p[0] + '"' + ((s.ui.qSev || 'all') === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
        }).join('') + '</select>' +
        '<span style="flex:1"></span>' +
        '<span class="badge plain">显示 ' + shown.length + ' / ' + active.length + '</span>' +
        '<button class="btn btn-xs" id="btnAllTodo">全部转待办</button>' +
        '</div>' +
        issueHtml,
        { note: '「忽略」表示经人工判断不适用，会从得分中剔除；「转待办」把问题写入项目待办清单。' })
      : H.card('检查说明',
        '<div class="grid grid-3" style="font-size:12.2px;color:var(--muted);line-height:1.75">' +
        '<div><b style="color:var(--ink-2)">逻辑一致性</b><br>章节完整度、篇幅偏差、结构失衡、结论是否有证据、绪论是否给出研究问题。</div>' +
        '<div><b style="color:var(--ink-2)">语言与格式</b><br>超长句、口语词、模糊限定、中英标点混用、摘要与关键词规范、图表编号。</div>' +
        '<div><b style="color:var(--ink-2)">引用与重复</b><br>未定义引用、引用密度、单一文献依赖、8 字窗口自重复、跨章相似度。</div>' +
        '</div>')) +

    H.card('关于"查重"的边界说明',
      '<div style="display:flex;gap:14px;flex-wrap:wrap">' +
      '<div style="flex:1 1 260px;font-size:12.3px;color:var(--ink-2);line-height:1.85">' +
      '<p><b>本工具做的是"文本自重复自查"：</b>把全文切成 8 字窗口，统计重复片段比例；再比较各章 6 字 shingle 的 Jaccard 相似度，定位互相复用的段落。</p>' +
      '<p><b>它做不到的：</b>不联网、不接知网/万方/Turnitin 比对库，因此<b>不能给出正式查重率</b>，也无法发现与外部文献的重复。</p>' +
      '<p><b>建议用法：</b>用自重复率与跨章相似度清理内部复制粘贴；正式查重前，把引用规范与格式检查跑一遍，减少"格式性重复"。</p>' +
      '</div>' +
      '<div style="flex:0 0 220px">' +
      '<div class="kpi" style="margin-bottom:8px"><span class="k">8 字窗口自重复率</span><span class="v">' +
      (q.stats ? (q.stats.repeated * 100).toFixed(1) + '<small>%</small>' : '—') + '</span>' +
      '<span class="d">' + (q.stats && q.stats.repeated > 0.06 ? '偏高，检查跨章复制' : q.stats && q.stats.repeated > 0.025 ? '轻度，多为模板句' : '正常范围') + '</span></div>' +
      '<div class="kpi"><span class="k">检测长度</span><span class="v">8<small>字</small></span><span class="d">短于此长度的重复不报警</span></div>' +
      '</div></div>') +

    H.card('规则清单（可预期、可复现）',
      '<div class="table-wrap"><table class="tbl"><thead><tr><th>维度</th><th>规则</th><th>严重度</th></tr></thead><tbody>' +
      [
        ['逻辑', '空章节 / 缺少绪论 / 缺少结论', '高'], ['逻辑', '章节篇幅偏离预算 > 2.2 倍或 < 45%', '中'],
        ['逻辑', '单章占比 > 42%（结构失衡）', '中'], ['逻辑', '绪论无研究问题', '高'],
        ['逻辑', '结论句无引用/数据支撑', '中'], ['逻辑', '段落 > 420 字', '低'],
        ['语言', '句子 > 95 字', '中'], ['语言', '口语词 / 弱动词 / 模糊限定堆叠', '中/低'],
        ['语言', '中英文标点混用', '中'], ['格式', '摘要缺失或长度异常、关键词数量', '高/中/低'],
        ['格式', '章节标题含手工编号、图表无编号、末句无标点', '低/中'], ['格式', '文献字段不完整', '中'],
        ['引用', '未定义引用 / 全文无引用', '高'], ['引用', '引用密度 < 1.2 处/千字、单一文献依赖', '中/低'],
        ['重复', '自重复率 > 6%、跨章相似度 > 42%', '高/中']
      ].map(function (r) {
        return '<tr><td><span class="badge plain">' + r[0] + '</span></td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
      }).join('') +
      '</tbody></table></div>');

  /* --- 事件 --- */
  plOn(root, '[data-run]', 'click', function () {
    const res = CheckEngine.run(s, opts);
    s.quality = {
      ranAt: res.ranAt, score: res.score, dims: res.dims, issues: res.issues,
      stamp: Progress.stamp(s), ignored: [], stats: res.stats
    };
    Store.save();
    App.render();
    PLToast.show('检查完成：' + res.issues.length + ' 条问题，得分 ' + res.score, res.issues.length ? 'warn' : 'ok');
  });

  root.querySelectorAll('[data-opt]').forEach(function (el) {
    el.addEventListener('change', function () {
      opts[el.getAttribute('data-opt')] = el.checked;
      s.ui.checkOpts = opts;
      Store.save();
      App.render();
    });
  });

  const qDim = root.querySelector('#qDim');
  if (qDim) qDim.addEventListener('change', function () { s.ui.qDim = qDim.value; Store.save(); App.render(); });
  const qSev = root.querySelector('#qSev');
  if (qSev) qSev.addEventListener('change', function () { s.ui.qSev = qSev.value; Store.save(); App.render(); });

  plOn(root, '[data-jump]', 'click', function (e, el) {
    s.ui.secId = el.getAttribute('data-jump');
    Store.save();
    App.go('writing');
  });

  plOn(root, '[data-todo]', 'click', function (e, el) {
    const id = el.getAttribute('data-todo');
    const it = (s.quality.issues || []).filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    if (s.todos.some(function (t) { return t.qid === id; })) { PLToast.show('该问题已在待办中', 'warn'); return; }
    s.todos.unshift({ id: U.uid('t'), qid: id, text: it.title + ' —— ' + it.fix, done: false, at: new Date().toISOString() });
    Store.save();
    PLToast.show('已加入待办', 'ok');
  });

  const allTodo = root.querySelector('#btnAllTodo');
  if (allTodo) allTodo.addEventListener('click', function () {
    let n = 0;
    active.forEach(function (it) {
      if (s.todos.some(function (t) { return t.qid === it.id; })) return;
      s.todos.unshift({ id: U.uid('t'), qid: it.id, text: it.title + ' —— ' + it.fix, done: false, at: new Date().toISOString() });
      n++;
    });
    Store.save();
    PLToast.show(n ? '已加入 ' + n + ' 条待办' : '问题均已在待办中', n ? 'ok' : 'warn');
  });

  plOn(root, '[data-ignore]', 'click', function (e, el) {
    const id = el.getAttribute('data-ignore');
    const i = ign.indexOf(id);
    if (i >= 0) ign.splice(i, 1); else ign.push(id);
    s.quality.ignored = ign;
    recalcQuality(s);
    Store.save();
    App.render();
  });

  root.querySelector('#btnReport').addEventListener('click', function () {
    if (!q.ranAt) { PLToast.show('请先运行检查', 'warn'); return; }
    const lines = [];
    lines.push('# 写作质量检查报告');
    lines.push('');
    lines.push('- 论文：' + (s.meta.title || '未命名'));
    lines.push('- 检查时间：' + U.fmtTime(q.ranAt));
    lines.push('- 综合得分：' + q.score + '（' + CheckEngine.scoreLabel(q.score) + '）');
    lines.push('- 统计：正文 ' + U.num(U.countWords(CheckEngine.textOf(s))) + ' 字，文献 ' + (s.refs || []).length + ' 条，引用点 ' + Cite.order(s).length + ' 处');
    lines.push('');
    lines.push('## 分项得分');
    Object.keys(CheckEngine.dims).forEach(function (k) {
      lines.push('- ' + CheckEngine.dims[k] + '：' + (q.dims[k] != null ? q.dims[k] : '—'));
    });
    lines.push('');
    lines.push('## 问题清单（' + active.length + ' 条待处理，已忽略 ' + ign.length + ' 条）');
    ['high', 'mid', 'low'].forEach(function (sev) {
      const list = active.filter(function (x) { return x.sev === sev; });
      if (!list.length) return;
      lines.push('');
      lines.push('### ' + (sev === 'high' ? '高' : sev === 'mid' ? '中' : '低') + ' 严重度（' + list.length + '）');
      list.forEach(function (x, i) {
        lines.push((i + 1) + '. **' + x.title + '**（' + CheckEngine.dims[x.dim] + '）');
        lines.push('   - 位置：' + ((secByIndex(s, x.secId) || {}).title || '全局'));
        lines.push('   - 说明：' + x.desc);
        lines.push('   - 建议：' + x.fix);
      });
    });
    lines.push('');
    lines.push('> 本报告由规则引擎生成，用于自查与修改排期，不代表评审结论，也不等同于官方查重结果。');
    U.download('质量检查报告-' + U.fmtDate() + '.md', lines.join('\n'), 'text/markdown');
  });
};

/* ============================================================
   修改与版本
   ============================================================ */
function snapshotNow(s, label, note) {
  const words = (s.outline.sections || []).reduce(function (a, b) { return a + U.wordsOf(b); }, 0);
  return {
    id: U.uid('v'),
    label: label || ('版本 ' + ((s.versions || []).length + 1)),
    at: new Date().toISOString(),
    note: note || '',
    stats: {
      words: words,
      sections: (s.outline.sections || []).length,
      refs: (s.refs || []).length,
      score: s.quality.score || null,
      issues: (s.quality.issues || []).length
    },
    data: JSON.stringify({
      meta: s.meta, outline: s.outline, refs: s.refs, topic: s.topic
    })
  };
}

Views.review = function (root) {
  const s = Store.s;
  const vers = (s.versions || []).slice().reverse();
  const curWords = (s.outline.sections || []).reduce(function (a, b) { return a + U.wordsOf(b); }, 0);
  const curRefs = (s.refs || []).length;
  const todosLeft = (s.todos || []).filter(function (t) { return !t.done; }).length;

  const selId = s.ui.verId;
  const selVer = selId ? (s.versions || []).filter(function (v) { return v.id === selId; })[0] : null;

  /* --- 版本对比 --- */
  let compareHtml = '';
  if (selVer) {
    let data = null;
    try { data = JSON.parse(selVer.data || '{}'); } catch (e) { data = null; }
    if (data && data.outline) {
      const oldSecs = data.outline.sections || [];
      const newSecs = s.outline.sections || [];
      const oldMap = {}, newMap = {};
      oldSecs.forEach(function (x) { oldMap[x.title] = x; });
      newSecs.forEach(function (x) { newMap[x.title] = x; });
      const titles = [];
      oldSecs.forEach(function (x) { if (titles.indexOf(x.title) < 0) titles.push(x.title); });
      newSecs.forEach(function (x) { if (titles.indexOf(x.title) < 0) titles.push(x.title); });

      const rows = titles.map(function (t) {
        const o = oldMap[t], n = newMap[t];
        const d = (n ? U.wordsOf(n) : 0) - (o ? U.wordsOf(o) : 0);
        let st = '未变';
        if (!o) st = '新增章节';
        else if (!n) st = '已删除';
        else if (d !== 0) st = d > 0 ? '扩写' : '删减';
        return '<tr><td>' + U.esc(t) + '</td>' +
          '<td class="num">' + (o ? U.wordsOf(o) : '—') + '</td>' +
          '<td class="num">' + (n ? U.wordsOf(n) : '—') + '</td>' +
          '<td class="num" style="color:' + (d > 0 ? 'var(--ok)' : d < 0 ? 'var(--bad)' : 'var(--muted)') + '">' + (d > 0 ? '+' : '') + (o || n ? d : 0) + '</td>' +
          '<td><span class="badge ' + (st === '新增章节' ? 'info' : st === '已删除' ? 'bad' : st === '未变' ? 'plain' : 'warn') + '">' + st + '</span></td></tr>';
      }).join('');

      compareHtml = H.card('版本对比：' + U.esc(selVer.label),
        '<div class="grid grid-4" style="margin-bottom:12px">' +
        H.kpi('字数变化', (curWords - selVer.stats.words > 0 ? '+' : '') + U.num(curWords - selVer.stats.words), '快照 ' + U.num(selVer.stats.words) + ' → 当前 ' + U.num(curWords)) +
        H.kpi('章节', String(newSecs.length), '快照 ' + selVer.stats.sections + ' 节') +
        H.kpi('文献', String(curRefs), '快照 ' + selVer.stats.refs + ' 条') +
        H.kpi('得分', selVer.stats.score == null ? '—' : String(selVer.stats.score), '当前 ' + (s.quality.score == null ? '—' : s.quality.score)) +
        '</div>' +
        '<div class="table-wrap"><table class="tbl"><thead><tr><th>章节</th><th class="num">快照字数</th><th class="num">当前字数</th><th class="num">差值</th><th>状态</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        '<div class="row tight" style="margin-top:12px">' +
        '<button class="btn btn-sm" id="btnRestoreSel">恢复到该版本</button>' +
        '<button class="btn btn-sm btn-ghost" id="btnCloseCompare">收起对比</button></div>',
        { note: '对比基于章节标题匹配；改过标题的章节会被识别为「新增 + 删除」。' });
    }
  }

  const verHtml = vers.length ? vers.map(function (v, i) {
    const isCur = i === 0;
    return '<div class="ver' + (isCur ? ' cur' : '') + '">' +
      '<div class="v-head"><h4>' + U.esc(v.label) + '</h4>' +
      (isCur ? '<span class="badge info">最新</span>' : '') +
      '<span class="v-ts">' + U.fmtTime(v.at) + '</span>' +
      '<span style="flex:1"></span>' +
      (v.note ? '<span class="badge plain">' + U.esc(v.note) + '</span>' : '') + '</div>' +
      '<div class="v-stats">' +
      '<span>字数 <b>' + U.num(v.stats.words) + '</b></span>' +
      '<span>章节 <b>' + v.stats.sections + '</b></span>' +
      '<span>文献 <b>' + v.stats.refs + '</b></span>' +
      '<span>得分 <b>' + (v.stats.score == null ? '—' : v.stats.score) + '</b></span>' +
      '<span>问题 <b>' + (v.stats.issues == null ? '—' : v.stats.issues) + '</b></span>' +
      '</div>' +
      '<div class="v-act">' +
      '<button class="btn btn-xs" data-compare="' + v.id + '">对比当前</button>' +
      '<button class="btn btn-xs" data-restore="' + v.id + '">恢复</button>' +
      '<button class="btn btn-xs btn-ghost" data-dver="' + v.id + '">删除</button>' +
      '</div></div>';
  }).join('') : H.empty('还没有版本快照', '快照记录当前全文、章节与文献库。建议在「大改前」「检查后」「导出前」各存一次，便于对比与回滚。', '<button class="btn btn-primary" data-snap="1">保存第一个快照</button>');

  const issues = (s.quality.issues || []).filter(function (x) { return (s.quality.ignored || []).indexOf(x.id) < 0; }).slice(0, 6);

  root.innerHTML =
    H.head('模块 07 · 收尾',
      '修改建议与版本记录',
      '把检查结果转成待办，逐个消化；关键节点保存快照，随时对比与回滚。本模块不自动改写文本，修改权始终在作者。',
      '<button class="btn" data-nav="quality">重新检查</button>' +
      '<button class="btn btn-primary" data-snap="1">保存版本快照</button>') +

    '<div class="grid grid-4" style="margin-bottom:16px">' +
    H.kpi('版本数', String((s.versions || []).length), '最新 ' + ((s.versions || [])[0] ? U.fmtTime((s.versions || [])[0].at) : '—')) +
    H.kpi('当前字数', U.num(curWords), '上次快照 ' + ((s.versions || [])[0] ? U.num((s.versions || [])[0].stats.words) : '—')) +
    H.kpi('未完成待办', String(todosLeft), '共 ' + (s.todos || []).length + ' 条') +
    H.kpi('待修问题', String((s.quality.issues || []).length - (s.quality.ignored || []).length), (s.quality.score == null ? '尚未检查' : '得分 ' + s.quality.score)) +
    '</div>' +

    compareHtml +

    '<div class="grid grid-side">' +
    '<div>' +
    H.card('版本时间线', '<div class="timeline">' + verHtml + '</div>',
      { actions: '<span class="badge plain">手动快照 + 回滚前自动保存</span>', note: '快照存于本机 localStorage，含全文与文献库；导出 JSON 可长期归档。' }) +
    '</div>' +
    '<div>' +
    H.card('修改建议（来自最近一次检查）',
      (issues.length
        ? issues.map(function (x) {
          const done = (s.todos || []).some(function (t) { return t.qid === x.id && t.done; });
          return '<div class="mini-issue" style="align-items:flex-start">' +
            '<span class="sev ' + (x.sev === 'high' ? 'high' : x.sev === 'mid' ? 'mid' : 'low') + '"></span>' +
            '<span style="flex:1"><b style="font-size:11.9px;color:var(--ink)">' + U.esc(x.title) + '</b>' +
            '<span style="display:block;color:var(--muted);font-size:11.4px;line-height:1.6">' + U.esc(x.fix) + '</span>' +
            '<span style="display:flex;gap:6px;margin-top:5px">' +
            (x.secId ? '<button class="btn btn-xs" data-jump="' + x.secId + '">去修改</button>' : '') +
            '<button class="btn btn-xs btn-ghost" data-todo="' + x.id + '">' + (done ? '已在待办' : '转待办') + '</button>' +
            '</span></span></div>';
        }).join('')
        : '<div style="font-size:12.5px;color:var(--muted)">' + (s.quality.ranAt ? '没有待处理问题。' : '先运行质量检查，问题会自动出现在这里。') + '</div>'),
      { note: '建议按「高 → 中 → 低」处理；高危问题通常是结构性的，先改结构再润色语言。' }) +
    H.card('待办清单',
      ((s.todos || []).length
        ? s.todos.map(function (t, i) {
          return '<div class="todo-item' + (t.done ? ' done' : '') + '">' +
            '<input type="checkbox" data-dtodo="' + i + '"' + (t.done ? ' checked' : '') + '>' +
            '<span>' + U.esc(t.text) + '</span>' +
            '<button class="icon-btn danger" data-dtodo-del="' + i + '" title="删除">✕</button>' +
            '</div>';
        }).join('')
        : '<div style="font-size:12.5px;color:var(--muted)">暂无待办。</div>')) +
    '</div>' +
    '</div>';

  /* --- 快照 --- */
  plOn(root, '[data-snap]', 'click', function () {
    PLModal.open({
      title: '保存版本快照',
      body: '<div class="field"><label>版本标签</label><input class="input" id="vLabel" value="' +
        U.attr('v' + ((s.versions || []).length + 1) + ' · ' + U.fmtDate()) + '"></div>' +
        '<div class="field"><label>备注（可选）</label><input class="input" id="vNote" placeholder="例：完成案例分析，待补稳健性检验"></div>' +
        '<div class="hint" style="font-size:11.5px;color:var(--muted)">快照包含：元信息、章节与全文、文献库、选题评估。不包含版本历史本身。</div>',
      footer: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" id="vOk">保存</button>',
      onMount: function (m) {
        m.querySelector('#vOk').addEventListener('click', function () {
          const label = m.querySelector('#vLabel').value.trim() || '未命名版本';
          const note = m.querySelector('#vNote').value.trim();
          s.versions.unshift(snapshotNow(s, label, note));
          Store.save();
          PLModal.close();
          App.render();
          PLToast.show('已保存快照', 'ok');
        });
      }
    });
  });

  /* --- 对比 / 恢复 / 删除 --- */
  plOn(root, '[data-compare]', 'click', function (e, el) {
    s.ui.verId = el.getAttribute('data-compare');
    Store.save();
    App.render();
  });

  const closeCmp = root.querySelector('#btnCloseCompare');
  if (closeCmp) closeCmp.addEventListener('click', function () { s.ui.verId = null; Store.save(); App.render(); });

  const doRestore = function (id) {
    const v = (s.versions || []).filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    PLModal.confirm({
      title: '恢复到该版本',
      body: '将把元信息、章节全文、文献库与选题评估恢复到「' + U.esc(v.label) + '」（' + U.fmtTime(v.at) + '）。当前状态会先自动保存为一个新快照，可再回滚。',
      ok: '确认恢复'
    }).then(function (ok) {
      if (!ok) return;
      let data = null;
      try { data = JSON.parse(v.data); } catch (e) { data = null; }
      if (!data) { PLToast.show('该快照数据损坏，无法恢复', 'bad'); return; }
      s.versions.unshift(snapshotNow(s, '回滚前自动保存 · ' + U.fmtTime(), 'restore-guard'));
      s.meta = U.mergeDeep(defaultState().meta, data.meta || {});
      s.outline = U.mergeDeep(defaultState().outline, data.outline || {});
      s.refs = data.refs || [];
      if (data.topic) s.topic = U.mergeDeep(defaultState().topic, data.topic);
      s.ui.secId = null;
      Store.save();
      App.render();
      PLToast.show('已恢复，原状态已存为新快照', 'ok');
    });
  };

  plOn(root, '[data-restore]', 'click', function (e, el) { doRestore(el.getAttribute('data-restore')); });
  const restoreSel = root.querySelector('#btnRestoreSel');
  if (restoreSel) restoreSel.addEventListener('click', function () { doRestore(selVer.id); });

  plOn(root, '[data-dver]', 'click', function (e, el) {
    const id = el.getAttribute('data-dver');
    const v = (s.versions || []).filter(function (x) { return x.id === id; })[0];
    if (!v) return;
    PLModal.confirm({ title: '删除快照', body: '确认删除「' + U.esc(v.label) + '」？删除后不可恢复。', ok: '删除', danger: true })
      .then(function (ok) {
        if (!ok) return;
        s.versions = s.versions.filter(function (x) { return x.id !== id; });
        Store.save();
        App.render();
      });
  });

  /* --- 待办 --- */
  root.querySelectorAll('[data-dtodo]').forEach(function (el) {
    el.addEventListener('change', function () {
      s.todos[Number(el.getAttribute('data-dtodo'))].done = el.checked;
      Store.save();
      App.render();
    });
  });
  root.querySelectorAll('[data-dtodo-del]').forEach(function (el) {
    el.addEventListener('click', function () {
      s.todos.splice(Number(el.getAttribute('data-dtodo-del')), 1);
      Store.save();
      App.render();
    });
  });
  plOn(root, '[data-todo]', 'click', function (e, el) {
    const id = el.getAttribute('data-todo');
    const it = (s.quality.issues || []).filter(function (x) { return x.id === id; })[0];
    if (!it) return;
    if (s.todos.some(function (t) { return t.qid === id; })) { PLToast.show('已在待办中', 'warn'); return; }
    s.todos.unshift({ id: U.uid('t'), qid: id, text: it.title + ' —— ' + it.fix, done: false, at: new Date().toISOString() });
    Store.save();
    App.render();
    PLToast.show('已加入待办', 'ok');
  });
  plOn(root, '[data-jump]', 'click', function (e, el) {
    s.ui.secId = el.getAttribute('data-jump');
    Store.save();
    App.go('writing');
  });
};

/* ============================================================
   成稿组装
   ============================================================ */
const PaperBuild = {};

PaperBuild.filename = function (s, ext) {
  const t = (s.meta.title || '论文').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 50);
  const a = (s.meta.author || '').replace(/[\\/:*?"<>|\s]+/g, '');
  return t + (a ? '-' + a : '') + '-' + U.fmtDate() + '.' + ext;
};

PaperBuild.bodySections = function (s) {
  const secs = s.outline.sections || [];
  const nums = secNumbers(secs);
  return secs.filter(function (x) { return (x.text || '').trim() || x.level === 1; }).map(function (x) {
    return { sec: x, num: nums[x.id] || '', text: Cite.renderText(x.text || '', s) };
  });
};

PaperBuild.preflight = function (s) {
  const blocks = [], warns = [];
  const words = (s.outline.sections || []).reduce(function (a, b) { return a + U.wordsOf(b); }, 0);
  if (!s.meta.title) blocks.push('未填写论文标题（封面与页眉需要）');
  if (!(s.outline.sections || []).length) blocks.push('没有章节结构，无法组装正文');
  if (words === 0) blocks.push('正文为空，没有可导出的内容');
  const undef = Cite.undefinedIds(s);
  if (undef.length) blocks.push('存在 ' + undef.length + ' 个未定义引用，导出会显示 [?]');

  if (!s.quality.ranAt) warns.push('尚未运行质量检查');
  else if (!Progress.qualityFresh(s)) warns.push('文本已变更，质量结论待复核');
  const high = (s.quality.issues || []).filter(function (x) {
    return x.sev === 'high' && (s.quality.ignored || []).indexOf(x.id) < 0;
  });
  if (high.length) warns.push('有 ' + high.length + ' 条高危问题未处理');
  const uncited = Cite.uncited(s);
  if (uncited.length) warns.push(uncited.length + ' 条文献未被引用（不会出现在参考文献表）');
  if (!String(s.meta.abstract || '').trim()) warns.push('摘要为空');
  const target = U.budget(s.outline.sections || []).total;
  if (target && words < target * 0.6) warns.push('正文仅达字数预算的 ' + Math.round(words / target * 100) + '%');
  return { blocks: blocks, warns: warns, words: words };
};

PaperBuild.articleHtml = function (s, o) {
  const d = new Date();
  const parts = [];
  const body = PaperBuild.bodySections(s);

  if (o.cover) {
    parts.push('<div class="cover">' +
      '<div class="c-sub">' + U.esc(s.meta.degree || '') + '</div>' +
      '<h1>' + U.esc(s.meta.title) + '</h1>' +
      '<div class="c-meta">' + U.esc(s.meta.author || '') + '<br>' + U.esc(s.meta.org || '') + '<br>' + U.fmtDate(d) + '</div>' +
      '</div>');
  }

  if (o.abstract) {
    parts.push('<h2 style="text-align:center">摘　要</h2>' +
      '<div class="abs">' + String(s.meta.abstract || '（摘要未填写）').split(/\n+/).filter(Boolean).map(function (p) {
        return '<p style="text-indent:2em;margin:0 0 6px">' + U.esc(p) + '</p>';
      }).join('') +
      '<p style="margin:10px 0 0"><b>关键词：</b>' + U.esc(s.meta.keywords || '（未填写）') + '</p></div>');
  }

  if (o.toc && body.length) {
    parts.push('<div style="page-break-after:always"></div><h2 style="text-align:center">目　录</h2>');
    body.forEach(function (b) {
      const indent = b.sec.level === 2 ? 'padding-left:1.6em' : 'font-weight:600';
      parts.push('<div class="toc-line" style="' + indent + '"><span>' + U.esc(b.num ? b.num + ' ' + b.sec.title : b.sec.title) +
        '</span><span class="dots"></span><span>—</span></div>');
    });
  }

  body.forEach(function (b) {
    if (b.sec.level === 1) parts.push('<h2>' + U.esc((b.num ? b.num + '　' : '') + b.sec.title) + '</h2>');
    else parts.push('<h3>' + U.esc((b.num ? b.num + '　' : '') + b.sec.title) + '</h3>');
    String(b.text || '').split(/\n+/).filter(function (x) { return x.trim(); }).forEach(function (p) {
      parts.push('<p class="ptext">' + U.esc(p.trim()) + '</p>');
    });
  });

  if (o.refs) {
    const bib = Cite.bibliography(s);
    parts.push('<div style="page-break-before:always"></div><h2>参考文献</h2><div class="refs">' +
      (bib.length ? bib.map(function (r, i) {
        return '<p>' + U.esc(Cite.formatRef(r, i + 1, o.style)) + '</p>';
      }).join('') : '<p>（无）</p>') + '</div>');
  }

  if (o.checkReport && s.quality.ranAt) {
    const active = (s.quality.issues || []).filter(function (x) { return (s.quality.ignored || []).indexOf(x.id) < 0; });
    parts.push('<div style="page-break-before:always"></div><h2>附录：质量检查摘要</h2>' +
      '<p style="text-indent:0">检查时间：' + U.fmtTime(s.quality.ranAt) + '；综合得分：' + s.quality.score + '（' + CheckEngine.scoreLabel(s.quality.score) + '）；待处理问题 ' + active.length + ' 条。</p>' +
      '<div class="refs">' + Object.keys(CheckEngine.dims).map(function (k) {
        return '<p>' + CheckEngine.dims[k] + '：' + (s.quality.dims[k] == null ? '—' : s.quality.dims[k]) + '/100</p>';
      }).join('') + '</div>');
  }

  return parts.join('\n');
};

PaperBuild.markdown = function (s, o) {
  const L = [];
  const body = PaperBuild.bodySections(s);
  if (o.cover) {
    L.push('# ' + s.meta.title);
    L.push('');
    L.push('**' + (s.meta.author || '') + '**　' + (s.meta.org || ''));
    L.push('');
    L.push('_' + (s.meta.degree || '') + '　' + U.fmtDate() + '_');
    L.push('');
  }
  if (o.abstract) {
    L.push('## 摘要');
    L.push('');
    L.push(String(s.meta.abstract || '（摘要未填写）').trim());
    L.push('');
    L.push('**关键词：**' + (s.meta.keywords || ''));
    L.push('');
  }
  if (o.toc && body.length) {
    L.push('## 目录');
    L.push('');
    body.forEach(function (b) {
      L.push((b.sec.level === 2 ? '    ' : '') + '- ' + (b.num ? b.num + ' ' : '') + b.sec.title);
    });
    L.push('');
  }
  body.forEach(function (b) {
    L.push((b.sec.level === 1 ? '## ' : '### ') + (b.num ? b.num + ' ' : '') + b.sec.title);
    L.push('');
    String(b.text || '').split(/\n+/).filter(function (x) { return x.trim(); }).forEach(function (p) {
      L.push(p.trim());
      L.push('');
    });
  });
  if (o.refs) {
    L.push('## 参考文献');
    L.push('');
    const bib = Cite.bibliography(s);
    bib.forEach(function (r, i) { L.push(Cite.formatRef(r, i + 1, o.style)); });
    if (!bib.length) L.push('（无）');
    L.push('');
  }
  if (o.checkReport && s.quality.ranAt) {
    L.push('## 附录：质量检查摘要');
    L.push('');
    L.push('- 检查时间：' + U.fmtTime(s.quality.ranAt));
    L.push('- 综合得分：' + s.quality.score + '（' + CheckEngine.scoreLabel(s.quality.score) + '）');
    Object.keys(CheckEngine.dims).forEach(function (k) {
      L.push('- ' + CheckEngine.dims[k] + '：' + (s.quality.dims[k] == null ? '—' : s.quality.dims[k]) + '/100');
    });
    L.push('');
  }
  return L.join('\n');
};

PaperBuild.plain = function (s, o) {
  return PaperBuild.markdown(s, o)
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/_/g, '');
};

PaperBuild.standalone = function (s, o) {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + U.esc(s.meta.title) + '</title>' +
    '<style>body{max-width:760px;margin:48px auto;padding:0 24px;font-family:"Noto Serif SC","Songti SC","SimSun",Georgia,serif;font-size:15px;line-height:2;color:#1c2530}' +
    'h1{font-size:24px;text-align:center}h2{font-size:17px;margin:28px 0 10px}h3{font-size:15.5px;margin:20px 0 8px}' +
    'p.ptext{text-indent:2em;margin:0 0 10px;text-align:justify}.cover{text-align:center;padding:60px 0;border-bottom:2px solid #ddd;margin-bottom:30px}' +
    '.cover .c-sub{letter-spacing:.3em;color:#666;margin-bottom:20px}.cover .c-meta{margin-top:40px;line-height:2.1;color:#555}' +
    '.abs{background:#faf9f5;border:1px solid #e5e0d5;padding:16px 18px;font-size:13.5px;line-height:1.9}' +
    '.toc-line{display:flex;gap:8px;font-size:13.5px}.toc-line .dots{flex:1;border-bottom:1px dotted #bbb;margin-bottom:5px}' +
    '.refs p{text-indent:-1.8em;padding-left:1.8em;font-size:13px;margin:0 0 6px}' +
    '@media print{body{max-width:none;margin:0}.cover{page-break-after:always}}</style></head><body>' +
    PaperBuild.articleHtml(s, o) + '</body></html>';
};

/* ============================================================
   成稿导出
   ============================================================ */
Views.export = function (root) {
  const s = Store.s;
  const o = s.exportOpts;
  const pre = PaperBuild.preflight(s);
  const blocked = pre.blocks.length > 0;
  const needAck = pre.warns.length > 0 && !o.acknowledged;
  const disabled = blocked || needAck;
  const html = PaperBuild.articleHtml(s, o);
  const bib = Cite.bibliography(s);

  root.innerHTML =
    H.head('模块 08 · 交付',
      '最终成稿导出',
      '勾选组成部件 → 预览 → 通过导出前校验 → 下载或打印 PDF。导出只做组装与排版，不改写内容。',
      '<button class="btn" id="btnCopyMd">复制 Markdown</button>' +
      '<button class="btn" id="btnPrint"' + (disabled ? ' disabled' : '') + '>打印 / 保存 PDF</button>' +
      '<button class="btn btn-primary" id="btnDownload"' + (disabled ? ' disabled' : '') + '>下载成稿</button>') +

    '<div class="export-grid">' +

    '<div>' +
    H.card('导出设置',
      '<div class="opt-row"><label><input type="checkbox" data-opt="cover"' + (o.cover ? ' checked' : '') + '>封面</label><small>标题 / 作者 / 单位 / 日期</small></div>' +
      '<div class="opt-row"><label><input type="checkbox" data-opt="abstract"' + (o.abstract ? ' checked' : '') + '>摘要与关键词</label><small>取「写作」前置部分</small></div>' +
      '<div class="opt-row"><label><input type="checkbox" data-opt="toc"' + (o.toc ? ' checked' : '') + '>目录</label><small>按章节层级自动生成</small></div>' +
      '<div class="opt-row"><label><input type="checkbox" data-opt="refs"' + (o.refs ? ' checked' : '') + '>参考文献</label><small>' + bib.length + ' 条被引文献</small></div>' +
      '<div class="opt-row"><label><input type="checkbox" data-opt="checkReport"' + (o.checkReport ? ' checked' : '') + '>附录：质量检查摘要</label><small>可选，便于答辩说明</small></div>' +
      '<div class="section-title" style="margin:14px 0 8px">引用样式</div>' +
      '<select class="select" id="expStyle" style="margin-bottom:12px">' +
      '<option value="gbt"' + (o.style === 'gbt' ? ' selected' : '') + '>GB/T 7714 顺序编码制</option>' +
      '<option value="ay"' + (o.style === 'ay' ? ' selected' : '') + '>作者-年制</option></select>' +
      '<div class="section-title" style="margin:4px 0 8px">文件格式</div>' +
      '<select class="select" id="expFormat">' +
      [['md', 'Markdown (.md)'], ['html', '独立网页 (.html)'], ['txt', '纯文本 (.txt)']].map(function (p) {
        return '<option value="' + p[0] + '"' + (o.format === p[0] ? ' selected' : '') + '>' + p[1] + '</option>';
      }).join('') + '</select>',
      { note: '打印 / PDF 走浏览器打印样式（A4、22mm 页边距、宋体正文），页码由浏览器生成。' }) +

    H.card('导出前校验',
      (pre.blocks.length
        ? pre.blocks.map(function (x) { return '<div class="checkline"><span class="no-ico">✕</span><span>' + U.esc(x) + '</span></div>'; }).join('')
        : '<div class="checkline"><span class="ok-ico">✓</span><span>结构、正文与引用均可导出</span></div>') +
      pre.warns.map(function (x) { return '<div class="checkline"><span class="wa-ico">!</span><span>' + U.esc(x) + '</span></div>'; }).join('') +
      (pre.warns.length
        ? '<label class="check" style="margin-top:10px' + (o.acknowledged ? ' on' : '') + '">' +
        '<input type="checkbox" id="ackWarn"' + (o.acknowledged ? ' checked' : '') + '>' +
        '<span>我已知悉上述警告，仍按当前状态导出<small>阻断项无法绕过，警告项需确认</small></span></label>'
        : '') +
      (blocked ? '<div style="margin-top:10px;font-size:12px;color:var(--bad)">存在阻断项，导出按钮已禁用。请先处理上述问题。</div>' : ''),
      { note: '校验只在导出时执行一次，不修改任何内容。' }) +

    H.card('统计',
      '<div class="grid grid-2">' +
      H.kpi('正文', U.num(pre.words) + '<small>字</small>', '章节 ' + (s.outline.sections || []).length + ' 节') +
      H.kpi('参考文献', String(bib.length) + '<small>条</small>', o.style === 'gbt' ? '顺序编码制' : '作者-年制') +
      '</div>') +
    '</div>' +

    '<div>' +
    H.card('成稿预览',
      '<div class="preview-page">' + html + '</div>',
      {
        actions: '<span class="badge ' + (blocked ? 'bad' : needAck ? 'warn' : 'ok') + '">' +
          (blocked ? '不可导出' : needAck ? '待确认' : '可导出') + '</span>',
        note: '预览使用与导出相同的组装逻辑；引文编号、章节编号与参考文献在此已确定。'
      }) +
    '</div>' +
    '</div>';

  /* --- 选项 --- */
  root.querySelectorAll('[data-opt]').forEach(function (el) {
    el.addEventListener('change', function () {
      o[el.getAttribute('data-opt')] = el.checked;
      Store.save();
      App.render();
    });
  });
  root.querySelector('#expStyle').addEventListener('change', function (e) {
    o.style = e.target.value;
    Store.save();
    App.render();
  });
  root.querySelector('#expFormat').addEventListener('change', function (e) {
    o.format = e.target.value;
    Store.save();
  });
  const ack = root.querySelector('#ackWarn');
  if (ack) ack.addEventListener('change', function () {
    o.acknowledged = ack.checked;
    Store.save();
    App.render();
  });

  const markExported = function () {
    s.meta.exportedAt = new Date().toISOString();
    Store.flush();
    renderChrome();
  };

  root.querySelector('#btnDownload').addEventListener('click', function () {
    if (disabled) return;
    const fmt = o.format || 'md';
    if (fmt === 'md') U.download(PaperBuild.filename(s, 'md'), PaperBuild.markdown(s, o), 'text/markdown');
    else if (fmt === 'html') U.download(PaperBuild.filename(s, 'html'), PaperBuild.standalone(s, o), 'text/html');
    else U.download(PaperBuild.filename(s, 'txt'), PaperBuild.plain(s, o), 'text/plain');
    markExported();
    PLToast.show('已导出 ' + fmt.toUpperCase() + ' 文件', 'ok');
  });

  root.querySelector('#btnPrint').addEventListener('click', function () {
    if (disabled) return;
    const pr = document.getElementById('printRoot');
    pr.innerHTML = PaperBuild.articleHtml(s, o);
    markExported();
    setTimeout(function () { window.print(); }, 80);
  });

  root.querySelector('#btnCopyMd').addEventListener('click', function () {
    U.copy(PaperBuild.markdown(s, o));
  });
};

/* ============================================================
   流程与接口说明
   ============================================================ */
Views.flow = function (root) {
  const s = Store.s;
  const p = Progress.of(s);
  const next = Progress.nextStep(s);

  const pipe = PLData.ioSpec.map(function (m, i) {
    const pr = p[m.id];
    return '<div class="pipe-node' + (pr && pr.part ? ' acc' : '') + '">' +
      '<b>' + (i + 1) + '. ' + U.esc(m.name) + '</b>' +
      '<small>' + U.esc(m.phase) + ' · ' + (pr ? Math.round(pr.ratio * 100) + '%' : '—') + '</small></div>';
  }).join('');

  root.innerHTML =
    H.head('设计说明',
      '流程、模块边界与数据接口',
      '八个模块按「准备 → 构建 → 收尾 → 交付」串成一条流水线。每个模块只做一件事，输入输出通过统一状态对象传递；门禁不阻断浏览，只影响完成度与导出校验。',
      '<button class="btn" data-nav="overview">回到总览</button>' +
      '<button class="btn btn-primary" data-nav="' + next.view + '">继续：' + U.esc(next.label) + '</button>') +

    H.card('流程图',
      '<div class="pipe">' + pipe + '</div>' +
      '<div style="font-size:12.2px;color:var(--muted);line-height:1.85;margin-top:8px">' +
      '实线为默认顺序，任意模块可随时跳转。箭头表示数据的单向流动：前序模块的产出是后续模块的输入，后续模块不回写前序（引用编号等派生数据由正文实时推导）。' +
      '</div>') +

    H.card('模块功能边界与输入输出',
      '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th style="width:130px">模块</th><th>功能边界（不做什么）</th><th>输入</th><th>输出</th><th style="width:110px">状态字段</th><th>衔接方式</th>' +
      '</tr></thead><tbody>' +
      PLData.ioSpec.map(function (m) {
        return '<tr><td><b>' + (m.phase) + ' · ' + U.esc(m.name) + '</b></td>' +
          '<td class="io-cell">' + U.esc(m.boundary) + '</td>' +
          '<td class="io-cell"><span class="io-lbl">输入</span>' + U.esc(m.input) + '</td>' +
          '<td class="io-cell"><span class="io-lbl">输出</span>' + U.esc(m.output) + '</td>' +
          '<td class="io-cell"><code>' + U.esc(m.state) + '</code></td>' +
          '<td class="io-cell">' + U.esc(m.next) + '<div style="margin-top:5px;color:var(--faint)">门禁：' + U.esc(m.guard) + '</div></td></tr>';
      }).join('') +
      '</tbody></table></div>') +

    '<div class="grid grid-2">' +
    H.card('数据契约（单一状态对象）',
      '<div style="font-family:var(--mono);font-size:11.5px;line-height:1.9;background:var(--surface-3);padding:12px;border-radius:8px;white-space:pre-wrap">' + U.esc(
        'state = {\n' +
        '  meta:     { title, author, org, field, degree,\n' +
        '              targetWords, abstract, keywords, exportedAt }\n' +
        '  topic:    { brief, candidates[], selected, weights,\n' +
        '              eval { question, gap, contribution, vars, checklist } }\n' +
        '  refs:     [{ id, type, authors, title, source, year,\n' +
        '              vol, issue, pages, doi, url, tags[], read, note }]\n' +
        '  outline:  { template, sections[{ id, level, title,\n' +
        '              target, text, guide }] }\n' +
        '  quality:  { ranAt, score, dims, issues[], ignored[], stamp }\n' +
        '  versions: [{ id, label, at, stats, data(JSON) }]\n' +
        '  todos:    [{ id, qid, text, done }]\n' +
        '  exportOpts:{ cover, abstract, toc, refs, checkReport,\n' +
        '              style, format, acknowledged }\n' +
        '  ai:       { provider, baseURL, model, temperature,\n' +
        '              maxTokens, timeout, stream, keyMode,\n' +
        '              include{section,outline,refs}, messages[] }\n' +
        '}') + '</div>',
      { note: '全部字段序列化为一个 JSON 存于 localStorage（键 paperlab.v1），可整体导出/导入。API Key 不在 state 内，单独存放于 paperlab.aikey.v1。' }) +

    H.card('派生数据（不存副本，避免不一致）',
      '<ul style="font-size:12.2px;color:var(--muted);line-height:1.9;padding-left:16px">' +
      '<li><b>引文编号</b>：扫描各节文本中 <code>[@id]</code> 的首次出现顺序，实时生成 1..n。</li>' +
      '<li><b>参考文献表</b>：编号 + 文献库字段，按 GB/T 7714 或作者-年制格式化。</li>' +
      '<li><b>完成度</b>：八阶段等权，逐阶段由各自的判定函数计算（如资料阶段 = 文献数/8，写作阶段 = 覆盖率 60% + 字数 40%）。</li>' +
      '<li><b>检查有效性</b>：<code>quality.stamp</code> 记录检查时的文本指纹；文本变更后自动标记「待复核」。</li>' +
      '<li><b>字数</b>：中文按字、英文按词累加，与多数学校口径一致。</li>' +
      '</ul>') +
    '</div>' +

    H.card('AI 协作（跨模块，不进流水线）',
      '<div style="font-size:12.4px;color:var(--muted);line-height:1.9">' +
      'AI 不占流水线阶段，也不改变任何模块的判定规则。它在任意阶段读取同一份状态（标题、研究问题、提纲、当前章节、文献题录），产出只进入对话区。' +
      '</div>' +
      '<ul style="font-size:12.2px;color:var(--muted);line-height:1.95;padding-left:16px;margin-top:8px">' +
      '<li><b>只读</b>：上下文拼装是纯函数，不修改 state；<code>context</code> 可用复选框裁剪（章节／提纲／文献）。</li>' +
      '<li><b>写入需确认</b>：模型输出必须由「采用到章节」触发，且可选择追加或替换；替换前会提示先存快照。</li>' +
      '<li><b>密钥隔离</b>：Key 存在 <code>paperlab.aikey.v1</code>，不进项目 JSON；支持会话内存、会话存储、AES-GCM 口令加密三种方式。</li>' +
      '<li><b>稳定性</b>：AbortController 超时、停止按钮、429/5xx 自动重试一次、流式解析失败回退整包 JSON、错误按状态码归类并给处置建议。</li>' +
      '<li><b>可追溯</b>：<code>ai.stats</code> 记录调用次数与耗时，<code>ai.lastTest</code> 保存最近一次连通性结果，便于排查。</li>' +
      '</ul>') +

    H.card('流程门禁规则',
      '<div class="table-wrap"><table class="tbl"><thead><tr><th style="width:150px">门禁</th><th>触发条件</th><th>行为</th></tr></thead><tbody>' +
      [
        ['选题未定', 'topic.selected 为空', '资料与提纲可浏览，但不计入完成度；导出不受影响（可先试写）'],
        ['研究问题缺失', 'eval.question 为空', '总览的「下一步」一直提示回到选题；检查会报「绪论无研究问题」'],
        ['文献不足', 'refs < 4 条', '引用检查提示密度过低；导出警告'],
        ['提纲为空', 'sections.length = 0', '写作页显示空状态并引导生成提纲'],
        ['未定义引用', '正文标记在文献库中不存在', '引用页标红；导出阻断（避免 [?] 出现在成稿）'],
        ['检查过期', 'quality.stamp ≠ 当前指纹', '得分标「待复核」；导出列为警告项'],
        ['警告未确认', '存在警告且未勾选知悉', '导出按钮禁用，勾选后放行'],
        ['版本未保存', 'versions 为空', '导出不受阻，但「下一步」建议先存快照']
      ].map(function (r) {
        return '<tr><td><b>' + r[0] + '</b></td><td>' + r[1] + '</td><td>' + r[2] + '</td></tr>';
      }).join('') +
      '</tbody></table></div>') +

    '<div class="grid grid-2">' +
    H.card('面向用户的交互约定',
      '<ul style="font-size:12.2px;color:var(--muted);line-height:1.9;padding-left:16px">' +
      '<li><b>三段式布局</b>：顶部流程条给出全局位置，左侧导航是模块入口，主区是按模块定制的工作台。</li>' +
      '<li><b>随处可跳转</b>：流程条、阶段卡片、检查项、待办都能直接跳到对应模块与章节。</li>' +
      '<li><b>即时反馈</b>：输入即存（500ms 防抖），字数/段落/引用数随输入更新，不打断写作。</li>' +
      '<li><b>破坏性操作二次确认</b>：删除章节、替换提纲、回滚版本、清空项目均弹确认，并在回滚前自动快照。</li>' +
      '<li><b>错误不静默</b>：存储失败、导入失败、引用缺失都有可见提示，不吞异常。</li>' +
      '<li><b>快捷键</b>：Ctrl+S 立即保存；Ctrl+Shift+C 在正文插入引用。</li>' +
      '</ul>') +
    H.card('设计取舍与已知限制',
      '<ul style="font-size:12.2px;color:var(--muted);line-height:1.9;padding-left:16px">' +
      '<li><b>用规则而非大模型</b>：规则可解释、可复现、离线运行，适合"检查"这类需要理由的任务；代价是无法判断论证是否真正成立。</li>' +
      '<li><b>不做联网查重</b>：仅做文本自重复与跨章相似度自查，正式查重仍需学校指定系统。</li>' +
      '<li><b>不代写</b>：写作模块只给结构、要点与句式模板，不生成正文，避免学术不端风险。</li>' +
      '<li><b>单机存储</b>：localStorage 容量约 5MB，超长论文请及时导出 JSON 备份。</li>' +
      '<li><b>章节标题作为对齐键</b>：版本对比按标题匹配，改标题会被计为「新增+删除」。</li>' +
      '</ul>') +
    '</div>';
};
