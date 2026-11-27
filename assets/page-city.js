/* 城市剖析页：单城市全指标 + 任意时段 + 图表放大 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  const SPLIT_NAME = { 0: "训练", 1: "验证", 2: "测试" };

  function stats(y, f) {
    let n = 0, sy = 0, sp = 0, se = 0, ae = 0, syy = 0, spp = 0, syp = 0, sden = 0;
    for (let i = 0; i < y.length; i++) {
      const a = y[i], b = f[i];
      if (a === null || b === null || a === undefined || b === undefined || !isFinite(a) || !isFinite(b)) continue;
      n++; sy += a; sp += b; se += (a - b) * (a - b); ae += Math.abs(a - b);
      syy += a * a; spp += b * b; syp += a * b;
      const d = Math.abs(a) + Math.abs(b);
      sden += d < 1e-9 ? 0 : 2 * Math.abs(b - a) / d;
    }
    if (!n) return { n: 0 };
    const rmse = Math.sqrt(se / n), mae = ae / n, my = sy / n, mp = sp / n;
    const cov = syp / n - my * mp;
    const vy = syy / n - my * my, vp = spp / n - mp * mp;
    const pcc = (vy > 1e-12 && vp > 1e-12) ? cov / Math.sqrt(vy * vp) : null;
    const ssTot = syy - n * my * my;
    const r2 = ssTot > 1e-12 ? 1 - se / ssTot : null;
    return { n, rmse, mae, pcc, r2, nrmse: my > 1e-9 ? rmse / my : null,
      smape: sden / n, mean: my, meanPred: mp, max: Math.max.apply(null, y.filter((v) => v !== null && isFinite(v))) };
  }

  window.WMEG.register("city", function (main, rail, ctx) {
    const D = ctx.D, U2 = U;
    const qs = ctx.params || new URLSearchParams();
    let city = qs.get("city") || ctx.STORE.city;
    if (D.cities.indexOf(city) < 0) city = D.cities[0];
    ctx.STORE.city = city;
    let view = { a: 0, b: D.dates.length - 1 };
    let seriesOn = { y: true, f: true, m: (ctx.params && ctx.params.get("mech") === "1") };
    // 机理分支默认关闭（量级小、会干扰读数），开启后走右轴
    let chart = null;

    const ci = () => D.cities.indexOf(city);
    const yArr = () => D.series.y.map((r) => r[ci()]);
    const fArr = () => D.series.f.map((r) => r[ci()]);
    const mArr = () => D.series.m.map((r) => r[ci()]);
    const rArr = () => D.rt.v.map((r) => r[ci()]);

    function buildSeries() {
      const s = [];
      if (seriesOn.y) s.push({ label: "实测", color: "#1F2A36", width: 1.7, dots: 34, dotR: 1.9, dotFill: "#1F2A36", dotW: 0, data: yArr() });
      if (seriesOn.f) s.push({ label: "WMEG 预测", color: "#E8590C", width: 2.2, area: true, areaOpacity: .08,
        dots: 34, dotR: 2.3, dotW: 1.6, data: fArr() });
      // 机理分支不参与输出，量级比预测小一个数量级 → 放到右轴，避免把主曲线压成贴地直线
      if (seriesOn.m) s.push({ label: "机理分支（右轴）", color: "#94A3B8", width: 1.2, dash: "5 3",
        axis: 2, opacity: .9, data: mArr() });
      return s;
    }
    function splitOf(i) { return D.split[i]; }
    function inRange(a, b, splitCode) {
      const yy = [], ff = [];
      for (let i = a; i <= b; i++) { if (D.split[i] !== splitCode) continue; yy.push(yArr()[i]); ff.push(fArr()[i]); }
      return { y: yy, f: ff };
    }

    /* ---------- 主图 ---------- */
    let logY = false, slider = null;
    const c1 = U.card(main, (city) + "市 · 拟合与预测", "实测 / WMEG 预测", [
      { label: U.icon("expand"), title: "放大查看", fn: () => openBig() },
      { label: U.icon("csv"), title: "导出当前区间 CSV", fn: () => exportCsv() },
      { label: "对数", title: "对数坐标：小波次与高峰同时可读（仅显示变换，悬停数值不变）", on: false,
        fn: (e) => { logY = !logY; e.target.classList.toggle("on", logY); if (chart) { chart.o.logY = logY; chart.draw(); } } },
    ]);
    c1.card.style.flex = "1";
    // 卡片最小高度必须 ≥ 头部+图例+工具条(约 90px) + 图表最小高度，否则底部工具条会被 overflow 裁掉
    c1.card.style.minHeight = "380px";
    const legendBox = U.el("div", "", CH.legend([
      { label: "实测", color: "#1F2A36", dot: true }, { label: "WMEG 预测", color: "#E8590C", ring: true },
      { label: "训练/验证/测试", color: "#EDF3F7" }]));
    c1.bd.appendChild(legendBox);
    const box = U.el("div"); box.style.flex = "1"; box.style.minHeight = "170px"; box.style.position = "relative";
    c1.bd.appendChild(box);
    setTimeout(() => {
      chart = new CH.LineChart(box, {
        dates: D.dates, series: buildSeries(), splitRanges: WMEG.splitRanges(D), brush: true, zoom: true,
        padding: [12, 46, 26, 44], xTickN: 10, y2: true, y2Format: (v) => U.fmt(v, 0), y2color: "#94A3B8",
        onSelect: (a, b) => { view = { a, b }; syncRangeLabel(); if (typeof setActive === "function") setActive(null); }
      });
      chart.setRange(view.a, view.b);
      // 区间滑动条：全范围缩略 + 双把手 + 平移，拖拽即改主图区间（与 brush/滚轮/预设/日期框双向同步）
      const sbox = U.el("div");
      sbox.style.cssText = "height:46px;flex:none;margin:0 2px 4px";
      c1.bd.appendChild(sbox);
      slider = new CH.RangeSlider(sbox, {
        dates: D.dates, a: view.a, b: view.b,
        series: [{ data: yArr(), color: "#1F2A36" }, { data: fArr(), color: "#E8590C" }],
        onChange: (a, b) => { view = { a, b }; chart.setRange(a, b); syncRangeLabel(); setActive(null); }
      });
    }, 20);

    /* ---------- 区间工具条 ---------- */
    const bar = U.el("div", "rangebar");
    bar.appendChild(U.el("span", "seglabel", "区间"));
    const seg = U.el("div", "seg");
    bar.appendChild(seg);
    const right = U.el("div", "rbar-right");
    bar.appendChild(right);

    const presets = [
      ["全部", () => [0, D.dates.length - 1]],
      ["测试段", () => { const a = D.dates.indexOf(D.meta.test_start); return [a < 0 ? 0 : a, D.dates.length - 1]; }],
      ["近 12 月", () => [Math.max(0, D.dates.length - 366), D.dates.length - 1]],
      ["近 6 月", () => [Math.max(0, D.dates.length - 183), D.dates.length - 1]],
      ["流行季", () => {
        const s = (D.r0.season || []).slice(-1)[0];
        return s ? [D.dates.indexOf(s.start), D.dates.indexOf(s.end)] : [0, D.dates.length - 1];
      }],
    ];
    const segBtns = [];
    function setActive(btn) {
      segBtns.forEach((b) => b.classList.toggle("on", b === btn));
    }
    presets.forEach(([lab, fn], i) => {
      const b = U.el("button", "", lab);
      b.onclick = () => { const p2 = fn(); view = { a: p2[0], b: p2[1] }; chart.setRange(view.a, view.b); syncRangeLabel(); setActive(b); };
      if (i === 0) b.classList.add("on");
      segBtns.push(b);
      seg.appendChild(b);
    });

    const din = document.createElement("input"); din.type = "date";
    const din2 = document.createElement("input"); din2.type = "date";
    const applyBtn = U.el("button", "btn sm primary", "应用");
    right.appendChild(U.el("span", "dlab", "起")); right.appendChild(din);
    right.appendChild(U.el("span", "dlab", "止")); right.appendChild(din2);
    right.appendChild(applyBtn);
    const rangeTxt = U.el("span", "rtxt", "");
    right.appendChild(rangeTxt);

    function syncRangeLabel() {
      din.value = D.dates[view.a] || ""; din2.value = D.dates[view.b] || "";
      rangeTxt.innerHTML = "<b>" + (D.dates[view.a] || "") + "</b> → <b>" + (D.dates[view.b] || "") +
        "</b> · " + (view.b - view.a + 1) + " 天";
      if (slider) slider.setRange(view.a, view.b);
    }
    applyBtn.onclick = () => {
      const a = D.dates.indexOf(din.value), b = D.dates.indexOf(din2.value);
      if (a < 0 || b < 0 || b <= a) { U.toast("区间无效"); return; }
      view = { a, b }; chart.setRange(a, b); syncRangeLabel(); setActive(null);
    };
    // 工具条放到图表上方：窗口再矮、图表再被压，控件也不会被卡片底边裁掉
    c1.bd.insertBefore(bar, c1.bd.firstChild);
    function openBig() {
      const bd = U.modal(city + "市 · " + D.dates[view.a] + " → " + D.dates[view.b], () => {});
      const d = U.el("div"); d.style.flex = "1"; d.style.minHeight = "0";
      bd.appendChild(d);
      const info = U.el("div", "tiny", "");
      info.style.marginBottom = "6px";
      bd.insertBefore(info, d);
      setTimeout(() => {
        const ch = new CH.LineChart(d, { dates: D.dates, series: buildSeries(), splitRanges: WMEG.splitRanges(D),
          brush: true, zoom: true, xTickN: 16, logY: logY, onSelect: (a, b) => {
            const s2 = stats(yArr().slice(a, b + 1), fArr().slice(a, b + 1));
            info.innerHTML = "区间 " + D.dates[a] + " → " + D.dates[b] + " · RMSE " + U.fmt(s2.rmse, 2) +
              " · MAE " + U.fmt(s2.mae, 2) + " · nRMSE " + U.pct(s2.nrmse, 1) + " · PCC " + U.fmt(s2.pcc, 3);
          } });
        ch.setRange(view.a, view.b);
      }, 30);
    }
    function exportCsv() {
      const rows = ["day,split,y_true,y_pred"];
      for (let i = view.a; i <= view.b; i++) {
        rows.push([D.dates[i], SPLIT_NAME[D.split[i]] || "", yArr()[i], fArr()[i]].join(","));
      }
      U.download(city + "_" + D.dates[view.a] + "_" + D.dates[view.b] + ".csv", "\ufeff" + rows.join("\n"));
      U.toast("已导出 " + (rows.length - 1) + " 行");
    }

    /* ---------- 月度分布（放在右栏，省出主区竖向空间） ---------- */
    function buildMonthly(host) {
      const mon = {};
      for (let i = 0; i < D.dates.length; i++) {
        const k = D.dates[i].slice(0, 7);
        const y = yArr()[i], f = fArr()[i];
        if (y === null && f === null) continue;
        mon[k] = mon[k] || { y: 0, f: 0, n: 0 };
        mon[k].n += 1;
        if (y !== null) mon[k].y += y;
        if (f !== null) mon[k].f += f;
      }
      const keys = Object.keys(mon);
      if (!keys.length) return;
      const vals = keys.map((k) => mon[k].y / Math.max(1, mon[k].n));
      const mx = Math.max(0.001, Math.max.apply(null, vals));
      // 用 SVG 而不是 flex 柱：月份多达 132 根时，flex 的 2px 间隙会把柱体挤成 0 宽（旧版整图空白）
      const NSM = "http://www.w3.org/2000/svg";
      const W = 1000, H = 86, bw = W / keys.length;
      const svg = document.createElementNS(NSM, "svg");
      svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      svg.setAttribute("preserveAspectRatio", "none");
      svg.style.cssText = "display:block;width:100%;height:86px";
      const grad = document.createElementNS(NSM, "linearGradient");
      grad.setAttribute("id", "monGrad");
      grad.setAttribute("x1", "0"); grad.setAttribute("y1", "0");
      grad.setAttribute("x2", "0"); grad.setAttribute("y2", "1");
      [["0%", "#57B7BE"], ["100%", "#0E7C86"]].forEach(([off, col]) => {
        const st = document.createElementNS(NSM, "stop");
        st.setAttribute("offset", off); st.setAttribute("stop-color", col); grad.appendChild(st);
      });
      svg.appendChild(grad);
      keys.forEach((k, ki) => {
        const h = Math.max(2, Math.sqrt(vals[ki] / mx) * 78);
        const r = document.createElementNS(NSM, "rect");
        r.setAttribute("x", (ki * bw + bw * 0.12).toFixed(2));
        r.setAttribute("y", (H - h).toFixed(2));
        r.setAttribute("width", Math.max(0.6, bw * 0.76).toFixed(2));
        r.setAttribute("height", h.toFixed(2));
        r.setAttribute("fill", "url(#monGrad)");
        r.style.cursor = "pointer";
        const tt = document.createElementNS(NSM, "title");
        tt.textContent = k + " · 日均实测 " + U.fmt(vals[ki], 1) + " · 预测 " + U.fmt(mon[k].f / Math.max(1, mon[k].n), 1);
        r.appendChild(tt);
        r.addEventListener("click", () => {
          const a = D.dates.findIndex((d) => d.slice(0, 7) === k);
          let b = a; while (b + 1 < D.dates.length && D.dates[b + 1].slice(0, 7) === k) b++;
          if (a >= 0) { view = { a, b }; chart.setRange(view.a, view.b); syncRangeLabel(); renderRail(); }
        });
        svg.appendChild(r);
      });
      const xlab = U.el("div");
      xlab.style.cssText = "display:flex;justify-content:space-between;font-size:9.5px;color:#8496A6;margin-top:3px";
      xlab.innerHTML = "<span>" + (keys[0] || "") + "</span><span>" + (keys[Math.floor(keys.length / 2)] || "") + "</span><span>" + (keys[keys.length - 1] || "") + "</span>";
      host.appendChild(svg);
      host.appendChild(xlab);
    }

    /* ---------- 右栏：再生数/峰值置顶（对外先看疫情强度），模型精度指标置底 ---------- */
    const r2 = U.card(rail, "峰值与再生数", "");
    const r3 = U.card(rail, "月度分布", "日均病例，点击柱切换主图区间");
    const r4 = U.card(rail, "数据覆盖", "");
    const r1 = U.card(rail, city + "市 · 模型指标", "RMSE · nRMSE · PCC（内部精度，供复核）");

    function statLine(s) {
      if (!s || !s.n) return "—";
      return "<b>" + U.fmt(s.rmse, 2) + "</b> · " + U.pct(s.nrmse, 1) + " · " + U.fmt(s.pcc, 3);
    }
    function kvLine(k, v) {
      return "<div class='kv'><span>" + k + "</span><span>" + v + "</span></div>";
    }

    function renderRail() {
      // 1) 分段指标
      const all = stats(yArr(), fArr());
      let h = "";
      [[0, "训练（拟合）"], [1, "验证"], [2, "测试（样本外）"]].forEach((pair) => {
        const sub = inRange(0, D.dates.length - 1, pair[0]);
        h += kvLine(pair[1], statLine(stats(sub.y, sub.f)));
      });
      h += kvLine("<b>全区间</b>", statLine(all));
      const cur = stats(yArr().slice(view.a, view.b + 1), fArr().slice(view.a, view.b + 1));
      h += "<div class='divider'></div>";
      h += kvLine("当前区间 RMSE", U.fmt(cur.rmse, 2));
      h += kvLine("当前区间 MAE", U.fmt(cur.mae, 2));
      h += kvLine("当前区间 nRMSE", U.pct(cur.nrmse, 1));
      h += kvLine("当前区间 PCC", U.fmt(cur.pcc, 3));
      r1.bd.innerHTML = h;

      // 2) 峰值与再生数
      const r0c = (D.r0.city.find((z) => z.city === city) || {});
      let rtNow = null;
      for (let i = D.dates.length - 1; i >= 0; i--) { const v = D.rt.v[i][ci()]; if (v !== null) { rtNow = v; break; } }
      let peakI = 0, peakV = -1;
      yArr().forEach((v, i) => { if (v !== null && v > peakV) { peakV = v; peakI = i; } });
      r2.bd.innerHTML = [
        ["基本再生数 R0", U.fmt(r0c.r0, 2)],
        ["当前 Rt", U.fmt(rtNow, 2)],
        ["Rt 中位数", U.fmt(r0c.rt_med, 2)],
        ["实测峰值", U.fmt(peakV, 1) + " 例"],
        ["峰值日期", D.dates[peakI]],
      ].map((kv) => kvLine(kv[0], kv[1])).join("") + "<div class='rtmini' style='height:84px;margin-top:6px'></div>";
      new CH.LineChart(r2.bd.querySelector(".rtmini"), { dates: D.dates, minimal: true, showX: false,
        padding: [4, 30, 4, 26], series: [{ label: "Rt", color: "#8E44C7", width: 1.3, data: rArr() }],
        yFormat: (v) => U.fmt(v, 1), hlines: [{ v: 1, color: "#C2185B", opacity: .5 }] });

      // 3) 月度分布
      r3.bd.innerHTML = "";
      buildMonthly(r3.bd);

      // 4) 数据覆盖
      const prof = (D.profile || {}).cases || {};
      const pc = (prof.per_city || []).find((z) => z.city === city) || {};
      r4.bd.innerHTML = [
        ["有效天数", (pc.days || "—") + " 天"],
        ["累计（平滑）", U.fmt(pc.sum, 0) + " 例"],
        ["日均", U.fmt(pc.mean, 2) + " 例"],
        ["峰值", U.fmt(pc.max, 1) + " 例"],
      ].map((kv) => kvLine(kv[0], kv[1])).join("");
    }


    /* ---------- 左控制台 ---------- */
    if (ctx.console) {
      const cw = ctx.console;
      cw.appendChild(U.el("h4", "", "城市 CITIES"));
      const list = U.el("div", "list");
      list.style.padding = "0 8px";
      D.cities.forEach((c) => {
        const row = U.el("div", "item" + (c === city ? " on" : ""));
        row.innerHTML = "<span class='nm'>" + c + "</span>";
        row.onclick = () => {
          city = c; ctx.STORE.city = c;
          Array.from(list.children).forEach((z) => z.classList.remove("on"));
          row.classList.add("on");
          window.WMEG.setParam("city", c);
          c1.hd.querySelector("h3").textContent = c + "市 · 拟合与预测";
          chart.setData(D.dates, buildSeries());
          if (slider) slider.setData([{ data: yArr(), color: "#1F2A36" }, { data: fArr(), color: "#E8590C" }]);
          renderRail();
        };
        list.appendChild(row);
      });
      cw.appendChild(list);
      cw.appendChild(U.el("h4", "", "曲线 CURVE"));
      [["y", "实测"], ["f", "WMEG 预测"], ["m", "机理分支"]].forEach(([k, lab]) => {
        const row = U.el("div", "row");
        row.style.cssText = "display:flex;align-items:center;gap:8px;padding:6px 14px;cursor:pointer;font-size:12px;color:var(--tx2)";
        row.innerHTML = "<span class='tick' style='width:10px;height:10px;border:1px solid #8496A6;border-radius:50%;display:inline-block'></span>" + lab;
        row.classList.toggle("on", seriesOn[k]);
        row.onclick = () => { seriesOn[k] = !seriesOn[k]; row.classList.toggle("on", seriesOn[k]); chart.setData(D.dates, buildSeries()); };
        cw.appendChild(row);
      });
    }

    setTimeout(() => { syncRangeLabel(); renderRail(); }, 40);
  });
})();
