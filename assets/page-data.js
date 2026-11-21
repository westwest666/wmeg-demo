/* 数据与滑窗页 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  window.WMEG.register("data", function (main, rail, ctx) {
    const D = ctx.D, m = D.meta, prof = D.profile || {};
    const c0 = U.card(main, "数据集区间与 7 : 2 : 1 切分", "训练 / 验证 / 测试按天数顺序切分（时间序列不可打乱）");
    const bar = U.el("div");
    bar.style.cssText = "display:flex;height:34px;border-radius:8px;overflow:hidden;border:1px solid var(--line);font-size:10.5px;font-weight:700;color:#fff";
    const segs = [
      { k: "训练", n: m.n_train, c: "linear-gradient(90deg,#3E7C86,#0E7C86)", d: m.window_start + " → " + m.train_end },
      { k: "验证", n: m.n_val, c: "linear-gradient(90deg,#E5A93B,#D9902B)", d: m.val_start + " → " + m.test_start },
      { k: "测试", n: m.n_test, c: "linear-gradient(90deg,#2FA37A,#1F8A64)", d: m.test_start + " → " + m.test_end },
    ];
    const tot = segs.reduce((a, s) => a + (s.n || 0), 0) || 1;
    segs.forEach((s) => {
      const d = U.el("div");
      d.style.cssText = "width:" + ((s.n || 0) / tot * 100) + "%;background:" + s.c + ";display:flex;align-items:center;justify-content:center;gap:6px";
      d.innerHTML = (s.n / tot >= 0.085) ? (s.k + " " + (s.n / tot * 100).toFixed(0) + "%") : (s.n / tot >= 0.04 ? s.k : "");
      d.title = s.k + " " + s.d + " · " + s.n + " 天";
      bar.appendChild(d);
    });
    c0.bd.appendChild(bar);
    const lb = U.el("div");
    lb.style.cssText = "display:flex;justify-content:space-between;font-size:10.5px;color:var(--tx3);margin-top:5px";
    lb.innerHTML = "<span>" + m.window_start + "</span><span>切分点 " + m.train_end + " / " + m.test_start + "</span><span>" + m.window_end + "</span>";
    c0.bd.appendChild(lb);
    c0.bd.appendChild(U.el("div", "tiny", "训练 " + m.n_train + " 天 · 验证 " + m.n_val + " 天 · 测试 " + m.n_test + " 天 · 共 " + m.n_days + " 天；样本数受 window=20 / horizon=12 影响，各段尾部会少 32 天。"));

    /* 长度扫描 */
    const c1 = U.card(main, "数据集长度扫描", "固定数据终点，改变起点 → 观察样本外误差", []);
    const g1 = U.el("div"); g1.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px";
    c1.bd.appendChild(g1);
    const l1 = U.el("div"); l1.style.height = "200px";
    const l2 = U.el("div"); l2.style.height = "200px";
    g1.appendChild(l1); g1.appendChild(l2);
    const sweep = (D.experiments || {}).window_sweep || [];
    setTimeout(() => {
      if (!sweep.length) { l1.innerHTML = "<div class='empty'>长度扫描尚未完成</div>"; l2.innerHTML = ""; return; }
      const xs = sweep.map((s) => s.years);
      new CH.LineChart(l1, { dates: sweep.map((s) => String(s.years)), minimal: false, showX: true, xFormat: (d) => d + " 年",
        xTickN: Math.max(2, sweep.length - 1), padding: [10, 44, 24, 42], yFormat: (v) => U.pct(v, 0),
        series: [{ label: "nRMSE", color: "#0E7C86", width: 2, data: sweep.map((s) => s.nrmse) }] });
      new CH.LineChart(l2, { dates: sweep.map((s) => String(s.years)), minimal: false, showX: true, xFormat: (d) => d + " 年",
        xTickN: Math.max(2, sweep.length - 1), padding: [10, 44, 24, 42], yFormat: (v) => U.fmt(v, 3),
        series: [{ label: "R²", color: "#2F7FC1", width: 2, data: sweep.map((s) => s.r2) }] });
    }, 30);
    c1.bd.appendChild(U.el("div", "tiny", "左：nRMSE（越低越好）；右：R²（越高越好）。横轴为训练+验证+测试的总跨度。"));

    /* 区间一览 */
    const c2 = U.card(main, "全部已训练区间", "点击行切换轮次（需该轮已随站点打包）", []);
    const tw = U.el("div"); tw.className = "scroll"; tw.style.maxHeight = "260px";
    const runs = (D.runs || []).slice().sort((a, b) => (a.window_start < b.window_start ? 1 : -1));
    let html = "<table class='t'><thead><tr><th>区间</th><th>天数</th><th>切分点</th><th>RMSE</th><th>nRMSE</th><th>R²</th><th>PCC</th><th>耗时</th></tr></thead><tbody>";
    runs.forEach((r) => {
      const k = r.kpi || {};
      const nd = Math.round((new Date(r.window_end) - new Date(r.window_start)) / 86400000) + 1;
      const tag = /^mig_|^smoke|^probe/.test(r.run_id) ? " <span class='pill'>" + r.run_id + "</span>" : "";
      html += "<tr data-run='" + r.run_id + "' style='cursor:pointer'><td><b>" + r.window_start + "</b> → " + r.window_end + tag +
        "</td><td>" + ((r.n_days) || nd || "—") + "</td><td>" + (r.train_end || "").slice(2) + " | " + (r.test_start || "").slice(2) +
        "</td><td>" + U.fmt(k.rmse, 2) + "</td><td>" + U.pct(k.nrmse, 1) + "</td><td>" + U.fmt(k.r2, 3) +
        "</td><td>" + U.fmt(k.pcc, 3) + "</td><td>" + (r.duration_sec ? (r.duration_sec / 60).toFixed(0) + "m" : "—") + "</td></tr>";
    });
    html += "</tbody></table>";
    tw.innerHTML = html;
    c2.bd.appendChild(tw);
    tw.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-run]");
      if (tr) { const sel = document.getElementById("runSel"); sel.value = tr.dataset.run; sel.dispatchEvent(new Event("change")); }
    });

    /* 覆盖热力 */
    const c3 = U.card(main, "病例数据覆盖（年 × 城市）", "7 日平滑后的累计病例数，颜色越深越多", []);
    const h3 = U.el("div"); h3.style.height = "252px";
    c3.bd.appendChild(h3);
    setTimeout(() => {
      const cs = (prof.cases || {});
      const yrs = Object.keys(cs.yearly_by_city || {});
      const vals = yrs.map((y) => cs.yearly_by_city[y]);
      new CH.Heatmap(h3, { rows: yrs, cols: D.cities, values: vals, height: 252, labelW: 34,
        fmt: (v) => (v === null ? "—" : U.fmt(v, 0)), colorScale: ["#F7FBFD", "#D6EEF0", "#7EC8CF", "#2E9AA6", "#0E7C86", "#0B5A62"] });
    }, 40);

    /* 右栏 */
    const r1 = U.card(rail, "数据口径", "");
    const cs = prof.cases || {}, mi = prof.migration || {};
    r1.bd.appendChild(U.el("div", "", [
      ["病例日期", (cs.dates ? cs.dates[0] + " → " + cs.dates[cs.dates.length - 1] : "—")],
      ["有效样本", (cs.first_valid || "") + " → " + (cs.last_valid || "")],
      ["城市数", (cs.cities || []).length],
      ["迁徙覆盖", mi.coverage ? (mi.coverage * 100).toFixed(1) + "%（" + mi.covered_days + "/" + mi.span_days + " 天）" : "—"],
      ["迁徙区间", (mi.start || "") + " → " + (mi.end || "")],
    ].map((kv) => "<div class='kv'><span>" + kv[0] + "</span><span>" + kv[1] + "</span></div>").join("")));
    const r2 = U.card(rail, "结论", "");
    r2.bd.appendChild(U.el("div", "note info",
      "时间序列按 7:2:1 顺序切分后，验证/测试段完全位于训练段之后，不存在信息泄漏；" +
      "但 2023 年起监测口径变化使病例数量级整体抬升，跨区间比较必须看 nRMSE / R²，不能直接比 RMSE。"));
    if (ctx.console) {
      const cw = ctx.console;
      cw.appendChild(U.el("h4", "", "数据集区间"));
      const box = U.el("div", "console");
      box.innerHTML =
        "<div class='cr'><label>起</label><input type='date' id='cStart' value='2015-01-01'></div>" +
        "<div class='cr'><label>止</label><input type='date' id='cEnd' value='2025-12-31'></div>" +
        "<div class='ratio' id='cRatio'><i style='width:70%;background:#0E7C86'>7</i><i style='width:20%;background:#D9902B'>2</i><i style='width:10%;background:#1F8A64'>1</i></div>" +
        "<div class='hint' id='cHint'>共 4018 天 · 训练→2022-09-13 · 测试→2025-12-31</div>" +
        "<button class='btn primary block' id='cRun' style='margin-top:7px'>按此区间训练</button>" +
        "<div class='hint' id='cMsg' style='margin-top:5px'></div>";
      cw.appendChild(box);
      const cS = box.querySelector("#cStart"), cE = box.querySelector("#cEnd"),
        cH = box.querySelector("#cHint"), cB = box.querySelector("#cRun"), cM = box.querySelector("#cMsg");
      function est() {
        const a = new Date(cS.value), b = new Date(cE.value);
        if (isNaN(a) || isNaN(b) || b <= a) { cH.textContent = "区间无效"; return null; }
        const days = Math.round((b - a) / 86400000) + 1;
        const i1 = Math.round(days * 0.7), i2 = Math.round(days * 0.9);
        const d1 = new Date(+a + (i1 - 1) * 86400000), d2 = new Date(+a + i2 * 86400000);
        const f = (x) => x.toISOString().slice(0, 10);
        cH.textContent = "共 " + days + " 天 · 训练→" + f(d1) + " · 测试→" + f(d2);
        return { days, a: cS.value, b: cE.value };
      }
      cS.onchange = est; cE.onchange = est; est();
      cB.onclick = async () => {
        const e = est(); if (!e) return;
        cB.disabled = true; cM.textContent = "提交中…";
        const r = await U.api("/api/run", { method: "POST", body: JSON.stringify({ start: e.a, end: e.b }) });
        if (r && r.ok) { cM.innerHTML = "已启动：" + r.run_id + "（排队/训练中，可稍后在当前页刷新）"; U.toast("训练任务已提交"); }
        else { cM.innerHTML = "静态模式：请在命令行运行 <code>python pipeline\\run_range.py --start " + e.a + " --end " + e.b + "</code>"; }
        cB.disabled = false;
      };
    }
  });
})();
