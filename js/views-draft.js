/* ============================================================
   论文工坊 PaperLab — 构建阶段视图
   提纲与结构 / 正文写作 / 引用与参考文献
   ============================================================ */

/* ---------------- 公共：章节编号 ---------------- */
function secNumbers(secs) {
  const map = {};
  let h = 0, sub = 0;
  (secs || []).forEach(function (x) {
    if (x.level === 1) { h++; sub = 0; map[x.id] = String(h); }
    else { sub++; map[x.id] = (h || 1) + '.' + sub; }
  });
  return map;
}

function secByIndex(s, id) {
  return (s.outline.sections || []).filter(function (x) { return x.id === id; })[0] || null;
}

/* ============================================================
   提纲与结构
   ============================================================ */
Views.outline = function (root) {
  const s = Store.s;
  const secs = s.outline.sections || [];
  const nums = secNumbers(secs);
  const total = U.budget(secs).total;
  const written = secs.reduce(function (a, b) { return a + U.wordsOf(b); }, 0);
  const target = Number(s.meta.targetWords) || 0;

  /* --- 结构诊断 --- */
  const l1 = secs.filter(function (x) { return x.level === 1; });
  const l2 = secs.filter(function (x) { return x.level === 2; });
  const diag = [];
  if (!secs.length) {
    diag.push({ ok: false, t: '尚未生成章节' });
  } else {
    diag.push({ ok: l1.length >= 4, t: '一级章节 ' + l1.length + ' 个（建议 4-6）' });
    diag.push({ ok: l2.length >= l1.length, t: '二级小节 ' + l2.length + ' 个' });
    const hasIntro = /绪论|引言|导论/.test(l1.map(function (x) { return x.title; }).join(' '));
    const hasEnd = /结论|结语|总结/.test(l1.map(function (x) { return x.title; }).join(' '));
    diag.push({ ok: hasIntro, t: hasIntro ? '包含绪论/引言' : '缺少绪论/引言' });
    diag.push({ ok: hasEnd, t: hasEnd ? '包含结论' : '缺少结论' });
    const dev = target > 0 ? Math.abs(total - target) / target : 0;
    diag.push({ ok: dev < 0.12, t: '字数预算合计 ' + U.num(total) + ' 字 / 目标 ' + U.num(target) + ' 字（偏差 ' + Math.round(dev * 100) + '%）' });
    const maxShare = written > 0 && l1.length ? Math.max.apply(null, l1.map(function (x) {
      let w = U.wordsOf(x);
      const i = secs.indexOf(x);
      for (let j = i + 1; j < secs.length && secs[j].level === 2; j++) w += U.wordsOf(secs[j]);
      return w;
    })) / written : 0;
    if (written > 800) diag.push({ ok: maxShare < 0.42, t: '最大章节占比 ' + Math.round(maxShare * 100) + '%' });
  }
  const okCount = diag.filter(function (x) { return x.ok; }).length;

  /* --- 模板选择 --- */
  const tplCards = PLData.outlineTemplates.map(function (t) {
    const on = s.outline.template === t.id;
    return '<div class="topic-card' + (on ? ' picked' : '') + '" style="gap:7px">' +
      '<span class="tc-tag">' + U.esc(t.name) + '</span>' +
      '<div style="font-size:12.3px;color:var(--muted);line-height:1.7;min-height:56px">' + U.esc(t.desc) + '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<span class="badge plain">' + t.sections.length + ' 节</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-sm' + (on ? ' btn-primary' : '') + '" data-tpl="' + t.id + '">' + (on ? '重新应用' : '应用模板') + '</button>' +
      '</div></div>';
  }).join('');

  /* --- 章节树 --- */
  const rows = secs.map(function (x, i) {
    const w = U.wordsOf(x);
    const t = Number(x.target) || 0;
    const ratio = t ? w / t : 0;
    return '<div class="tree-row lvl' + x.level + '" data-row="' + x.id + '">' +
      '<span class="tr-num">' + U.esc(nums[x.id] || '') + '</span>' +
      '<input class="tr-title" data-stitle="' + x.id + '" value="' + U.attr(x.title) + '">' +
      '<input class="tr-target" type="number" min="0" step="100" data-starget="' + x.id + '" value="' + t + '" title="目标字数">' +
      '<span class="tr-act">' +
      (w > 0 ? '<span class="badge ' + (ratio > 0.85 ? 'ok' : ratio > 0.3 ? 'warn' : 'plain') + '" style="margin-right:2px">' + w + '字</span>' : '') +
      '<button class="icon-btn" data-oact="up" data-id="' + x.id + '" title="上移">↑</button>' +
      '<button class="icon-btn" data-oact="down" data-id="' + x.id + '" title="下移">↓</button>' +
      '<button class="icon-btn" data-oact="' + (x.level === 1 ? 'in' : 'out') + '" data-id="' + x.id + '" title="' + (x.level === 1 ? '降为子节' : '升为一级') + '">' + (x.level === 1 ? '⇥' : '⇤') + '</button>' +
      '<button class="icon-btn" data-oact="add" data-id="' + x.id + '" title="在其后插入一节">＋</button>' +
      '<button class="icon-btn danger" data-oact="del" data-id="' + x.id + '" title="删除">✕</button>' +
      '</span></div>';
  }).join('');

  root.innerHTML =
    H.head('模块 03 · 构建',
      '提纲与结构生成',
      '选择范式模板 → 生成两级章节树 → 调整顺序与字数预算。本模块只产出结构与预算，不生成正文；结构一旦变化，写作目录与检查口径同步更新。',
      '<button class="btn" id="btnAddSec">+ 新增一级章节</button>' +
      '<button class="btn btn-primary" data-nav="writing">进入写作 →</button>') +

    H.card('结构诊断',
      '<div class="row" style="align-items:center;gap:16px">' +
      '<div style="flex:0 0 auto;display:flex;align-items:baseline;gap:6px"><span style="font-family:var(--serif);font-size:26px;color:var(--accent-ink)">' + okCount + '</span>' +
      '<span style="font-size:12px;color:var(--muted)">/ ' + diag.length + ' 项通过</span></div>' +
      '<div class="chips" style="flex:1 1 300px">' +
      diag.map(function (d) { return '<span class="badge ' + (d.ok ? 'ok' : 'warn') + '">' + (d.ok ? '✓ ' : '! ') + U.esc(d.t) + '</span>'; }).join('') +
      '</div></div>',
      { note: '诊断只针对结构（完整性、层次、预算），不评价论点质量。' }) +

    '<div class="section-title">范式模板</div>' +
    '<div class="topic-grid" style="margin-bottom:18px">' + tplCards + '</div>' +

    '<div class="section-title">章节树</div>' +
    H.card('',
      (secs.length
        ? '<div class="tree">' + rows + '</div>'
        : H.empty('还没有章节', '选择上面的范式模板一键生成，或手工新增一级章节。生成后每节都可以改标题、调层级、改预算。')) +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:14px;padding-top:12px;border-top:1px dashed var(--line);font-size:12px;color:var(--muted)">' +
      '<span>目标总字数 <b style="color:var(--ink)">' + U.num(total) + '</b></span>' +
      '<span>已写 <b style="color:var(--ink)">' + U.num(written) + '</b></span>' +
      '<span>进度 ' + H.bar(total ? written / total : 0, 'thin') + '</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn btn-sm" id="btnRedist">按目标字数重新分配</button>' +
      '</div>',
      { note: '提示：字数预算是「检查」判断篇幅失衡的基准，建议与导师要求或期刊规范对齐。' }) +

    H.card('提纲导出的下游用途',
      '<div class="grid grid-3" style="font-size:12.2px;color:var(--muted)">' +
      '<div><b style="color:var(--ink-2)">→ 写作</b><br>章节树成为写作目录，每节带目标字数与写作要点。</div>' +
      '<div><b style="color:var(--ink-2)">→ 检查</b><br>空章节、篇幅偏差、缺少绪论/结论都以此为依据。</div>' +
      '<div><b style="color:var(--ink-2)">→ 导出</b><br>按层级自动编号（1 / 1.1），生成目录页。</div>' +
      '</div>');

  /* --- 模板应用 --- */
  root.querySelectorAll('[data-tpl]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-tpl');
      const tpl = PLData.outlineTemplates.filter(function (x) { return x.id === id; })[0];
      if (!tpl) return;
      const apply = function () {
        const target = Number(s.meta.targetWords) || 12000;
        s.outline.template = id;
        s.outline.sections = tpl.sections.map(function (x) {
          return {
            id: U.uid('sec'), level: x.level, title: x.title,
            target: 0, text: '', guide: x.guide || ''
          };
        });
        U.assignTargets(s.outline.sections, tpl, target);
        Store.save();
        App.render();
        PLToast.show('已生成 ' + tpl.sections.length + ' 节提纲', 'ok');
      };
      if (secs.some(function (x) { return (x.text || '').trim(); })) {
        PLModal.confirm({
          title: '替换现有提纲',
          body: '当前章节已有正文内容。应用新模板会重建章节树，已写内容将无法对应（建议先在「修改与版本」保存快照）。',
          ok: '仍然替换', danger: true
        }).then(function (ok) { if (ok) apply(); });
      } else apply();
    });
  });

  /* --- 树编辑 --- */
  root.querySelectorAll('[data-stitle]').forEach(function (el) {
    el.addEventListener('input', function () {
      const sec = secByIndex(s, el.getAttribute('data-stitle'));
      if (sec) { sec.title = el.value; Store.save(); }
    });
    el.addEventListener('change', function () { renderChrome(); });
  });
  root.querySelectorAll('[data-starget]').forEach(function (el) {
    el.addEventListener('input', function () {
      const sec = secByIndex(s, el.getAttribute('data-starget'));
      if (!sec) return;
      sec.target = Number(el.value) || 0;
      /* 编辑子节时同步父章节预算，保持「父 = 子节之和」 */
      if (sec.level === 2) {
        const i = secs.indexOf(sec);
        let p = null;
        for (let j = i - 1; j >= 0; j--) { if (secs[j].level === 1) { p = secs[j]; break; } }
        if (p) {
          let sum = 0;
          const pi = secs.indexOf(p);
          for (let k = pi + 1; k < secs.length && secs[k].level === 2; k++) sum += Number(secs[k].target) || 0;
          p.target = sum;
          const pel = root.querySelector('[data-starget="' + p.id + '"]');
          if (pel) pel.value = sum;
        }
      }
      Store.save();
    });
  });

  root.querySelectorAll('[data-oact]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const act = btn.getAttribute('data-oact');
      const id = btn.getAttribute('data-id');
      const i = secs.findIndex(function (x) { return x.id === id; });
      if (i < 0) return;
      const cur = secs[i];

      if (act === 'up') {
        if (i === 0) return;
        if (cur.level === 2) {
          if (secs[i - 1].level === 1) { PLToast.show('子节不能移到本章之前', 'warn'); return; }
          secs.splice(i - 1, 0, secs.splice(i, 1)[0]);
        } else {
          /* 一级章节整章（含子节）上移 */
          let end = i + 1;
          while (end < secs.length && secs[end].level === 2) end++;
          const block = secs.splice(i, end - i);
          let t = i - 1;
          while (t > 0 && secs[t].level === 2) t--;
          secs.splice(t, 0, block[0]);
          for (let k = 1; k < block.length; k++) secs.splice(t + k, 0, block[k]);
        }
      } else if (act === 'down') {
        if (i === secs.length - 1) return;
        if (cur.level === 2) {
          if (secs[i + 1].level === 1) { PLToast.show('子节不能移到下一章之后', 'warn'); return; }
          secs.splice(i + 1, 0, secs.splice(i, 1)[0]);
        } else {
          let end = i + 1;
          while (end < secs.length && secs[end].level === 2) end++;
          const block = secs.splice(i, end - i);
          let t = i;
          if (secs[t] && secs[t].level === 1) {
            t++;
            while (t < secs.length && secs[t].level === 2) t++;
          }
          for (let k = 0; k < block.length; k++) secs.splice(t + k, 0, block[k]);
        }
      } else if (act === 'in') {
        if (i === 0) { PLToast.show('第一节不能降级', 'warn'); return; }
        cur.level = 2;
      } else if (act === 'out') {
        cur.level = 1;
      } else if (act === 'add') {
        const ns = { id: U.uid('sec'), level: cur.level, title: '新章节', target: 500, text: '', guide: '' };
        secs.splice(i + 1, 0, ns);
      } else if (act === 'del') {
        const w = U.wordsOf(cur);
        const doDel = function () {
          s.outline.sections = secs.filter(function (x) { return x.id !== id; });
          if (s.ui.secId === id) s.ui.secId = null;
          Store.save();
          App.render();
        };
        if (w > 0) {
          PLModal.confirm({
            title: '删除章节',
            body: '「' + U.esc(cur.title) + '」已有 ' + w + ' 字正文，删除后无法恢复（除版本回滚外）。确认删除？',
            ok: '删除', danger: true
          }).then(function (ok) { if (ok) doDel(); });
        } else doDel();
        return;
      }
      Store.save();
      App.render();
    });
  });

  root.querySelector('#btnAddSec').addEventListener('click', function () {
    s.outline.sections.push({ id: U.uid('sec'), level: 1, title: '新章节', target: 800, text: '', guide: '' });
    Store.save();
    App.render();
  });

  root.querySelector('#btnRedist').addEventListener('click', function () {
    const target = Number(s.meta.targetWords) || 0;
    if (!target) { PLToast.show('先在项目总览填写目标字数', 'warn'); return; }
    if (!secs.length) return;
    const tpl = PLData.outlineTemplates.filter(function (x) { return x.id === s.outline.template; })[0];
    const hasMatch = tpl && secs.some(function (sec) {
      return tpl.sections.some(function (x) { return x.title === sec.title && x.level === sec.level; });
    });
    /* 有模板按模板权重；改过标题的提纲按现有预算比例缩放 */
    const useTpl = hasMatch ? tpl : {
      sections: secs.map(function (sec) {
        return { title: sec.title, level: sec.level, w: Math.max(1, Number(sec.target) || (sec.level === 1 ? 4 : 2)) };
      })
    };
    U.assignTargets(secs, useTpl, target);
    Store.save();
    App.render();
    PLToast.show('预算已按目标字数重新分配', 'ok');
  });
};

