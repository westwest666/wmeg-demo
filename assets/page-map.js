/* 时空传播页：地图 + 迁徙流 + 时间轴 */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  function heatColor(t) {
    // 浅黄 → 橙 → 深红
    const stops = [[247, 251, 253], [254, 236, 210], [253, 186, 116], [240, 113, 71], [190, 40, 40], [120, 20, 30]];
    t = Math.max(0, Math.min(0.9999, t));
    const x = t * (stops.length - 1), i = Math.floor(x), f = x - i;
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
    return "rgb(" + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",") + ")";
  }
  window.WMEG.heatColor = heatColor;

  window.WMEG.register("map", function (main, rail, ctx) {
    const D = ctx.D, G = D.map, U2 = U;
    const n = D.dates.length;
    let metric = "pred", showFlow = true, showAdj = true, showLab = true;
    let day = (function () {
      // 默认停在测试段里第一个「有预测值」的日期（分段起点前 20 天因窗口不足无预测）
      let t = D.dates.indexOf(D.meta.test_start);
      if (t < 0) t = 0;
      for (let i = t; i < Math.min(n, t + 40); i++) {
        const row = D.series.f[i];
        if (row && row.some((v) => v !== null && v !== undefined && isFinite(v))) return i;
      }
      return t;
    })();
    let playing = false, timer = null, sel = ctx.STORE.city;

    /* ---------- 地图 ---------- */
    const card = U.card(main, "山西省 11 地级市 · 时空传播", "色阶随「着色」切换 · 时间轴逐日回放", []);
    card.tools.appendChild((function () {
      const b = U.el("button", "ico", "▶");
      b.title = "播放 / 暂停";
      b.onclick = () => { playing = !playing; b.classList.toggle("on", playing); b.textContent = playing ? "❚❚" : "▶"; tick(); };
      return b;
    })());
    card.tools.appendChild((function () {
      const b = U.el("button", "ico", "⟲");
      b.title = "重置视图";
      b.onclick = () => { st.s = 1; st.tx = 0; st.ty = 0; applyT(); };
      return b;
    })());
    card.card.style.flex = "1";
    card.card.style.minHeight = "0";
    const wrap = U.el("div", "mapwrap");
    wrap.style.minHeight = "420px";
    card.bd.appendChild(wrap);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 " + G.W + " " + G.H);
    wrap.appendChild(svg);
    const NS = "http://www.w3.org/2000/svg";
    function e(tag, attrs, par) {
      const x = document.createElementNS(NS, tag);
      for (const k in attrs) x.setAttribute(k, attrs[k]);
      (par || svg).appendChild(x); return x;
    }
    const gZoom = e("g", {});
    const gAdj = e("g", {}, gZoom);
    const gPoly = e("g", {}, gZoom);
    const gFlow = e("g", {}, gZoom);
    const gLab = e("g", {}, gZoom);
    (G.edges || []).forEach(([a, b]) => {
      const ca = G.cents[a], cb = G.cents[b];
      if (!ca || !cb) return;
      e("line", { x1: ca[0], y1: ca[1], x2: cb[0], y2: cb[1], stroke: "#B9C7D2",
        "stroke-width": 1.1, "stroke-dasharray": "3 5", opacity: .85 }, gAdj);
    });
    const polys = {}, labels = {}, vals = {};
    Object.keys(G.polys || {}).forEach((k) => {
      polys[k] = e("path", { d: G.polys[k], fill: "#EEF3F7", stroke: "#FFFFFF", "stroke-width": 1.6,
        style: "cursor:pointer;transition:fill .18s" }, gPoly);
      polys[k].addEventListener("click", () => { sel = k; render(); });
      polys[k].addEventListener("mouseenter", () => { polys[k].setAttribute("stroke", "#0E7C86"); });
      polys[k].addEventListener("mouseleave", () => { polys[k].setAttribute("stroke", "#FFFFFF"); });
    });
    // 迁徙流
    const flows = (G.flows || []).slice(0, 40);
    const flowEls = flows.map((f) => {
      const [a, b, v] = f; const ca = G.cents[a], cb = G.cents[b];
      if (!ca || !cb) return null;
      const mx = (ca[0] + cb[0]) / 2, my = (ca[1] + cb[1]) / 2;
      const dx = cb[0] - ca[0], dy = cb[1] - ca[1];
      const cx = mx - dy * 0.14, cy = my + dx * 0.14;
      const d = "M" + ca[0] + "," + ca[1] + "Q" + cx + "," + cy + " " + cb[0] + "," + cb[1];
      const p = e("path", { d, fill: "none", stroke: "#2F7FC1", "stroke-width": Math.min(3.2, 0.7 + v / 9),
        opacity: .55, "stroke-linecap": "round" }, gFlow);
      p.setAttribute("class", "flow");
      return p;
    });
    // 标签
    Object.keys(G.cents || {}).forEach((k) => {
      const [x, y] = G.cents[k];
      const t1 = e("text", { x, y: y - 3, "text-anchor": "middle", "font-size": 12.5, "font-weight": 700,
        fill: "#14202B", "paint-order": "stroke", stroke: "#fff", "stroke-width": 2.2, style: "pointer-events:none" }, gLab);
      t1.textContent = k;
      const t2 = e("text", { x, y: y + 12, "text-anchor": "middle", "font-size": 11, "font-weight": 700,
        fill: "#14202B", "paint-order": "stroke", stroke: "#fff", "stroke-width": 2.2,
        "font-variant-numeric": "tabular-nums", style: "pointer-events:none" }, gLab);
      labels[k] = [t1, t2];
    });
    // 缩放/平移
    const st = { s: 1, tx: 0, ty: 0 };
    function applyT() { gZoom.setAttribute("transform", "translate(" + st.tx + "," + st.ty + ") scale(" + st.s + ")"); syncLabelSize(); }
    function syncLabelSize() {
      const fs = Math.max(7, 12.5 / st.s);
      gLab.querySelectorAll("text").forEach((t, i) => {
        t.setAttribute("font-size", t.getAttribute("data-base-y") === null ? (i % 2 === 0 ? fs : fs * 0.88) : fs);
        t.setAttribute("stroke-width", Math.max(1.4, 2.2 / st.s));
      });
      gAdj.querySelectorAll("line").forEach((l) => l.setAttribute("stroke-width", 1.1 / st.s));
      gPoly.querySelectorAll("path").forEach((p) => p.setAttribute("stroke-width", 1.6 / st.s));
    }
    wrap.addEventListener("wheel", (ev) => {
      ev.preventDefault();
      const r = svg.getBoundingClientRect();
      const k = ev.deltaY > 0 ? 0.9 : 1.11;
      const ns = Math.max(1, Math.min(12, st.s * k));
      const px = (ev.clientX - r.left) / r.width * G.W, py = (ev.clientY - r.top) / r.height * G.H;
      st.tx = px - (px - st.tx) * (ns / st.s);
      st.ty = py - (py - st.ty) * (ns / st.s);
      st.s = ns; applyT();
    }, { passive: false });
    let drag = null;
    wrap.addEventListener("mousedown", (ev) => { drag = { x: ev.clientX, y: ev.clientY, tx: st.tx, ty: st.ty };
      wrap.classList.add("drag"); });
    window.addEventListener("mouseup", () => { drag = null; wrap.classList.remove("drag"); });
    window.addEventListener("mousemove", (ev) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect();
      st.tx = drag.tx + (ev.clientX - drag.x) / r.width * G.W;
      st.ty = drag.ty + (ev.clientY - drag.y) / r.height * G.H;
      applyT();
    });
    wrap.addEventListener("dblclick", () => { st.s = 1; st.tx = 0; st.ty = 0; applyT(); });
    const tools = U.el("div", "maptools");
    ["+", "−", "⟲"].forEach((s) => {
      const b = U.el("button", "btn", s);
      b.onclick = () => {
        if (s === "+") { st.s = Math.min(12, st.s * 1.25); }
        else if (s === "−") { st.s = Math.max(1, st.s / 1.25); }
        else { st.s = 1; st.tx = 0; st.ty = 0; }
        applyT();
      };
      tools.appendChild(b);
    });
    wrap.appendChild(tools);
    const scalebar = U.el("div", "scalebar", "");
    wrap.appendChild(scalebar);

    /* ---------- 时间轴 ---------- */
    const tl = U.el("div", "timeline");
    tl.style.borderTop = "1px solid var(--line)";
    const dayTxt = U.el("div", "day", "");
    const range = document.createElement("input"); range.type = "range";
    range.min = 0; range.max = n - 1; range.value = day;
    const tot = U.el("div", "tot", "");
    tl.appendChild(dayTxt); tl.appendChild(range); tl.appendChild(tot);
    card.bd.appendChild(tl);
    range.oninput = () => { day = +range.value; render(); };
    function tick() {
      clearInterval(timer);
      if (!playing) return;
      timer = setInterval(() => { day = (day + 1) % n; range.value = day; render(); }, 90);
    }

    /* ---------- 渲染 ---------- */
    function currentVal(i, ci) {
      if (metric === "pred") return D.series.f[i] ? D.series.f[i][ci] : null;
      if (metric === "obs") return D.series.y[i] ? D.series.y[i][ci] : null;
      if (metric === "bias") {
        const y = D.series.y[i] ? D.series.y[i][ci] : null, f = D.series.f[i] ? D.series.f[i][ci] : null;
        return (y === null || f === null) ? null : f - y;
      }
      if (metric === "rt") return D.rt.v[i] ? D.rt.v[i][ci] : null;
      return null;
    }
    function maxima() {
      let mx = 1;
      for (let i = 0; i < n; i++) for (let c = 0; c < D.cities.length; c++) {
        const v = currentVal(i, c);
        if (v !== null && isFinite(v)) mx = Math.max(mx, Math.abs(v));
      }
      return mx;
    }
    let MX = maxima();
    function render() {
      const d = D.dates[day];
      dayTxt.textContent = d;
      let sumO = 0, sumP = 0;
      // 计数类用对数刻度（低值日也能看出差异），偏差/Rt 用线性
      const scale = (v) => {
        if (v === null || !isFinite(v)) return 0;
        if (metric === "rt") return Math.min(1, Math.abs(v) / 3.0);
        if (metric === "bias") return Math.min(1, Math.abs(v) / Math.max(1, MX * 0.35));
        return Math.min(1, Math.log1p(Math.abs(v)) / Math.log1p(Math.max(1, MX)));
      };
      D.cities.forEach((c, ci) => {
        const v = currentVal(day, ci);
        const t = scale(v);
        const fillC = (v === null || !isFinite(v)) ? "#EEF3F7" : heatColor(metric === "bias" ? Math.abs(t) : t);
        const _rgb = (fillC.match(/\d+/g) || [240, 240, 240]).map(Number);
        const _lum = (0.299 * _rgb[0] + 0.587 * _rgb[1] + 0.114 * _rgb[2]) / 255;
        const darkText = _lum < 0.62;
        if (polys[c]) {
          polys[c].setAttribute("fill", fillC);
          polys[c].style.opacity = (sel && sel !== c) ? 0.96 : 1;
          polys[c].setAttribute("stroke", c === sel ? "#0E7C86" : "#FFFFFF");
          polys[c].setAttribute("stroke-width", c === sel ? 2.4 : 1.6);
        }
        const lab = labels[c];
        if (lab) {
          lab[0].textContent = c;
          lab[1].textContent = (v === null || !isFinite(v)) ? "—" : (metric === "rt" ? U.fmt(v, 2) : U.fmt(v, metric === "bias" ? 1 : 0));
          lab[0].setAttribute("fill", darkText ? "#fff" : "#14202B");
          lab[1].setAttribute("fill", darkText ? "#fff" : "#14202B");
          lab[0].setAttribute("stroke", darkText ? "#14202B" : "#fff");
          lab[1].setAttribute("stroke", darkText ? "#14202B" : "#fff");
        }
        const yv = D.series.y[day] ? D.series.y[day][ci] : null, fv = D.series.f[day] ? D.series.f[day][ci] : null;
        if (yv !== null) sumO += yv; if (fv !== null) sumP += fv;
      });
      tot.innerHTML = "全省 实测 <b>" + U.fmt(sumO, 0) + "</b> · 预测 <b>" + U.fmt(sumP, 0) + "</b>";
      gFlow.style.display = showFlow ? "" : "none";
      gAdj.style.display = showAdj ? "" : "none";
      gLab.style.display = showLab ? "" : "none";
      (flowEls || []).forEach((p) => p && p.setAttribute("opacity", showFlow ? .55 : 0));
      scalebar.textContent = ["预测值", "实测值", "偏差(预测-实测)", "Rt"][["pred", "obs", "bias", "rt"].indexOf(metric)] + " · 色阶 0 ~ " + U.fmt(MX, metric === "rt" ? 2 : 0);
      renderRail();
    }
    /* ---------- 右栏 ---------- */
    let railBuilt = false;
    function renderRail() {
      rail.innerHTML = "";
      const ci = D.cities.indexOf(sel);
      const val = currentVal(day, ci);
      const c1 = U.card(rail, (sel || "—") + "市", D.dates[day]);
      const kv = U.el("div");
      const rk = D.cities.map((c, i) => ({ c, v: currentVal(day, i) })).filter((z) => z.v !== null).sort((a, b) => b.v - a.v);
      const rank = rk.findIndex((z) => z.c === sel) + 1;
      const rm = (D.metrics.per_city || []).find((z) => z.city === sel + "市" || z.city === sel) || {};
      kv.innerHTML = [
        ["当日" + ({ pred: "预测", obs: "实测", bias: "偏差", rt: "Rt" }[metric]), metric === "rt" ? U.fmt(val, 2) : U.fmt(val, 1) + " 例"],
        ["全省排名", rank ? rank + " / 11" : "—"],
        ["测试段 nRMSE", U.pct(rm.nrmse, 1)],
        ["R0", U.fmt((D.r0.city.find((z) => z.city === sel) || {}).r0, 2)],
      ].map((kv2) => "<div class='kv'><span>" + kv2[0] + "</span><span>" + kv2[1] + "</span></div>").join("");
      c1.bd.appendChild(kv);
      const btn = U.el("button", "btn block primary", "进入城市剖析 →");
      btn.style.marginTop = "8px";
      btn.onclick = () => { location.href = "city.html?city=" + encodeURIComponent(sel); };
      c1.bd.appendChild(btn);
      const cbox = U.el("div"); cbox.style.height = "88px";
      c1.bd.appendChild(cbox);
      const y = D.series.y.map((r) => r[ci]), f = D.series.f.map((r) => r[ci]);
      setTimeout(() => new CH.LineChart(cbox, { dates: D.dates, minimal: true, showX: false,
        padding: [4, 30, 4, 26], series: [{ label: "实测", color: "#1F2A36", width: 1.2, data: y },
          { label: "预测", color: "#0E7C86", width: 1.4, data: f }], yFormat: (v) => CH.fmt(v, 0) }), 5);

      const c2 = U.card(rail, "迁徙流 TOP10", "百度迁徙 · 2020-2025 均值份额");
      const list = U.el("div", "list");
      (G.flows || []).slice(0, 10).forEach((f2, i) => {
        const row = U.el("div", "item");
        row.innerHTML = "<span class='rk'>" + (i + 1) + "</span><span class='nm'>" + f2[0] + " → " + f2[1] +
          "</span><span class='track'><i class='fill' style='display:block;height:100%;width:" +
          Math.min(100, f2[2] / (G.flows[0][2] || 1) * 100) + "%;background:linear-gradient(90deg,#8FC3F0,#1C7ED6)'></i></span>" +
          "<span class='vl'>" + U.fmt(f2[2], 1) + "</span>";
        list.appendChild(row);
      });
      c2.bd.appendChild(list);
    }

    /* ---------- 左控制台 ---------- */
    if (ctx.console) {
      const cw = ctx.console;
      const row = (label, on, fn) => {
        const d = U.el("div", "row" + (on ? " on" : ""));
        d.innerHTML = "<span class='tick'></span>" + label;
        d.onclick = fn;
        cw.appendChild(d);
        return d;
      };
      cw.appendChild(U.el("h4", "", "图层"));
      const ly = [
        ["接壤边", () => showAdj, (v) => showAdj = v],
        ["迁徙流", () => showFlow, (v) => showFlow = v],
        ["城市标签", () => showLab, (v) => showLab = v],
      ];
      ly.forEach(([lab, get, set]) => {
        row(lab, get(), (e) => { set(!get()); e.currentTarget.classList.toggle("on", get()); render(); });
      });
      cw.appendChild(U.el("h4", "", "着色"));
      const colors = [["pred", "预测值"], ["obs", "实测值"], ["bias", "偏差"], ["rt", "有效再生数 Rt"]];
      const rows = colors.map(([k, lab]) => {
        const d = row(lab, metric === k, () => {
          metric = k; MX = maxima();
          rows.forEach((r) => r.classList.remove("on"));
          d.classList.add("on");
          render();
        });
        return d;
      });
    }
    render();
  });
})();
