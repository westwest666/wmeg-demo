/* ===========================================================
   WMEG-Net 单页应用外壳：一次加载，左侧栏切换视图（不跳页）
   - 地址栏用 hash 路由：#/city?city=太原&run=run_full_1525
   - 切视图时统一清理图表（ResizeObserver）与左栏控制台
   =========================================================== */
(function (global) {
  window.addEventListener("error", function (e) {
    if (String(e.message || "").indexOf("ResizeObserver loop") >= 0) { e.preventDefault(); return; }
    var el = document.createElement("div");
    el.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:999;max-width:70vw;padding:10px 14px;" +
      "background:#FFF1EE;border:1px solid #F5B5A8;border-radius:8px;color:#A21B0F;" +
      "font:12px/1.6 monospace;box-shadow:0 6px 20px rgba(0,0,0,.12);white-space:pre-wrap";
    el.textContent = "脚本错误: " + (e.message || "") + " @ " + (e.filename || "").split("/").pop() + ":" + (e.lineno || 0);
    document.body.appendChild(el);
  });
  const BASE = window.WMEG_DATA;
  if (!BASE) { document.body.innerHTML = "<div class='empty'>缺少数据：请先运行 python pipeline\\site_build.py</div>"; return; }

  const PAGES = [
    { id: "index", label: "全省总览", icon: "M3 17l5-6 4 4 5-7 4 5" },
    { id: "map", label: "时空传播", icon: "M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" },
    { id: "city", label: "城市剖析", icon: "M4 20V9l8-5 8 5v11M9 20v-6h6v6" },
    { id: "rt", label: "再生数 Rt", icon: "M3 12h3l2-6 3 12 3-9 2 3h5" },
    { id: "model", label: "模型诊断", icon: "M4 19V5m0 14h16M8 15l3-5 3 3 4-7" },
    { id: "data", label: "数据与滑窗", icon: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" },
    { id: "mig", label: "迁徙流", icon: "M4 12h11m0 0l-4-4m4 4l-4 4M19 5v14" },
    { id: "manual", label: "使用说明", icon: "M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2zm3 3h8M7 12h8M7 16h5" }
  ];
  const SUB = {
    index: "全省聚合 · 拟合与预测 · 再生数",
    map: "地理分布 · 迁徙流 · 时间演化",
    city: "单城市全指标 · 任意时段 · 图表放大",
    rt: "R0 / Rt · 模型反演",
    model: "误差结构 · 观测-预测对照",
    data: "数据集区间 · 721 切分 · 长度扫描",
    mig: "数据审计 · 是否进入模型",
    manual: "全部用法与口径"
  };

  const U = {
    fmt(v, d) { return Chart.fmt(v, d); },
    pct(v, d) { return (v === null || v === undefined || !isFinite(v)) ? "—" : (v * 100).toFixed(d === undefined ? 1 : d) + "%"; },
    num(v, d) { return (v === null || v === undefined || !isFinite(v)) ? "—" : Number(v).toLocaleString("zh-CN", { maximumFractionDigits: d === undefined ? 1 : d }); },
    q(sel, root) { return (root || document).querySelector(sel); },
    qa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
    el(tag, cls, html) {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (html !== undefined) n.innerHTML = html;
      return n;
    },
    card(parent, title, sub, tools) {
      const c = U.el("div", "card");
      const hd = U.el("div", "hd");
      hd.innerHTML = "<h3>" + title + "</h3>" + (sub ? "<span class='sub'>" + sub + "</span>" : "");
      const tw = U.el("div", "tools");
      (tools || []).forEach((t) => {
        const b = U.el("button", "ico" + (t.on ? " on" : ""), t.label);
        if (t.title) b.title = t.title;
        if (t.fn) b.onclick = t.fn;
        tw.appendChild(b);
      });
      hd.appendChild(tw);
      c.appendChild(hd);
      const bd = U.el("div", "bd");
      c.appendChild(bd);
      if (parent) parent.appendChild(c);
      return { card: c, bd, hd, tools: tw };
    },
    kv(parent, k, v, cls) {
      const d = U.el("div", "kv" + (cls ? " " + cls : ""));
      d.innerHTML = "<span>" + k + "</span><span>" + v + "</span>";
      parent.appendChild(d);
      return d;
    },
    icon(name) {
      const p = { expand: "M9 3H3v6M15 21h6v-6M3 15v6h6M21 9V3h-6", reset: "M3 12a9 9 0 1015-6.7M21 3v6h-6", csv: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" }[name] || "";
      return "<svg viewBox='0 0 24 24' width='13' height='13' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'><path d='" + p + "'/></svg>";
    },
    toast(msg, ms) {
      let t = document.querySelector(".toast");
      if (!t) { t = U.el("div", "toast"); document.body.appendChild(t); }
      t.textContent = msg; t.classList.add("on");
      clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), ms || 2600);
    },
    modal(title, build) {
      let m = document.querySelector(".modal");
      if (!m) {
        m = U.el("div", "modal");
        m.innerHTML = "<div class='box'><div class='bhd'><h3></h3><div style='margin-left:auto;display:flex;gap:8px'><button class='btn sm' data-close>关闭</button></div></div><div class='bbd'></div></div>";
        document.body.appendChild(m);
        m.addEventListener("click", (e) => { if (e.target === m || e.target.hasAttribute("data-close")) m.classList.remove("on"); });
      }
      m.querySelector("h3").textContent = title;
      const bd = m.querySelector(".bbd");
      bd.innerHTML = "";
      m.classList.add("on");
      return bd;
    },
    download(name, text, mime) {
      const b = new Blob([text], { type: mime || "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b); a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    async api(path, opts) {
      try {
        const r = await fetch(path, Object.assign({ headers: { "Content-Type": "application/json" } }, opts || {}));
        if (!r.ok) throw new Error("HTTP " + r.status);
        return await r.json();
      } catch (e) { return { ok: false, error: String(e) }; }
    }
  };

  /* ---------------- 状态 ---------------- */
  const STORE = { base: BASE, run: BASE, runId: BASE.meta.run_id, city: BASE.cities[0], loaded: {} };
  global.APP = { PAGES, U, STORE, D: BASE };
  window.WMEG_RUNS = window.WMEG_RUNS || {};

  function loadRun(id) {
    return new Promise((resolve) => {
      if (id === STORE.base.meta.run_id) { STORE.run = STORE.base; resolve(STORE.run); return; }
      if (window.WMEG_RUNS[id]) { STORE.run = mergeRun(window.WMEG_RUNS[id]); resolve(STORE.run); return; }
      const s = document.createElement("script");
      s.src = "runs/" + id + "/data.js";
      s.onload = () => { STORE.run = mergeRun(window.WMEG_RUNS[id]); resolve(STORE.run); };
      s.onerror = () => { U.toast("该轮次未随站点打包（需服务端在线）"); resolve(null); };
      document.head.appendChild(s);
    });
  }
  function mergeRun(p) {
    return Object.assign({}, STORE.base, p, { map: STORE.base.map, profile: STORE.base.profile,
      runs: STORE.base.runs, experiments: STORE.base.experiments, cities: STORE.base.cities,
      citiesFull: STORE.base.citiesFull });
  }

  /* ---------------- hash 路由 ---------------- */
  function parseHash() {
    let h = String(location.hash || "").replace(/^#\/?/, "");
    const i = h.indexOf("?");
    const view = (i >= 0 ? h.slice(0, i) : h).trim();
    const params = new URLSearchParams(i >= 0 ? h.slice(i + 1) : "");
    return { view, params };
  }
  function buildHash(view, params) {
    const p = new URLSearchParams();
    Object.keys(params || {}).forEach((k) => {
      const v = params[k];
      if (v !== null && v !== undefined && v !== "") p.set(k, v);
    });
    const q = p.toString();
    return "#/" + view + (q ? "?" + q : "");
  }
  function currentParams() {
    const { params } = parseHash();
    const o = {};
    params.forEach((v, k) => { o[k] = v; });
    if (STORE.runId !== STORE.base.meta.run_id) o.run = STORE.runId;
    return o;
  }
  function go(view, extra) {
    const params = Object.assign(currentParams(), extra || {});
    if (extra && extra.run === null) delete params.run;
    const h = buildHash(view, params);
    if (location.hash === h) route();
    else location.hash = h;
  }
  function setParam(k, v) {
    const params = currentParams();
    if (v === null || v === undefined || v === "") delete params[k]; else params[k] = v;
    const { view } = parseHash();
    history.replaceState(null, "", buildHash(view, params));
  }

  /* ---------------- 外壳（只渲染一次） ---------------- */
  function iconPath(p) { return "<svg viewBox='0 0 24 24'><path d='" + p + "'/></svg>"; }

  function renderShell() {
    const app = document.getElementById("app");
    app.innerHTML =
      "<div class='top'>" +
      "<div class='brand'><svg width='26' height='26' viewBox='0 0 32 32'>" +
      "<rect width='32' height='32' rx='9' fill='#0E7C86'/>" +
      "<path d='M6 20c3-8 5 4 8-4s5 6 8-2' fill='none' stroke='#fff' stroke-width='2.4' stroke-linecap='round'/>" +
      "<circle cx='24' cy='9' r='2.4' fill='#7FE3E9'/></svg>" +
      "<span class='brandtext'>WMEG-Net</span><small>山西 ILI</small></div>" +
      "<div class='sub' id='pagesub'></div>" +
      "<div class='spacer'></div>" +
      "<select class='sel' id='runSel' title='数据集区间（训练轮次）'></select>" +
      "<span class='chip' id='chipWin'></span>" +
      "<span class='chip' id='chipSplit'></span>" +
      "<span class='chip' id='chipUpd'><i></i><span></span></span>" +
      "</div>" +
      "<div class='shell' id='shell'>" +
      "<aside class='side'>" +
      "<div class='navlist' id='navlist'></div>" +
      "<div id='consoleWrap'></div>" +
      "<div class='tail'><button class='collapse' id='collapseBtn' title='收起/展开侧栏'>‹</button>" +
      "<span class='ver' id='verTxt'>v7 · SPA</span></div>" +
      "</aside>" +
      "<section class='page' id='page'><div class='main' id='main'></div><div class='rail' id='rail'></div></section>" +
      "</div>";
    const nav = document.getElementById("navlist");
    PAGES.forEach((p) => {
      const a = U.el("a", "nav");
      a.id = "nav_" + p.id;
      a.href = "#/" + p.id;
      a.innerHTML = iconPath(p.icon) + "<span class='lbl'>" + p.label + "</span>";
      nav.appendChild(a);
    });
    const sel = document.getElementById("runSel");
    const runs = (STORE.base.runs || []).slice();
    runs.sort((a, b) => (a.window_start < b.window_start ? 1 : -1));
    runs.forEach((r) => {
      const o = document.createElement("option");
      o.value = r.run_id;
      const k = r.kpi || {};
      o.textContent = r.window_start.slice(0, 7) + " → " + r.window_end.slice(0, 7) +
        (k.nrmse !== undefined && k.nrmse !== null ? " · nRMSE " + k.nrmse.toFixed(3) : "");
      sel.appendChild(o);
    });
    sel.onchange = async () => {
      const id = sel.value;
      const p = await loadRun(id);
      if (!p) { sel.value = STORE.runId; return; }
      STORE.runId = id; STORE.run = p; STORE.loaded = {};
      refreshChips();
      setParam("run", id === STORE.base.meta.run_id ? null : id);
      route();
    };
    const shell = document.getElementById("shell");
    const btn = document.getElementById("collapseBtn");
    if (localStorage.getItem("wneg.mini") === "1") { shell.classList.add("mini"); btn.textContent = "›"; }
    btn.onclick = () => {
      shell.classList.toggle("mini");
      const on = shell.classList.contains("mini");
      btn.textContent = on ? "›" : "‹";
      localStorage.setItem("wneg.mini", on ? "1" : "0");
      window.dispatchEvent(new Event("resize"));
    };
    document.getElementById("chipUpd").querySelector("span").textContent =
      "更新 " + (STORE.base.meta.generated_at || "").slice(5, 16);
    refreshChips();
  }

  function refreshChips() {
    const m = STORE.run.meta;
    const win = document.getElementById("chipWin");
    if (win) win.innerHTML = "<b>" + m.window_start + "</b> → <b>" + m.window_end + "</b>";
    const sp = document.getElementById("chipSplit");
    if (sp) sp.innerHTML = "训练 <b>" + m.train_end + "</b> · 测试 <b>" + m.test_start + "</b>";
    const sel = document.getElementById("runSel");
    if (sel) sel.value = STORE.runId;
  }

  /* ---------------- 视图切换 ---------------- */
  let routing = false, pending = false;
  async function route() {
    // 路由是在途状态时不能直接丢弃新请求，否则快速点两下左侧栏会停在旧视图
    if (routing) { pending = true; return; }
    routing = true;
    try {
      const parsed = parseHash();
      let vid = PAGES.some((p) => p.id === parsed.view) ? parsed.view : "index";
      const params = parsed.params;
      // 轮次：hash 参数优先，其次保持当前
      const wantRun = params.get("run");
      if (wantRun && wantRun !== STORE.runId) {
        const p = await loadRun(wantRun);
        if (p) { STORE.runId = wantRun; STORE.run = p; refreshChips(); }
      }
      CH.teardown();
      const page = document.getElementById("page");
      const main = document.getElementById("main");
      const rail = document.getElementById("rail");
      const cw = document.getElementById("consoleWrap");
      page.classList.remove("norail");
      main.className = "main";
      main.innerHTML = ""; rail.innerHTML = ""; cw.innerHTML = "";
      main.scrollTop = 0; rail.scrollTop = 0;
      PAGES.forEach((p) => {
        const a = document.getElementById("nav_" + p.id);
        if (a) a.classList.toggle("on", p.id === vid);
      });
      const sub = document.getElementById("pagesub");
      if (sub) sub.textContent = (PAGES.find((p) => p.id === vid) || {}).label + " · " + (SUB[vid] || "");
      document.title = (PAGES.find((p) => p.id === vid) || {}).label + " · WMEG-Net 山西 ILI";
      const fn = (global.WMEG.pages || {})[vid];
      if (!fn) {
        main.innerHTML = "<div class='empty'>视图 " + vid + " 未注册</div>";
      } else {
        try {
          fn(main, rail, { console: cw, U, STORE, D: STORE.run, params: params, view: vid });
        } catch (err) {
          const box = document.createElement("div");
          box.className = "card pad";
          box.innerHTML = "<h3 style='color:#A21B0F;margin:0 0 6px'>该视图渲染失败</h3><pre style='white-space:pre-wrap;font-size:11px;color:#A21B0F'>" +
            (err && err.stack ? err.stack : String(err)) + "</pre>";
          main.appendChild(box);
        }
      }
      // 让新视图里的图表在布局完成后重算尺寸
      requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    } finally {
      routing = false;
      if (pending) { pending = false; setTimeout(route, 0); }
    }
  }

  global.WMEG = global.WMEG || {};
  global.WMEG.go = go;
  global.WMEG.route = route;
  global.WMEG.setParam = setParam;
  global.WMEG.APP = global.APP;

  window.addEventListener("hashchange", route);

  document.addEventListener("DOMContentLoaded", async () => {
    // 兼容旧链接：index.html?run=xxx → #/index?run=xxx
    const qs = new URLSearchParams(location.search);
    const legacyRun = qs.get("run");
    let boot = parseHash();
    if (!boot.view) {
      const dv = (document.body.getAttribute("data-page") || "index").trim();
      boot = { view: dv, params: new URLSearchParams(legacyRun ? "run=" + encodeURIComponent(legacyRun) : "") };
      history.replaceState(null, "", buildHash(boot.view, { run: legacyRun || "" }));
    } else if (legacyRun && !boot.params.get("run")) {
      boot.params.set("run", legacyRun);
      history.replaceState(null, "", buildHash(boot.view, { run: legacyRun }));
    }
    if (legacyRun && legacyRun !== STORE.runId) {
      const p = await loadRun(legacyRun);
      if (p) { STORE.runId = legacyRun; STORE.run = p; }
    }
    renderShell();
    route();
  });
})(window);
