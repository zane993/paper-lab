/* ============================================================
   AI 协作：统一模型接入层（OpenAI 兼容协议）
   - 预设：DeepSeek / 腾讯混元 / 通义千问 / 本地 Ollama / 自建代理
   - 密钥：会话内存 / 会话存储 / 口令加密（AES-GCM）/ 明文（不推荐）
   - 调用：超时、取消、流式解析、一次重试、错误归类
   本文件不包含任何硬编码密钥，也不向第三方上报任何数据。
   ============================================================ */
const AI = {};

/* ---------------- 预设模型来源 ---------------- */
AI.providers = [
  {
    id: 'deepseek', name: 'DeepSeek（官方）',
    base: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    hint: 'OpenAI 兼容协议。浏览器直连可能被服务端 CORS 拦截，若测试失败请改用自建代理地址。'
  },
  {
    id: 'hunyuan', name: '腾讯混元 HY',
    base: 'https://api.hunyuan.cloud.tencent.com/v1',
    models: ['hunyuan-turbos-latest', 'hunyuan-pro', 'hunyuan-lite'],
    hint: '需先在腾讯云控制台开通混元服务并创建 API Key；模型名以控制台为准。'
  },
  {
    id: 'qwen', name: '通义千问（DashScope 兼容模式）',
    base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-max', 'qwen-turbo', 'qwen-long'],
    hint: '使用 DashScope 的 OpenAI 兼容地址；Key 形如 sk-xxxx，模型名如 qwen-plus。'
  },
  {
    id: 'ollama', name: '本地 Ollama（离线）',
    base: 'http://127.0.0.1:11434/v1',
    models: ['qwen2.5:7b', 'llama3.1:8b', 'deepseek-r1:7b'],
    hint: '本地推理不联网；启动时设置 OLLAMA_ORIGINS=* 以允许网页跨域访问。'
  },
  {
    id: 'custom', name: '自建代理 / 其它兼容服务',
    base: '',
    models: [],
    hint: '任何 OpenAI 兼容网关（one-api / new-api / LiteLLM / vLLM / 公司内网代理）。地址填到 /v1 为止。'
  }
];

AI.providerById = function (id) {
  return AI.providers.filter(function (p) { return p.id === id; })[0] || AI.providers[0];
};

AI.normBase = function (u) {
  let v = String(u || '').trim();
  if (!v) return '';
  v = v.replace(/\/+$/, '');
  v = v.replace(/\/chat\/completions$/i, '');
  v = v.replace(/\/models$/i, '');
  return v.replace(/\/+$/, '');
};

AI.endpoint = function (base, path) {
  return AI.normBase(base) + path;
};

/* ---------------- 密钥管理 ---------------- */
AI.KEY_STORE = 'paperlab.aikey.v1';
AI.KEY_SESSION = 'paperlab.aikey.session';
AI._plain = '';            /* 仅内存，页面关闭即失效 */
AI._unlockPrompted = false;

AI.cryptoReady = function () {
  return !!(window.crypto && window.crypto.subtle && (typeof window.isSecureContext === 'undefined' || window.isSecureContext));
};

AI.b64 = function (buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

AI.unb64 = function (str) {
  const bin = atob(str);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};

AI.deriveKey = async function (pass, salt) {
  const raw = new TextEncoder().encode(pass);
  const baseKey = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt, iterations: 150000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
};

AI.encryptKey = async function (plain, pass) {
  if (!AI.cryptoReady()) throw AI.mkErr('CRYPTO', '当前环境不支持加密存储（需要 https 或 127.0.0.1）');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await AI.deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(plain));
  return { v: 1, alg: 'AES-GCM/PBKDF2-150k', salt: AI.b64(salt), iv: AI.b64(iv), ct: AI.b64(ct) };
};

AI.decryptKey = async function (cipher, pass) {
  if (!cipher || !cipher.ct) throw AI.mkErr('CRYPTO', '没有已保存的加密密钥');
  const salt = AI.unb64(cipher.salt);
  const iv = AI.unb64(cipher.iv);
  const k = await AI.deriveKey(pass, salt);
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, k, AI.unb64(cipher.ct));
    return new TextDecoder().decode(pt);
  } catch (e) {
    throw AI.mkErr('BAD_PASS', '口令不正确，无法解密已保存的密钥');
  }
};

