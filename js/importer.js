/* ============================================================
   论文工坊 PaperLab — 导入层
   .bib / .ris 文献导入 · .md / .txt / .docx 正文导入 · .json 项目导入
   拖拽入口 + 解析预览 + 写入章节
   ============================================================ */

const Importer = {};

Importer.ACCEPT = '.bib,.ris,.md,.markdown,.txt,.docx,.json';

/* ---------------- 通用 ---------------- */

Importer.ext = function (name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
};

/* 文本解码：优先 UTF-8，含替换符时回退 GBK（中文 Windows 的 .txt 常见） */
Importer.decodeText = function (buf) {
  const u8 = (buf instanceof Uint8Array) ? buf : new Uint8Array(buf);
  if (u8.length >= 3 && u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) {
    return new TextDecoder('utf-8').decode(u8.subarray(3));
  }
  if (u8.length >= 2 && u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder('utf-16le').decode(u8.subarray(2));
  if (u8.length >= 2 && u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder('utf-16be').decode(u8.subarray(2));
  let out = '';
  try { out = new TextDecoder('utf-8').decode(u8); } catch (e) { out = ''; }
  const bad = (out.match(/\uFFFD/g) || []).length;
  if (bad > 2 && bad / Math.max(1, out.length) > 0.002) {
    try {
      const alt = new TextDecoder('gbk').decode(u8);
      if ((alt.match(/\uFFFD/g) || []).length < bad) return alt;
    } catch (e) { }
  }
  return out;
};

/* 行内标记清理：链接、强调、行内代码、引用块、列表符号 */
Importer.cleanInline = function (s) {
  return String(s == null ? '' : s)
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}([-*+])\s+/gm, '· ')
    .replace(/&nbsp;/g, ' ')
    .trim();
};

/* 中文段落常被硬换行，拼接时中文之间不加空格，英文之间补空格 */
Importer.joinLines = function (lines) {
  let out = '';
  for (let i = 0; i < lines.length; i++) {
    const line = String(lines[i]).trim();
    if (!line) continue;
    if (!out) { out = line; continue; }
    const prev = out.charAt(out.length - 1);
    const next = line.charAt(0);
    const cjk = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
    out += (cjk.test(prev) || cjk.test(next)) ? '' : ' ';
    out += line;
  }
  return out;
};

Importer.normBody = function (lines) {
  const raw = Importer.cleanInline(lines.join('\n'));
  const paras = raw.split(/\n\s*\n/).map(function (p) {
    return Importer.joinLines(p.split('\n'));
  }).filter(function (p) { return p.length > 0; });
  return paras.join('\n\n').trim();
};

