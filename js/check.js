/* ============================================================
   论文工坊 PaperLab — 质量检查引擎
   纯规则、纯本地：逻辑一致性 / 语言表达 / 格式规范 / 引用规范 / 重复与原创
   注意：这里的"重复"是文本自重复与跨章相似度自查，不是知网/万方查重。
   ============================================================ */

const CheckEngine = {};

CheckEngine.dims = {
  logic: '逻辑与结构',
  language: '语言表达',
  format: '格式规范',
  citation: '引用规范',
  dup: '重复与原创'
};

CheckEngine.weights = { logic: 0.30, language: 0.22, format: 0.18, citation: 0.15, dup: 0.15 };

CheckEngine.pen = { high: 12, mid: 6, low: 2 };

/* ---------------- 基础工具 ---------------- */
CheckEngine.sections = function (s) { return (s.outline.sections || []); };

CheckEngine.textOf = function (s) {
  return CheckEngine.sections(s).map(function (x) { return x.text || ''; }).join('\n');
};

CheckEngine.paras = function (text) {
  return String(text || '').split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
};

CheckEngine.sentences = function (text) {
  return String(text || '').split(/(?<=[。！？!?；;])/).map(function (x) { return x.trim(); }).filter(Boolean);
};

CheckEngine.chapterWords = function (s) {
  const secs = CheckEngine.sections(s);
  const out = [];
  let cur = null;
  secs.forEach(function (x) {
    if (x.level === 1) {
      cur = { id: x.id, title: x.title, text: x.text || '', words: U.wordsOf(x) };
      out.push(cur);
    } else if (cur) {
      cur.text += '\n' + (x.text || '');
      cur.words += U.wordsOf(x);
    }
  });
  return out;
};

/* 规范化：去掉空白与标点，仅留文字，用于重复检测 */
CheckEngine.norm = function (text) {
  return String(text || '').replace(/[\s\p{P}\p{S}]/gu, '');
};

CheckEngine.shingles = function (text, n) {
  const t = CheckEngine.norm(text);
  const set = new Set();
  for (let i = 0; i + n <= t.length; i++) set.add(t.slice(i, i + n));
  return set;
};

CheckEngine.jaccard = function (a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  a.forEach(function (x) { if (b.has(x)) inter++; });
  return inter / (a.size + b.size - inter);
};

/* 8 字窗口自重复率 */
CheckEngine.selfRepeat = function (text) {
  const t = CheckEngine.norm(text);
  const n = 8;
  if (t.length < n * 3) return { rate: 0, sample: '' };
  const seen = new Set();
  let total = 0, repeat = 0, sample = '';
  for (let i = 0; i + n <= t.length; i++) {
    const g = t.slice(i, i + n);
    total++;
    if (seen.has(g)) {
      repeat++;
      if (!sample) sample = g;
    } else {
      seen.add(g);
    }
  }
  return { rate: total ? repeat / total : 0, sample: sample };
};

/* 找出正文中的引用标记 */
CheckEngine.tokens = function (text) {
  const out = [];
  const re = /\[@\s*([A-Za-z0-9_\-]+)\s*\]/g;
  let m;
  while ((m = re.exec(String(text || '')))) out.push(m[1]);
  return out;
};

CheckEngine.quote = function (text, index, len) {
  const t = String(text || '');
  const a = Math.max(0, index - 14);
  const b = Math.min(t.length, index + (len || 16));
  return (a > 0 ? '…' : '') + t.slice(a, b).replace(/\s+/g, ' ') + (b < t.length ? '…' : '');
};

