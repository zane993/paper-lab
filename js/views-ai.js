/* ============================================================
   视图：AI 写作协作
   ============================================================ */

/* 轻量富文本：转义后处理 ``` / `code` / **粗体** / 换行 */
function aiFmt(text) {
  const esc = U.esc(String(text || ''));
  const parts = esc.split(/```/);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out += '<pre class="ai-pre">' + parts[i].replace(/^\n+|\n+$/g, '') + '</pre>';
    } else if (parts[i].trim()) {
      out += '<p>' + parts[i]
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<b>$1</b>')
        .replace(/(^|\n)&gt;\s?([^\n]*)/g, '$1<span class="ai-quote">$2</span>')
        .replace(/\n{2,}/g, '</p><p>')
        .replace(/\n/g, '<br>') + '</p>';
    }
  }
  return out;
}

function aiPassPrompt(title, desc) {
  return new Promise(function (resolve) {
    const root = PLModal.open({
      title: title,
      body: '<div style="font-size:12.8px;line-height:1.8;color:var(--muted)">' + U.esc(desc || '') + '</div>' +
        '<div class="field" style="margin-top:10px"><label>口令</label>' +
        '<input class="input" type="password" id="aiPass" autocomplete="new-password" placeholder="至少 6 位">' +
        '</div>',
      footer: '<button class="btn" data-close="1">取消</button>' +
        '<button class="btn btn-primary" id="aiPassOk">确定</button>'
    });
    if (!root) return resolve(null);
    const input = root.querySelector('#aiPass');
    const done = function (v) { PLModal.close(); resolve(v); };
    root.querySelector('#aiPassOk').addEventListener('click', function () {
      done((input.value || '').trim() || null);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') done((input.value || '').trim() || null);
    });
    setTimeout(function () { try { input.focus(); } catch (e) { } }, 30);
  });
}

Views.ai = function (root) {
  const s = Store.s;
  const a = s.ai;
  const cfg = AI.cfg();
  const ks = AI.keyState();
  const sec = AI.currentSection(s);
  const secTitle = sec ? ((AI.sectionNumber(s, sec) ? AI.sectionNumber(s, sec) + ' ' : '') + sec.title) : '（尚无章节）';
  const prov = AI.providerById(cfg.provider);
  const ctxTokens = AI.estimateTokens(AI.buildContext(s, a.include));
  const pending = a.pending;
  if (pending) a.pending = null;

  const liveKey = AI.key();
  const keyStateText = ks.locked
    ? '<span class="badge warn">已加密保存 · 未解锁</span>'
    : liveKey
      ? '<span class="badge ok">已就绪 · ' + U.esc(AI.keyMask(liveKey)) + '</span>'
      : (ks.has ? '<span class="badge warn">已保存但不可用</span>' : '<span class="badge bad">未配置密钥</span>');

  const modeLabel = { encrypted: '口令加密保存（推荐）', session: '仅本次会话（关页面即失效）', plain: '明文保存在本机（不推荐）', none: '不保存（每次输入）' };

  /* ---------- 左：模型配置 ---------- */
  const cfgCard =
    H.card('模型接入',
      '<div class="field"><label>模型来源</label>' +
      '<select class="select" id="aiProvider">' +
      AI.providers.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === cfg.provider ? ' selected' : '') + '>' + U.esc(p.name) + '</option>';
      }).join('') + '</select>' +
      '<span class="hint">' + U.esc(prov.hint || '') + '</span></div>' +

      '<div class="field"><label>API 地址（OpenAI 兼容 base）<span class="req">*</span></label>' +
      '<input class="input" id="aiBase" value="' + U.attr(a.baseURL || '') + '" placeholder="https://api.deepseek.com/v1" spellcheck="false">' +
      '<span class="hint">填到 /v1 为止；自建代理请填写完整地址（如 http://127.0.0.1:3000/v1）。</span></div>' +

      '<div class="field"><label>模型名<span class="req">*</span></label>' +
      '<input class="input" id="aiModel" value="' + U.attr(a.model || '') + '" placeholder="deepseek-chat" list="aiModelList" spellcheck="false">' +
      '<datalist id="aiModelList">' +
      (prov.models || []).concat(a.modelsFound || []).filter(function (v, i, arr) { return v && arr.indexOf(v) === i; })
        .map(function (m) { return '<option value="' + U.attr(m) + '">'; }).join('') +
      '</datalist>' +
      '<span class="hint">来源切换后会自动填入常用模型名，可手动改为控制台里的任意模型。</span></div>' +

      '<div class="field"><label>API Key</label>' +
      '<div class="row tight">' +
      '<input class="input" type="password" id="aiKey" value="" autocomplete="new-password" spellcheck="false" placeholder="sk-…" style="flex:1 1 160px">' +
      '<button class="btn btn-sm" id="aiKeySave">保存密钥</button>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:wrap">' + keyStateText +
      (ks.locked ? '<button class="btn btn-xs" id="aiKeyUnlock">解锁</button>' : '') +
      (ks.has ? '<button class="btn btn-xs btn-ghost" id="aiKeyClear">清除</button>' : '') +
      '</div></div>' +

      '<div class="field"><label>保存方式</label>' +
      '<select class="select" id="aiKeyMode">' +
      ['encrypted', 'session', 'plain', 'none'].map(function (m) {
        return '<option value="' + m + '"' + ((a.keyMode || 'encrypted') === m ? ' selected' : '') + '>' + modeLabel[m] + '</option>';
      }).join('') + '</select>' +
      '<span class="hint">' + (AI.cryptoReady()
        ? '加密使用 WebCrypto AES-GCM（PBKDF2 15 万次）。口令不落盘，忘记无法找回。'
        : '当前环境不支持 WebCrypto（需 https 或 127.0.0.1），加密选项不可用，请选「仅本次会话」。') + '</span></div>' +

      '<div class="field"><label>温度 <b id="aiTempVal" style="font-weight:600;color:var(--ink)">' + cfg.temperature.toFixed(2) + '</b></label>' +
      '<input type="range" id="aiTemp" min="0" max="1.5" step="0.05" value="' + cfg.temperature + '" style="width:100%">' +
      '<span class="hint">写作建议 0.2–0.6；越高越发散，越低越保守。</span></div>' +

      '<div class="grid grid-2" style="gap:10px">' +
      '<div class="field"><label>最大输出 tokens</label>' +
      '<input class="input" type="number" id="aiMax" min="64" max="8000" step="64" value="' + cfg.maxTokens + '"></div>' +
      '<div class="field"><label>超时（秒）</label>' +
      '<input class="input" type="number" id="aiTimeout" min="10" max="300" step="5" value="' + cfg.timeout + '"></div>' +
      '</div>' +

      '<div class="field"><label>流式输出</label>' +
      '<label class="check' + (cfg.stream ? ' on' : '') + '"><input type="checkbox" id="aiStream"' + (cfg.stream ? ' checked' : '') + '><span>边生成边显示<small>关闭后一次性返回，适合不支持 SSE 的代理或对稳定性要求更高的网络</small></span></label></div>' +

      '<div class="row tight" style="margin-top:6px;align-items:center">' +
      '<button class="btn btn-sm" id="aiTest">测试连接</button>' +
      '<span id="aiTestOut" style="font-size:11.8px;color:var(--muted);line-height:1.6">' +
      (a.lastTest
        ? (a.lastTest.ok ? '<span style="color:var(--ok)">上次成功</span>' : '<span style="color:var(--bad)">上次失败</span>') + ' · ' + U.esc(a.lastTest.msg || '') + ' · ' + (a.lastTest.ms || 0) + 'ms'
        : '尚未测试') +
      '</span></div>',
      {
        note: '密钥只存在本机：加密模式存 localStorage（密文），会话模式存 sessionStorage，明文模式建议只在个人电脑使用。项目 JSON 导出不包含密钥。'
      });

  /* ---------- 右：对话 ---------- */
  const msgs = (a.messages || []);
  const chatHtml = msgs.length
    ? msgs.map(function (m, i) {
      if (m.role === 'user') {
        return '<div class="msg user"><div class="msg-b">' + aiFmt(m.content) + '</div></div>';
      }
      return '<div class="msg ai">' +
        '<div class="msg-h">助手' + (m.action ? ' · ' + U.esc((AI.actionById(m.action) || {}).label || '') : '') +
        (m.ms ? ' · ' + m.ms + 'ms' : '') + '</div>' +
        '<div class="msg-b">' + aiFmt(m.content) + '</div>' +
        '<div class="msg-f">' +
        '<button class="btn btn-xs" data-ai-apply="' + i + '">采用到章节</button>' +
        '<button class="btn btn-xs btn-ghost" data-ai-copy="' + i + '">复制</button>' +
        '</div></div>';
    }).join('')
    : '<div class="ai-empty">' +
    '<b>先选一个动作，或直接描述你要什么</b>' +
    '<p>助手会带着当前章节、提纲与文献题录作为上下文；输出的文本不会自动写入正文，需你点「采用到章节」。</p>' +
    '</div>';

  const quick = AI.actions.map(function (x) {
    return '<button class="chip" data-ai-act="' + x.id + '">' + U.esc(x.label) + '</button>';
  }).join('');

  const chatCard = H.card('',
    '<div class="ai-chat-head">' +
    '<div><b>' + U.esc(cfg.model || '未选择模型') + '</b>' +
    '<span class="ai-dim">' + U.esc(prov.name) + ' · 当前章节：' + U.esc(secTitle) + '</span></div>' +
    '<div class="ai-dim">调用 ' + ((a.stats && a.stats.calls) || 0) + ' 次' +
    ((a.stats && a.stats.lastMs) ? ' · 上次 ' + a.stats.lastMs + 'ms' : '') + '</div>' +
    '</div>' +

    '<div class="ai-msgs" id="aiMsgs">' + chatHtml + '</div>' +

    '<div class="ai-foot">' +
    '<div class="chip-row" style="margin-bottom:8px">' + quick + '</div>' +
    '<div class="ai-ctx">' +
    '<label class="check' + (a.include.section ? ' on' : '') + '"><input type="checkbox" id="aiCtxSection"' + (a.include.section ? ' checked' : '') + '><span>本章节</span></label>' +
    '<label class="check' + (a.include.outline ? ' on' : '') + '"><input type="checkbox" id="aiCtxOutline"' + (a.include.outline ? ' checked' : '') + '><span>提纲</span></label>' +
    '<label class="check' + (a.include.refs ? ' on' : '') + '"><input type="checkbox" id="aiCtxRefs"' + (a.include.refs ? ' checked' : '') + '><span>文献题录</span></label>' +
    '<span class="ai-dim">上下文约 ' + U.num(ctxTokens) + ' tokens（估算）</span>' +
    '</div>' +
    '<textarea class="textarea" id="aiInput" rows="3" placeholder="描述你要的处理，例如：把这段讨论改得更克制，保留 [@r3] 的引用，指出还缺什么证据…">' +
    U.esc(pending && pending.draft ? pending.draft : '') + '</textarea>' +
    '<div class="row tight" style="margin-top:8px;align-items:center">' +
    '<button class="btn btn-primary" id="aiSend">发送（Ctrl+Enter）</button>' +
    '<button class="btn" id="aiStop" disabled>停止</button>' +
    '<span class="ai-dim" id="aiHint">密钥与配置只存在本机；输出仅供参考，引用需自行核实。</span>' +
    '</div>' +
    '</div>',
    { flush: false });

  root.innerHTML =
    H.head('模块 09 · 协作',
      'AI 写作协作',
      '统一接入 DeepSeek / 腾讯混元 / 通义千问 / 本地 Ollama / 自建代理（OpenAI 兼容协议）。助手只给建议与候选文本，写入正文必须由你点击「采用到章节」。',
      '<button class="btn" data-nav="writing">回到正文写作</button>' +
      '<button class="btn btn-ghost" id="aiClearChat">清空对话</button>') +
    '<div class="ai-grid">' +
    '<div>' + cfgCard + '</div>' +
    '<div>' + chatCard + '</div>' +
    '</div>';

  const msgsEl = root.querySelector('#aiMsgs');
  const ta = root.querySelector('#aiInput');
  const sendBtn = root.querySelector('#aiSend');
  const stopBtn = root.querySelector('#aiStop');
  const hintEl = root.querySelector('#aiHint');
  const scrollBottom = function () { if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight; };
  scrollBottom();

  /* ---------- 配置交互 ---------- */
  const save = function () { Store.save(); };

  root.querySelector('#aiProvider').addEventListener('change', function (e) {
    const p = AI.providerById(e.target.value);
    s.ai.provider = p.id;
    s.ai.baseURL = p.base;
    s.ai.model = (p.models && p.models[0]) || '';
    s.ai.modelsFound = [];
    save();
    App.render();
  });

  root.querySelector('#aiBase').addEventListener('input', function (e) {
    s.ai.baseURL = e.target.value.trim();
    save();
  });
  root.querySelector('#aiModel').addEventListener('input', function (e) {
    s.ai.model = e.target.value.trim();
    save();
  });
  root.querySelector('#aiTemp').addEventListener('input', function (e) {
    s.ai.temperature = Number(e.target.value);
    const lab = root.querySelector('#aiTempVal');
    if (lab) lab.textContent = Number(e.target.value).toFixed(2);
    save();
  });
  root.querySelector('#aiMax').addEventListener('input', function (e) {
    s.ai.maxTokens = Number(e.target.value) || 1200;
    save();
  });
  root.querySelector('#aiTimeout').addEventListener('input', function (e) {
    s.ai.timeout = Number(e.target.value) || 60;
    save();
  });
  root.querySelector('#aiStream').addEventListener('change', function (e) {
    s.ai.stream = !!e.target.checked;
    save();
  });
  root.querySelector('#aiKeyMode').addEventListener('change', function (e) {
    s.ai.keyMode = e.target.value;
    save();
  });

  root.querySelector('#aiKeySave').addEventListener('click', async function () {
    const val = (root.querySelector('#aiKey').value || '').trim();
    const mode = root.querySelector('#aiKeyMode').value;
    if (!val) { PLToast.show('先粘贴 API Key', 'warn'); return; }
    try {
      if (mode === 'encrypted') {
        if (!AI.cryptoReady()) { PLToast.show('当前环境不支持加密存储，请改用「仅本次会话」', 'bad'); return; }
        const p1 = await aiPassPrompt('设置加密口令', '口令只用于本机解密，不写入磁盘；忘记后需要重新填 Key。');
        if (!p1) return;
        if (p1.length < 6) { PLToast.show('口令至少 6 位', 'warn'); return; }
        const p2 = await aiPassPrompt('再次输入口令', '确认无误后写入本机加密存储。');
        if (p1 !== p2) { PLToast.show('两次口令不一致', 'bad'); return; }
        await AI.saveKey(val, 'encrypted', p1);
        PLToast.show('已加密保存密钥', 'ok');
      } else {
        await AI.saveKey(val, mode, '');
        PLToast.show(mode === 'session' ? '已保存到本次会话' : mode === 'plain' ? '已明文保存（注意本机安全）' : '仅保存在内存', 'ok');
      }
      s.ai.keyMode = mode;
      save();
      App.render();
    } catch (e) {
      const d = AI.describeError(e);
      PLToast.show(d.msg, 'bad');
    }
  });

  const unlockBtn = root.querySelector('#aiKeyUnlock');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', async function () {
      const p = await aiPassPrompt('解锁密钥', '输入加密口令，仅本次会话有效。');
      if (!p) return;
      try {
        const masked = await AI.unlockKey(p);
        PLToast.show('已解锁 ' + masked, 'ok');
        App.render();
      } catch (e) {
        const d = AI.describeError(e);
        PLToast.show(d.msg, 'bad');
      }
    });
  }

  const clearKeyBtn = root.querySelector('#aiKeyClear');
  if (clearKeyBtn) {
    clearKeyBtn.addEventListener('click', function () {
      PLModal.confirm({ title: '清除本机密钥', body: '清除后需要重新填写 API Key。', ok: '清除', danger: true })
        .then(function (ok) {
          if (!ok) return;
          AI.clearKey();
          PLToast.show('已清除密钥', 'ok');
          App.render();
        });
    });
  }

  root.querySelector('#aiTest').addEventListener('click', async function () {
    const btn = this;
    const out = root.querySelector('#aiTestOut');
    if (!AI.key() && AI.keyState().locked) {
      out.innerHTML = '<span style="color:var(--warn)">密钥处于加密锁定状态，请先解锁</span>';
      return;
    }
    btn.disabled = true;
    const old = btn.textContent;
    btn.textContent = '测试中…';
    out.innerHTML = '<span style="color:var(--muted)">正在连接…</span>';
    const r = await AI.test();
    btn.disabled = false;
    btn.textContent = old;
    s.ai.lastTest = { ok: r.ok, ms: r.ms, msg: r.msg, hint: r.hint || '', at: new Date().toISOString() };
    if (r.models && r.models.length) s.ai.modelsFound = r.models.slice(0, 40);
    save();
    out.innerHTML = (r.ok
      ? '<span style="color:var(--ok)">✓ ' + U.esc(r.msg) + '</span>'
      : '<span style="color:var(--bad)">✕ ' + U.esc(r.msg) + '</span>' +
        (r.hint ? '<br><span style="color:var(--muted)">' + U.esc(r.hint) + '</span>' : '')) +
      '<span class="ai-dim"> · ' + r.ms + 'ms</span>';
  });

  /* ---------- 对话交互 ---------- */
  if (ta) {
    ta.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        doSend(ta.value);
      }
    });
  }

  root.querySelectorAll('[data-ai-act]').forEach(function (chip) {
    chip.addEventListener('click', function () {
      const id = chip.getAttribute('data-ai-act');
      s.ai.lastAction = id;
      ta.value = AI.actionPrompt(s, id, '');
      ta.focus();
      save();
    });
  });

  ['Section', 'Outline', 'Refs'].forEach(function (k) {
    const el = root.querySelector('#aiCtx' + k);
    if (!el) return;
    el.addEventListener('change', function () {
      a.include[{ Section: 'section', Outline: 'outline', Refs: 'refs' }[k]] = !!el.checked;
      save();
      const lab = el.parentNode;
      if (lab) lab.classList.toggle('on', !!el.checked);
      hintEl.textContent = '上下文约 ' + U.num(AI.estimateTokens(AI.buildContext(s, a.include))) + ' tokens';
    });
  });

  root.querySelector('#aiClearChat').addEventListener('click', function () {
    if (!(a.messages || []).length) { PLToast.show('对话本来就是空的', 'warn'); return; }
    PLModal.confirm({ title: '清空对话', body: '只清空对话记录，不影响正文与配置。', ok: '清空', danger: true })
      .then(function (ok) {
        if (!ok) return;
        s.ai.messages = [];
        save();
        App.render();
      });
  });

  if (sendBtn) sendBtn.addEventListener('click', function () { doSend(ta.value); });
  if (stopBtn) stopBtn.addEventListener('click', function () {
    AI.abort();
    hintEl.textContent = '已停止生成。';
  });

  /* 消息内的采用/复制/重试 */
  root.querySelectorAll('[data-ai-apply]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const i = Number(btn.getAttribute('data-ai-apply'));
      openApply(s.ai.messages[i].content);
    });
  });
  root.querySelectorAll('[data-ai-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const i = Number(btn.getAttribute('data-ai-copy'));
      U.copy(s.ai.messages[i].content);
    });
  });
  root.querySelectorAll('[data-ai-retry]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      doSend(btn.getAttribute('data-ai-retry'));
    });
  });

  /* ---------- 发送 ---------- */
  let busy = false;

  async function doSend(raw) {
    const text = String(raw || '').trim();
    if (busy) { PLToast.show('正在生成，先点「停止」再发送', 'warn'); return; }
    if (!text) { PLToast.show('先输入内容或选一个快捷动作', 'warn'); return; }
    if (AI.keyState().locked) { PLToast.show('密钥已加密保存但未解锁，请先在左侧解锁', 'warn'); return; }
    if (!AI.key()) { PLToast.show('请先配置 API Key', 'warn'); return; }

    busy = true;
    sendBtn.disabled = true;
    stopBtn.disabled = false;
    hintEl.textContent = '生成中…（可点「停止」中断）';

    const messages = AI.buildMessages(s, { userText: text });
    const actionId = s.ai.lastAction || '';

    /* 立即渲染用户气泡 */
    if (!msgsEl.querySelector('.msg')) msgsEl.innerHTML = '';
    const uEl = document.createElement('div');
    uEl.className = 'msg user';
    uEl.innerHTML = '<div class="msg-b">' + aiFmt(text) + '</div>';
    msgsEl.appendChild(uEl);

    const aEl = document.createElement('div');
    aEl.className = 'msg ai';
    aEl.innerHTML = '<div class="msg-h">助手 · 生成中</div>' +
      '<div class="msg-b"><span class="ai-typing">▍</span></div>';
    msgsEl.appendChild(aEl);
    const bodyEl = aEl.querySelector('.msg-b');
    scrollBottom();

    let acc = '';
    const t0 = Date.now();
    try {
      const r = await AI.chat({
        messages: messages,
        onDelta: function (piece) {
          acc += piece;
          bodyEl.innerHTML = aiFmt(acc) + '<span class="ai-typing">▍</span>';
          msgsEl.scrollTop = msgsEl.scrollHeight;
        }
      });
      const finalText = r.text;
      s.ai.messages.push({ role: 'user', content: text, action: actionId, at: new Date().toISOString() });
      s.ai.messages.push({ role: 'assistant', content: finalText, action: actionId, ms: r.ms, at: new Date().toISOString() });
      if (s.ai.messages.length > 40) s.ai.messages = s.ai.messages.slice(-40);
      save();
      s.ai.lastMs = r.ms;
      App.render();
      PLToast.show('已生成（' + r.ms + 'ms' + (r.usage && r.usage.total_tokens ? '，' + r.usage.total_tokens + ' tokens' : '') + '）', 'ok');
    } catch (e) {
      const d = AI.describeError(e);
      const partialNote = acc ? '（已生成 ' + acc.length + ' 字，未保存）' : '';
      aEl.innerHTML =
        '<div class="msg-h" style="color:var(--bad)">生成失败 · ' + (d.code || 'ERROR') + '</div>' +
        '<div class="msg-b"><p><b>' + U.esc(d.msg) + '</b></p>' +
        (d.hint ? '<p style="color:var(--muted)">' + U.esc(d.hint) + '</p>' : '') +
        (partialNote ? '<p style="color:var(--muted)">' + U.esc(partialNote) + '</p>' : '') +
        '</div>' +
        '<div class="msg-f"><button class="btn btn-xs" data-ai-retry="' + U.attr(text) + '">重试</button>' +
        '<button class="btn btn-xs btn-ghost" data-nav="ai">查看配置</button></div>';
      const rt = aEl.querySelector('[data-ai-retry]');
      if (rt) rt.addEventListener('click', function () { doSend(rt.getAttribute('data-ai-retry')); });
      msgsEl.scrollTop = msgsEl.scrollHeight;
      hintEl.textContent = '失败：' + d.msg;
      s.ai.lastError = { code: d.code, msg: d.msg, hint: d.hint, at: new Date().toISOString() };
      save();
    } finally {
      busy = false;
      sendBtn.disabled = false;
      stopBtn.disabled = true;
      if (hintEl.textContent.indexOf('失败') < 0 && hintEl.textContent.indexOf('已停止') < 0) {
        hintEl.textContent = '用时 ' + (Date.now() - t0) + 'ms';
      }
    }
  }

  /* ---------- 采用到章节 ---------- */
  function openApply(text) {
    const secs = (s.outline && s.outline.sections) || [];
    if (!secs.length) { PLToast.show('还没有章节，先去「提纲与结构」生成', 'warn'); return; }
    const cur = AI.currentSection(s);
    const opts = secs.map(function (x) {
      return '<option value="' + x.id + '"' + (cur && cur.id === x.id ? ' selected' : '') + '>' +
        (x.level === 2 ? '　' : '') + U.esc(x.title) + '</option>';
    }).join('');
    const modal = PLModal.open({
      title: '采用到章节',
      wide: true,
      body:
        '<div class="field"><label>目标章节</label><select class="select" id="aiApplySec">' + opts + '</select></div>' +
        '<div class="field"><label>写入方式</label>' +
        '<label class="check on" style="margin-bottom:6px"><input type="radio" name="aiApplyMode" value="append" checked><span>追加到本节末尾<small>保留原文，作为补充内容</small></span></label>' +
        '<label class="check"><input type="radio" name="aiApplyMode" value="replace"><span>替换本节全文<small>原内容会被覆盖，建议先保存版本快照</small></span></label>' +
        '</div>' +
        '<div class="field"><label>将写入的内容</label>' +
        '<textarea class="textarea" id="aiApplyText" rows="8" style="min-height:150px">' + U.esc(text) + '</textarea>' +
        '<span class="hint">写入后可在正文页继续编辑；引用标记保持原样，请自行核实文献。</span></div>',
      footer: '<button class="btn" data-close="1">取消</button>' +
        '<button class="btn btn-primary" id="aiApplyOk">写 入</button>'
    });
    if (!modal) return;
    modal.querySelector('#aiApplyOk').addEventListener('click', function () {
      const secId = modal.querySelector('#aiApplySec').value;
      const target = secs.filter(function (x) { return x.id === secId; })[0];
      const mode = (modal.querySelector('input[name="aiApplyMode"]:checked') || {}).value || 'append';
      const body = modal.querySelector('#aiApplyText').value;
      if (!target) return;
      if (!String(body || '').trim()) { PLToast.show('内容为空', 'warn'); return; }
      target.text = AI.applyText(target, body, mode);
      s.ui.secId = target.id;
      s.ui.view = 'writing';
      Store.save();
      PLModal.close();
      App.render();
      PLToast.show('已写入「' + target.title + '」，可继续编辑', 'ok');
    });
  }
};