AI.keyVault = {
  read: function () {
    try {
      const raw = localStorage.getItem(AI.KEY_STORE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  },
  write: function (obj) {
    try {
      if (!obj) localStorage.removeItem(AI.KEY_STORE);
      else localStorage.setItem(AI.KEY_STORE, JSON.stringify(obj));
    } catch (e) { /* 忽略：退化为内存模式 */ }
  }
};

AI.keyState = function () {
  const vault = AI.keyVault.read();
  const mode = (vault && vault.mode) || 'none';
  let session = '';
  try { session = sessionStorage.getItem(AI.KEY_SESSION) || ''; } catch (e) { session = ''; }
  const locked = mode === 'encrypted' && !AI._plain;
  const has = !!(AI._plain || (mode === 'session' && session) ||
    (mode === 'encrypted' && vault && vault.cipher) ||
    (mode === 'plain' && vault && vault.key));
  return { mode: mode, has: has, locked: locked, vault: vault };
};

AI.key = function () {
  if (AI._plain) return AI._plain;
  const vault = AI.keyVault.read();
  if (vault && vault.mode === 'plain' && vault.key) return vault.key;
  try {
    const s = sessionStorage.getItem(AI.KEY_SESSION);
    if (s) return s;
  } catch (e) { /* ignore */ }
  return '';
};

AI.keyMask = function (k) {
  if (!k) return '';
  if (k.length <= 8) return '●●●●';
  return k.slice(0, 4) + '●●●●' + k.slice(-4);
};

/* 保存密钥：mode = session | encrypted | plain | none */
AI.saveKey = async function (plain, mode, pass) {
  const val = String(plain || '').trim();
  if (!val) throw AI.mkErr('EMPTY_KEY', '请先填写 API Key');
  if (mode === 'encrypted') {
    if (!pass || String(pass).length < 6) throw AI.mkErr('WEAK_PASS', '口令至少 6 位');
    const cipher = await AI.encryptKey(val, pass);
    AI.keyVault.write({ mode: 'encrypted', cipher: cipher });
    AI._plain = val;
    try { sessionStorage.removeItem(AI.KEY_SESSION); } catch (e) { }
    return { mode: mode, masked: AI.keyMask(val) };
  }
  if (mode === 'session') {
    AI._plain = val;
    try { sessionStorage.setItem(AI.KEY_SESSION, val); } catch (e) { }
    AI.keyVault.write(null);
    return { mode: mode, masked: AI.keyMask(val) };
  }
  if (mode === 'plain') {
    AI._plain = val;
    AI.keyVault.write({ mode: 'plain', key: val });
    try { sessionStorage.removeItem(AI.KEY_SESSION); } catch (e) { }
    return { mode: mode, masked: AI.keyMask(val) };
  }
  AI._plain = val;
  AI.keyVault.write(null);
  try { sessionStorage.removeItem(AI.KEY_SESSION); } catch (e) { }
  return { mode: 'none', masked: AI.keyMask(val) };
};

AI.unlockKey = async function (pass) {
  const vault = AI.keyVault.read();
  if (!vault || vault.mode !== 'encrypted' || !vault.cipher) throw AI.mkErr('NO_CIPHER', '没有加密保存的密钥');
  const plain = await AI.decryptKey(vault.cipher, pass);
  AI._plain = plain;
  return AI.keyMask(plain);
};

AI.clearKey = function () {
  AI._plain = '';
  AI.keyVault.write(null);
  try { sessionStorage.removeItem(AI.KEY_SESSION); } catch (e) { }
};

/* ---------------- 配置快照 ---------------- */
AI.cfg = function () {
  const a = (Store.s && Store.s.ai) || {};
  const num = function (v, d) { return isFinite(Number(v)) && v !== '' && v !== null ? Number(v) : d; };
  return {
    baseURL: AI.normBase(a.baseURL || ''),
    model: String(a.model || '').trim(),
    temperature: Math.min(2, Math.max(0, num(a.temperature, 0.4))),
    maxTokens: Math.min(8000, Math.max(64, num(a.maxTokens, 1200))),
    timeout: Math.min(300, Math.max(10, num(a.timeout, 60))),
    stream: a.stream !== false,
    provider: a.provider || 'deepseek'
  };
};

/* ---------------- 错误 ---------------- */
AI.mkErr = function (code, msg, hint) {
  const e = new Error(msg);
  e.code = code;
  if (hint) e.hint = hint;
  return e;
};

AI.httpError = function (status, bodyText) {
  let detail = '';
  try {
    const j = JSON.parse(bodyText);
    detail = (j.error && (j.error.message || j.error.code)) || j.message || '';
  } catch (e) {
    detail = (bodyText || '').slice(0, 200);
  }
  const map = {
    400: ['请求被拒绝（400）', '多为模型名不存在或参数越界；检查模型名大小写与 max_tokens。'],
    401: ['API Key 无效（401）', '检查 Key 是否复制完整、是否含空格、是否已吊销；自建代理还需检查令牌映射。'],
    402: ['余额不足（402）', '账户欠费或额度用尽，请充值或换用其它来源。'],
    403: ['无权限（403）', 'Key 未开通该模型，或网关拒绝来源域名；确认模型已授权。'],
    404: ['地址或模型不存在（404）', 'API 地址通常要以 /v1 结尾；模型名需与控制台一致。'],
    413: ['请求体过大（413）', '上下文太长；减少「提纲/文献」上下文或分段处理。'],
    429: ['触发限流（429）', '并发或频率超限，稍后重试；也可降低 max_tokens 或换模型。'],
    500: ['服务端错误（500）', '模型服务异常，稍后重试或切换来源。'],
    502: ['网关错误（502）', '代理后端不可用，检查自建代理的转发配置。'],
    503: ['服务繁忙（503）', '模型过载，稍后重试。'],
    504: ['网关超时（504）', '代理到上游超时，检查网络或调大超时时间。']
  };
  const m = map[status] || [('请求失败（' + status + '）'), '查看服务端返回内容判断原因。'];
  const msg = m[0] + (detail ? '：' + detail : '');
  return AI.mkErr('HTTP_' + status, msg, m[1]);
};

AI.normalizeError = function (e) {
  if (e && e.code) return e;
  if (!e) return AI.mkErr('UNKNOWN', '未知错误');
  if (e.name === 'AbortError') {
    return AI.mkErr('ABORT', '请求已取消或超时', '可在「模型配置 → 超时」调大秒数，或检查网络。');
  }
  if (e instanceof TypeError || /Failed to fetch|NetworkError|Load failed/i.test(e.message || '')) {
    return AI.mkErr('NETWORK', '网络不通或被 CORS 拦截',
      '浏览器直连第三方 API 常被跨域策略拒绝：请改用自建代理地址，或使用支持跨域的服务（本地 Ollama 可设 OLLAMA_ORIGINS=*）。');
  }
  return AI.mkErr('UNKNOWN', e.message || String(e));
};

AI.describeError = function (e) {
  const err = AI.normalizeError(e);
  return { code: err.code || '', msg: err.message || '', hint: err.hint || '' };
};

/* ---------------- HTTP 调用 ---------------- */
AI.abort = function () {
  if (AI._ctrl) { try { AI._ctrl.abort(); } catch (e) { } AI._ctrl = null; }
};

AI.readStream = async function (res, onDelta) {
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  if (ctype.indexOf('text/event-stream') < 0) {
    /* 服务端忽略了 stream 参数，按整包 JSON 处理 */
    const data = await res.json().catch(function () { return null; });
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const text = c || '';
    if (text && onDelta) onDelta(text);
    return { text: text, usage: (data && data.usage) || null, mode: 'json' };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder('utf-8');
  let buf = '';
  let out = '';
  let usage = null;
  let finished = false;
  while (!finished) {
    const r = await reader.read();
    if (r.done) break;
    buf += dec.decode(r.value, { stream: true });
    buf = buf.replace(/\r\n/g, '\n');
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const lines = chunk.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.indexOf('data:') !== 0) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') { finished = true; break; }
        try {
          const j = JSON.parse(payload);
          if (j.usage) usage = j.usage;
          const ch = j.choices && j.choices[0];
          const piece = (ch && ((ch.delta && ch.delta.content) || (ch.message && ch.message.content))) || '';
          if (piece) { out += piece; if (onDelta) onDelta(piece); }
        } catch (e) { /* 分片不完整时跳过 */ }
      }
    }
  }
  return { text: out, usage: usage, mode: 'sse' };
};

