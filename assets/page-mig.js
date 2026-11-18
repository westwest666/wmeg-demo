/* 迁徙流页：数据审计 + 是否进入模型 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  window.WMEG.register("mig", function (main, rail, ctx) {
    const D = ctx.D, prof = D.profile || {}, mi = prof.migration || {}, cs = prof.cases || {};
    const exp = (D.experiments || {}).migration || [];

    const c1 = U.card(main, "迁移数据覆盖审计", "百度迁徙：逐日城市间流动份额（%）", []);
    const h1 = U.el("div"); h1.style.height = "190px";
    c1.bd.appendChild(h1);
    setTimeout(() => {
      const rows = [], vals = [];
      const byYear = {};
      (mi.months || []).forEach((z) => {
        const y = z.m.slice(0, 4), mo = +z.m.slice(5, 7);
        byYear[y] = byYear[y] || {};
        byYear[y][mo] = z.ratio;
      });
      Object.keys(byYear).sort().forEach((y) => {
        rows.push(y);
        vals.push(Array.from({ length: 12 }, (_, i) => {
          const v = byYear[y][i + 1];
          return v === undefined ? 0 : v;
        }));
      });
      new CH.Heatmap(h1, { rows, cols: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
        values: vals, height: 190, labelW: 40, fmt: (v) => (v * 100).toFixed(0) + "%",
        colorScale: ["#FFF7F0", "#FCE3C8", "#F6C08E", "#EE9455", "#D9692B", "#A8431C"], title: "覆盖" });
    }, 30);
    const cov = (mi.coverage || 0) * 100;
    c1.bd.appendChild(U.el("div", "tiny",
      "2020-01-10 → 2025-12-31 共 " + mi.span_days + " 天，有数据 <b>" + mi.covered_days + "</b> 天（<b>" +
      cov.toFixed(1) + "%</b>）；空白月份为百度「城市迁徙」未公开的时段（通常只有春运前后与部分节假日）。" +
      "每日平均 " + ((mi.pair_per_day || {}).median || 0) + " 条城市对。"));

    const c2 = U.card(main, "迁徙强度 与 全省 ILI", "左轴：日均流动份额（%）；右轴：全省日发病", []);
    const g2 = U.el("div"); g2.style.height = "240px";
    c2.bd.appendChild(g2);
    setTimeout(() => {
      const di = mi.daily_intensity || {};
      const dates = di.dates || [], v = di.v || [];
      const idx0 = cs.dates ? cs.dates.indexOf(dates[0]) : -1;
      const prov = (cs.province_daily || []).slice(idx0 >= 0 ? idx0 : 0, (idx0 >= 0 ? idx0 : 0) + dates.length);
      new CH.LineChart(g2, { dates, padding: [12, 54, 26, 46], xTickN: 8,
        series: [
          { label: "迁徙强度", color: "#2F7FC1", width: 1.4, data: v },
          { label: "全省 ILI", color: "#E8590C", width: 1.6, axis: 2, data: prov },
        ],
        y2: true, yFormat: (v2) => U.fmt(v2, 1), y2Format: (v2) => U.fmt(v2, 0), y2color: "#E8590C" });
    }, 40);
    c2.bd.appendChild(U.el("div", "tiny", "迁徙强度 = 各城 in/out 前 10 对端份额之和的均值；缺口为数据未公开时段。"));

    const c3 = U.card(main, "城际流动结构", "双向平均份额（2020-2025 均值）", []);
    const w3 = U.el("div"); w3.style.height = "240px";
    c3.bd.appendChild(w3);
    setTimeout(() => {
      const flows = (D.map.flows || []).slice(0, 40);
      const names = D.cities;
      const M = names.map(() => names.map(() => null));
      flows.forEach(([a, b, v]) => {
        const i = names.indexOf(a), j = names.indexOf(b);
        if (i >= 0 && j >= 0) { M[i][j] = v; M[j][i] = v; }
      });
      new CH.Heatmap(w3, { rows: names, cols: names, values: M, height: 240, labelW: 40, labelH: 18,
        fmt: (v) => (v === null ? "—" : U.fmt(v, 1)), colorScale: ["#F7FBFD", "#DCEBF6", "#A9CDE8", "#6BA5D4", "#3B7DB8", "#1F4E7A"],
        title: "份额 %" });
    }, 50);

    const c4 = U.card(main, "迁徙先验 A/B 实验", "同一区间、同一预算，仅改变图结构先验", []);
    const b4 = U.el("div");
    c4.bd.appendChild(b4);
    if (!exp.length) {
      b4.innerHTML = "<div class='empty' style='height:90px'>实验进行中／尚未登记（见 analysis/experiments.json）</div>";
    } else {
      const g4 = U.el("div"); g4.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px";
      const a1 = U.el("div"); a1.style.height = "180px";
      const a2 = U.el("div"); a2.style.height = "180px";
      g4.appendChild(a1); g4.appendChild(a2);
      b4.appendChild(g4);
      setTimeout(() => {
        new CH.Bars(a1, { data: exp.map((z) => ({ k: z.arm, v: z.nrmse })), labelW: 86,
          fmt: (v) => U.pct(v, 1), color: "#0E7C86", height: 180 });
        new CH.Bars(a2, { data: exp.map((z) => ({ k: z.arm, v: z.r2 })), labelW: 86,
          fmt: (v) => U.fmt(v, 3), color: "#2F7FC1", height: 180 });
      }, 40);
      const tb = U.el("div");
      let html = "<table class='t' style='margin-top:8px'><thead><tr><th>臂</th><th>图结构</th><th>nRMSE</th><th>R²</th><th>PCC</th><th>ΔnRMSE</th></tr></thead><tbody>";
      const base = exp[0] || {};
      exp.forEach((z) => {
        const d = (z.nrmse !== null && base.nrmse) ? ((z.nrmse - base.nrmse) / base.nrmse) : null;
        html += "<tr><td><b>" + z.arm + "</b></td><td>" + z.graph + "</td><td>" + U.pct(z.nrmse, 1) +
          "</td><td>" + U.fmt(z.r2, 3) + "</td><td>" + U.fmt(z.pcc, 3) + "</td><td style='color:" +
          (d === null ? "#8496A6" : d < 0 ? "#2B8A3E" : "#C2410C") + ";font-weight:700'>" +
          (d === null ? "基准" : (d > 0 ? "+" : "") + (d * 100).toFixed(1) + "%") + "</td></tr>";
      });
      html += "</tbody></table>";
      tb.innerHTML = html;
      b4.appendChild(tb);
      b4.appendChild(U.el("div", "tiny", "ΔnRMSE 相对第一行（接壤对称邻接基线）；负值表示误差下降。"));
    }

    /* 右栏 */
    const r1 = U.card(rail, "审计结论", "");
    r1.bd.appendChild(U.el("div", "note warn",
      "<b>百度「城市迁徙」只有一部分时段。</b>2020-2025 逐日覆盖 " + cov.toFixed(1) +
      "%，缺失集中在每年 4-10 月的非节假日窗口，因此它<b>不能</b>作为逐日连续的外生输入。"));
    const r2 = U.card(rail, "是否进入模型", "");
    r2.bd.appendChild(U.el("div", "",
      "<div class='kv'><span>作为静态图先验</span><span>可用</span></div>" +
      "<div class='kv'><span>作为逐日输入</span><span>不可用（缺口 43%）</span></div>" +
      "<div class='kv'><span>跨年可比性</span><span>2020 疫情期异常</span></div>"));
    r2.bd.appendChild(U.el("div", "tiny",
      "做法：只用「城市对份额的结构」构建图先验（top-4 邻接 / 对称份额权重），" +
      "避开了逐日缺口问题；逐日迁徙通道因缺口过大与疫情期异常，不纳入主模型。"));
    const r3 = U.card(rail, "关于高德", "");
    r3.bd.appendChild(U.el("div", "tiny",
      "高德（Amap）城市迁徙同样按日发布，覆盖更连续。若要补齐逐日通道，需要：<br>" +
      "① 抓取或申请 2020-2025 逐日城市 OD 数据；<br>" +
      "② 转成与本项目一致的 <code>date,city,direction,other_city,value_pct</code> 表；<br>" +
      "③ 用 <code>pipeline\\build_migration_prior.py</code> 重建先验，并在 <code>run_range.py --mig-graph</code> 切换。" +
      "接口已预留，不需要改模型代码。"));
    const r4 = U.card(rail, "外部参照声明", "");
    r4.bd.appendChild(U.el("div", "note info",
      "页面上的迁徙箭头与 TOP 流向仅作<b>外部参照</b>；主模型默认图结构为行政区接壤对称邻接，" +
      "是否采用迁徙先验以 A/B 实验结论为准。"));
  });
})();
