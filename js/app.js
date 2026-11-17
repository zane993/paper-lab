/* ============================================================
   论文工坊 PaperLab — 启动与路由
   ============================================================ */

const App = {
  render: function () {
    const s = Store.s;
    const view = Views[s.ui.view] ? s.ui.view : 'overview';
    if (view !== s.ui.view) s.ui.view = view;
    renderChrome();
    const root = document.getElementById('view');
    if (!root) return;
    root.innerHTML = '';
    try {
      Views[view](root);
    } catch (err) {
      if (window.console) console.error(err);
      root.innerHTML = '<div class="card"><div class="card-head"><h3>页面渲染出错</h3></div><div class="card-body">' +
        '<p style="font-size:12.5px;color:var(--bad)">' + U.esc(err && err.message ? err.message : String(err)) + '</p>' +
        '<p style="font-size:12px;color:var(--muted)">数据未丢失（已保存在本机）。可以先导出项目 JSON，再刷新页面。</p>' +
        '<button class="btn btn-sm" onclick="location.reload()">刷新页面</button></div></div>';
    }
  },

  go: function (view) {
    Store.s.ui.view = view;
    Store.flush();
    try {
      if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    } catch (e) { location.hash = view; }
    App.render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const main = document.getElementById('view');
    if (main) main.focus({ preventScroll: true });
  }
};

/* 支持 #模块 深链接：刷新后停留在同一模块 */
window.addEventListener('hashchange', function () {
  const v = (location.hash || '').replace(/^#/, '');
  if (v && Views[v] && v !== Store.s.ui.view) {
    Store.s.ui.view = v;
    Store.flush();
    App.render();
  }
});

/* ---------------- 全局事件委托 ---------------- */
document.addEventListener('click', function (e) {
  const navEl = e.target.closest('[data-nav]');
  if (navEl) {
    e.preventDefault();
    App.go(navEl.getAttribute('data-nav'));
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') PLModal.close();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'textarea' || tag === 'input') return;
    e.preventDefault();
    Store.flush();
    PLToast.show('已立即保存', 'ok');
  }
});

window.addEventListener('beforeunload', function () {
  if (Store.dirty) Store.flush();
});

/* ---------------- 帮助 ---------------- */
document.getElementById('btnHelp').addEventListener('click', function () {
  PLModal.open({
    title: '使用说明与快捷键',
    wide: true,
    body:
      '<div class="section-title">三步上手</div>' +
      '<div style="font-size:12.6px;line-height:1.9;color:var(--ink-2)">' +
      '<p><b>1. 载入示例</b>：在「项目总览」点「载入示例项目」，可以立刻看到选题、文献、提纲、正文、检查与导出的完整链路。示例文献是占位数据，请替换。</p>' +
      '<p><b>2. 换成自己的研究</b>：清空项目 → 填标题 → 在「选题」填领域与关键词 → 选定题目并补研究问题 → 「资料」加文献 → 「提纲」应用模板。</p>' +
      '<p><b>3. 写作与收尾</b>：按章节写作（右侧有要点与句式），插入引用 → 「引用」核对编号 → 「检查」跑一遍规则 → 「修改与版本」存快照 → 「导出」下载或打印 PDF。</p>' +
      '</div>' +
      '<div class="section-title">快捷键</div>' +
      '<div style="font-size:12.5px;color:var(--ink-2);line-height:1.9">' +
      '<p><code>Ctrl + S</code>　立即保存（输入时也会自动保存）</p>' +
      '<p><code>Ctrl + Shift + C</code>　在正文光标处插入引用</p>' +
      '<p><code>Esc</code>　关闭弹窗</p>' +
      '</div>' +
      '<div class="section-title">数据与边界</div>' +
      '<div style="font-size:12.3px;color:var(--muted);line-height:1.9">' +
      '<p>项目数据保存在本机浏览器的 localStorage（键 <code>paperlab.v1</code>），刷新、关浏览器都不会丢失；换设备请用「项目总览 → 导出项目 JSON」迁移。</p>' +
      '<p>质量检查是规则引擎：不联网、不调用大模型、不做正式查重。它给的是"可解释的修改线索"，不是评审结论。</p>' +
      '</div>',
    footer: '<button class="btn btn-primary" data-close="1">知道了</button>'
  });
});

/* ---------------- 启动 ---------------- */
(function boot() {
  Store.load();
  const hashView = (location.hash || '').replace(/^#/, '');
  if (hashView && Views[hashView]) Store.s.ui.view = hashView;
  App.render();

  const s = Store.s;
  if (!s.meta.title && !(s.topic.candidates || []).length) {
    setTimeout(function () {
      PLToast.show('新手可先在「项目总览」载入示例项目', 'ok');
    }, 600);
  }
})();