AI.chatOnce = async function (cfg, key, messages, useStream, onDelta) {
  const url = AI.endpoint(cfg.baseURL, '/chat/completions');
  const ctrl = new AbortController();
  AI._ctrl = ctrl;
  const timer = setTimeout(function () { ctrl.abort(); }, cfg.timeout * 1000);
  let got = false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Accept': useStream ? 'text/event-stream, application/json' : 'application/json'
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        stream: !!useStream
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const t = await res.text().catch(function () { return ''; });
      throw AI.httpError(res.status, t);
    }
    if (useStream) {
      const r = await AI.readStream(res, function (piece) {
        got = true;
        if (onDelta) onDelta(piece);
      });
      return r;
    }
    const data = await res.json();
    const c = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    const text = c || '';
    if (text && onDelta) onDelta(text);
    if (text) got = true;
    return { text: text, usage: (data && data.usage) || null, mode: 'json' };
  } catch (e) {
    const err = AI.normalizeError(e);
    err.partial = got;
    throw err;
  } finally {
    clearTimeout(timer);
    if (AI._ctrl === ctrl) AI._ctrl = null;
  }
};

AI.chat = async function (opt) {
  const o = opt || {};
  const cfg = AI.cfg();
  const key = AI.key();
  if (!cfg.baseURL) throw AI.mkErr('NO_BASE', '未配置 API 地址', '在「模型配置」选择来源或填写自建代理地址（含 /v1）。');
  if (!cfg.model) throw AI.mkErr('NO_MODEL', '未配置模型名', '选择来源后会自动填入常用模型名，也可手动修改。');
  if (!key) throw AI.mkErr('NO_KEY', '未配置 API Key', '填入密钥后点「保存密钥」；也可选择「仅本次会话」。');

  const useStream = o.stream !== undefined ? !!o.stream : cfg.stream;
  const messages = o.messages || [];
  const started = Date.now();
  let attempt = 0;
  let lastErr = null;

  while (attempt < 2) {
    try {
      const r = await AI.chatOnce(cfg, key, messages, useStream, o.onDelta);
      const text = (r.text || '').trim();
      if (!text) {
        throw AI.mkErr('EMPTY', '模型返回为空', '可能是模型名不支持、内容被安全策略过滤，或 max_tokens 太小。');
      }
      const st = Store.s.ai.stats || { calls: 0, lastTokens: null };
      st.calls = (st.calls || 0) + 1;
      if (r.usage) st.lastTokens = (r.usage.total_tokens || r.usage.totalTokens) || null;
      st.lastMs = Date.now() - started;
      Store.s.ai.stats = st;
      return { text: text, ms: Date.now() - started, usage: r.usage || null, mode: r.mode };
    } catch (e) {
      lastErr = AI.normalizeError(e);
      const retriable = ['HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504'].indexOf(lastErr.code) >= 0;
      if (attempt === 0 && retriable && !lastErr.partial) {
        attempt++;
        await new Promise(function (res) { setTimeout(res, 900); });
        continue;
      }
      throw lastErr;
    }
  }
  throw lastErr || AI.mkErr('UNKNOWN', '调用失败');
};

