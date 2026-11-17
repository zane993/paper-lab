/* Node 单测：不依赖浏览器与第三方包，CI 里直接 node tests/parsers.test.js */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/importer.js'), 'utf8');

/* 最小依赖桩：只用 importer 需要的 U / Store */
const ctx = {
  console: console,
  TextDecoder: TextDecoder,
  Blob: typeof Blob !== 'undefined' ? Blob : undefined,
  Response: typeof Response !== 'undefined' ? Response : undefined,
  U: {
    uid: (function () { let n = 0; return function (p) { return (p || 'id') + '_' + (++n); }; })(),
    countWords: function (t) {
      if (!t) return 0;
      const cjk = (String(t).match(/[\u3400-\u9fff\u3040-\u30ff]/g) || []).length;
      const en = (String(t).match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) || []).length;
      return cjk + en;
    }
  },
  Store: { s: { refs: [], outline: { sections: [] }, ui: { secId: null } } },
  window: {},
  document: {}
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(source + '\n;globalThis.__Importer = Importer;', ctx, { filename: 'importer.js' });
const I = ctx.__Importer;

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? '  →  ' + extra : '')); }
}

/* ---------- Markdown ---------- */
console.log('Markdown');
const md = [
  '# 第一章 绪论',
  '',
  '本文讨论 **生成式 AI** 的[应用边界](https://example.com)，参见 `[@r1]`。',
  '第二行硬换行。',
  '',
  '## 1.1 研究背景',
  '',
  '- 列表项一',
  '- 列表项二',
  '',
  '> 引用块内容',
  '',
  '```',
  '# 代码里的井号不是标题',
  '```'
].join('\n');
const mdRes = I.parseMarkdown(md);
ok('识别 2 个标题', mdRes.headings === 2, 'got ' + mdRes.headings);
ok('首节标题去掉编号前缀保留原文', mdRes.blocks[0].title === '第一章 绪论', mdRes.blocks[0].title);
ok('链接保留文字丢弃地址', mdRes.blocks[0].text.indexOf('应用边界') >= 0 && mdRes.blocks[0].text.indexOf('example.com') < 0, mdRes.blocks[0].text);
ok('强调符号被清理', mdRes.blocks[0].text.indexOf('**') < 0, mdRes.blocks[0].text);
ok('硬换行中文之间不插空格', mdRes.blocks[0].text.indexOf('参见 [@r1]。第二行') >= 0, JSON.stringify(mdRes.blocks[0].text));
ok('列表转 · 前缀', mdRes.blocks[1].text.indexOf('· 列表项一') >= 0, mdRes.blocks[1].text);
ok('代码块内的 # 不当作标题', mdRes.blocks.some(function (b) { return b.title.indexOf('代码里的井号') >= 0; }) === false);
ok('引用块符号被去掉', mdRes.blocks[1].text.indexOf('> ') < 0, mdRes.blocks[1].text);

/* ---------- 纯文本 ---------- */
console.log('纯文本');
const plain = ['第一章 绪论', '这里是绪论正文。', '', '1.1 研究背景', '背景正文。', '', '第二章 方法', '方法正文。'].join('\n');
const plainRes = I.parsePlain(plain);
ok('识别 3 个标题', plainRes.headings === 3, 'got ' + plainRes.headings);
ok('章为 1 级', plainRes.blocks[0].level === 1, String(plainRes.blocks[0].level));
ok('小节为 2 级', plainRes.blocks[1].level === 2, String(plainRes.blocks[1].level));

/* ---------- BibTeX ---------- */
console.log('BibTeX');
const bib = [
  '@article{li2024,',
  '  author = {李明 and 王芳 and Chen, San},',
  '  title = {生成式人工智能的{应用}边界},',
  '  journal = "开放教育研究",',
  '  year = {2024},',
  '  volume = {30},',
  '  number = {2},',
  '  pages = {45--56},',
  '  doi = {10.1000/xyz}',
  '}',
  '',
  '@inproceedings{swan2023,',
  '  author = {Swanson, D.},',
  '  title = {Teacher mediation},',
  '  booktitle = {Proceedings of AIED},',
  '  year = 2023,',
  '  address = {Berlin}',
  '}'
].join('\n');
const bibRes = I.parseBib(bib);
ok('解析 2 条', bibRes.length === 2, 'got ' + bibRes.length);
ok('and 转逗号', bibRes[0].authors === '李明, 王芳, Chen, San', bibRes[0].authors);
ok('嵌套花括号被剥离', bibRes[0].title === '生成式人工智能的应用边界', bibRes[0].title);
ok('双引号取值', bibRes[0].source === '开放教育研究', bibRes[0].source);
ok('页码 -- 归一为 -', bibRes[0].pages === '45-56', bibRes[0].pages);
ok('year 无括号形式', bibRes[1].year === '2023', bibRes[1].year);
ok('会议类型映射', bibRes[1].type === 'conf', bibRes[1].type);