/* ============================================================
   正文写作
   ============================================================ */
function sectionQuickIssues(s, sec) {
  const out = [];
  const text = (sec && sec.text) || '';
  const target = Number(sec && sec.target) || 0;
  const w = U.countWords(text);

  if (!text.trim()) {
    out.push({ sev: 'low', t: '本节尚未开始', d: '建议先写 3-5 句的「论证骨架」，再逐段扩写。' });
    return out;
  }
  if (target && w < target * 0.4) out.push({ sev: 'mid', t: '字数偏少（' + w + ' / ' + target + '）', d: '可能是论证未展开，先补证据与反例，而不是凑字。' });
  if (target && w > target * 2.2) out.push({ sev: 'mid', t: '字数超出预算 ' + Math.round(w / target * 100) + '%', d: '检查是否与其他章节重复，或把细节移入附录。' });

  const sents = CheckEngine.sentences(text);
  const longs = sents.filter(function (x) { return U.countWords(x) > 95; });
  if (longs.length) out.push({ sev: 'mid', t: longs.length + ' 个超长句', d: '例：「' + longs[0].slice(0, 28) + '…」建议在转折处断句。' });

  const col = PLData.lexicon.colloquial.filter(function (x) { return text.indexOf(x) >= 0; });
  if (col.length) out.push({ sev: 'mid', t: '口语化表达：' + col.slice(0, 4).join('、'), d: '替换为可量化的表述。' });

  const vague = PLData.lexicon.vague.filter(function (x) { return text.indexOf(x) >= 0; });
  if (vague.length >= 2) out.push({ sev: 'low', t: '模糊限定词较多：' + vague.slice(0, 4).join('、'), d: '保留一个，其余改为条件句。' });

  const half = (text.match(/[\u4e00-\u9fa5][,;:!?()][\u4e00-\u9fa5]/g) || []);
  if (half.length) out.push({ sev: 'mid', t: '中英文标点混用 ' + half.length + ' 处', d: '统一为全角标点。' });

  const tokens = CheckEngine.tokens(text);
  const undef = Array.from(new Set(tokens.filter(function (id) { return !Cite.refById(s, id); })));
  if (undef.length) out.push({ sev: 'high', t: '未定义引用：' + undef.slice(0, 3).join('、'), d: '文献库中没有这些 ID，导出会显示为 [?]。' });

  const chapters = CheckEngine.paras(text);
  const weakClaim = chapters.filter(function (p) {
    return /因此|所以|表明|说明/.test(p) && !/\[@|表\s*\d|图\s*\d|\d+(\.\d+)?%/.test(p) && U.countWords(p) > 100;
  });
  if (weakClaim.length) out.push({ sev: 'low', t: weakClaim.length + ' 处结论缺少证据', d: '补文献引用、数据结果或案例事实。' });

  return out;
}

function insertAtCursor(ta, text) {
  if (!ta) return;
  const start = ta.selectionStart == null ? ta.value.length : ta.selectionStart;
  const end = ta.selectionEnd == null ? ta.value.length : ta.selectionEnd;
  ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
  ta.selectionStart = ta.selectionEnd = start + text.length;
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

function openCitePicker(s, onPick) {
  const refs = s.refs || [];
  if (!refs.length) { PLToast.show('文献库为空，请先到「资料」添加文献', 'warn'); return; }
  const items = refs.map(function (r) {
    const n = Cite.numberMap(s)[r.id];
    return '<button class="phrase" style="display:flex;gap:8px;align-items:flex-start;text-align:left" data-pickref="' + r.id + '">' +
      '<span class="badge ' + (n ? 'info' : 'plain') + '" style="flex:0 0 auto">' + (n ? '[' + n + ']' : '未引') + '</span>' +
      '<span style="flex:1"><b style="font-size:12.3px">' + U.esc(r.title || '（无题名）') + '</b>' +
      '<span style="display:block;font-size:11.3px;color:var(--muted)">' + U.esc(r.authors || '佚名') + ' · ' + U.esc(r.year || '') + ' · ' + U.esc(r.source || '') + '</span></span>' +
      '</button>';
  }).join('');

  PLModal.open({
    title: '插入引用',
    wide: true,
    body: '<div class="field"><input class="input" id="citeSearch" placeholder="搜索题名 / 作者 / 标签" autofocus></div>' +
      '<div id="citeList" style="max-height:52vh;overflow-y:auto">' + items + '</div>' +
      '<div class="hint" style="font-size:11.5px;color:var(--muted);margin-top:8px">插入的是 [@文献ID] 标记，导出时自动转成 [1] 或 (作者, 年)。编号按正文首次出现顺序生成。</div>',
    onMount: function (m) {
      const search = m.querySelector('#citeSearch');
      search.addEventListener('input', function () {
        const q = search.value.toLowerCase();
        m.querySelectorAll('[data-pickref]').forEach(function (el) {
          const txt = el.textContent.toLowerCase();
          el.style.display = txt.indexOf(q) >= 0 ? '' : 'none';
        });
      });
      m.querySelectorAll('[data-pickref]').forEach(function (el) {
        el.addEventListener('click', function () {
          PLModal.close();
          onPick(el.getAttribute('data-pickref'));
        });
      });
      setTimeout(function () { search.focus(); }, 60);
    }
  });
}

Views.writing = function (root) {
  const s = Store.s;
  const secs = s.outline.sections || [];
  if (!secs.length) {
    root.innerHTML = H.head('模块 04 · 构建', '正文写作', '按章节推进，每节有目标字数、写作要点与实时指标。') +
      H.empty('还没有章节，无法写作', '先到「提纲与结构」生成章节树；也可以直接导入现成的 .md / .docx，按标题自动建章节。',
        '<button class="btn btn-primary" data-nav="outline">去生成提纲</button>' +
        '<button class="btn" id="btnImportEmpty" style="margin-left:8px">导入 .md / .txt / .docx</button>');
    const b = root.querySelector('#btnImportEmpty');
    if (b) b.addEventListener('click', function () {
      if (typeof Importer === 'object') Importer.pick('.md,.markdown,.txt,.docx');
    });
    return;
  }

  let curId = s.ui.secId;
  if (curId !== '__front' && !secs.some(function (x) { return x.id === curId; })) curId = secs[0].id;
  s.ui.secId = curId;

  const isFront = curId === '__front';
  const cur = isFront ? null : secByIndex(s, curId);
  const nums = secNumbers(secs);
  const idx = isFront ? -1 : secs.indexOf(cur);
  const prevId = isFront ? null : (idx > 0 ? secs[idx - 1].id : '__front');
  const nextId = isFront ? (secs[0] ? secs[0].id : null) : (idx < secs.length - 1 ? secs[idx + 1].id : null);

  const totalWords = secs.reduce(function (a, b) { return a + U.wordsOf(b); }, 0);
  const targetAll = U.budget(secs).total;

  const listHtml = '<button class="sec-item' + (isFront ? ' on' : '') + '" data-sec="__front">' +
    '<span class="si-top"><span class="si-t">摘要与关键词</span><span class="si-n">前置</span></span>' +
    '<span class="si-n" style="color:' + (s.meta.abstract ? 'var(--ok)' : 'var(--faint)') + '">' + (s.meta.abstract ? U.countWords(s.meta.abstract) + ' 字' : '未填写') + '</span>' +
    '</button>' +
    secs.map(function (x) {
      const w = U.wordsOf(x);
      const t = Number(x.target) || 0;
      const ratio = t ? w / t : 0;
      const cls = w === 0 ? 'todo' : ratio >= 0.85 ? 'done' : 'part';
      return '<button class="sec-item lvl' + x.level + (x.id === curId ? ' on' : '') + '" data-sec="' + x.id + '">' +
        '<span class="si-top"><span class="si-n">' + U.esc(nums[x.id]) + '</span>' +
        '<span class="si-t">' + U.esc(x.title) + '</span>' +
        '<span class="nv-dot ' + cls + '" style="flex:0 0 auto"></span></span>' +
        '<span class="si-n" style="padding-left:2px">' + (w ? w + ' / ' + t + ' 字' : '目标 ' + t + ' 字') + '</span>' +
        '</button>';
    }).join('');

  const guide = isFront ? {
    points: ['摘要按「问题—方法—结果—结论」四句结构写，200-400 字。', '用过去时陈述已完成的工作，不写"本文将"。', '不放引用、图表、公式编号。', '关键词 3-6 个，覆盖对象、方法、场景。'],
    risks: ['摘要出现"具有重要意义"等空话', '摘要结论超出正文证据', '关键词与题名重复堆叠'],
    phrases: ['本文以……为对象，采用……方法，考察……', '研究发现：第一，……；第二，……', '研究表明，……，其边界条件为……']
  } : PLData.guideFor(cur.title);

  const cited = isFront ? [] : CheckEngine.tokens(cur.text).map(function (id) { return Cite.refById(s, id); }).filter(Boolean);
  const uniqCited = [];
  cited.forEach(function (r) { if (!uniqCited.some(function (x) { return x.id === r.id; })) uniqCited.push(r); });
  const quick = isFront ? [] : sectionQuickIssues(s, cur);
  const map = Cite.numberMap(s);

  const wordsNow = isFront ? U.countWords(s.meta.abstract) : U.wordsOf(cur);
  const targetNow = isFront ? 350 : (Number(cur && cur.target) || 0);
  const refNotes = (s.refs || []).filter(function (r) { return (r.note || '').trim(); }).slice(0, 3);

  root.innerHTML =
    H.head('模块 04 · 构建',
      '正文写作',
      '左侧目录、中间稿纸、右侧引导。当前章节：<b>' + (isFront ? '摘要与关键词' : U.esc(cur.title)) + '</b>（' + U.num(wordsNow) + ' 字）。输入即自动保存到本机。',
      '<button class="btn btn-sm" id="btnPrevSec"' + (prevId ? '' : ' disabled') + '>← 上一节</button>' +
      '<button class="btn btn-sm" id="btnNextSec"' + (nextId ? '' : ' disabled') + '>下一节 →</button>' +
      '<button class="btn btn-primary btn-sm" data-nav="citations">引用检查 →</button>') +

    '<div class="write-grid">' +

    /* 左：目录 */
    '<div class="card flush">' +
    '<div class="card-head"><h3>目录</h3><div class="spacer"></div><span class="badge plain">' + U.num(totalWords) + ' / ' + U.num(targetAll) + '</span></div>' +
    '<div class="sec-list">' + listHtml + '</div>' +
    '<div class="card-note" style="font-size:11px">绿点＝接近目标｜黄点＝进行中｜灰点＝未开始</div>' +
    '</div>' +

    /* 中：编辑器 */
    '<div class="card flush editor-wrap">' +
    '<div class="card-head">' +
    '<h3>' + (isFront ? '摘要与关键词' : '<span style="color:var(--faint);font-family:var(--mono);font-size:12px;margin-right:6px">' + U.esc(nums[curId] || '') + '</span>' + U.esc(cur.title)) + '</h3>' +
    '<div class="spacer"></div>' +
    '<span class="badge ' + (wordsNow >= targetNow * 0.85 ? 'ok' : wordsNow > 0 ? 'warn' : 'plain') + '" id="secCount">' + U.num(wordsNow) + ' / ' + U.num(targetNow) + ' 字</span>' +
    '<span style="font-size:11.5px;color:var(--faint);white-space:nowrap"><span id="mp">' + U.countParas(isFront ? s.meta.abstract : (cur && cur.text)) + ' 段</span> · <span id="mc">' + uniqCited.length + ' 引用</span></span>' +
    '</div>' +
    '<div class="editor-toolbar">' +
    (isFront
      ? '<span style="font-size:11.5px;color:var(--muted)">摘要与关键词会进入导出封面页，并参与格式检查。</span>'
      : '<button class="btn btn-xs" id="btnCite">❝ 插入引用</button>' +
      '<div class="sep"></div>' +
      '<select class="select" id="transSel" style="width:auto;padding:4px 26px 4px 8px;font-size:12px">' +
      '<option value="">插入过渡句…</option>' +
      Object.keys(PLData.transitions).map(function (k) {
        return '<optgroup label="' + k + '">' + PLData.transitions[k].map(function (p, i) {
          return '<option value="' + U.attr(p) + '">' + U.esc(p) + '</option>';
        }).join('') + '</optgroup>';
      }).join('') + '</select>' +
      '<button class="btn btn-xs" id="btnFig">+ 图表占位</button>' +
      '<button class="btn btn-xs" id="btnImportText">导入文档</button>' +
      '<div class="sep"></div>' +
      '<button class="btn btn-xs" id="btnCheckSec">本节点体检</button>' +
      '<button class="btn btn-xs" id="btnAiHelp">AI 辅助</button>') +
    '</div>' +

    (isFront
      ? '<textarea id="paperText" spellcheck="false" placeholder="按「问题—方法—结果—结论」写 200-400 字摘要……">' + U.esc(s.meta.abstract) + '</textarea>' +
      '<div style="padding:14px 20px;border-top:1px solid var(--line);background:var(--surface-2)">' +
      '<div class="field" style="margin:0"><label>关键词（3-6 个，用分号或逗号分隔）</label>' +
      '<input class="input" id="kwInput" value="' + U.attr(s.meta.keywords) + '" placeholder="例：生成式人工智能；教学效能；认知负荷">' +
      '<span class="hint">当前 ' + String(s.meta.keywords || '').split(/[,，;；、\s]+/).filter(Boolean).length + ' 个关键词</span></div></div>'
      : '<textarea id="paperText" spellcheck="false" placeholder="从一句话判断开始：本节要回答什么？然后用证据支撑它。\n\n提示：按 Ctrl+Shift+C 插入引用，Ctrl+S 立即保存。">' + U.esc(cur.text) + '</textarea>') +
    '</div>' +

    /* 右：引导 */
    '<div class="side-panel">' +
    '<div class="card">' +
    '<div class="card-head" style="padding:11px 14px"><h3 style="font-size:12.5px">写作引导</h3><div class="spacer"></div><span class="badge plain">' + (isFront ? '前置部分' : '按标题匹配') + '</span></div>' +
    '<div class="card-body" style="padding:13px 14px">' +
    '<div class="guide-block"><h5>写作要点</h5><ul>' + guide.points.map(function (p) { return '<li>' + U.esc(p) + '</li>'; }).join('') + '</ul></div>' +
    '<div class="guide-block risk" style="margin-top:9px"><h5>常见问题</h5><ul>' + guide.risks.map(function (p) { return '<li>' + U.esc(p) + '</li>'; }).join('') + '</ul></div>' +
    '<div class="guide-block" style="margin-top:9px"><h5>句式模板（点击插入）</h5>' +
    guide.phrases.map(function (p) { return '<button class="phrase" data-phrase="' + U.attr(p) + '">' + U.esc(p) + '</button>'; }).join('') +
    '</div>' +
    '</div></div>' +

    '<div class="card">' +
    '<div class="card-head" style="padding:11px 14px"><h3 style="font-size:12.5px">本节指标</h3></div>' +
    '<div class="card-body" style="padding:13px 14px">' +
    '<div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--muted);margin-bottom:5px">' +
    '<span>字数进度</span><b style="color:var(--ink)">' + Math.round(targetNow ? wordsNow / targetNow * 100 : 0) + '%</b></div>' +
    H.bar(targetNow ? wordsNow / targetNow : 0) +
    (isFront ? '' :
      '<div class="field" style="margin:12px 0 0"><label style="font-size:11.5px">调整本节目标字数</label>' +
      '<input class="input" type="number" min="0" step="100" id="secTarget" value="' + targetNow + '" style="padding:4px 8px;font-size:12.5px"></div>') +
    '<div style="display:flex;gap:12px;margin-top:12px;font-size:11.5px;color:var(--muted);flex-wrap:wrap">' +
    '<span>段落 <b style="color:var(--ink-2)">' + U.countParas(isFront ? s.meta.abstract : (cur && cur.text)) + '</b></span>' +
    '<span>长句 <b style="color:var(--ink-2)">' + (isFront ? 0 : CheckEngine.sentences(cur.text).filter(function (x) { return U.countWords(x) > 95; }).length) + '</b></span>' +
    '<span>引用 <b style="color:var(--ink-2)">' + uniqCited.length + '</b></span>' +
    '</div>' +
    (uniqCited.length
      ? '<div class="chips" style="margin-top:10px">' + uniqCited.map(function (r) {
        return '<span class="badge info" title="' + U.attr(r.title) + '">[' + (map[r.id] || '?') + '] ' + U.esc((r.authors || '').split(/[,;、]/)[0] || '佚名') + '</span>';
      }).join('') + '</div>'
      : '') +
    '</div></div>' +

    '<div class="card">' +
    '<div class="card-head" style="padding:11px 14px"><h3 style="font-size:12.5px">即时提示</h3><div class="spacer"></div>' +
    '<span class="badge ' + (quick.some(function (x) { return x.sev === 'high'; }) ? 'bad' : quick.length ? 'warn' : 'ok') + '">' + (quick.length || '无') + '</span></div>' +
    '<div class="card-body" style="padding:8px 14px 12px" id="quickBox">' +
    (quick.length
      ? quick.slice(0, 6).map(function (x) {
        return '<div class="mini-issue"><span class="sev ' + (x.sev === 'high' ? 'high' : x.sev === 'mid' ? 'mid' : 'low') + '"></span>' +
          '<span><b style="font-size:11.8px;color:var(--ink)">' + U.esc(x.t) + '</b>' +
          '<span style="display:block;color:var(--muted);font-size:11.5px;line-height:1.6">' + U.esc(x.d) + '</span></span></div>';
      }).join('')
      : '<div style="font-size:11.8px;color:var(--muted)">本节未触发即时规则。完整检查请到「质量检查」。</div>') +
    '</div></div>' +

    (refNotes.length
      ? '<div class="card"><div class="card-head" style="padding:11px 14px"><h3 style="font-size:12.5px">文献笔记</h3><div class="spacer"></div><button class="btn-link" data-nav="refs">全部</button></div>' +
      '<div class="card-body" style="padding:10px 14px">' + refNotes.map(function (r) {
        return '<div style="font-size:11.8px;margin-bottom:8px"><b style="color:var(--ink-2)">' + U.esc((r.authors || '').split(/[,;、]/)[0]) + '（' + U.esc(r.year || '') + '）</b>' +
          '<div style="color:var(--muted);line-height:1.65">' + U.esc(r.note) + '</div></div>';
      }).join('') + '</div></div>'
      : '') +
    '</div>' +
    '</div>';

  /* --- 目录切换 --- */
  root.querySelectorAll('[data-sec]').forEach(function (el) {
    el.addEventListener('click', function () {
      s.ui.secId = el.getAttribute('data-sec');
      Store.flush();
      App.render();
      const ta = document.getElementById('paperText');
      if (ta) ta.focus();
    });
  });

  const ta = root.querySelector('#paperText');
  const kwInput = root.querySelector('#kwInput');

  /* --- 输入即保存 --- */
  ta.addEventListener('input', function () {
    if (isFront) s.meta.abstract = ta.value;
    else cur.text = ta.value;
    Store.save();

    const w = U.countWords(ta.value);
    const mw = document.getElementById('mw');
    if (mw) mw.textContent = w + ' 字';
    const mp = document.getElementById('mp');
    if (mp) mp.textContent = U.countParas(ta.value) + ' 段';
    const badge = document.getElementById('secCount');
    if (badge && !isFront) badge.textContent = w + ' / ' + targetNow + ' 字';
  });

  if (kwInput) {
    kwInput.addEventListener('input', function () {
      s.meta.keywords = kwInput.value;
      Store.save();
    });
  }

  /* --- 快捷键 --- */
  ta.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      Store.flush();
      PLToast.show('已立即保存', 'ok');
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'c') {
      e.preventDefault();
      if (!isFront) openCitePicker(s, function (id) { insertAtCursor(ta, '[@' + id + ']'); });
    }
  });

  /* --- 工具栏 --- */
  const btnCite = root.querySelector('#btnCite');
  if (btnCite) btnCite.addEventListener('click', function () {
    openCitePicker(s, function (id) { insertAtCursor(ta, '[@' + id + ']'); });
  });

  const transSel = root.querySelector('#transSel');
  if (transSel) transSel.addEventListener('change', function () {
    if (!transSel.value) return;
    insertAtCursor(ta, transSel.value);
    transSel.value = '';
  });

  const btnFig = root.querySelector('#btnFig');
  if (btnFig) btnFig.addEventListener('click', function () {
    const n = (nums[curId] || '1') + '-' + (CheckEngine.paras(ta.value).length + 1);
    insertAtCursor(ta, '\n[图 ' + n + ' 图题：请在导出前替换为真实图表说明]\n');
  });

  const btnImportText = root.querySelector('#btnImportText');
  if (btnImportText) btnImportText.addEventListener('click', function () {
    if (typeof Importer === 'object') Importer.pick('.md,.markdown,.txt,.docx');
  });

  const btnAi = root.querySelector('#btnAiHelp');
  if (btnAi) btnAi.addEventListener('click', function () {
    cur.text = ta.value;                       /* 先落盘当前编辑内容，保证 AI 读到最新文本 */
    const act = isFront ? 'abstract' : 'polish';
    Store.s.ai.pending = { action: act, secId: (cur && cur.id) || null, draft: AI.actionPrompt(Store.s, act, '') };
    Store.save();
    App.go('ai');
  });

  const btnCheck = root.querySelector('#btnCheckSec');
  if (btnCheck) btnCheck.addEventListener('click', function () {
    cur.text = ta.value;
    const res = CheckEngine.run(Store.s, { logic: true, language: true, format: false, citation: true, dup: false });
    const mine = res.issues.filter(function (x) { return x.secId === cur.id; });
    PLModal.open({
      title: '本节体检 · ' + cur.title,
      wide: true,
      body: mine.length
        ? mine.map(function (x) {
          return '<div class="issue ' + (x.sev === 'high' ? 'high' : x.sev === 'mid' ? 'mid' : 'low') + '">' +
            '<div class="i-sev"><span class="badge ' + (x.sev === 'high' ? 'bad' : x.sev === 'mid' ? 'warn' : 'plain') + '">' + (x.sev === 'high' ? '高' : x.sev === 'mid' ? '中' : '低') + '</span></div>' +
            '<div class="i-main"><div class="i-title">' + U.esc(x.title) + '</div><div class="i-desc">' + U.esc(x.desc) + '</div>' +
            '<div class="i-fix"><b>建议：</b>' + U.esc(x.fix) + '</div></div><div></div></div>';
        }).join('')
        : '<div class="empty"><h4>本节未发现问题</h4><p>规则未命中不代表论证一定成立，仍需人工复核引文与逻辑。</p></div>',
      footer: '<button class="btn" data-close="1">关闭</button>'
    });
  });

  /* --- 句式插入 --- */
  root.querySelectorAll('[data-phrase]').forEach(function (el) {
    el.addEventListener('click', function () {
      insertAtCursor(ta, el.getAttribute('data-phrase'));
    });
  });

  /* --- 目标字数 --- */
  const secTarget = root.querySelector('#secTarget');
  if (secTarget) secTarget.addEventListener('input', function () {
    cur.target = Number(secTarget.value) || 0;
    Store.save();
  });

  /* --- 上下节 --- */
  const bp = root.querySelector('#btnPrevSec');
  if (bp) bp.addEventListener('click', function () {
    if (!prevId) return;
    s.ui.secId = prevId;
    Store.flush();
    App.render();
  });
  const bn = root.querySelector('#btnNextSec');
  if (bn) bn.addEventListener('click', function () {
    if (!nextId) return;
    s.ui.secId = nextId;
    Store.flush();
    App.render();
  });
};