/* ---------------- 连接测试 ---------------- */
AI.test = async function (overrideCfg) {
  const cfg = Object.assign({}, AI.cfg(), overrideCfg || {});
  const key = AI.key();
  if (!cfg.baseURL) return { ok: false, ms: 0, msg: '未填写 API 地址', hint: '地址一般以 /v1 结尾。' };
  if (!key) return { ok: false, ms: 0, msg: '未填写 API Key', hint: '填入后点「保存密钥」，再测试。' };
  const t0 = Date.now();

  /* 1) 优先探 /models：能同时验证地址、鉴权与跨域 */
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(function () { ctrl.abort(); }, 12000);
    let res;
    try {
      res = await fetch(AI.endpoint(cfg.baseURL, '/models'), {
        headers: { 'Authorization': 'Bearer ' + key, 'Accept': 'application/json' },
        signal: ctrl.signal
      });
    } finally {
      clearTimeout(timer);
    }
    if (res.ok) {
      const j = await res.json().catch(function () { return null; });
      const list = (j && j.data) || [];
      const ids = list.map(function (x) { return x.id; }).filter(Boolean);
      const has = ids.length ? (ids.indexOf(cfg.model) >= 0 ? '，已找到当前模型' : '，但列表中未见「' + cfg.model + '」') : '';
      return {
        ok: true, ms: Date.now() - t0,
        msg: '连接成功（模型列表可用' + (ids.length ? '，共 ' + ids.length + ' 个' : '') + has + '）',
        models: ids.slice(0, 40)
      };
    }
    if (res.status === 401 || res.status === 403) {
      const e = AI.httpError(res.status, await res.text().catch(function () { return ''; }));
      return { ok: false, ms: Date.now() - t0, msg: e.message, hint: e.hint };
    }
  } catch (e) {
    const err = AI.normalizeError(e);
    /* 网络/CORS 问题直接返回，避免再打一次 */
    if (err.code === 'NETWORK') {
      return { ok: false, ms: Date.now() - t0, msg: err.message, hint: err.hint };
    }
    /* 其余情况（如 /models 404）继续用最小对话请求探测 */
  }

  /* 2) 最小对话请求 */
  try {
    const r = await AI.chatOnce(cfg, key, [{ role: 'user', content: 'ping' }], false);
    return {
      ok: true, ms: Date.now() - t0,
      msg: '连接成功（对话接口可用，返回 ' + (r.text || '').replace(/\s+/g, ' ').slice(0, 40) + '…）'
    };
  } catch (e) {
    const err = AI.normalizeError(e);
    return { ok: false, ms: Date.now() - t0, msg: err.message, hint: err.hint };
  }
};