/* ---------- RIS ---------- */
console.log('RIS');
const ris = [
  'TY  - JOUR',
  'AU  - 张华',
  'AU  - 陈晓',
  'TI  - 智能辅导系统对初中数学成绩的影响',
  'JO  - 中国电化教育',
  'PY  - 2023',
  'VL  - 12',
  'IS  - 5',
  'SP  - 101',
  'EP  - 108',
  'DO  - 10.1000/abc',
  'ER  - ',
  '',
  'TY  - BOOK',
  'AU  - 王强',
  'TI  - 质性研究方法',
  'PB  - 示例出版社',
  'CY  - 北京',
  'PY  - 2020',
  'ER  - '
].join('\n');
const risRes = I.parseRis(ris);
ok('解析 2 条', risRes.length === 2, 'got ' + risRes.length);
ok('多作者合并', risRes[0].authors === '张华, 陈晓', risRes[0].authors);
ok('页码拼接', risRes[0].pages === '101-108', risRes[0].pages);
ok('专著出版社落到来源', risRes[1].source === '示例出版社', risRes[1].source);
ok('类型映射 book', risRes[1].type === 'book', risRes[1].type);

/* ---------- 标题归一化与匹配 ---------- */
console.log('标题匹配');
ok('去编号与空格', I.normalizeTitle('3.2 分析框架构建') === '分析框架构建', I.normalizeTitle('3.2 分析框架构建'));
ok('去中文序号', I.normalizeTitle('第二章 研究设计') === '研究设计', I.normalizeTitle('第二章 研究设计'));
const secs = [
  { id: 'a', title: '2.1 分析框架构建' },
  { id: 'b', title: '研究设计' },
  { id: 'c', title: '结论与展望' }
];
const blocks = [
  { level: 2, title: '分析框架构建', text: 'x' },
  { level: 1, title: '第三章 研究设计', text: 'y' },
  { level: 1, title: '参考文献', text: 'z' }
];
const map = I.matchBlocks(blocks, secs);
ok('同名去编号后匹配', map[0] === 'a', String(map[0]));
ok('章号不同但标题一致可匹配', map[1] === 'b', String(map[1]));
ok('无对应章节返回 null', map[2] === null, String(map[2]));

/* ---------- 文献去重 ---------- */
console.log('文献去重');
ctx.Store.s.refs = [{ title: '生成式人工智能的应用边界' }];
const split = I.splitRefs([{ title: '3.2 生成式人工智能的应用边界' }, { title: '别的题名' }]);
ok('归一化后判重', split.fresh.length === 1 && split.dup.length === 1, 'fresh=' + split.fresh.length + ' dup=' + split.dup.length);

/* ---------- ZIP 中央目录解析（docx 容器） ---------- */
console.log('ZIP 容器');
const CRC_TABLE = (function () {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  files.forEach(function (f) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.from(f.data, 'utf8');
    const comp = zlib.deflateRawSync(raw);
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(comp.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    locals.push(lh, name, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(8, 10);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(comp.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += lh.length + name.length + comp.length;
  });
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat(locals.concat([centralBuf, eocd]));
}

const docx = zip([
  { name: '[Content_Types].xml', data: '<?xml version="1.0"?><Types/>' },
  { name: 'word/document.xml', data: '<?xml version="1.0"?><w:document xmlns:w="x"><w:body/></w:document>' }
]);
const entry = I.zipEntry(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.length), 'word/document.xml');
ok('找到 document.xml', !!entry, entry ? '' : 'null');
ok('记录压缩方法 deflate', !!entry && entry.method === 8, entry ? String(entry.method) : '');
ok('压缩数据非空', !!entry && entry.data.length > 0, entry ? String(entry.data.length) : '');
const missing = I.zipEntry(docx.buffer.slice(docx.byteOffset, docx.byteOffset + docx.length), 'word/styles.xml');
ok('缺失条目返回 null', missing === null);

/* ---------- 汇总 ---------- */
console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
process.exit(fail ? 1 : 0);