/* ============================================================
   引用与参考文献
   ============================================================ */
function citeLocations(s, id) {
  const re = new RegExp('\\[@' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]');
  return (s.outline.sections || []).filter(function (x) { return re.test(x.text || ''); }).map(function (x) { return x.title; });
}

Views.citations = function (root) {
  const s = Store.s;
  const map = Cite.numberMap(s);
  const order = Cite.order(s);
  const undef = Cite.undefinedIds(s);
  const uncited = Cite.uncited(s);
  const style = s.exportOpts.style || 'gbt';
  const totalTokens = (s.outline.sections || []).reduce(function (a, x) { return a + CheckEngine.tokens(x.text).length; }, 0);

  const rows = order.map(function (id, i) {
    const r = Cite.refById(s, id);
    if (!r) {
      return '<tr><td class="num">' + (i + 1) + '</td>' +
        '<td><div class="t-main" style="color:var(--bad)">未定义引用 [@' + U.esc(id) + ']</div>' +
        '<div class="t-sub">文献库中没有该 ID，导出会显示 [?]</div></td>' +
        '<td>—</td><td class="num">' + Cite.countIn(CheckEngine.textOf(s), id) + '</td><td>—</td>' +
        '<td><span class="badge bad">缺失</span></td></tr>';
    }
    const locs = citeLocations(s, id);
    return '<tr>' +
      '<td class="num"><b>' + (i + 1) + '</b></td>' +
      '<td><div class="t-main">' + U.esc(r.title || '（无题名）') + '</div>' +
      '<div class="t-sub">' + U.esc(Cite.authorStr(r)) + ' · ' + U.esc(r.year || '年份未填') + '</div>' +
      '<div class="t-sub" style="margin-top:3px;color:var(--muted)">' + U.esc(Cite.formatRef(r, null, style)) + '</div></td>' +
      '<td style="width:66px"><span class="badge plain">' + U.esc(U.typeName(r.type)) + '</span></td>' +
      '<td class="num" style="width:56px">' + Cite.countIn(CheckEngine.textOf(s), id) + '</td>' +
      '<td style="width:150px;font-size:11.5px;color:var(--muted)">' + U.esc(locs.slice(0, 2).join('、') || '—') + (locs.length > 2 ? ' 等' : '') + '</td>' +
      '<td style="width:60px"><span class="badge ok">已编号</span></td>' +
      '</tr>';
  }).join('');

  const bib = Cite.bibliography(s).map(function (r, i) { return Cite.formatRef(r, i + 1, style); });
  const bibText = bib.join('\n');

  root.innerHTML =
    H.head('模块 05 · 收尾',
      '引用与参考文献',
      '正文里的 [@ID] 标记在这里变成规范引文：按首次出现顺序编号，输出 GB/T 7714 或作者-年制。本模块不判断"该不该引"，只保证"引得对、格式齐"。',
      '<select class="select" id="styleSel" style="width:auto">' +
      '<option value="gbt"' + (style === 'gbt' ? ' selected' : '') + '>GB/T 7714 顺序编码制</option>' +
      '<option value="ay"' + (style === 'ay' ? ' selected' : '') + '>作者-年制（简明）</option></select>' +
      '<button class="btn" id="btnCopyBib">复制参考文献表</button>' +
      '<button class="btn btn-primary" data-nav="quality">去质量检查 →</button>') +

    '<div class="grid grid-4" style="margin-bottom:16px">' +
    H.kpi('被引文献', String(order.length - undef.length) + '<small>篇</small>', '文献库共 ' + (s.refs || []).length + ' 篇') +
    H.kpi('正文引用点', String(totalTokens) + '<small>处</small>', '含重复引用') +
    H.kpi('未定义标记', String(undef.length), undef.length ? '必须处理' : '无异常') +
    H.kpi('未引用文献', String(uncited.length), uncited.length ? '不会出现在成稿' : '全部被引用') +
    '</div>' +

    (undef.length
      ? H.card('未定义引用（阻断导出的问题）',
        undef.map(function (id) {
          return '<div class="issue high" style="margin-bottom:6px">' +
            '<div class="i-sev"><span class="badge bad">高</span></div>' +
            '<div class="i-main"><div class="i-title">[@' + U.esc(id) + '] 找不到对应文献</div>' +
            '<div class="i-desc">出现在：' + U.esc(citeLocations(s, id).join('、') || '未知章节') + '。可能文献已被删除，或标记被手工改动。</div></div>' +
            '<div class="i-act"><button class="btn btn-xs" data-copy-token="' + U.attr('[@' + id + ']') + '">复制标记</button>' +
            '<button class="btn btn-xs btn-danger" data-rm-token="' + id + '">删除标记</button></div></div>';
        }).join(''),
        { note: '处理方式：① 到「资料」补录文献（ID 需一致）；② 删除标记；③ 若为笔误，改回正确 ID。' })
      : '') +

    H.card('引用清单', '<div class="table-wrap"><table class="tbl"><thead><tr>' +
      '<th class="num">序号</th><th>文献与格式预览</th><th>类型</th><th class="num">出现</th><th>所在章节</th><th>状态</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div style="padding:22px;text-align:center;color:var(--muted);font-size:12.5px">正文还没有引用。写作时用工具条「插入引用」，或直接输入 [@文献ID]。</div></td></tr>') + '</tbody></table></div>',
      { note: '序号由正文首次出现位置自动决定，手工改号不会生效。' }) +

    '<div class="grid grid-side">' +
    H.card('参考文献表（' + (style === 'gbt' ? 'GB/T 7714' : '作者-年制') + '）',
      (bib.length
        ? '<div style="font-size:12.3px;line-height:1.9">' + bib.map(function (x) { return '<p style="text-indent:-1.6em;padding-left:1.6em;margin-bottom:6px">' + U.esc(x) + '</p>'; }).join('') + '</div>'
        : '<div style="font-size:12.5px;color:var(--muted)">暂无可输出的参考文献。</div>'),
      { actions: '<button class="btn btn-xs" id="btnBibTxt">下载 .txt</button>', note: '只列出被正文引用的文献，与清单序号一一对应。' }) +

    '<div>' +
    H.card('未引用文献',
      (uncited.length
        ? uncited.map(function (r) {
          return '<div style="display:flex;gap:8px;align-items:flex-start;font-size:12px;padding:6px 0;border-bottom:1px dashed var(--line)">' +
            '<span style="flex:1"><b style="color:var(--ink-2)">' + U.esc(r.title || '（无题名）') + '</b>' +
            '<span style="display:block;color:var(--muted);font-size:11.5px">' + U.esc(r.authors || '') + ' · ' + U.esc(r.year || '') + '</span></span>' +
            '<button class="btn btn-xs" data-copy-token="' + U.attr('[@' + r.id + ']') + '">复制标记</button></div>';
        }).join('')
        : '<div style="font-size:12.5px;color:var(--muted)">全部文献都已被引用。</div>'),
      { note: '未引用文献不会进入参考文献表。若只是背景阅读，可保留在库中。' }) +
    H.card('格式化规则',
      '<ul style="font-size:12px;color:var(--muted);line-height:1.8;padding-left:16px">' +
      '<li>作者超过 3 位按「前 3 位, 等」截断；英文作者保留原文顺序。</li>' +
      '<li>期刊格式：作者. 题名[J]. 刊名, 年, 卷(期): 页码.</li>' +
      '<li>学位论文：[D]；专著：[M]；会议/析出：[C]//；网络资源：[EB/OL]。</li>' +
      '<li>缺少字段时保留占位提示，不猜测补全。</li>' +
      '</ul>') +
    '</div>' +
    '</div>';

  root.querySelector('#styleSel').addEventListener('change', function (e) {
    s.exportOpts.style = e.target.value;
    Store.save();
    App.render();
  });

  root.querySelector('#btnCopyBib').addEventListener('click', function () {
    if (!bibText) { PLToast.show('暂无参考文献', 'warn'); return; }
    U.copy(bibText);
  });

  root.querySelector('#btnBibTxt').addEventListener('click', function () {
    if (!bibText) { PLToast.show('暂无参考文献', 'warn'); return; }
    U.download('参考文献-' + U.fmtDate() + '.txt', bibText);
  });

  root.querySelectorAll('[data-copy-token]').forEach(function (el) {
    el.addEventListener('click', function () { U.copy(el.getAttribute('data-copy-token')); });
  });

  root.querySelectorAll('[data-rm-token]').forEach(function (el) {
    el.addEventListener('click', function () {
      const id = el.getAttribute('data-rm-token');
      const re = new RegExp('\\[@' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\]', 'g');
      (s.outline.sections || []).forEach(function (x) { x.text = (x.text || '').replace(re, ''); });
      Store.save();
      App.render();
      PLToast.show('已删除该标记', 'ok');
    });
  });
};
