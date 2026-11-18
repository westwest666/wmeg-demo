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
    let seriesOn = { y: true, f: true, m: false };
    let chart = null;

    const ci = () => D.cities.indexOf(city);
    const yArr = () => D.series.y.map((r) => r[ci()]);
    const fArr = () => D.series.f.map((r) => r[ci()]);
    const mArr = () => D.series.m.map((r) => r[ci()]);
    const rArr = () => D.rt.v.map((r) => r[ci()]);

    function buildSeries() {
      const s = [];
      if (seriesOn.y) s.push({ label: "实测", color: "#1F2A36", width: 1.8, data: yArr() });
      if (seriesOn.f) s.push({ label: "WMEG 预测", color: "#0E7C86", width: 1.8, data: fArr() });
      if (seriesOn.m) s.push({ label: "机理头", color: "#E8590C", width: 1.3, dash: "5 3", data: mArr() });
      return s;
    }
    function splitOf(i) { return D.split[i]; }
    function inRange(a, b, splitCode) {
      const yy = [], ff = [];
      for (let i = a; i <= b; i++) { if (D.split[i] !== splitCode) continue; yy.push(yArr()[i]); ff.push(fArr()[i]); }
      return { y: yy, f: ff };
    }

    /* ---------- 主图 ---------- */
    const c1 = U.card(main, (city) + "市 · 拟合与预测", "拖拽框选放大 · 滚轮缩放 · 双击复位", [
      { label: U.icon("expand"), title: "放大查看", fn: () => openBig() },
      { label: U.icon("csv"), title: "导出当前区间 CSV", fn: () => exportCsv() },
    ]);
    c1.card.style.flex = "1";
    c1.card.style.minHeight = "300px";
    const legendBox = U.el("div", "", CH.legend([
      { label: "实测", color: "#1F2A36" }, { label: "WMEG 预测", color: "#0E7C86", dot: true },
      { label: "机理头", color: "#E8590C" }, { label: "训练/验证/测试", color: "#EDF3F7" }]));
    c1.bd.appendChild(legendBox);
    const box = U.el("div"); box.style.flex = "1"; box.style.minHeight = "240px"; box.style.position = "relative";
    c1.bd.appendChild(box);
    setTimeout(() => {
      chart = new CH.LineChart(box, {
        dates: D.dates, series: buildSeries(), splitRanges: WMEG.splitRanges(D), brush: true, zoom: true,
        padding: [12, 46, 26, 44], xTickN: 10,
        onSelect: (a, b) => { view = { a, b }; syncRangeLabel(); }
      });
      chart.setRange(view.a, view.b);
    }, 20);

    /* ---------- 区间工具条 ---------- */
    const bar = U.el("div");
    bar.style.cssText = "display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:2px 0 6px;font-size:11.5px;color:var(--tx3)";
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
    presets.forEach(([lab, fn]) => {
      const b = U.el("button", "btn sm", lab);
      b.onclick = () => { const [a, b2] = fn(); view = { a, b: b2 }; chart.setRange(a, b2); syncRangeLabel(); };
      bar.appendChild(b);
    });
    const din = document.createElement("input"); din.type = "date"; din.className = "btn sm"; din.style.padding = "2px 6px";
    const din2 = document.createElement("input"); din2.type = "date"; din2.className = "btn sm"; din2.style.padding = "2px 6px";
    const applyBtn = U.el("button", "btn sm primary", "应用");
    bar.appendChild(din); bar.appendChild(din2); bar.appendChild(applyBtn);
    const rangeTxt = U.el("span", "", "");
    bar.appendChild(rangeTxt);
    function syncRangeLabel() {
      din.value = D.dates[view.a] || ""; din2.value = D.dates[view.b] || "";
      rangeTxt.innerHTML = "当前区间 <b>" + (D.dates[view.a] || "") + " → " + (D.dates[view.b] || "") +
        "</b> · " + (view.b - view.a + 1) + " 天";
      din.style.color = "var(--tx2)"; din2.style.color = "var(--tx2)";
    }
    applyBtn.onclick = () => {
      const a = D.dates.indexOf(din.value), b = D.dates.indexOf(din2.value);
      if (a < 0 || b < 0 || b <= a) { U.toast("区间无效"); return; }
      view = { a, b }; chart.setRange(a, b); syncRangeLabel();
    };
    c1.bd.appendChild(bar);
    function openBig() {
      const bd = U.modal(city + "市 · " + D.dates[view.a] + " → " + D.dates[view.b], () => {});
      const d = U.el("div"); d.style.flex = "1"; d.style.minHeight = "0";
      bd.appendChild(d);
      const info = U.el("div", "tiny", "");
      info.style.marginBottom = "6px";
      bd.insertBefore(info, d);
      setTimeout(() => {
        const ch = new CH.LineChart(d, { dates: D.dates, series: buildSeries(), splitRanges: WMEG.splitRanges(D),
          brush: true, zoom: true, xTickN: 16, onSelect: (a, b) => {
            const s2 = stats(yArr().slice(a, b + 1), fArr().slice(a, b + 1));
            info.innerHTML = "区间 " + D.dates[a] + " → " + D.dates[b] + " · RMSE " + U.fmt(s2.rmse, 2) +
              " · MAE " + U.fmt(s2.mae, 2) + " · nRMSE " + U.pct(s2.nrmse, 1) + " · PCC " + U.fmt(s2.pcc, 3);
          } });
        ch.setRange(view.a, view.b);
      }, 30);
    }
    function exportCsv() {
      const rows = ["day,split,y_true,y_pred_fused,y_pred_mech"];
      for (let i = view.a; i <= view.b; i++) {
        rows.push([D.dates[i], SPLIT_NAME[D.split[i]] || "", yArr()[i], fArr()[i], mArr()[i]].join(","));
      }
      U.download(city + "_" + D.dates[view.a] + "_" + D.dates[view.b] + ".csv", "\ufeff" + rows.join("\n"));
      U.toast("已导出 " + (rows.length - 1) + " 行");
    }

    /* ---------- 下方两图 ---------- */
    const c2 = U.card(main, "分步长误差（1-12 步）", "测试段逐城 RMSE / 相对误差", []);
    c2.card.style.flex = "0 0 auto";
    const g2 = U.el("div"); g2.style.cssText = "display:grid;grid-template-columns:1fr 1fr;gap:10px";
    c2.bd.appendChild(g2);
    const h1 = U.el("div"); h1.style.height = "148px";
    const h2 = U.el("div"); h2.style.height = "148px";
    g2.appendChild(h1); g2.appendChild(h2);
    setTimeout(() => {
      const full = city + "市";
      const abs = (D.metrics.city_horizon || {})[full] || null;
      const rel = (D.metrics.city_horizon_rel || {})[full] || null;
      new CH.Bars(h1, { data: (abs || []).map((v, i) => ({ k: "H" + (i + 1), v: v })), labelW: 26,
        fmt: (v) => U.fmt(v, 2), color: "#2F7FC1", height: 148 });
      new CH.Bars(h2, { data: (rel || []).map((v, i) => ({ k: "H" + (i + 1), v: v })), labelW: 26,
        fmt: (v) => U.pct(v, 0), color: "#0E7C86", height: 148 });
    }, 30);

    const c3 = U.card(main, "月度分布", "该市逐月累计与预测对比（全区间）", []);
    const h3 = U.el("div"); h3.style.height = "150px";
    c3.bd.appendChild(h3);
    setTimeout(() => {
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
      // 月度均值（例/日）+ 平方根刻度：避免冬季峰值把整年压成一条线
      const vals = keys.map((k) => mon[k].y / Math.max(1, mon[k].n));
      const mx = Math.max(0.001, Math.max.apply(null, vals));
      const wrapM = U.el("div");
      wrapM.style.cssText = "display:flex;gap:2px;align-items:flex-end;height:104px";
      const g = U.el("div");
      g.style.cssText = "flex:1;display:flex;gap:2px;align-items:flex-end;height:104px";
      keys.forEach((k, ki) => {
        const col = U.el("div");
        col.style.cssText = "flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;cursor:pointer;height:100%";
        const h = Math.max(2, Math.sqrt(vals[ki] / mx) * 92);
        const bar = U.el("div");
        bar.style.cssText = "width:100%;max-width:26px;border-radius:2px 2px 0 0;background:linear-gradient(180deg,#57B7BE,#0E7C86);height:" + h + "px";
        bar.title = k + " · 日均实测 " + U.fmt(vals[ki], 1) + " · 预测 " + U.fmt(mon[k].f / Math.max(1, mon[k].n), 1);
        col.appendChild(bar);
        col.onclick = () => {
          const a = D.dates.findIndex((d) => d.slice(0, 7) === k);
          let b = a; while (b + 1 < D.dates.length && D.dates[b + 1].slice(0, 7) === k) b++;
          if (a >= 0) { view = { a, b }; chart.setRange(view.a, view.b); syncRangeLabel(); }
        };
        g.appendChild(col);
      });
      const xlab = U.el("div");
      xlab.style.cssText = "display:flex;justify-content:space-between;font-size:9.5px;color:#8496A6;margin-top:3px";
      xlab.innerHTML = "<span>" + (keys[0] || "") + "</span><span>" + (keys[Math.floor(keys.length / 2)] || "") + "</span><span>" + (keys[keys.length - 1] || "") + "</span>";
      wrapM.appendChild(g);
      c3.bd.appendChild(wrapM);
      c3.bd.appendChild(xlab);
      c3.bd.appendChild(U.el("div", "tiny", "柱高为月度日均（平方根刻度），点击柱切换主图区间。"));
    }, 30);

    /* ---------- 右栏 ---------- */
    const r1 = U.card(rail, city + "市 · 分段指标", "");
    const r1b = U.el("div");
    r1.bd.appendChild(r1b);
    const r2 = U.card(rail, "峰值与再生数", "");
    r2.bd.appendChild(U.el("div", "", ""));
    const r3 = U.card(rail, "数据覆盖", "");
    r3.bd.appendChild(U.el("div", "", ""));

    function renderRail() {
      r1b.innerHTML = "";
      const rows = [[0, "训练段（拟合）"], [1, "验证段"], [2, "测试段（样本外）"]];
      let tbl = "<table class='t'><thead><tr><th>分段</th><th>RMSE</th><th>nRMSE</th><th>PCC</th><th>R²</th></tr></thead><tbody>";
      rows.forEach(([code, lab]) => {
        const { y, f } = inRange(0, D.dates.length - 1, code);
        const s = stats(y, f);
        tbl += "<tr><td>" + lab + "</td><td>" + U.fmt(s.rmse, 2) + "</td><td>" + U.pct(s.nrmse, 1) +
          "</td><td>" + U.fmt(s.pcc, 3) + "</td><td>" + U.fmt(s.r2, 3) + "</td></tr>";
      });
      const all = stats(yArr(), fArr());
      tbl += "<tr style='background:#F7FAFC'><td><b>全区间</b></td><td><b>" + U.fmt(all.rmse, 2) +
        "</b></td><td><b>" + U.pct(all.nrmse, 1) + "</b></td><td><b>" + U.fmt(all.pcc, 3) +
        "</b></td><td><b>" + U.fmt(all.r2, 3) + "</b></td></tr></tbody></table>";
      r1b.innerHTML = tbl;
      const cur = stats(yArr().slice(view.a, view.b + 1), fArr().slice(view.a, view.b + 1));
      const curDiv = U.el("div");
      curDiv.style.marginTop = "8px";
      curDiv.innerHTML = "<div class='kv'><span>当前区间 RMSE</span><span>" + U.fmt(cur.rmse, 2) + "</span></div>" +
        "<div class='kv'><span>当前区间 MAE</span><span>" + U.fmt(cur.mae, 2) + "</span></div>" +
        "<div class='kv'><span>当前区间 nRMSE</span><span>" + U.pct(cur.nrmse, 1) + "</span></div>" +
        "<div class='kv'><span>当前区间 PCC</span><span>" + U.fmt(cur.pcc, 3) + "</span></div>";
      r1b.appendChild(curDiv);

      const r2b = r2.bd.firstChild;
      const r0c = (D.r0.city.find((z) => z.city === city) || {});
      const rtNow = (function () { for (let i = D.dates.length - 1; i >= 0; i--) { const v = D.rt.v[i][ci()]; if (v !== null) return v; } return null; })();
      let peakI = 0, peakV = -1;
      yArr().forEach((v, i) => { if (v !== null && v > peakV) { peakV = v; peakI = i; } });
      r2b.innerHTML = [
        ["基本再生数 R0", U.fmt(r0c.r0, 2)],
        ["当前 Rt", U.fmt(rtNow, 2)],
        ["Rt 中位数", U.fmt(r0c.rt_med, 2)],
        ["实测峰值", U.fmt(peakV, 1) + " 例"],
        ["峰值日期", D.dates[peakI]],
      ].map((kv) => "<div class='kv'><span>" + kv[0] + "</span><span>" + kv[1] + "</span></div>").join("");
      const rtBox = U.el("div"); rtBox.style.height = "90px"; r2.bd.appendChild(rtBox);
      new CH.LineChart(rtBox, { dates: D.dates, minimal: true, showX: false, padding: [4, 30, 4, 26],
        series: [{ label: "Rt", color: "#8E44C7", width: 1.3, data: rArr() }], yFormat: (v) => U.fmt(v, 1),
        hlines: [{ v: 1, color: "#C2185B", opacity: .5 }] });

      const prof = (D.profile || {}).cases || {};
      const pc = (prof.per_city || []).find((z) => z.city === city) || {};
      r3.bd.firstChild.innerHTML = [
        ["有效天数", (pc.days || "—") + " 天"],
        ["累计（平滑）", U.fmt(pc.sum, 0) + " 例"],
        ["日均", U.fmt(pc.mean, 2) + " 例"],
        ["峰值", U.fmt(pc.max, 1) + " 例"],
      ].map((kv) => "<div class='kv'><span>" + kv[0] + "</span><span>" + kv[1] + "</span></div>").join("");
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
          renderRail();
        };
        list.appendChild(row);
      });
      cw.appendChild(list);
      cw.appendChild(U.el("h4", "", "曲线 CURVE"));
      [["y", "实测"], ["f", "WMEG 预测"], ["m", "机理头"]].forEach(([k, lab]) => {
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