/* ---------------- 提示词与上下文 ---------------- */
AI.systemPrompt = function () {
  return [
    '你是善驮论文工坊的学术写作协作助手。作者是论文的唯一责任人，你负责结构、表达与质疑，不替作者下结论。',
    '硬性规则：',
    '1. 不得虚构文献、数据、页码、统计量；需要引用但无法确认时写 [待补文献]，需要作者补充信息时写 [需确认]。',
    '2. 不输出整篇论文；每次只处理指定的章节或片段，单次正文建议不超过 800 字。',
    '3. 润色时保留专业术语、引用标记（形如 [@r1]）、数字与主张强度（不得把“可能”改成“必然”）。',
    '4. 中文写作，学术书面语；避免“首先/其次/最后”式的空转套话与形容词堆砌。',
    '5. 信息不足时，先列 1-3 个关键问题，再给初步建议，不要编造事实填空。',
    '6. 输出结构固定：① 判断/建议　② 可直接使用的文本（如有，用引用块）　③ 风险与待补材料。'
  ].join('\n');
};

AI.actions = [
  {
    id: 'skeleton', label: '生成论证骨架',
    prompt: '为「{sec}」生成 3-5 句论证骨架：每句给「论点—证据类型—限定条件」，并列出我需要补充的证据清单。'
  },
  {
    id: 'polish', label: '润色本节',
    prompt: '润色「{sec}」：先给不超过 3 条问题诊断，再给改写后的完整段落（保留全部引用标记与数字），最后标注改动级别（轻/中/重）。'
  },
  {
    id: 'challenge', label: '审稿人质疑',
    prompt: '以严格审稿人的身份质疑「{sec}」：列出 3 条最可能被质疑的问题（证据-结论跳跃、替代解释、边界条件缺失），每条给最小补证动作。'
  },
  {
    id: 'transition', label: '过渡句',
    prompt: '为「{sec}」与下一节之间写 3 个过渡句候选，保持论证链条，不引入新证据。'
  },
  {
    id: 'abstract', label: '重写摘要',
    prompt: '基于当前项目信息重写摘要（200-300 字），遵循「问题—方法—结果—结论」，不得添加我没有提供的结果。'
  },
  {
    id: 'outline', label: '质疑提纲',
    prompt: '审视当前提纲：指出结构缺环（缺失章节、顺序问题、层级不当），给 2 套调整方案并说明各自代价。'
  }
];

AI.actionById = function (id) {
  return AI.actions.filter(function (a) { return a.id === id; })[0] || null;
};

AI.currentSection = function (s) {
  const secs = (s.outline && s.outline.sections) || [];
  const cur = secs.filter(function (x) { return x.id === (s.ui && s.ui.secId); })[0];
  return cur || secs[0] || null;
};

