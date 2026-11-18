/* 再生数页：R0 / Rt 机理反演 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  window.WMEG.register("rt", function (main, rail, ctx) {
    const D = ctx.D;
    const c1 = U.card(main, "全省有效再生数 Rt", "对逐日发病曲线做 Cori(2013) 滑窗估计，串行间隔 Γ(2.9,1.3)，7 日平滑", [
      { label: U.icon("expand"), title: "放大", fn: () => openBig() },
    ]);
    c1.bd.innerHTML = CH.legend([{ label: "模型预测反演 Rt", color: "#8E44C7" },
      { label: "实测反演 Rt（参照）", color: "#2F7FC1" },
      { label: "R = 1", color: "#C2185B" }]);
    const box = U.el("div"); box.style.height = "264px";
    c1.bd.appendChild(box);
    let showObs = true;
    const ch = new CH.LineChart(box, {
      dates: D.dates, splitRanges: WMEG.splitRanges(D), brush: true, zoom: true, padding: [12, 48, 26, 44],
      series: [
        { label: "模型 Rt", color: "#8E44C7", width: 1.7, data: D.rt.prov_s },
        { label: "实测 Rt", color: "#2F7FC1", width: 1.1, dash: "4 3", opacity: .8, data: D.rt.obs_prov_s },
      ],
      yFormat: (v) => U.fmt(v, 1), hlines: [{ v: 1, color: "#C2185B", label: "R = 1" }],
      yMax: 6, onSelect: (a, b) => {}
    });
    function openBig() {
      const bd = U.modal("山西省 · 有效再生数 Rt", () => {});
      const d = U.el("div"); d.style.flex = "1"; bd.appendChild(d);
      setTimeout(() => new CH.LineChart(d, { dates: D.dates, splitRanges: WMEG.splitRanges(D),
        brush: true, zoom: true, xTickN: 16, padding: [12, 48, 26, 44],
        series: [{ label: "模型 Rt", color: "#8E44C7", width: 1.7, data: D.rt.prov_s },
          { label: "实测 Rt", color: "#2F7FC1", width: 1.1, dash: "4 3", opacity: .8, data: D.rt.obs_prov_s }],
        yFormat: (v) => U.fmt(v, 1), yMax: 6, hlines: [{ v: 1, color: "#C2185B", label: "R = 1" }] }), 30);
    }

    const c2 = U.card(main, "11 市 Rt", "点选城市查看详情");
    const grid = U.el("div");
    grid.style.cssText = "display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px";
    c2.bd.appendChild(grid);
    D.cities.forEach((city, ci) => {
      const cell = U.el("div");
      cell.style.cssText = "border:1px solid var(--line);border-radius:8px;padding:5px 6px 2px;cursor:pointer";
      const hd = U.el("div");
      const r0v = (D.r0.city.find((z) => z.city === city) || {}).r0;
      hd.style.cssText = "display:flex;justify-content:space-between;font-size:11.5px";
      hd.innerHTML = "<b>" + city + "</b><span style='color:#C2185B'>R₀ " + U.fmt(r0v, 2) + "</span>";
      cell.appendChild(hd);
      const cb = U.el("div"); cb.style.height = "68px";
      cell.appendChild(cb);
      setTimeout(() => new CH.LineChart(cb, { dates: D.dates, minimal: true, showX: false,
        padding: [3, 26, 3, 24], yFormat: (v) => U.fmt(v, 1), yMin: 0, yMax: 4,
        series: [{ label: "Rt", color: "#8E44C7", width: 1.0, opacity: .9, data: D.rt.v.map((r) => r[ci]) }],
        hlines: [{ v: 1, color: "#C2185B", opacity: .4 }] }), 10);
      cell.onclick = () => { location.href = "city.html?city=" + encodeURIComponent(city); };
      grid.appendChild(cell);
    });

    const c3 = U.card(main, "各流行季 R0", "7 月 → 次年 6 月的峰值传播强度");
    const b3 = U.el("div"); b3.style.height = Math.max(120, (D.r0.season || []).length * 24) + "px";
    c3.bd.appendChild(b3);
    setTimeout(() => new CH.Bars(b3, { data: (D.r0.season || []).map((s) => ({ k: s.label, v: s.r0 })),
      labelW: 58, fmt: (v) => U.fmt(v, 2), color: "#C2185B",
      height: Math.max(120, (D.r0.season || []).length * 24), baseline: 1 }), 20);

    /* 右栏 */
    const r1 = U.card(rail, "R0 / Rt 明细", "");
    const tb = U.el("div");
    let html = "<table class='t'><thead><tr><th>城市</th><th>R0</th><th>Rt 中位</th><th>当前</th></tr></thead><tbody>";
    (D.r0.city || []).slice().sort((a, b) => (b.r0 || 0) - (a.r0 || 0)).forEach((z) => {
      html += "<tr><td>" + z.city + "</td><td style='color:#C2185B;font-weight:700'>" + U.fmt(z.r0, 2) +
        "</td><td>" + U.fmt(z.rt_med, 2) + "</td><td>" + U.fmt(z.rt_last, 2) + "</td></tr>";
    });
    html += "</tbody></table>";
    tb.innerHTML = html;
    r1.bd.appendChild(tb);

    const r2 = U.card(rail, "模型 Rt vs 实测 Rt", "逐日对照（同一估计式，两条曲线相互独立）");
    const sb = U.el("div"); sb.style.height = "180px";
    r2.bd.appendChild(sb);
    setTimeout(() => {
      const xs = [], ys = [];
      for (let i = 0; i < D.rt.prov_s.length; i++) {
        const a = D.rt.prov_s[i], b = D.rt.obs_prov_s ? D.rt.obs_prov_s[i] : null;
        if (a === null || b === null || !isFinite(a) || !isFinite(b)) continue;
        xs.push(a); ys.push(b);
      }
      new CH.Scatter(sb, { x: xs, y: ys, xLabel: "模型 Rt", yLabel: "实测 Rt", color: "#8E44C7", r: 1.6, opacity: .35 });
      let mx = 0, my = 0, n = xs.length, cov = 0, vx = 0, vy = 0;
      for (let i = 0; i < n; i++) { mx += xs[i]; my += ys[i]; }
      mx /= n; my /= n;
      for (let i = 0; i < n; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; vy += (ys[i] - my) ** 2; }
      const pcc = (vx > 1e-9 && vy > 1e-9) ? cov / Math.sqrt(vx * vy) : null;
      const note = U.el("div", "tiny", "散点 " + n + " 个（全省逐日） · Pearson r = <b>" + U.fmt(pcc, 3) + "</b>");
      note.style.marginTop = "4px";
      r2.bd.appendChild(note);
    }, 20);

    const r3 = U.card(rail, "口径说明", "");
    r3.bd.appendChild(U.el("div", "tiny",
      "Rt 采用 Cori et al. (2013) 的滑动窗口估计式：" +
      "Rt = Στ天内 It / Στ天内 Σs ws·I(t−s)，串行间隔 w 取 Γ(2.9, 1.3)（均值 2.9 天），τ=7 天，再做 7 日平滑。" +
      "<br><br>「模型 Rt」= 对模型预测的逐日曲线做同一估计；「实测 Rt」= 对实测曲线做同一估计，二者用同一把尺子，可逐日对照。" +
      "<br><br>R0 取「流行季（7 月→次年 6 月）内 7 日平滑 Rt 再做 14 日平均后的峰值」（压掉尖峰、保留波浪强度），是峰值传播强度的上界估计，不是 t=0 时刻的严格 R0；报告量为 7 日平滑序列，增长段 Rt 会被平滑系统性压低，故宜作下界理解。" +
      "<br><br><b>小样本提示：</b>窗口分母（期望感染压力）小于 3 例的日期直接留空，不给出 Rt；城市卡片纵轴固定在 0–4，个别尖峰被截断，用于看趋势而非逐日精确值。" +
      "<br><br><b>为何不用 β/γ：</b>机理头的 β 只是权重 0.1 的辅助分支，其尺度未与「每人每天传染数」对齐；" +
      "实测 β/γ 与观测反演 Rt 的逐日相关系数 ≈ 0，直接当 Rt 会误导，故弃用。"));
  });
})();