/* 章节标题归一化：去编号、去空白与标点，用于同名匹配 */
Importer.normalizeTitle = function (t) {
  return String(t || '')
    .replace(/^[\s"'“”‘’《》【】]+/, '')
    .replace(/^\s*(?:第[一二三四五六七八九十百零〇]+[章节篇]|[一二三四五六七八九十]+[、.．]|\d+(?:[.．]\d+)*[、.．]?)\s*/, '')
    .replace(/[\s\u3000]+/g, '')
    .replace(/[：:。.、，,；;·—\-]+$/, '')
    .toLowerCase();
};

/* ---------------- Markdown / 纯文本 ---------------- */

Importer.parseMarkdown = function (raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const blocks = [];
  let cur = { level: 0, title: '', lines: [] };
  let inCode = false;

  const flush = function () {
    const body = Importer.normBody(cur.lines);
    if (cur.level > 0 || body) blocks.push({ level: cur.level, title: Importer.cleanInline(cur.title), text: body });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode) { cur.lines.push(line); continue; }
    const h = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      flush();
      cur = { level: Math.min(h[1].length, 3), title: h[2].trim().replace(/[#*`]/g, ''), lines: [] };
      continue;
    }
    if (/^\s{0,3}([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) continue;  /* 分隔线 */
    cur.lines.push(line);
  }
  flush();
  return Importer.finishBlocks(blocks);
};

/* 纯文本：按「章/节」行首编号做轻量分节，识别不到就当一段 */
Importer.parsePlain = function (raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  const blocks = [];
  let cur = { level: 0, title: '', lines: [] };
  let i = 0;

  const flush = function () {
    const body = Importer.normBody(cur.lines);
    if (cur.level > 0 || body) blocks.push({ level: cur.level, title: cur.title, text: body });
  };

  for (; i < lines.length; i++) {
    const t = lines[i].trim();
    const isShort = t.length > 0 && t.length <= 40 && !/[。；;]$/.test(t);
    let level = 0;
    if (isShort && /^第[一二三四五六七八九十百零〇]+[章篇]/.test(t)) level = 1;
    else if (isShort && /^第[一二三四五六七八九十百零〇]+节/.test(t)) level = 2;
    else if (isShort && /^\d+[.．]\d+[.．]?\s*\S/.test(t)) level = 2;
    else if (isShort && /^\d+[.．、]\s*\S/.test(t)) level = 1;
    else if (isShort && /^[一二三四五六七八九十]+、/.test(t)) level = 2;

    if (level > 0) {
      flush();
      cur = { level: level, title: t.replace(/[：:]\s*$/, ''), lines: [] };
      continue;
    }
    cur.lines.push(lines[i]);
  }
  flush();

  if (blocks.length > 1 || (blocks[0] && blocks[0].level > 0)) return Importer.finishBlocks(blocks);
  return Importer.finishBlocks([{ level: 0, title: '', text: Importer.normBody(lines) }]);
};

Importer.finishBlocks = function (blocks) {
  const clean = blocks.filter(function (b) { return b.level > 0 || (b.text || '').trim(); });
  const words = clean.reduce(function (a, b) { return a + U.countWords(b.text); }, 0);
  return { blocks: clean, words: words, headings: clean.filter(function (b) { return b.level > 0; }).length };
};

/* ---------------- DOCX（zip + OOXML） ---------------- */

Importer.zipEntry = function (buf, name) {
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  const min = 22;
  if (u8.length < min) throw new Error('文件过小，不是有效的 .docx');
  let eocd = -1;
  const floor = Math.max(0, u8.length - 66000);
  for (let i = u8.length - min; i >= floor; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('文件不是有效的 zip 容器（.docx 应为 zip 格式）');

  const count = dv.getUint16(eocd + 10, true);
  let off = dv.getUint32(eocd + 16, true);
  for (let k = 0; k < count; k++) {
    if (off + 46 > u8.length || dv.getUint32(off, true) !== 0x02014b50) break;
    const method = dv.getUint16(off + 10, true);
    const csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true);
    const elen = dv.getUint16(off + 30, true);
    const clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    const fname = new TextDecoder('utf-8').decode(u8.subarray(off + 46, off + 46 + nlen));
    if (fname === name) {
      if (lho + 30 > u8.length) break;
      const lnlen = dv.getUint16(lho + 26, true);
      const lelen = dv.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lelen;
      return { method: method, data: u8.subarray(start, Math.min(u8.length, start + csize)) };
    }
    off += 46 + nlen + elen + clen;
  }
  return null;
};

Importer.unzipText = async function (buf, name) {
  const entry = Importer.zipEntry(buf, name);
  if (!entry) throw new Error('压缩包内缺少 ' + name);
  if (entry.method === 0) return new TextDecoder('utf-8').decode(entry.data);
  if (typeof DecompressionStream !== 'function') {
    throw new Error('当前浏览器不支持解压 .docx（缺 DecompressionStream），请升级到 Chrome/Edge 103+ 或改用 .md');
  }
  let stream;
  try {
    stream = new Blob([entry.data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  } catch (e) {
    throw new Error('当前浏览器不支持 deflate-raw 解压，请改用 .md / .txt');
  }
  const out = await new Response(stream).arrayBuffer();
  return new TextDecoder('utf-8').decode(out);
};

/* 取出 w:p 里的文本：w:t 保留、w:tab 变制表、w:br 变换行 */
Importer.paraText = function (p) {
  let s = '';
  const walk = function (node) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i];
      const ln = c.localName;
      if (ln === 't') s += c.textContent;
      else if (ln === 'tab') s += '\t';
      else if (ln === 'br' || ln === 'cr') s += '\n';
      else if (ln === 'pPr' || ln === 'rPr' || ln === 'delText' || ln === 'instrText') continue;
      else if (c.childNodes && c.childNodes.length) walk(c);
    }
  };
  walk(p);
  return s.replace(/[ \t]+$/g, '');
};

Importer.headingLevel = function (p) {
  const ns = function (name) { return p.getElementsByTagNameNS('*', name); };
  const style = ns('pStyle')[0];
  const val = style ? (style.getAttribute('w:val') || style.getAttribute('val') || '') : '';
  let m = /^heading\s*([1-6])$/i.exec(val) || /^标题\s*([1-6])$/.exec(val) || /^([1-6])$/.exec(val);
  if (m) return Math.min(Number(m[1]), 3);
  const lvl = ns('outlineLvl')[0];
  if (lvl) {
    const v = Number(lvl.getAttribute('w:val') || lvl.getAttribute('val'));
    if (!isNaN(v) && v >= 0 && v <= 5) return Math.min(v + 1, 3);
  }
  return 0;
};

Importer.parseDocx = async function (buf) {
  if (typeof DOMParser !== 'function') throw new Error('当前环境不支持解析 .docx');
  const xml = await Importer.unzipText(buf, 'word/document.xml');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (!doc || doc.getElementsByTagName('parsererror').length) throw new Error('word/document.xml 解析失败');
  const body = doc.getElementsByTagNameNS('*', 'body')[0] || doc.documentElement;
  const blocks = [];
  let cur = { level: 0, title: '', lines: [] };

  const flush = function () {
    const text = Importer.normBody(cur.lines);
    if (cur.level > 0 || text) blocks.push({ level: cur.level, title: cur.title, text: text });
  };

  const para = function (p) {
    const txt = Importer.paraText(p).trim();
    if (!txt) return;
    const lvl = Importer.headingLevel(p);
    if (lvl > 0) {
      flush();
      cur = { level: lvl, title: txt, lines: [] };
    } else {
      cur.lines.push(txt);
    }
  };

  /* 表格按「行 → 单元格 | 单元格」单独成段，避免与上下文正文糊在一起 */
  const table = function (tbl) {
    const rows = [];
    const trs = tbl.getElementsByTagNameNS('*', 'tr');
    for (let i = 0; i < trs.length; i++) {
      const cells = [];
      const tcs = trs[i].getElementsByTagNameNS('*', 'tc');
      for (let j = 0; j < tcs.length; j++) {
        cells.push(Importer.paraText(tcs[j]).replace(/\s*\n\s*/g, ' ').trim());
      }
      const line = cells.filter(Boolean).join(' | ');
      if (line) rows.push(line);
    }
    if (!rows.length) return;
    cur.lines.push('');
    rows.forEach(function (r) { cur.lines.push(r); cur.lines.push(''); });
  };

  const walk = function (node) {
    for (let i = 0; i < node.childNodes.length; i++) {
      const c = node.childNodes[i];
      const ln = c.localName;
      if (ln === 'p') para(c);
      else if (ln === 'tbl') table(c);
      else if (ln === 'sectPr' || ln === 'bookmarkStart' || ln === 'bookmarkEnd') continue;
      else if (c.childNodes && c.childNodes.length) walk(c);
    }
  };
  walk(body);

  flush();

  /* 没有识别到任何标题时，按纯文本处理更符合预期 */
  const out = blocks.filter(function (b) { return b.level > 0 || (b.text || '').trim(); });
  const noHeading = !out.some(function (b) { return b.level > 0; });
  const words = out.reduce(function (a, b) { return a + U.countWords(b.text); }, 0);
  return { blocks: out, words: words, headings: out.filter(function (b) { return b.level > 0; }).length, noHeading: noHeading };
};

/* ---------------- 文献：BibTeX / RIS ---------------- */

Importer.REF_TYPES = {
  jour: 'journal', jfull: 'journal', jf: 'journal', magc: 'journal', mgzn: 'journal', news: 'journal',
  book: 'book', ebook: 'book', edbook: 'book',
  chap: 'chapter', booksec: 'chapter',
  conf: 'conf', cpaper: 'conf', inpr: 'conf', rprt: 'report', rept: 'report',
  thesis: 'thesis', thms: 'thesis', disr: 'thesis',
  std: 'standard', stand: 'standard',
  web: 'web', elec: 'web', blog: 'web', gweb: 'web', elcs: 'web'
};

Importer.parseRis = function (raw) {
  const lines = String(raw || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let rec = null;

  const push = function () {
    if (!rec) return;
    const g = function (k) { return (rec.f[k] || '').trim(); };
    const type = Importer.REF_TYPES[(g('TY') || '').toLowerCase()] || 'journal';
    const title = g('TI') || g('T1');
    if (!title && !g('AU')) { rec = null; return; }
    out.push({
      id: U.uid('r'), type: type,
      authors: (rec.f.AU || []).concat(rec.f.A1 || []).join(', '),
      title: title,
      source: g('JO') || g('JF') || g('T2') || g('JA') || g('PB') || '',
      year: (g('PY') || g('Y1') || g('DA')).slice(0, 4),
      vol: g('VL'), issue: g('IS'), pages: g('SP') ? (g('SP') + (g('EP') ? '-' + g('EP') : '')) : '',
      place: g('CY'), doi: g('DO'), url: g('UR'),
      tags: [], read: 0, note: '',
      addedAt: new Date().toISOString()
    });
    rec = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Z0-9]{2})\s{0,2}-\s?(.*)$/.exec(lines[i]);
    if (!m) continue;
    const tag = m[1], val = m[2];
    if (tag === 'TY') { push(); rec = { f: { TY: val } }; continue; }
    if (!rec) continue;
    if (tag === 'ER') { push(); continue; }
    if (tag === 'AU' || tag === 'A1') { (rec.f[tag] = rec.f[tag] || []).push(val); continue; }
    rec.f[tag] = rec.f[tag] ? (rec.f[tag] + ' ' + val) : val;
  }
  push();
  return out;
};

const IMP_BIB_TYPE = {
  article: 'journal', book: 'book', booklet: 'book', inbook: 'chapter', incollection: 'chapter',
  inproceedings: 'conf', conference: 'conf', proceedings: 'book',
  phdthesis: 'thesis', mastersthesis: 'thesis', thesis: 'thesis',
  techreport: 'report', report: 'report', manual: 'standard', standard: 'standard',
  misc: 'web', online: 'web', electronic: 'web', unpublished: 'report'
};

/* BibTeX 解析：支持 {…} 与 "…" 两种取值、嵌套花括号、author 的 and 分隔 */
Importer.parseBib = function (text) {
  const src = String(text || '').replace(/^\uFEFF/, '');
  const out = [];
  const heads = [];
  const hr = /@([A-Za-z]+)\s*\{/g;
  let hm;
  while ((hm = hr.exec(src))) {
    const type = hm[1].toLowerCase();
    if (type === 'string' || type === 'preamble' || type === 'comment') continue;
    heads.push({ type: type, at: hr.lastIndex });
  }

  heads.forEach(function (h) {
    let depth = 1, i = h.at;
    for (; i < src.length && depth > 0; i++) {
      const ch = src[i];
      if (ch === '\\') { i++; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    const body = src.slice(h.at, i - 1);
    const fields = {};
    const fr = /([A-Za-z][\w-]*)\s*=\s*/g;
    let fm;
    while ((fm = fr.exec(body))) {
      let j = fr.lastIndex;
      while (j < body.length && /\s/.test(body[j])) j++;
      let val = '';
      if (body[j] === '{') {
        let d = 1, k = j + 1;
        for (; k < body.length && d > 0; k++) {
          if (body[k] === '\\') { k++; continue; }
          if (body[k] === '{') d++;
          else if (body[k] === '}') d--;
        }
        val = body.slice(j + 1, k - 1);
        fr.lastIndex = k;
      } else if (body[j] === '"') {
        let k = j + 1;
        for (; k < body.length; k++) {
          if (body[k] === '\\') { k++; continue; }
          if (body[k] === '"') break;
        }
        val = body.slice(j + 1, k);
        fr.lastIndex = k + 1;
      } else {
        let k = j;
        while (k < body.length && body[k] !== ',' && body[k] !== '\n') k++;
        val = body.slice(j, k);
        fr.lastIndex = k;
      }
      fields[fm[1].toLowerCase()] = val.replace(/[{}]/g, '').replace(/\s+/g, ' ').trim();
    }

    const pick = function () {
      for (let i = 0; i < arguments.length; i++) if (fields[arguments[i]]) return fields[arguments[i]];
      return '';
    };
    const title = pick('title');
    if (!title && !pick('author')) return;
    const year = (pick('year', 'date').match(/\d{4}/) || [''])[0];
    out.push({
      id: U.uid('r'),
      type: IMP_BIB_TYPE[h.type] || 'web',
      authors: pick('author', 'editor').replace(/\s+and\s+/gi, ', '),
      title: title,
      source: pick('journal', 'journaltitle', 'booktitle', 'publisher', 'school', 'institution', 'organization'),
      year: year,
      vol: pick('volume'),
      issue: pick('number', 'issue'),
      pages: pick('pages').replace(/--+/g, '-'),
      place: pick('address', 'location'),
      doi: pick('doi'),
      url: pick('url'),
      tags: [], read: 0, note: pick('note'),
      addedAt: new Date().toISOString()
    });
  });
  return out;
};

/* 按题名去重（归一化后比较），返回 { fresh, dup } */
Importer.splitRefs = function (list) {
  const seen = {};
  (Store.s.refs || []).forEach(function (r) { seen[Importer.normalizeTitle(r.title)] = 1; });
  const fresh = [], dup = [];
  (list || []).forEach(function (r) {
    const k = Importer.normalizeTitle(r.title);
    if (!k || seen[k]) { dup.push(r); return; }
    seen[k] = 1;
    fresh.push(r);
  });
  return { fresh: fresh, dup: dup };
};

/* ---------------- 文本写入章节 ---------------- */

Importer.sections = function () {
  return (Store.s.outline && Store.s.outline.sections) || [];
};

Importer.currentSectionId = function () {
  const secs = Importer.sections();
  const id = Store.s.ui && Store.s.ui.secId;
  if (id && secs.some(function (x) { return x.id === id; })) return id;
  return secs.length ? secs[0].id : null;
};

/* 建立「导入块 → 现有章节」的映射：先精确同名，再包含匹配 */
Importer.matchBlocks = function (blocks, secs) {
  const used = {};
  const norm = secs.map(function (x) { return { id: x.id, n: Importer.normalizeTitle(x.title), title: x.title }; });
  return (blocks || []).map(function (b) {
    if (b.level <= 0) return null;
    const n = Importer.normalizeTitle(b.title);
    if (!n) return null;
    let hit = null;
    for (let i = 0; i < norm.length; i++) {
      if (!used[norm[i].id] && norm[i].n === n) { hit = norm[i]; break; }
    }
    if (!hit && n.length >= 4) {
      for (let i = 0; i < norm.length; i++) {
        if (used[norm[i].id]) continue;
        if (norm[i].n.indexOf(n) >= 0 || n.indexOf(norm[i].n) >= 0) { hit = norm[i]; break; }
      }
    }
    if (hit) used[hit.id] = 1;
    return hit ? hit.id : null;
  });
};

Importer.applyText = function (payload, opt) {
  const secs = Importer.sections();
  const blocks = (payload && payload.blocks) || [];
  const mode = (opt && opt.mode) || 'auto';
  const how = (opt && opt.how) || 'append';
  const report = { merged: 0, created: 0, words: 0, skipped: 0 };
  const replaced = {};

  const write = function (sec, text) {
    if (!sec || !text) return;
    if (how === 'replace' && !replaced[sec.id]) {
      sec.text = text;
      replaced[sec.id] = 1;
    } else {
      sec.text = (sec.text ? sec.text.replace(/\s+$/, '') + '\n\n' : '') + text;
    }
    report.words += U.countWords(text);
  };

  if (mode === 'current') {
    const sec = secs.filter(function (x) { return x.id === Importer.currentSectionId(); })[0];
    if (!sec) { report.skipped = 1; return report; }
    write(sec, blocks.map(function (b) { return b.text; }).filter(Boolean).join('\n\n'));
    report.merged = 1;
    return report;
  }

  const map = Importer.matchBlocks(blocks, secs);
  blocks.forEach(function (b, i) {
    const targetId = mode === 'new' ? null : map[i];
    if (targetId) {
      const sec = secs.filter(function (x) { return x.id === targetId; })[0];
      write(sec, b.text);
      if (b.text) report.merged++;
      return;
    }
    secs.push({
      id: U.uid('sec'),
      level: b.level > 0 ? b.level : 1,
      title: (b.title || '').trim() || '导入内容',
      target: 0, text: b.text || '', guide: ''
    });
    report.created++;
    report.words += U.countWords(b.text);
  });
  return report;
};

/* ---------------- 项目 JSON ---------------- */

Importer.importProject = function (file) {
  return new Promise(function (resolve) {
    const reader = new FileReader();
    reader.onload = function () {
      let data = null;
      try {
        data = JSON.parse(String(reader.result));
        if (!data || !data.meta || !data.outline || !Array.isArray(data.outline.sections)) throw new Error('结构不符');
      } catch (e) {
        PLToast.show('导入失败：不是有效的项目 JSON', 'bad');
        resolve(false);
        return;
      }
      PLModal.confirm({
        title: '导入项目 JSON',
        body: '文件：<b>' + U.esc(file.name) + '</b><br>将用该备份<b>覆盖当前项目</b>（选题、文献、正文、版本全部替换）。当前内容若未备份将无法找回。',
        ok: '覆盖并导入', danger: true
      }).then(function (ok) {
        if (!ok) { resolve(false); return; }
        if (typeof Sync === 'object') Sync.beginLocalEdit();
        Store.s = U.mergeDeep(defaultState(), data);
        Store.flush();
        App.go('overview');
        PLToast.show('项目已导入', 'ok');
        resolve(true);
      });
    };
    reader.onerror = function () { PLToast.show('读取文件失败', 'bad'); resolve(false); };
    reader.readAsText(file, 'utf-8');
  });
};

/* ---------------- 预览与确认 ---------------- */

Importer.previewText = function (payload) {
  const s = Store.s;
  const secs = Importer.sections();
  const map = Importer.matchBlocks(payload.blocks, secs);
  const matched = map.filter(Boolean).length;
  const headless = payload.blocks.filter(function (b) { return b.level <= 0; }).length;
  const sample = payload.blocks.slice(0, 6).map(function (b) {
    return '<li style="margin-bottom:2px"><b>' + (b.level > 0 ? 'H' + b.level : '正文') + '</b>　' +
      U.esc((b.title || (b.text || '').slice(0, 28) || '（空）')) + '</li>';
  }).join('');

  const cur = Importer.currentSectionId();
  const curSec = secs.filter(function (x) { return x.id === cur; })[0];

  PLModal.open({
    title: '导入正文：' + (payload.name || '未命名文件'),
    wide: true,
    body:
      '<div class="grid grid-4" style="margin-bottom:14px">' +
      H.kpi('识别字数', U.num(payload.words) + '<small>字</small>', '按中文字符＋英文单词计') +
      H.kpi('章节标题', String(payload.headings) + '<small>个</small>', 'H1–H3 / Word 标题样式') +
      H.kpi('可并入现有章节', String(matched) + '<small>节</small>', matched ? '按标题同名或包含匹配' : '未匹配到同名章节') +
      H.kpi('前置段落', String(headless) + '<small>段</small>', '无标题的正文段落') +
      '</div>' +
      (payload.noHeading ? '<div style="font-size:12.3px;color:var(--warn);background:var(--warn-soft);padding:9px 12px;border-radius:8px;margin-bottom:12px">文档里没有识别到标题样式。若这是 .docx，请在 Word 中用「标题 1/2/3」样式标记章节；否则会整篇当作一段写入。</div>' : '') +
      '<div class="section-title">写入方式</div>' +
      '<div class="grid grid-2">' +
      '<label class="check on"><input type="radio" name="impMode" value="auto" checked><span>智能匹配<small>同名标题并入对应章节，其余追加为新章节</small></span></label>' +
      '<label class="check"><input type="radio" name="impMode" value="current"><span>全部写入当前章节<small>当前：' + U.esc(curSec ? curSec.title : '（无章节）') + '</small></span></label>' +
      '<label class="check"><input type="radio" name="impMode" value="new"><span>按标题新建章节<small>不并入现有章节，全部追加到提纲末尾</small></span></label>' +
      '<label class="check"><input type="checkbox" id="impReplace"><span>覆盖已有正文<small>仅对匹配成功的章节生效，默认是追加</small></span></label>' +
      '</div>' +
      '<div class="section-title" style="margin-top:14px">内容预览（前 6 块）</div>' +
      '<ul style="font-size:12.2px;color:var(--ink-2);line-height:1.75;margin:0;padding-left:18px">' + sample + '</ul>',
    footer: '<button class="btn" data-close="1">取消</button><button class="btn btn-primary" id="impOk">导入</button>',
    onMount: function (m) {
      m.querySelectorAll('input[name="impMode"]').forEach(function (el) {
        el.addEventListener('change', function () {
          m.querySelectorAll('input[name="impMode"]').forEach(function (x) {
            x.closest('.check').classList.toggle('on', x.checked);
          });
        });
      });
      const replaceBox = m.querySelector('#impReplace');
      if (replaceBox) replaceBox.addEventListener('change', function () {
        replaceBox.closest('.check').classList.toggle('on', replaceBox.checked);
      });
      m.querySelector('#impOk').addEventListener('click', function () {
        const modeEl = m.querySelector('input[name="impMode"]:checked');
        const replaceBox = m.querySelector('#impReplace');
        if (typeof Sync === 'object') Sync.beginLocalEdit();
        const rep = Importer.applyText(payload, {
          mode: modeEl ? modeEl.value : 'auto',
          how: replaceBox && replaceBox.checked ? 'replace' : 'append'
        });
        if (!rep.merged && !rep.created) { PLToast.show('没有可写入的内容', 'warn'); return; }
        Store.flush();
        PLModal.close();
        App.go('writing');
        App.render();
        PLToast.show('已导入 ' + U.num(rep.words) + ' 字：并入 ' + rep.merged + ' 节，新建 ' + rep.created + ' 节', 'ok');
      });
    }
  });
};

Importer.previewRefs = function (list, meta) {
  const split = Importer.splitRefs(list);
  const preview = split.fresh.slice(0, 8).map(function (r) {
    return '<li style="margin-bottom:3px">' + U.esc(r.title || '（无题名）') +
      '<span style="color:var(--faint)">　' + U.esc((r.authors || '').split(/[,;、]/)[0] || '佚名') + ' · ' + U.esc(r.year || '—') + '</span></li>';
  }).join('');

  PLModal.open({
    title: '导入文献：' + (meta.name || ''),
    wide: true,
    body:
      '<div class="grid grid-3" style="margin-bottom:14px">' +
      H.kpi('解析条目', String(list.length) + '<small>条</small>', '来自 ' + (meta.format || 'BibTeX')) +
      H.kpi('可新增', String(split.fresh.length) + '<small>条</small>', '题名与现有文献不重复') +
      H.kpi('重复跳过', String(split.dup.length) + '<small>条</small>', '按题名归一化后比对') +
      '</div>' +
      (split.fresh.length
        ? '<div class="section-title">前 8 条</div><ul style="font-size:12.2px;color:var(--ink-2);line-height:1.8;margin:0;padding-left:18px">' + preview + '</ul>'
        : '<div style="font-size:12.5px;color:var(--muted)">没有可新增的条目：全部与现有文献重名，或文件里没有可解析的记录。</div>') +
      '<div class="hint" style="margin-top:12px;font-size:11.5px;color:var(--faint)">导入后可在文献库里逐条编辑类型、卷期页码与阅读状态；被引次数由正文标记决定。</div>',
    footer: '<button class="btn" data-close="1">取消</button>' +
      (split.fresh.length ? '<button class="btn btn-primary" id="refOk">导入 ' + split.fresh.length + ' 条</button>' : ''),
    onMount: function (m) {
      const ok = m.querySelector('#refOk');
      if (!ok) return;
      ok.addEventListener('click', function () {
        if (typeof Sync === 'object') Sync.beginLocalEdit();
        split.fresh.slice().reverse().forEach(function (r) { Store.s.refs.unshift(r); });
        Store.flush();
        PLModal.close();
        App.go('refs');
        PLToast.show('已导入 ' + split.fresh.length + ' 条文献', 'ok');
      });
    }
  });
};

/* ---------------- 文件分发 ---------------- */

Importer.handleFiles = async function (files) {
  const list = Array.prototype.slice.call(files || []).filter(Boolean);
  if (!list.length) return;

  const json = [], bibs = [], ris = [], texts = [], bad = [];
  list.forEach(function (f) {
    const ext = Importer.ext(f.name);
    if (ext === 'json') json.push(f);
    else if (ext === 'bib') bibs.push(f);
    else if (ext === 'ris') ris.push(f);
    else if (ext === 'md' || ext === 'markdown' || ext === 'txt' || ext === 'docx') texts.push(f);
    else bad.push(f.name);
  });

  if (bad.length) {
    PLToast.show('不支持：' + bad.join('、') + '（可用 .bib/.ris/.md/.txt/.docx/.json）', 'warn');
  }

  if (json.length) {
    if (json.length > 1) { PLToast.show('一次只能导入一个项目 JSON', 'warn'); }
    else { await Importer.importProject(json[0]); return; }
  }

  if (bibs.length || ris.length) {
    const refs = [];
    let fmt = 'BibTeX';
    for (let i = 0; i < bibs.length; i++) {
      const t = Importer.decodeText(await bibs[i].arrayBuffer());
      refs.push.apply(refs, Importer.parseBib(t));
    }
    for (let i = 0; i < ris.length; i++) {
      const t = Importer.decodeText(await ris[i].arrayBuffer());
      refs.push.apply(refs, Importer.parseRis(t));
      if (i === 0 && !bibs.length) fmt = 'RIS';
    }
    if (!refs.length) { PLToast.show('未能解析出文献条目，请检查文件格式', 'bad'); return; }
    if (texts.length) PLToast.show('本次先处理文献；正文请再拖一次', 'warn');
    Importer.previewRefs(refs, { name: (bibs[0] || ris[0]).name, format: fmt });
    return;
  }

  if (texts.length) {
    const blocks = [];
    let words = 0, headings = 0, noHeading = false, names = [];
    for (let i = 0; i < texts.length; i++) {
      const f = texts[i];
      const ext = Importer.ext(f.name);
      names.push(f.name);
      try {
        let parsed;
        if (ext === 'docx') parsed = await Importer.parseDocx(await f.arrayBuffer());
        else {
          const t = Importer.decodeText(await f.arrayBuffer());
          parsed = (ext === 'txt') ? Importer.parsePlain(t) : Importer.parseMarkdown(t);
        }
        if (parsed.noHeading) noHeading = true;
        blocks.push.apply(blocks, parsed.blocks);
        words += parsed.words;
        headings += parsed.headings;
      } catch (e) {
        PLToast.show(f.name + '：' + (e && e.message ? e.message : '解析失败'), 'bad');
      }
    }
    if (!blocks.length) return;
    Importer.previewText({ blocks: blocks, words: words, headings: headings, noHeading: noHeading, name: names.join('、') });
    return;
  }

  if (!bad.length) PLToast.show('没有可导入的文件', 'warn');
};

/* ---------------- 拖拽层 ---------------- */

Importer.initDrop = function () {
  if (document.getElementById('dropMask')) return;
  const mask = document.createElement('div');
  mask.id = 'dropMask';
  mask.className = 'drop-mask';
  mask.innerHTML = '<div class="drop-card">' +
    '<div class="drop-ico">↧</div>' +
    '<h3>松开以导入</h3>' +
    '<p>文献 .bib / .ris　·　正文 .md / .txt / .docx　·　项目 .json</p>' +
    '<span class="drop-note">文件只在本机浏览器里解析，不会上传</span>' +
    '</div>';
  document.body.appendChild(mask);

  let depth = 0;
  const hasFiles = function (e) {
    const dt = e.dataTransfer;
    if (!dt) return false;
    if (dt.types && Array.prototype.indexOf.call(dt.types, 'Files') < 0) return false;
    return true;
  };
  const hide = function () { depth = 0; mask.classList.remove('on'); };

  window.addEventListener('dragenter', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    mask.classList.add('on');
  });
  window.addEventListener('dragover', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'copy'; } catch (err) { }
  });
  window.addEventListener('dragleave', function (e) {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) mask.classList.remove('on');
  });
  window.addEventListener('drop', function (e) {
    if (!hasFiles(e)) return;
    e.preventDefault();
    hide();
    Importer.handleFiles(e.dataTransfer.files);
  });
};

/* 文件选择器入口：各模块按钮共用 */
Importer.pick = function (accept) {
  let input = document.getElementById('impFilePicker');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'impFilePicker';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', function () {
      const files = input.files;
      input.value = '';
      if (files && files.length) Importer.handleFiles(files);
    });
  }
  input.setAttribute('accept', accept || Importer.ACCEPT);
  input.click();
};
