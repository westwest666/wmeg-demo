/* 模型诊断页 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  window.WMEG.register("model", function (main, rail, ctx) {
    const D = ctx.D, mt = D.metrics || {};

    const c1 = U.card(main, "城市 × 预测步长 相对误差", "测试段 RMSE ÷ 该城测试段均值", []);
    const b1 = U.el("div"); b1.style.height = Math.max(220, D.cities.length * 22 + 30) + "px";
    c1.bd.appendChild(b1);
    setTimeout(() => {
      const rel = mt.city_horizon_rel || {};
      const rows = D.cities.slice().sort();
      const vals = rows.map((c) => {
        const v = rel[c + "市"] || rel[c] || [];
        return v.concat(new Array(12 - v.length).fill(null)).slice(0, 12);
      });
      new CH.Heatmap(b1, { rows, cols: Array.from({ length: 12 }, (_, i) => "H" + (i + 1)),
        values: vals, fmt: (v) => (v === null ? "—" : (v * 100).toFixed(0) + "%"),
        height: Math.max(220, rows.length * 22 + 30), labelW: 44, labelH: 16, title: "相对 RMSE" });
    }, 30);

    /* ---------- 三头对照 ---------- */
    const hd = (mt.heads || {});
    if (hd.city && hd.province) {
      const c0 = U.card(main, "三头对照", "融合输出 = 直接预测头；机理头是辅助分支，不进入最终预测", []);
      const gw = U.el("div");
      gw.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:14px";
      c0.bd.appendChild(gw);
      const mkTable = (scope, title) => {
        const box = U.el("div");
        const h = hd[scope] || {};
        const row = (k, lab, col) => "<tr><td>" + lab + "</td><td>" + (h[k] ? U.fmt(h[k][col], 3) : "—") + "</td></tr>";
        const rows = [];
        ["fused", "mech", "base"].forEach((k) => {
          const lab = { fused: "融合 / 直接头", mech: "机理头", base: "持续性基线" }[k];
          rows.push("<tr><td><b>" + lab + "</b></td><td>" + U.fmt((h[k] || {}).nrmse, 3) +
            "</td><td>" + U.fmt((h[k] || {}).pcc, 3) + "</td><td>" + U.fmt((h[k] || {}).r2, 3) + "</td></tr>");
        });
        box.innerHTML = "<div class='tiny' style='margin-bottom:3px'>" + title + "</div>" +
          "<table class='t compact'><thead><tr><th style='width:42%'>头</th><th>nRMSE</th><th>PCC</th><th>R²</th></tr></thead><tbody>" +
          rows.join("") + "</tbody></table>";
        return box;
      };
      gw.appendChild(mkTable("city", "池化（11 城 × 日）"));
      gw.appendChild(mkTable("province", "省级（11 城逐日求和）"));
      c0.bd.appendChild(U.el("div", "tiny",
        "机理头 nRMSE 约为直接头的 3 倍、R² 为负：它系统性低估一个数量级（β 中位数 ≈ 0.094，折算 R₀≈0.33），" +
        "因为该分支只拿 λ_aux=0.1 的辅助监督、且不参与输出。它提供的是传播结构（β/接触矩阵/Rt 形状），不是预测值。"));
    }

    const c2 = U.card(main, "观测 vs 预测（测试段逐城逐日）", "", []);
    const g = U.el("div"); g.style.cssText = "display:grid;grid-template-columns:1.25fr 1fr;gap:10px";
    c2.bd.appendChild(g);
    const s1 = U.el("div"); s1.style.height = "230px";
    const s2 = U.el("div"); s2.style.height = "230px";
    g.appendChild(s1); g.appendChild(s2);
    setTimeout(() => {
      const xs = [], ys = [];
      for (let i = 0; i < D.dates.length; i++) {
        if (D.split[i] !== 2) continue;
        for (let c = 0; c < D.cities.length; c++) {
          const a = D.series.y[i] && D.series.y[i][c], b = D.series.f[i] && D.series.f[i][c];
          if (a === null || b === null || !isFinite(a) || !isFinite(b)) continue;
          xs.push(a); ys.push(b);
        }
      }
      new CH.Scatter(s1, { x: xs, y: ys, xLabel: "实测", yLabel: "预测", color: "#0E7C86", r: 1.7, opacity: .35 });
      const q = (mt.quarter || []);
      new CH.Bars(s2, { data: q.map((z) => ({ k: z.q.replace(/^20/, ""), v: z.nrmse })), labelW: 42,
        fmt: (v) => U.pct(v, 0), color: "#2F7FC1", height: 230 });
    }, 40);
    c2.bd.appendChild(U.el("div", "tiny", "左：测试段全部城市-日散点，虚线为 y=x；右：分季度 nRMSE。"));

    const c3 = U.card(main, "逐城指标（测试段）", "按 nRMSE 升序", []);
    const tb = U.el("div");
    tb.style.maxHeight = "320px";
    tb.className = "scroll";
    let html = "<table class='t'><thead><tr><th>城市</th><th>n</th><th>RMSE</th><th>MAE</th><th>nRMSE</th><th>PCC</th><th>R²</th><th>sMAPE</th><th>机理头</th></tr></thead><tbody>";
    (mt.per_city || []).forEach((z) => {
      html += "<tr><td><b>" + z.city.replace("市", "") + "</b></td><td>" + z.n + "</td><td>" + U.fmt(z.rmse, 2) +
        "</td><td>" + U.fmt(z.mae, 2) + "</td><td>" + U.pct(z.nrmse, 1) + "</td><td>" + U.fmt(z.pcc, 3) +
        "</td><td>" + U.fmt(z.r2, 3) + "</td><td>" + U.pct(z.smape, 1) + "</td><td>" + U.fmt(z.rmse_mech, 2) + "</td></tr>";
    });
    html += "</tbody></table>";
    tb.innerHTML = html;
    c3.bd.appendChild(tb);

    /* 右栏 */
    const r1 = U.card(rail, "分段指标", "池化全部城市-日");
    const t1 = U.el("div");
    let h1 = "<table class='t'><thead><tr><th>分段</th><th>n</th><th>RMSE</th><th>nRMSE</th><th>PCC</th><th>R²</th></tr></thead><tbody>";
    ["train", "val", "test"].forEach((k) => {
      const s = (mt.splits || {})[k];
      if (!s) return;
      h1 += "<tr><td>" + ({ train: "训练（拟合）", val: "验证", test: "测试（样本外）" }[k]) + "</td><td>" + s.n +
        "</td><td>" + U.fmt(s.rmse, 2) + "</td><td>" + U.pct(s.nrmse, 1) + "</td><td>" + U.fmt(s.pcc, 3) +
        "</td><td>" + U.fmt(s.r2, 3) + "</td></tr>";
    });
    const bs = (mt.baseline || {});
    if (bs.nrmse !== undefined && bs.nrmse !== null) {
      h1 += "<tr style='background:#F7FAFC'><td>持续性基线</td><td>" + (bs.n || "—") + "</td><td>" +
        U.fmt(bs.rmse, 2) + "</td><td>" + U.pct(bs.nrmse, 1) + "</td><td>" + U.fmt(bs.pcc, 3) +
        "</td><td>" + U.fmt(bs.r2, 3) + "</td></tr>";
    }
    h1 += "</tbody></table>";
    t1.innerHTML = h1;
    if (bs.skill !== undefined && bs.skill !== null) {
      const nd = U.el("div", "tiny", "同口径持续性基线 = h=1..12 的 y(t−h) 等权平均，与模型逐日曲线的聚合方式一致。" +
        "相对基线误差下降：全市 <b>" + U.pct(bs.skill, 1) + "</b> · 省级 <b>" + U.pct((bs.province || {}).skill, 1) + "</b>");
      nd.style.marginTop = "6px";
      t1.appendChild(nd);
    }
    r1.bd.appendChild(t1);

    const r2 = U.card(rail, "训练配置", "");
    const m = D.meta;
    r2.bd.appendChild(U.el("div", "", [
      ["区间", m.window_start + " → " + m.window_end],
      ["7:2:1 切分", "训练 " + (m.n_train || "—") + " d / 验证 " + (m.n_val || "—") + " d / 测试 " + (m.n_test || "—") + " d"],
      ["边界", m.train_end + " | " + m.test_start],
      ["种子", "seed " + m.seeds + (String(m.seeds).indexOf(",") < 0 ? "（单种子）" : "（集成）")], ["最大轮数", m.epochs],
      ["图结构", m.graph_mask + (m.graph_data && m.graph_data !== "radiation" ? " / " + m.graph_data : "")],
      ["迁徙图", m.mig_graph], ["人口年份", m.pop_year],
      ["训练耗时", m.duration_sec ? (m.duration_sec / 60).toFixed(1) + " 分钟" : "—"],
      ["参数量", "15,385"],
    ].map((kv) => "<div class='kv'><span>" + kv[0] + "</span><span>" + kv[1] + "</span></div>").join("")));

    const ab = (D.experiments || {}).aux_ablation || [];
    if (ab.length) {
      const r0 = U.card(rail, "机理头消融", "λ_aux：机理/辅助头损失权重");
      let ht = "<table class='t compact'><thead><tr><th style='width:34%'>λ_aux</th><th>直接头<br>nRMSE</th><th>机理头<br>R²</th><th>机理头<br>标定后 R²</th></tr></thead><tbody>";
      ab.forEach((z) => {
        ht += "<tr><td><b>" + (z.lam_aux === null ? "—" : z.lam_aux.toFixed(1)) + "</b></td><td>" +
          U.fmt(z.nrmse, 3) + "</td><td>" + (z.mech_r2 === null ? "—" : U.fmt(z.mech_r2, 3)) +
          "</td><td>" + (z.mech_cal_r2 === null || z.mech_cal_r2 === undefined ? "—" : U.fmt(z.mech_cal_r2, 3)) + "</td></tr>";
      });
      ht += "</tbody></table>";
      r0.bd.innerHTML = ht + "<div class='tiny' style='margin-top:5px'>同区间 2020-2025、2 种子。" +
        "λ_aux 从 0 → 0.5，直接头 nRMSE 只动 0.2%，说明机理分支对主预测的边际贡献≈0；" +
        "但它的形状能力不差（逐城标定后 R² 0.33→0.55，PCC 0.84-0.87），差的是绝对尺度。</div>";
      rail.appendChild(r0.card);
    }

    const r3 = U.card(rail, "峰值与校准", "");
    const pk = mt.peak || {};
    r3.bd.appendChild(U.el("div", "", [
      ["峰值命中率（±7d）", U.pct(pk.peak_hit_rate, 1)],
      ["峰值幅度比", U.fmt(pk.peak_ratio_mean, 3)],
      ["直接头 RMSE", U.fmt((mt.per_city || []).reduce((a, z) => a + (z.rmse_direct || 0), 0) / Math.max(1, (mt.per_city || []).length), 2)],
      ["机理头 RMSE", U.fmt((mt.per_city || []).reduce((a, z) => a + (z.rmse_mech || 0), 0) / Math.max(1, (mt.per_city || []).length), 2)],
    ].map((kv) => "<div class='kv'><span>" + kv[0] + "</span><span>" + kv[1] + "</span></div>").join("")));
  });
})();