AI.sectionNumber = function (s, sec) {
  if (!sec) return '';
  const secs = (s.outline && s.outline.sections) || [];
  let c1 = 0, c2 = 0;
  for (let i = 0; i < secs.length; i++) {
    if (secs[i].level === 1) { c1++; c2 = 0; }
    else { c2++; }
    if (secs[i].id === sec.id) return sec.level === 1 ? String(c1) : (c1 + '.' + c2);
  }
  return '';
};

AI.buildContext = function (s, include) {
  const inc = include || { section: true, outline: true, refs: true };
  const parts = [];
  const m = s.meta || {};
  parts.push('【项目】' + (m.title || '（未命名）') + '｜' + (m.degree || '') + '｜领域：' + (m.field || '未填') +
    '｜目标字数：' + (m.targetWords || 0));

  const q = s.topic && s.topic.eval && s.topic.eval.question;
  const gap = s.topic && s.topic.eval && s.topic.eval.gap;
  if (q) parts.push('【研究问题】' + q);
  if (gap) parts.push('【研究缺口】' + gap);
  if (m.abstract) parts.push('【现有摘要】' + String(m.abstract).slice(0, 600));

  if (inc.outline) {
    const secs = (s.outline && s.outline.sections) || [];
    if (secs.length) {
      let c1 = 0, c2 = 0;
      const lines = secs.map(function (x) {
        if (x.level === 1) { c1++; c2 = 0; return c1 + ' ' + x.title + '（目标 ' + (x.target || 0) + ' 字）'; }
        c2++;
        return '  ' + c1 + '.' + c2 + ' ' + x.title + '（目标 ' + (x.target || 0) + ' 字）';
      });
      parts.push('【提纲】\n' + lines.join('\n').slice(0, 2000));
    }
  }

  if (inc.refs) {
    const refs = (s.refs || []).slice(0, 20);
    if (refs.length) {
      parts.push('【可引用文献】\n' + refs.map(function (r) {
        return '[@' + r.id + '] ' + (r.authors || '') + '. ' + (r.title || '') + '. ' + (r.source || '') + ', ' + (r.year || '');
      }).join('\n').slice(0, 1600));
    }
  }

  if (inc.section) {
    const sec = AI.currentSection(s);
    if (sec) {
      const num = AI.sectionNumber(s, sec);
      const body = String(sec.text || '').slice(0, 4000);
      parts.push('【当前章节】' + (num ? num + ' ' : '') + sec.title + (body ? '\n正文：\n' + body : '\n（本节尚无正文）'));
    }
  }
  return parts.join('\n\n');
};

AI.buildMessages = function (s, opt) {
  const o = opt || {};
  const ctx = AI.buildContext(s, s.ai && s.ai.include);
  const sys = AI.systemPrompt() + '\n\n' + ctx;
  const hist = ((s.ai && s.ai.messages) || []).filter(function (x) { return x.role === 'user' || x.role === 'assistant'; });
  const recent = hist.slice(-8).map(function (x) {
    return { role: x.role, content: String(x.content || '').slice(0, 2000) };
  });
  const msgs = [{ role: 'system', content: sys }].concat(recent);
  if (o.userText) msgs.push({ role: 'user', content: o.userText });
  return msgs;
};

AI.actionPrompt = function (s, actionId, extra) {
  const act = AI.actionById(actionId);
  const sec = AI.currentSection(s);
  const title = sec ? ((AI.sectionNumber(s, sec) ? AI.sectionNumber(s, sec) + ' ' : '') + sec.title) : '当前章节';
  let p = act ? act.prompt.replace(/\{sec\}/g, title) : (extra || '');
  if (act && extra) p += '\n\n我的补充要求：' + extra;
  return p;
};

/* ---------------- 纯函数：文本应用 ---------------- */
AI.applyText = function (sec, text, mode) {
  if (!sec) return '';
  const t = String(text || '').trim();
  if (!t) return sec.text || '';
  if (mode === 'replace') return t;
  const old = String(sec.text || '').replace(/\s+$/, '');
  return old ? old + '\n\n' + t : t;
};

/* ---------------- 用量估算（粗略，仅提示用） ---------------- */
AI.estimateTokens = function (text) {
  const s = String(text || '');
  const zh = (s.match(/[\u4e00-\u9fa5]/g) || []).length;
  const other = s.length - zh;
  return Math.round(zh * 1.05 + other / 3.6);
};
