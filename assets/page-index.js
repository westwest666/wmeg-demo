/* 全省总览页 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  function imgHtml(a, b) { return "<b>" + U.fmt(a, 2) + "</b>"; }
  const splitRanges = (D) => window.WMEG.splitRanges(D);

  window.WMEG.register("index", function (main, rail, ctx) {
    const D = ctx.D, mt = D.metrics || {}, meta = D.meta;
    const prov = mt.province || {}, ov = mt.overall || {};
    const nDays = D.dates.length;
    const testIdx = [];
    D.split.forEach((s, i) => { if (s === 2) testIdx.push(i); });

    /* ---------- KPI ---------- */
    const kpis = [
      { t: "全省日均发病（测试段）", v: U.fmt(prov.mean_true, 1), u: "例/日", d: "预测 " + U.fmt(prov.mean_pred, 1), cls: "obs" },
      { t: "省级 nRMSE", v: U.pct(prov.nrmse, 1), d: "RMSE " + U.fmt(prov.rmse, 1) + " 例", cls: "pred" },
      { t: "省级 PCC / R²", v: U.fmt(prov.pcc, 3), d: "R² " + U.fmt(prov.r2, 3), cls: "pred" },
      { t: "基本再生数 R0", v: U.fmt(D.r0.prov, 2), d: "各流行季 Rt 峰值的中位数", cls: "r0" },
      { t: "当前有效再生数 Rt", v: U.fmt(D.r0.rt_now, 2), d: "全省 7 日平滑", cls: "rt" },
      (function () {
        const b = (mt.baseline || {});
        const sk = b.skill, skp = (b.province || {}).skill;
        return { t: "相对持续性基线", v: (sk === null || sk === undefined) ? "—" : (sk > 0 ? "+" : "") + (sk * 100).toFixed(1) + "%",
          d: "省级 " + ((skp === null || skp === undefined) ? "—" : (skp > 0 ? "+" : "") + (skp * 100).toFixed(1) + "%") + " · 同口径多步",
          cls: (sk > 0 ? "ok" : "warn") };
      })(),
      { t: "数据集区间", v: meta.n_days, u: "天", d: meta.window_start.slice(2) + " → " + meta.window_end.slice(2) },
    ];
    // 紧凑指标带：只占一条窄带，视觉重量让给主图
    const kp = U.el("div", "mbar");
    kpis.forEach((k) => {
      const el = U.el("div", "m " + (k.cls || ""));
      el.innerHTML = "<span class='ml'>" + k.t + "</span>" +
        "<span class='mv num'>" + k.v + (k.u ? "<i>" + k.u + "</i>" : "") + "</span>" +
        "<span class='md'>" + k.d + "</span>";
      el.title = k.t + " · " + k.d;
      kp.appendChild(el);
    });
    main.appendChild(kp);

    /* ---------- 全省拟合/预测 ---------- */
    const c1 = U.card(main, "山西省 · 全省拟合与预测",
      "训练段为拟合，验证/测试段为样本外预测（逐城市建模后求和）", [
        { label: U.icon("expand"), title: "放大", fn: () => openBig() },
        { label: "机理", title: "叠加机理分支（右轴 · 量级较小）", on: false,
          fn: (e) => { showMech = !showMech; e.target.classList.toggle("on", showMech); chart.setData(D.dates, series()); } },
      ]);
    c1.bd.innerHTML = CH.legend([
      { label: "实测（7 日平滑）", color: "#1F2A36" },
      { label: "WMEG-Net 融合预测", color: "#0E7C86", dot: false },
      { label: "训练 / 验证 / 测试", color: "#EDF3F7" },
    ]);
    c1.card.classList.add("mainchart");
    const box = U.el("div"); box.style.flex = "1 1 auto"; box.style.minHeight = "260px"; box.style.position = "relative";
    c1.bd.appendChild(box);
    let showMech = false;
    function series() {
      const s = [
        { label: "实测", color: "#1F2A36", width: 2.2, data: D.series.prov.y },
        { label: "预测", color: "#0E7C86", width: 2.2, data: D.series.prov.f },
      ];
      if (showMech) s.push({ label: "机理分支（右轴）", color: "#E8590C", width: 1.2, dash: "5 3",
        axis: 2, opacity: .9, data: D.series.prov.m });
      return s;
    }
    const chart = new CH.LineChart(box, { dates: D.dates, series: series(), splitRanges: splitRanges(D),
      brush: true, zoom: true, y2: true, y2Format: (v) => U.fmt(v, 0), y2color: "#E8590C" });
    function openBig() {
      const bd = U.modal("山西省 · 全省拟合与预测", () => {});
      const d = U.el("div"); d.style.flex = "1"; d.style.minHeight = "0";
      bd.appendChild(d);
      setTimeout(() => new CH.LineChart(d, { dates: D.dates, series: series(), splitRanges: splitRanges(D), brush: true, zoom: true, xTickN: 14 }), 30);
    }

    /* ---------- 11 市小多图 ---------- */
    const c2 = U.card(main, "11 市拟合与预测", "点击进入城市剖析 · 低病例城市 nRMSE 天然偏高，请结合 PCC/R² 看", []);
    const grid = U.el("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(auto-fill,minmax(216px,1fr))";
    grid.style.gap = "8px";
    c2.bd.appendChild(grid);
    D.cities.forEach((city, ci) => {
      const cell = U.el("div", "citycell");
      cell.style.cssText = "border:1px solid var(--line);border-radius:8px;padding:5px 6px 2px;cursor:pointer;background:#fff";
      const head = U.el("div");
      head.style.cssText = "display:flex;align-items:baseline;gap:6px;font-size:11.5px";
      const cm = (mt.per_city || []).find((z) => z.city === city + "市") || (mt.per_city || []).find((z) => z.city === city) || {};
      head.innerHTML = "<b>" + city + "</b><span style='color:#8496A6;font-size:10px'>nRMSE " + U.pct(cm.nrmse, 1) + "</span>";
      cell.appendChild(head);
      const cbox = U.el("div"); cbox.style.height = "76px";
      cell.appendChild(cbox);
      const y = D.series.y.map((r) => r[ci]), f = D.series.f.map((r) => r[ci]);
      setTimeout(() => new CH.LineChart(cbox, {
        dates: D.dates, minimal: true, showX: false, padding: [4, 34, 4, 30],
        series: [{ label: "实测", color: "#1F2A36", width: 1.2, data: y, showTip: true },
                 { label: "预测", color: "#0E7C86", width: 1.4, data: f }],
        splitRanges: splitRanges(D), yFormat: (v) => CH.fmt(v, 0)
      }), 10);
      cell.onclick = (e) => { if (e.shiftKey || e.ctrlKey) { openCity(city, y, f); } else { window.WMEG.go("city", { city: city }); } };
      grid.appendChild(cell);
    });
    function openCity(city, y, f) {
      const bd = U.modal(city + "市 · 拟合与预测", () => {});
      const d = U.el("div"); d.style.flex = "1"; bd.appendChild(d);
      setTimeout(() => new CH.LineChart(d, { dates: D.dates, splitRanges: splitRanges(D),
        series: [{ label: "实测", color: "#1F2A36", width: 1.8, data: y }, { label: "预测", color: "#0E7C86", width: 1.8, data: f }] }), 30);
    }

    /* ---------- 右栏 ---------- */
    const r1 = U.card(rail, "基本再生数 R0", "实测反演 · 流行季 Rt 峰值");
    const r0list = (D.r0.city || []).slice().sort((a, b) => (b.r0 || 0) - (a.r0 || 0));
    const r0box = U.el("div"); r0box.style.height = Math.max(120, r0list.length * 19) + "px";
    r1.bd.appendChild(r0box);
    new CH.Bars(r0box, {
      data: r0list.map((z) => ({ k: z.city, v: z.r0 || 0 })), labelW: 40,
      fmt: (v) => U.fmt(v, 2), color: "#C2185B", height: Math.max(120, r0list.length * 19),
      onClick: (d) => { window.WMEG.go("city", { city: d.k }); }
    });
    const r0note = U.el("div", "tiny", "R<sub>0</sub> = 流行季内「7 日平滑 R<sub>t</sub>」再做 14 日平均后的峰值（Cori 估计，峰值传播强度上界）；全省 R<sub>0</sub>=" + U.fmt(D.r0.prov, 2) + "（各季中位数）");
    r0note.style.marginTop = "4px";
    r1.bd.appendChild(r0note);

    const r2 = U.card(rail, "有效再生数 Rt", "全省 7 日平滑 · 红色虚线 R=1");
    const r2box = U.el("div"); r2box.style.height = "150px";
    r2.bd.appendChild(r2box);
    new CH.LineChart(r2box, {
      dates: D.dates, minimal: false, xTickN: 4, padding: [8, 34, 22, 34],
      series: [{ label: "Rt", color: "#8E44C7", width: 1.6, data: D.rt.prov_s }],
      splitRanges: splitRanges(D), yFormat: (v) => U.fmt(v, 1),
      hlines: [{ v: 1, color: "#C2185B", label: "R=1" }]
    });

    const r3 = U.card(rail, "流行季波次", "7 月 → 次年 6 月");
    const tb = U.el("table", "t");
    tb.innerHTML = "<thead><tr><th>流行季</th><th>峰值</th><th>峰日</th><th>R0</th></tr></thead>";
    const tbody = U.el("tbody");
    (D.r0.season || []).forEach((s) => {
      const tr = U.el("tr");
      tr.innerHTML = "<td>" + s.label + "</td><td class='num'>" + U.fmt(s.peak_val, 0) +
        "</td><td>" + s.peak_day.slice(2, 10) + "</td><td class='num' style='color:#C2185B;font-weight:700'>" + U.fmt(s.r0, 2) + "</td>";
      tr.style.cursor = "pointer";
      tr.onclick = () => { chart.setRange(D.dates.indexOf(s.start), D.dates.indexOf(s.end)); };
      tbody.appendChild(tr);
    });
    tb.appendChild(tbody);
    r3.bd.appendChild(tb);

    const r4 = U.card(rail, "本次训练", "");
    r4.bd.appendChild(U.el("div", "", [
      ["区间", meta.window_start + " → " + meta.window_end],
      ["切分", "训练→" + meta.train_end + " · 验证→" + meta.test_start + " · 测试→" + meta.test_end],
      ["比例", "7 : 2 : 1（" + (meta.ratio || []).map((v) => (v * 100).toFixed(0) + "%").join(" / ") + "）"],
      ["种子 / 轮数", meta.seeds + " / " + meta.epochs],
      ["图结构", (meta.graph_mask || "-") + (meta.graph_data && meta.graph_data !== "radiation" ? " · " + meta.graph_data : "")],
      ["耗时", (meta.duration_sec ? (meta.duration_sec / 60).toFixed(1) + " 分钟" : "—")],
    ].map((kv) => "<div class='kv'><span>" + kv[0] + "</span><span>" + kv[1] + "</span></div>").join("")));
  });
})();