/* ---------------- 主流程 ---------------- */
CheckEngine.run = function (s, opts) {
  const o = Object.assign({ logic: true, language: true, format: true, citation: true, dup: true }, opts || {});
  const issues = [];
  const secs = CheckEngine.sections(s);
  const push = function (dim, sev, title, desc, fix, extra) {
    const ex = extra || {};
    issues.push(Object.assign({
      id: dim + '-' + U.hash(title + '|' + (ex.secId || '')),
      dim: dim, sev: sev, title: title, desc: desc, fix: fix,
      secId: null, quote: '', pen: CheckEngine.pen[sev] || 2
    }, ex));
  };

  const totalWords = secs.reduce(function (a, b) { return a + U.wordsOf(b); }, 0);
  const fullText = CheckEngine.textOf(s);

  /* ============ 1. 逻辑与结构 ============ */
  if (o.logic) {
    if (!secs.length) {
      push('logic', 'high', '尚未生成章节结构',
        '没有提纲时，写作与检查都缺少判断依据，全文无法评估完整性。',
        '到「提纲与结构」选择模板生成章节树，或手工添加章节。');
    } else {
      const empty = secs.filter(function (x) { return U.wordsOf(x) < 20; });
      if (empty.length) {
        push('logic', 'high', '有 ' + empty.length + ' 个章节尚无有效内容',
          '空章节会被评审直接视为未完成：' + empty.slice(0, 5).map(function (x) { return '「' + x.title + '」'; }).join('、') + (empty.length > 5 ? ' 等' : '') + '。',
          '优先补齐一级章节；二级小节可先写 200 字提纲式内容再扩写。',
          { secId: empty[0].id });
      }

      const t1 = secs.filter(function (x) { return x.level === 1; }).map(function (x) { return x.title; }).join(' ');
      if (t1.indexOf('绪论') < 0 && t1.indexOf('引言') < 0) {
        push('logic', 'mid', '缺少绪论/引言章节', '读者无法在开篇获得研究背景与问题。', '新增一级章节「绪论」，包含背景、问题、意义与方法。');
      }
      if (t1.indexOf('结论') < 0 && t1.indexOf('结语') < 0 && t1.indexOf('总结') < 0) {
        push('logic', 'high', '缺少结论章节', '没有结论，全文的问题—证据—回答链条不闭合。', '新增「结论」章节，用 3-5 条回应研究问题，不引入新证据。');
      }

      /* 字数偏差（按一级章节聚合） */
      const chapters = CheckEngine.chapterWords(s);
      const budgetMap = U.budget(secs).byChapter;
      const devi = [];
      chapters.forEach(function (c) {
        const target = Number(budgetMap[c.id]) || 0;
        if (target >= 400 && c.words > 0) {
          const ratio = c.words / target;
          if (ratio < 0.45) devi.push({ c: c, r: ratio, target: target, dir: 'under' });
          else if (ratio > 2.2) devi.push({ c: c, r: ratio, target: target, dir: 'over' });
        }
      });
      if (devi.length) {
        push('logic', 'mid', '章节篇幅与预算偏离较大',
          devi.slice(0, 4).map(function (d) {
            return '「' + d.c.title + '」' + d.c.words + ' 字 / 预算 ' + d.target + ' 字（' + Math.round(d.r * 100) + '%）';
          }).join('；') + (devi.length > 4 ? ' 等' : '') + '。',
          '过短的章节通常是论证未展开，过长则多有重复或跑题；先调结构再改文字。',
          { secId: devi[0].c.id });
      }

      /* 结构失衡 */
      if (totalWords > 1200) {
        chapters.forEach(function (c) {
          if (c.words / totalWords > 0.42) {
            push('logic', 'mid', '「' + c.title + '」占全文 ' + Math.round(c.words / totalWords * 100) + '%',
              '单一章节占比过高，容易挤压论证空间，也常意味着内容未拆分。',
              '把该章拆成两个同级章节，或把描述性内容移入附录。', { secId: c.id });
          }
        });
      }

      /* 研究问题是否出现 */
      const intro = chapters.filter(function (c) { return /绪论|引言|导论/.test(c.title); })[0];
      if (intro && U.countWords(intro.text) > 200) {
        if (!/[？?]|研究问题|本文(试图|旨在|关注)|核心问题/.test(intro.text)) {
          push('logic', 'high', '绪论未见明确的研究问题',
            '整节没有问句，也没有「研究问题」「本文旨在」等表述，读者难以判断你要回答什么。',
            '在研究背景之后单列一段，用一句话写出研究问题，并说明其可检验/可论证性。',
            { secId: intro.id });
        }
      }

      /* 长段落 */
      let longPara = 0, eviWeak = 0, firstLong = null, firstWeak = null;
      secs.forEach(function (sec) {
        CheckEngine.paras(sec.text).forEach(function (p) {
          if (U.countWords(p) > 420) {
            longPara++;
            if (!firstLong) firstLong = { id: sec.id, q: p.slice(0, 26) };
          }
          const hasClaim = /因此|所以|由此可见|表明|说明|证明/.test(p);
          const hasEvidence = /\[@|表\s*\d|图\s*\d|\d+(\.\d+)?%|\d{4}年/.test(p);
          if (hasClaim && !hasEvidence && U.countWords(p) > 120) {
            eviWeak++;
            if (!firstWeak) firstWeak = { id: sec.id, q: p.slice(0, 26) };
          }
        });
      });
      if (longPara) {
        push('logic', 'low', '有 ' + longPara + ' 个超长段落（>420 字）',
          '单段承载过多论点，读者难以抓住中心句。例：「' + (firstLong ? firstLong.q : '') + '…」',
          '按「一个段落一个判断」拆分，段首写中心句。', { secId: firstLong && firstLong.id });
      }
      if (eviWeak) {
        push('logic', 'mid', '有 ' + eviWeak + ' 处结论缺少证据支撑',
          '段落出现「因此/表明/说明」但既无引用也无数据。例：「' + (firstWeak ? firstWeak.q : '') + '…」',
          '为每个判断补三类证据之一：文献引用、数据结果、案例事实。', { secId: firstWeak && firstWeak.id });
      }
    }
  }

  /* ============ 2. 语言表达 ============ */
  if (o.language) {
    const lex = PLData.lexicon;
    let longSent = 0, firstLongSent = null;
    let colloquial = [], vagueHit = 0, weakHit = [], halfPunct = 0, firstPunct = null;

    secs.forEach(function (sec) {
      const t = sec.text || '';
      if (!t.trim()) return;

      CheckEngine.sentences(t).forEach(function (sent) {
        if (U.countWords(sent) > 95) {
          longSent++;
          if (!firstLongSent) firstLongSent = { id: sec.id, q: sent.slice(0, 30) };
        }
      });

      lex.colloquial.forEach(function (w) {
        if (t.indexOf(w) >= 0) colloquial.push({ w: w, id: sec.id });
      });
      lex.weakPhrase.forEach(function (w) {
        if (t.indexOf(w) >= 0) weakHit.push({ w: w, id: sec.id });
      });

      CheckEngine.paras(t).forEach(function (p) {
        let v = 0;
        lex.vague.forEach(function (w) { if (p.indexOf(w) >= 0) v++; });
        if (v >= 3) vagueHit++;
        const m = p.match(/[\u4e00-\u9fa5][,;:!?()][\u4e00-\u9fa5]/g);
        if (m) {
          halfPunct += m.length;
          if (!firstPunct) firstPunct = { id: sec.id, q: m[0] };
        }
      });
    });

    if (longSent) {
      push('language', 'mid', '有 ' + longSent + ' 个超长句（>95 字）',
        '长句常由多个判断叠成，容易主谓失配。例：「' + (firstLongSent ? firstLongSent.q : '') + '…」',
        '在转折与因果处断句，一句只放一个判断。', { secId: firstLongSent && firstLongSent.id });
    }
    if (colloquial.length) {
      const uniq = Array.from(new Set(colloquial.map(function (x) { return x.w; })));
      push('language', 'mid', '出现口语化表达 ' + uniq.length + ' 类',
        '学术写作中「' + uniq.slice(0, 6).join('、') + '」等词会削弱论证的严谨感。',
        '替换为可量化的表述，例如「很多」→「多数（n=…）」，「非常」→「显著」。', { secId: colloquial[0].id });
    }
    if (weakHit.length) {
      const uniq = Array.from(new Set(weakHit.map(function (x) { return x.w; })));
      push('language', 'low', '存在弱动词/空泛句式',
        '「' + uniq.slice(0, 4).join('」「') + '」属于可删除而不损信息的表达。',
        '改为具体动作：「进行了研究」→「检验了……」「估计了……」。', { secId: weakHit[0].id });
    }
    if (vagueHit) {
      push('language', 'low', '有 ' + vagueHit + ' 个段落模糊限定词堆叠',
        '同一段出现 3 个以上「可能/也许/在一定程度上」，会让结论显得不可靠。',
        '保留一个限定词，其余改为条件句或给出置信区间。');
    }
    if (halfPunct) {
      push('language', 'mid', '中英文标点混用 ' + halfPunct + ' 处',
        '中文语境中使用了半角逗号/括号。例：「' + (firstPunct ? firstPunct.q : '') + '」',
        '统一为全角标点（，；：（）！？），数字与英文内部保持半角。', { secId: firstPunct && firstPunct.id });
    }
    if (/\n{3,}/.test(fullText)) {
      push('language', 'low', '存在多余空行', '连续空行会影响排版一致性，导出时可能产生异常分页。', '压缩为单个空行。');
    }
    if (/ {3,}/.test(fullText)) {
      push('language', 'low', '存在连续空格', '多为粘贴外部内容残留。', '用「查找替换」清理连续空格。');
    }
  }

  /* ============ 3. 格式规范 ============ */
  if (o.format) {
    const abs = String(s.meta.abstract || '').trim();
    const kws = String(s.meta.keywords || '').split(/[,，;；、\s]+/).filter(Boolean);
    if (!abs) {
      push('format', 'high', '摘要缺失', '摘要决定读者是否继续读，也是检索系统的信息来源。', '到「正文写作」顶部填写 250-400 字摘要：问题—方法—发现—结论。');
    } else {
      const w = U.countWords(abs);
      if (w < 180) push('format', 'mid', '摘要偏短（' + w + ' 字）', '摘要过短通常缺少方法或结论要素。', '补齐「研究方法」与「主要发现」，控制在 250-400 字。');
      if (w > 600) push('format', 'mid', '摘要偏长（' + w + ' 字）', '超出多数期刊/学位论文惯例。', '删去背景铺垫，只保留问题、方法、结果、结论。');
    }
    if (!kws.length) {
      push('format', 'mid', '关键词缺失', '关键词影响检索命中率。', '填写 3-6 个关键词，用分号或逗号分隔。');
    } else if (kws.length < 3) {
      push('format', 'low', '关键词偏少（' + kws.length + ' 个）', '一般需要 3-6 个，覆盖研究对象、方法、场景。', '补充方法类与场景类关键词。');
    } else if (kws.length > 6) {
      push('format', 'low', '关键词偏多（' + kws.length + ' 个）', '过多关键词会稀释主题标识。', '保留 3-6 个最能区分本研究的词。');
    }

    /* 手工编号 */
    secs.forEach(function (x) {
      if (/^\s*(\d+(\.\d+)*|[一二三四五六七八九十]+[、.])\s*/.test(x.title)) {
        push('format', 'low', '章节标题内含手工编号：「' + x.title + '」',
          '导出时会自动编号，手工编号会造成「1 1 绪论」这类重复。',
          '删除标题开头的编号，编号交给导出器。', { secId: x.id });
      }
    });

    /* 图表引用 */
    secs.forEach(function (x) {
      const t = x.text || '';
      if (/(如|见)表\s*(所示|中|下)/.test(t) && !/表\s*\d/.test(t)) {
        push('format', 'mid', '「' + x.title + '」提及表格但未给出表号',
          '读者无法定位具体表格，排版后尤其明显。', '改为「如表 3-1 所示」，并在表格上方给出表题。', { secId: x.id });
      }
      if (/(如|见)图\s*(所示|中|下)/.test(t) && !/图\s*\d/.test(t)) {
        push('format', 'mid', '「' + x.title + '」提及插图但未给出图号',
          '图号缺失会导致图文无法对应。', '改为「如图 2-1 所示」，图题置于图下方。', { secId: x.id });
      }
    });

    /* 标点/结尾 */
    secs.forEach(function (x) {
      const t = (x.text || '').trim();
      if (t && !/[。！？!?」』）)]$/.test(t)) {
        push('format', 'low', '「' + x.title + '」末尾缺少句末标点',
          '正文结尾应闭合，否则导出后与下一节标题粘连。',
          '在末句补句号，并删除多余空行。', { secId: x.id });
      }
    });

    /* 参考文献字段完整性 */
    const badRefs = (s.refs || []).filter(function (r) {
      if (!r.authors || !r.title || !r.year) return true;
      if ((r.type === 'journal' || r.type === 'conf' || r.type === 'thesis') && !r.source) return true;
      return false;
    });
    if (badRefs.length) {
      push('format', 'mid', '有 ' + badRefs.length + ' 条文献字段不完整',
        '缺作者/题名/年份/来源会导致参考文献表出现占位符。例：' +
        badRefs.slice(0, 3).map(function (r) { return '「' + (r.title || '无题名') + '」'; }).join('、') + '。',
        '到「资料收集与管理」补全字段，或删除不打算引用的条目。');
    }
  }

  /* ============ 4. 引用规范 ============ */
  if (o.citation) {
    const order = Cite.order(s);
    const undef = Cite.undefinedIds(s);
    const uncited = Cite.uncited(s);

    if (undef.length) {
      push('citation', 'high', '有 ' + undef.length + ' 个引用标记找不到对应文献',
        '标记 ' + undef.slice(0, 4).map(function (x) { return '[@' + x + ']'; }).join('、') + ' 在文献库中不存在，导出将显示为 [?]。',
        '删除这些标记，或到「资料」补录对应文献（ID 需一致）。');
    }
    if (!order.length && totalWords > 800) {
      push('citation', 'high', '全文没有任何引用',
        '无引用的论文无法体现文献基础，也易被判定为综述缺失。',
        '至少在文献综述与研究设计处引用核心文献，插入方式：工具条「插入引用」。');
    }
    if (uncited.length) {
      push('citation', 'low', '有 ' + uncited.length + ' 条文献未被正文引用',
        '参考文献表只列出被引文献，未引用条目不会出现在成稿中。',
        '在正文合适位置引用，或标记为"仅阅读"并从文献库移除。');
    }
    const density = totalWords > 0 ? order.length / (totalWords / 1000) : 0;
    if (totalWords > 800 && density < 1.2) {
      push('citation', 'mid', '引用密度偏低（每千字 ' + density.toFixed(1) + ' 处）',
        '人文社科通常每千字 3-8 处；密度过低说明论证主要靠个人判断。',
        '在文献综述与讨论部分补充对话性引用。');
    }
    if (order.length >= 6) {
      const counts = order.map(function (id) { return Cite.countIn(fullText, id); });
      const max = Math.max.apply(null, counts);
      if (max / counts.reduce(function (a, b) { return a + b; }, 0) > 0.45) {
        push('citation', 'low', '引用过度集中于单一文献',
          '单一文献占总引用 ' + Math.round(max / counts.reduce(function (a, b) { return a + b; }, 0) * 100) + '%，容易被认为文献面窄。',
          '补充同主题的其他研究，形成对话。');
      }
    }

    /* 标记格式异常 */
    secs.forEach(function (x) {
      const t = x.text || '';
      if (/\[\s+@|\[@\s|@\s+\]|【@|\[＠|\[@[A-Za-z0-9_\-]+\s+\]/.test(t)) {
        push('citation', 'low', '「' + x.title + '」引用标记格式异常',
          '标记内不应有空格，也不应使用全角括号。',
          '规范写法为 [@文献ID]，建议用工具条的引用选择器插入。', { secId: x.id });
      }
    });
  }

  /* ============ 5. 重复与原创 ============ */
  if (o.dup) {
    const rep = CheckEngine.selfRepeat(fullText);
    if (rep.rate > 0.06) {
      push('dup', 'high', '全文 8 字窗口自重复率 ' + (rep.rate * 100).toFixed(1) + '%',
        '存在较多重复片段（示例片段：「' + rep.sample + '」）。常见于多章复制粘贴同一段背景。',
        '定位重复章节，只在一处完整论述，其余改为交叉引用（"如前文 2.1 所述"）。');
    } else if (rep.rate > 0.025) {
      push('dup', 'mid', '全文 8 字窗口自重复率 ' + (rep.rate * 100).toFixed(1) + '%',
        '轻度重复，多为套话与固定表述（示例片段：「' + rep.sample + '」）。',
        '检查"综上所述""随着……的发展"等模板句是否反复出现。');
    }

    /* 相邻重复句 */
    let dupSent = 0, dupSample = '';
    secs.forEach(function (sec) {
      const sents = CheckEngine.sentences(sec.text);
      for (let i = 1; i < sents.length; i++) {
        if (sents[i].length > 12 && sents[i] === sents[i - 1]) {
          dupSent++;
          if (!dupSample) dupSample = sents[i].slice(0, 24);
        }
      }
    });
    if (dupSent) {
      push('dup', 'mid', '有 ' + dupSent + ' 处相邻重复句',
        '例：「' + dupSample + '…」',
        '删除其中一句，或把重复句改写为递进关系。');
    }

    /* 跨章相似 */
    const chs = CheckEngine.chapterWords(s).filter(function (c) { return U.countWords(c.text) > 300; });
    const sh = chs.map(function (c) { return { c: c, set: CheckEngine.shingles(c.text, 6) }; });
    const pairs = [];
    for (let i = 0; i < sh.length; i++) {
      for (let j = i + 1; j < sh.length; j++) {
        const sim = CheckEngine.jaccard(sh[i].set, sh[j].set);
        if (sim > 0.42) pairs.push({ a: sh[i].c, b: sh[j].c, sim: sim });
      }
    }
    pairs.sort(function (a, b) { return b.sim - a.sim; });
    pairs.slice(0, 2).forEach(function (p) {
      push('dup', 'mid', '「' + p.a.title + '」与「' + p.b.title + '」相似度 ' + Math.round(p.sim * 100) + '%',
        '两章可能有整段复用，或都在重复同一背景介绍。',
        '保留一处完整论述，另一处改为指向性引用；若确为不同论证，补充各自的独有证据。',
        { secId: p.b.id });
    });
  }

  /* ---------------- 汇总 ---------------- */
  const dims = {};
  Object.keys(CheckEngine.dims).forEach(function (k) { dims[k] = 100; });
  issues.forEach(function (it) {
    if (dims[it.dim] != null) dims[it.dim] -= it.pen;
  });
  Object.keys(dims).forEach(function (k) { dims[k] = U.clamp(Math.round(dims[k]), 0, 100); });

  let score = 0;
  Object.keys(CheckEngine.weights).forEach(function (k) { score += dims[k] * CheckEngine.weights[k]; });
  score = Math.round(score);

  const order = { high: 0, mid: 1, low: 2 };
  issues.sort(function (a, b) { return order[a.sev] - order[b.sev]; });

  return {
    ranAt: new Date().toISOString(),
    score: score,
    dims: dims,
    issues: issues,
    stats: {
      total: issues.length,
      high: issues.filter(function (x) { return x.sev === 'high'; }).length,
      mid: issues.filter(function (x) { return x.sev === 'mid'; }).length,
      low: issues.filter(function (x) { return x.sev === 'low'; }).length,
      repeated: CheckEngine.selfRepeat(fullText).rate,
      words: totalWords
    }
  };
};

CheckEngine.scoreLabel = function (score) {
  if (score == null) return '未检查';
  if (score >= 90) return '可直接送审';
  if (score >= 80) return '良好，需局部打磨';
  if (score >= 65) return '基本成型，问题集中';
  if (score >= 45) return '结构或论证缺陷明显';
  return '尚处草稿阶段';
};
