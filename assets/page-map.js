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
  const MET = { pred: "预测", obs: "实测", rt: "Rt", t: "温度距平", h: "湿度距平", r: "降水量", p: "迁徙压力", risk: "起升风险" };
  const EXT = window.WMEG_MAP_EXT || null;
  function extVal(k, i, ci) { return (EXT && EXT[k] && EXT[k][i]) ? EXT[k][i][ci] : null; }
  function sgn(v, d) { return (v === null || v === undefined || !isFinite(v)) ? "—" : (v > 0 ? "+" : "") + window.APP.U.fmt(v, d); }
  // 双向色阶：中点暖纸色；温度/风险 冷蓝→暖红，湿度 干橙→湿青
  const RAMP_T = [[37, 99, 176], [120, 170, 220], [247, 244, 236], [240, 138, 93], [178, 34, 34]];
  const RAMP_H = [[176, 106, 40], [222, 178, 120], [247, 244, 236], [120, 190, 190], [14, 124, 134]];
  const RAMP_R = [[247, 244, 236], [199, 224, 240], [126, 176, 222], [47, 111, 181], [16, 62, 122]];
  function rampColor(stops, t) {
    t = Math.max(0, Math.min(0.9999, t));
    const x = t * (stops.length - 1), i = Math.floor(x), f = x - i;
    const a = stops[i], b = stops[Math.min(stops.length - 1, i + 1)];
    return "rgb(" + a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(",") + ")";
  }
  function divT(v, mx) { return 0.5 + 0.5 * Math.max(-1, Math.min(1, v / Math.max(0.5, mx))); }
  const Q1_LAB = { z_tavg_anom_lag7: "暖距平 · 滞后1周", z_AH_anom_lag0: "干距平 · 当周", cold_dry_7d: "冷干占比 · 当周" };
  function q1Chips() {
    if (!EXT || !EXT.q1) return "";
    return "<div style='display:flex;flex-wrap:wrap;gap:5px;margin-top:5px'>" + EXT.q1.map((q) => {
      const down = q.coef < 0;
      return "<span title='系数 " + q.coef + " · t=" + q.t + "' style='font-size:10px;padding:2px 7px;border-radius:9px;" +
        "background:" + (down ? "rgba(29,78,216,.10)" : "rgba(180,35,42,.10)") + ";color:" + (down ? "#1D4ED8" : "#B4232A") +
        ";font-weight:700'>" + (Q1_LAB[q.name] || q.name) + (down ? " ↓" : " ↑") + "</span>";
    }).join("") + "</div>";
  }

  window.WMEG.register("map", function (main, rail, ctx) {
    const D = ctx.D, G = D.map, U2 = U;
    const n = D.dates.length;
    let metric = "pred", showFlow = true, showAdj = true, showLab = true, showVal = true;
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
    const playBtns = [];
    let alive = true;
    const REDUCED = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    // 属性只在值变化时写入：播放时每帧百余次「写同一个值」也会让整张 SVG 反复失效
    function setA(node, k, v) { const s = String(v); if (node.getAttribute(k) !== s) node.setAttribute(k, s); }

    /* ---------- 地图 ---------- */
    const card = U.card(main, "山西省 11 地级市 · 时空传播", "色阶随「着色」切换 · 时间轴逐日回放 · 悬停城市查看详情", []);
    card.tools.appendChild((function () {
      const b = U.el("button", "ico", "▶");
      b.title = "播放 / 暂停（空格键同效，时间轴上也有播放键）";
      b.onclick = () => setPlaying(!playing);
      playBtns.push(b);
      return b;
    })());
    card.tools.appendChild((function () {
      const b = U.el("button", "ico", "⟲");
      b.title = "重置视图";
      b.onclick = () => { st.s = 1; st.tx = 0; st.ty = 0; applyT(); };
      return b;
    })());
    card.tools.appendChild((function () {
      const b = U.el("button", "ico", "⛶");
      b.title = "全屏查看地图（Esc 退出）";
      b.onclick = () => {
        const on = card.card.classList.toggle("fullmap");
        b.classList.toggle("on", on);
        document.body.style.overflow = on ? "hidden" : "";
        setTimeout(() => { syncLabelSize(); window.dispatchEvent(new Event("resize")); }, 60);
      };
      return b;
    })());
    const onKeyEsc = (ev) => {
      if (ev.key === "Escape" && card.card.classList.contains("fullmap")) {
        card.card.classList.remove("fullmap");
        document.body.style.overflow = "";
        setTimeout(syncLabelSize, 60);
      }
    };
    document.addEventListener("keydown", onKeyEsc);
    card.card.style.flex = "1";
    card.card.style.minHeight = "0";
    // 图版式三栏：左=三要素同步小图，中=主地图，右=逐城三要素表+Q1方向；消除主图两侧空白
    const grid = U.el("div", "mapgrid");
    const sideL = U.el("div", "mapside");
    const wrap = U.el("div", "mapwrap");
    wrap.style.minHeight = "420px";
    const sideR = U.el("div", "mapside");
    grid.appendChild(sideL); grid.appendChild(wrap); grid.appendChild(sideR);
    card.bd.appendChild(grid);
    const NS = "http://www.w3.org/2000/svg";
    // 地图拆成三层独立 SVG：底图（接壤边 + 多边形）/ 迁徙流 / 标签。
    // 流动线动画只重绘自己这一层；播放时多边形填色也不会带着标签和流动线一起重画。
    function mkLayer(cls) {
      const s = document.createElementNS(NS, "svg");
      s.setAttribute("class", cls);
      s.setAttribute("viewBox", "0 0 " + G.W + " " + G.H);
      const gz = document.createElementNS(NS, "g");
      s.appendChild(gz);
      wrap.appendChild(s);
      return { svg: s, gz };
    }
    const L0 = mkLayer("mv-base"), L1 = mkLayer("mv-flow"), L2 = mkLayer("mv-lab");
    const svg = L0.svg, gZoom = L0.gz;
    function e(tag, attrs, par) {
      const x = document.createElementNS(NS, tag);
      for (const k in attrs) x.setAttribute(k, attrs[k]);
      (par || gZoom).appendChild(x); return x;
    }
    const gDeco = e("g", {});
    // 制图装饰：经纬网 + 邻省注记，让主图两侧的地理空白变成有意义的图面
    for (let gx = 200; gx <= 800; gx += 150)
      e("line", { x1: gx, y1: 80, x2: gx, y2: 1720, stroke: "#E3D5C0", "stroke-width": 1, "stroke-dasharray": "2 7", opacity: .9 }, gDeco);
    for (let gy = 200; gy <= 1600; gy += 200)
      e("line", { x1: 140, y1: gy, x2: 860, y2: gy, stroke: "#E3D5C0", "stroke-width": 1, "stroke-dasharray": "2 7", opacity: .9 }, gDeco);
    [["内蒙古", 520, 70], ["河北", 945, 820], ["河南", 640, 1755], ["陕西", 62, 900]].forEach(([t, x, y]) => {
      const tx = e("text", { x, y, "text-anchor": "middle", "font-size": 44, fill: "#CFC4B2", "font-weight": 700, style: "letter-spacing:6px" }, gDeco);
      tx.textContent = t;
    });
    const gAdj = e("g", {});
    const gPoly = e("g", {});
    const gFlow = e("g", {}, L1.gz);
    const gLab = e("g", {}, L2.gz);
    (G.edges || []).forEach(([a, b]) => {
      const ca = G.cents[a], cb = G.cents[b];
      if (!ca || !cb) return;
      e("line", { x1: ca[0], y1: ca[1], x2: cb[0], y2: cb[1], stroke: "#D9C7B6",
        "stroke-width": 1.1, "stroke-dasharray": "3 5", opacity: .85 }, gAdj);
    });
    const polys = {}, labels = {}, vals = {};
    Object.keys(G.polys || {}).forEach((k) => {
      polys[k] = e("path", { d: G.polys[k], fill: "#F1EAE0", stroke: "#FFFFFF", "stroke-width": 1.6,
        class: "mappoly" }, gPoly);
      polys[k].addEventListener("click", () => { sel = k; CH.TIP().style.opacity = 0; render(); });
      polys[k].addEventListener("mouseenter", (ev) => { polys[k].setAttribute("stroke", "#0E7C86"); showCityTip(k, ev); });
      polys[k].addEventListener("mousemove", (ev) => showCityTip(k, ev));
      polys[k].addEventListener("mouseleave", () => {
        polys[k].setAttribute("stroke", k === sel ? "#0E7C86" : "#FFFFFF");
        CH.TIP().style.opacity = 0;
      });
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
    // 流动动画：由脚本按动画时钟推进虚线相位（约 30 次/秒，速度与原 CSS 动画一致）。
    // 图层关闭、页面切到后台或离开本页时停表，不再让整张地图为了虚线流动而每帧重绘。
    let flowRaf = 0, flowT = 0, flowOff = 0;
    const FLOW_UNIT = 28, FLOW_SPEED = 20;   // 1.4s 走 28 个单位
    function flowFrame(t) {
      flowRaf = 0;
      if (!alive || document.hidden || !showFlow) { flowT = 0; return; }
      if (!flowT) { flowT = t; flowRaf = requestAnimationFrame(flowFrame); return; }
      if (t - flowT >= 30) {
        flowOff = (flowOff + (t - flowT) / 1000 * FLOW_SPEED) % FLOW_UNIT;
        flowT = t;
        gFlow.setAttribute("stroke-dashoffset", (-flowOff).toFixed(2));
      }
      flowRaf = requestAnimationFrame(flowFrame);
    }
    function startFlow() {
      if (REDUCED || !alive || flowRaf || document.hidden || !showFlow) return;
      flowRaf = requestAnimationFrame(flowFrame);
    }
    const onVis = () => { if (!document.hidden) startFlow(); };
    document.addEventListener("visibilitychange", onVis);
    // 标签：白底徽章（名称 + 带单位的数值），任何底色上都清晰
    Object.keys(G.cents || {}).forEach((k) => {
      const [x, y] = G.cents[k];
      const g = e("g", { style: "pointer-events:none" }, gLab);
      // 无框制图式标注：文字外圈一层暖纸色光晕（paint-order:stroke），直接"印"在地图上，
      // 没有任何矩形底；光晕随字号同步缩放，深红城市与迁徙线上也读得清
      const halo = { stroke: "rgba(255,249,240,.92)", "stroke-linejoin": "round", "paint-order": "stroke" };
      const t1 = e("text", Object.assign({ x, y, "text-anchor": "middle", "font-weight": 800, fill: "#7C2D12" }, halo), g);
      t1.textContent = k;
      const t2 = e("text", Object.assign({ x, y, "text-anchor": "middle", "font-weight": 800, fill: "#9A3412",
        "font-variant-numeric": "tabular-nums" }, halo), g);
      labels[k] = [t1, t2, null];
    });
    /* 悬停城市：一张完整的当日信息卡，而不是把更多字挤进地图标注。
       同一天同一城市只拼一次 HTML，鼠标移动时只挪位置 */
    let tipKey = "";
    function showCityTip(c, ev) {
      const ci = D.cities.indexOf(c);
      if (ci < 0 || !ev) return;
      const tip = CH.TIP();
      const key = c + "|" + day + "|" + metric;
      // 提示框被右栏迷你图写过之后，即使日期城市没变也要重拼
      if (key !== tipKey || tip._own !== "map") {
        tipKey = key;
        const yv = D.series.y[day] ? D.series.y[day][ci] : null;
        const fv = D.series.f[day] ? D.series.f[day][ci] : null;
        const rv = D.rt.v[day] ? D.rt.v[day][ci] : null;
        const bv = (yv === null || fv === null || yv === undefined || fv === undefined) ? null : fv - yv;
        const rk = D.cities.map((cc, i) => ({ cc, v: currentVal(day, i) }))
          .filter((z) => z.v !== null && isFinite(z.v)).sort((a, b) => b.v - a.v);
        const rank = rk.findIndex((z) => z.cc === c) + 1;
        const rm = (D.metrics.per_city || []).find((z) => z.city === c + "市" || z.city === c) || {};
        const r0 = (D.r0.city.find((z) => z.city === c) || {}).r0;
        const row = (lab, val) => "<div class='r'><span>" + lab + "</span><span>" + val + "</span></div>";
        CH.tipWrite(tip, "<div style='font-weight:700;margin-bottom:3px'>" + c + "市 · " + D.dates[day] + "</div>" +
          row("实测 / 预测", U.fmt(yv, 1) + " / " + U.fmt(fv, 1) + " 例") +
          row("偏差（预测-实测）", bv === null ? "—" : (bv > 0 ? "+" : "") + U.fmt(bv, 1) + " 例") +
          row("有效再生数 Rt", U.fmt(rv, 2)) +
          row("温度 / 湿度距平", sgn(extVal("t", day, ci), 1) + "°C / " + sgn(extVal("h", day, ci), 1) + " g/m³") +
          row("迁徙输入压力 P", U.fmt(extVal("p", day, ci), 3)) +
          row("当日" + MET[metric] + "排名", rank ? rank + " / 11" : "—") +
          row("R0", U.fmt(r0, 2)) +
          q1Chips() +
          "<div style='color:#8496A6;margin-top:3px'>点击进入城市剖析</div>", "map");
      }
      tip.style.opacity = 1;
      CH.placeTip(tip, ev.clientX, ev.clientY);
    }
    // 缩放/平移
    const st = { s: 1, tx: 0, ty: 0 };
    function applyT() {
      const tr = "translate(" + st.tx + "," + st.ty + ") scale(" + st.s + ")";
      L0.gz.setAttribute("transform", tr); L1.gz.setAttribute("transform", tr); L2.gz.setAttribute("transform", tr);
      syncLabelSize();
    }
    let labFs = 20;
    const LAB_UNIT = 58;   // 名称字号基准：viewBox 宽（1000）的 5.8%，固定写在地图坐标里
    function syncLabelSize() {
      // 标注随地图同步缩放：字号在地图坐标里固定，屏幕上的大小 = 58 × 真实 meet 缩放 × 缩放倍数。
      // 地图大标注就大、地图小标注就小 —— 小地图里徽章不再互相压住（最近城市对纵向间距 185 单位，
      // 58 单位字号的徽章高约 152 单位，留有余量）。
      // 再夹在 11–30px：极小窗口下仍可读，全屏或放大时不会大到盖住城市。
      const r = wrap.getBoundingClientRect();
      const sc = Math.max(0.05, Math.min((r.width || 700) / G.W, (r.height || 600) / G.H));
      const k = sc * st.s;
      labFs = Math.max(11, Math.min(30, LAB_UNIT * k)) / k;
      layoutLabels();
      gAdj.querySelectorAll("line").forEach((l) => l.setAttribute("stroke-width", 1.1 / st.s));
      syncStroke();
    }
    function syncStroke() {
      // 描边宽度除以缩放倍数：屏幕上始终约 1.6 个视图单位粗细，放大地图不会出现粗黑边（与旧版一致）。
      // 选中城市只靠描边颜色区分，不额外加粗
      Object.keys(polys).forEach((k) => {
        setA(polys[k], "stroke-width", +(1.6 / st.s).toFixed(4));
      });
    }
    /* 标签几何：无框光晕文字，不再需要量文本宽度（逐日播放零强制测量）。
       光晕粗细随字号同步缩放，位置公式与原徽章中心一致 */
    let lastFs = -1;
    function layoutLabels() {
      if (!showLab) return;       // 整层隐藏时留到重新显示再排
      const fs = labFs, vs = fs * 0.85;
      if (fs !== lastFs) {
        lastFs = fs;
        Object.keys(labels).forEach((k) => {
          labels[k][0].setAttribute("font-size", fs);
          labels[k][1].setAttribute("font-size", vs);
          labels[k][0].setAttribute("stroke-width", (fs * 0.16).toFixed(2));
          labels[k][1].setAttribute("stroke-width", (vs * 0.16).toFixed(2));
        });
      }
      Object.keys(labels).forEach((k) => {
        const c = G.cents[k];
        if (!c) return;
        const t1 = labels[k][0], t2 = labels[k][1];
        const showV = showVal && t2.style.display !== "none";
        const padY = fs * 0.20;
        const h = fs + (showV ? vs * 1.25 : 0) + padY * 2;
        const cx = c[0], cy = c[1];
        setA(t1, "x", cx); setA(t2, "x", cx);
        setA(t1, "y", showV ? cy - vs * 0.28 : cy + fs * 0.35);
        setA(t2, "y", cy + h / 2 - padY - vs * 0.12);
      });
    }
    const ro = new ResizeObserver(() => syncLabelSize());
    ro.observe(wrap);
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
      CH.TIP().style.opacity = 0;
      wrap.classList.add("drag"); });
    const onWinUp = () => { drag = null; wrap.classList.remove("drag"); };
    const onWinMove = (ev) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect();
      st.tx = drag.tx + (ev.clientX - drag.x) / r.width * G.W;
      st.ty = drag.ty + (ev.clientY - drag.y) / r.height * G.H;
      applyT();
    };
    window.addEventListener("mouseup", onWinUp);
    window.addEventListener("mousemove", onWinMove);
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
    const compass = U.el("div");
    compass.style.cssText = "position:absolute;top:10px;right:14px;text-align:center;color:#8496A6;font-size:12px;font-weight:800;line-height:1.15;pointer-events:none";
    compass.innerHTML = "▲<br>N";
    wrap.appendChild(compass);
    const scalebar = U.el("div", "scalebar", "");
    scalebar.innerHTML = "<div class='sb-t'></div><div class='sb-bar'></div>" +
      "<div class='sb-l'><span>0</span><span class='sb-max'></span></div>";
    scalebar.style.fontSize = "13px";
    scalebar.style.padding = "6px 12px";
    const sbT = scalebar.querySelector(".sb-t"); let sbMax = scalebar.querySelector(".sb-max");
    wrap.appendChild(scalebar);

    /* ---------- 时间轴 ---------- */
    const tl = U.el("div", "timeline");
    tl.style.borderTop = "1px solid var(--line)";
    // 时间轴上的圆形播放键（与卡片右上角播放键状态同步）
    const playBtn = U.el("button", "play", "▶");
    playBtn.title = "逐日播放 / 暂停（空格键）";
    playBtn.onclick = () => setPlaying(!playing);
    playBtns.push(playBtn);
    tl.appendChild(playBtn);
    const dayTxt = U.el("div", "day", "");
    dayTxt.style.fontSize = "17px";
    const range = document.createElement("input"); range.type = "range";
    range.min = 0; range.max = n - 1; range.value = day;
    const tot = U.el("div", "tot", "全省 实测 <b></b> · 预测 <b></b>");
    tot.style.fontSize = "13px";
    const totB = tot.querySelectorAll("b");
    tl.appendChild(dayTxt); tl.appendChild(range); tl.appendChild(tot);
    card.bd.appendChild(tl);
    range.oninput = () => { day = +range.value; render(); };
    // 空格播放 / 暂停（输入控件聚焦时不劫持）
    const onKeySpace = (ev) => {
      if (!alive || ev.code !== "Space") return;
      const t = (ev.target && ev.target.tagName) || "";
      if (t === "INPUT" || t === "TEXTAREA" || t === "SELECT") return;
      ev.preventDefault();
      setPlaying(!playing);
    };
    document.addEventListener("keydown", onKeySpace);
    function tick() {
      clearInterval(timer);
      if (!playing) return;
      timer = setInterval(() => { day = (day + 1) % n; range.value = day; render(); }, 90);
    }
    // 离开本页：停播放、停流动动画、断开尺寸观察、移除 window/document 监听
    //（原先这些监听每进一次地图页就多一套，并把整张地图的 DOM 一直留在内存里）
    let liveT = 0;
    function dispose() {
      alive = false; clearInterval(timer); playing = false;
      clearTimeout(liveT);
      if (flowRaf) { cancelAnimationFrame(flowRaf); flowRaf = 0; }
      try { ro.disconnect(); } catch (err) { }
      window.removeEventListener("mouseup", onWinUp);
      window.removeEventListener("mousemove", onWinMove);
      document.removeEventListener("keydown", onKeyEsc);
      document.removeEventListener("keydown", onKeySpace);
      document.removeEventListener("visibilitychange", onVis);
      CH.TIP().style.opacity = 0;
    }
    window.addEventListener("hashchange", dispose, { once: true });
    function setPlaying(on) {
      if (!alive) return;
      playing = on;
      playBtns.forEach((b) => { b.classList.toggle("on", on); b.textContent = on ? "❚❚" : "▶"; });
      tick();
    }

    /* ---------- 渲染 ---------- */
    function currentVal(i, ci) {
      if (metric === "pred") return D.series.f[i] ? D.series.f[i][ci] : null;
      if (metric === "obs") return D.series.y[i] ? D.series.y[i][ci] : null;
      if (metric === "rt") return D.rt.v[i] ? D.rt.v[i][ci] : null;
      if (metric === "t" || metric === "h" || metric === "r" || metric === "p" || metric === "risk") return extVal(metric, i, ci);
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
    let lastRender = -1e9, lastSel = null;
    function render() {
      // 连续更新（播放 / 拖时间轴）期间关掉多边形 fill 过渡：90ms 一步本就看不出渐变，
      // 却让 11 个多边形始终处于动画中；松手或暂停后恢复，点选「着色」时仍有渐变
      const now = performance.now();
      if (now - lastRender < 260) wrap.classList.add("live");
      lastRender = now;
      clearTimeout(liveT);
      liveT = setTimeout(() => { wrap.classList.remove("live"); lastRender = -1e9; }, 300);

      dayTxt.textContent = D.dates[day];
      let sumO = 0, sumP = 0;
      // 计数类用对数刻度（低值日也能看出差异），偏差/Rt 用线性
      const scale = (v) => {
        if (v === null || !isFinite(v)) return 0;
        if (metric === "rt") return Math.min(1, Math.abs(v) / 3.0);
        if (metric === "t" || metric === "h" || metric === "risk") return Math.min(1, Math.abs(v) / Math.max(0.5, MX));
        if (metric === "p") return Math.min(1, Math.abs(v) / Math.max(1e-6, MX));
        if (metric === "r") return Math.sqrt(Math.max(0, Math.min(1, v / Math.max(1e-6, MX))));
        return Math.min(1, Math.log1p(Math.abs(v)) / Math.log1p(Math.max(1, MX)));
      };
      const selChanged = sel !== lastSel;
      D.cities.forEach((c, ci) => {
        const v = currentVal(day, ci);
        const t = scale(v);
        const fillC = (v === null || !isFinite(v)) ? "#F1EAE0" :
          (metric === "t" || metric === "risk") ? rampColor(RAMP_T, divT(v, MX)) :
          metric === "h" ? rampColor(RAMP_H, divT(v, MX)) :
          metric === "r" ? rampColor(RAMP_R, t) : heatColor(t);
        if (polys[c]) {
          setA(polys[c], "fill", fillC);
          const op = (sel && sel !== c) ? "0.96" : "1";
          if (polys[c].style.opacity !== op) polys[c].style.opacity = op;
          if (selChanged) setA(polys[c], "stroke", c === sel ? "#0E7C86" : "#FFFFFF");
        }
        const mag = (v === null || !isFinite(v)) ? 0 : Math.abs(v) / Math.max(0.5, MX);
        const deep = mag > 0.62 && metric !== "pred" && metric !== "obs" && metric !== "p";
        const lab = labels[c];
        if (lab) {
          // 第二行带口径与单位：计数类「例」、Rt 前缀、偏差显式正负号
          const txt = (v === null || !isFinite(v)) ? "—" :
            metric === "rt" ? "Rt " + U.fmt(v, 2) :
            metric === "t" ? sgn(v, 1) + "°C" :
            metric === "h" ? sgn(v, 1) + " g/m³" :
            metric === "r" ? U.fmt(v, 1) + " mm" :
            metric === "p" ? U.fmt(v, 2) :
            metric === "risk" ? sgn(v, 2) :
            U.fmt(v, 0) + " 例";
          if (lab[1].textContent !== txt) lab[1].textContent = txt;
          const disp = showVal ? "" : "none";
          if (lab[1].style.display !== disp) lab[1].style.display = disp;
          setA(lab[0], "fill", c === sel ? (deep ? "#DFF1F0" : "#0B5A62") : (deep ? "#FFF6EA" : "#7C2D12"));
          setA(lab[1], "fill", deep ? "#FFFFFF" :
            metric === "rt" ? "#8E44C7" :
            (metric === "t" || metric === "risk") ? (v > 0 ? "#B4232A" : "#1D4ED8") :
            metric === "h" ? (v > 0 ? "#0E7C86" : "#B45309") :
            metric === "r" ? "#1D4ED8" : "#9A3412");
          // 选中城市：光晕换淡青，配合青色城市名形成选中态（不再靠矩形描边）
          // 深色底（暴雨/寒潮/高风险）：标签反白 + 暗光晕，保证对比度
          const hl = deep ? "rgba(23,32,42,.45)" : (c === sel ? "rgba(223,241,240,.95)" : "rgba(255,249,240,.92)");
          setA(lab[0], "stroke", hl); setA(lab[1], "stroke", hl);
        }
        const yv = D.series.y[day] ? D.series.y[day][ci] : null, fv = D.series.f[day] ? D.series.f[day][ci] : null;
        if (yv !== null) sumO += yv; if (fv !== null) sumP += fv;
      });
      lastSel = sel;
      totB[0].textContent = U.fmt(sumO, 0);
      totB[1].textContent = U.fmt(sumP, 0);
      layoutLabels();
      updateRail();
      updatePanels();
    }
    /* 图层显隐、色阶文字：与「当前是哪一天」无关，只在开关切换时更新 */
    function applyLayers() {
      L1.svg.style.display = showFlow ? "" : "none";
      gAdj.style.display = showAdj ? "" : "none";
      L2.svg.style.display = showLab ? "" : "none";
      sbT.textContent = MET[metric] + " · 色阶";
      const dec = (metric === "rt" || metric === "p" || metric === "risk") ? 2 : (metric === "t" || metric === "h" || metric === "r") ? 1 : 0;
      const diverging = (metric === "t" || metric === "h" || metric === "risk");
      const stops = (metric === "t" || metric === "risk") ? RAMP_T : metric === "h" ? RAMP_H : metric === "r" ? RAMP_R :
        [[247, 251, 253], [254, 236, 210], [253, 186, 116], [240, 113, 71], [190, 40, 40], [120, 20, 30]];
      const sbBar = scalebar.querySelector(".sb-bar");
      sbBar.style.background = "linear-gradient(90deg," + stops.map((s, i) =>
        "rgb(" + s.join(",") + ") " + (i / (stops.length - 1) * 100).toFixed(0) + "%").join(",") + ")";
      sbBar.style.height = "8px"; sbBar.style.borderRadius = "4px";
      scalebar.querySelector(".sb-l").innerHTML = diverging ?
        "<span>−" + U.fmt(MX, dec) + "</span><span>0</span><span>+" + U.fmt(MX, dec) + "</span>" :
        "<span>0</span><span class='sb-max'>" + U.fmt(MX, dec) + "</span>";
      sbMax = scalebar.querySelector(".sb-max");
      layoutLabels();
      startFlow();
    }
    /* ---------- 右栏：只建一次，逐日只改文本 ---------- */
    let railEls = null, miniChart = null, railCi = -1;
    function buildRail() {
      const c1 = U.card(rail, (sel || "—") + "市", D.dates[day]);
      const kv = U.el("div");
      kv.innerHTML = ["当前 Rt", "基本再生数 R0", "当日实测", "当日预测", "全省排名", "迁徙输入压力"]
        .map((k2) => "<div class='kv'><span>" + k2 + "</span><span></span></div>").join("");
      c1.bd.appendChild(kv);
      const btn = U.el("button", "btn block primary", "进入城市剖析 →");
      btn.style.marginTop = "8px";
      btn.onclick = () => { window.WMEG.go("city", { city: sel }); };
      c1.bd.appendChild(btn);
      const cbox = U.el("div"); cbox.style.height = "88px";
      c1.bd.appendChild(cbox);
      miniChart = new CH.LineChart(cbox, { dates: D.dates, minimal: true, showX: false,
        padding: [4, 30, 4, 26], series: [{ label: "实测", color: "#1F2A36", width: 1.2, data: [] },
          { label: "预测", color: "#E8590C", width: 1.4, data: [] }], yFormat: (v) => CH.fmt(v, 0) });

      const c3 = U.card(rail, "气象 · Q1 影响", "距平逐日 · 箭头为面板回归方向");
      const kv3 = U.el("div");
      kv3.innerHTML = ["温度距平 T", "湿度距平 H"]
        .map((k2) => "<div class='kv'><span>" + k2 + "</span><span></span></div>").join("");
      c3.bd.appendChild(kv3);
      const chipBox = U.el("div"); chipBox.innerHTML = q1Chips(); c3.bd.appendChild(chipBox);
      const note3 = U.el("div");
      note3.style.cssText = "font-size:10.5px;color:#8496A6;margin-top:6px;line-height:1.5";
      note3.textContent = "面板回归 n=" + (EXT ? EXT.q1_n : 0) + " · R²=" + (EXT ? EXT.q1_r2 : 0) +
        "；距平=对同期气候态。↓=抑制起升、↑=促进起升。";
      c3.bd.appendChild(note3);

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
      railEls = {
        h3: c1.hd.querySelector("h3"), sub: c1.hd.querySelector(".sub"),
        vals: Array.from(kv.querySelectorAll(".kv > span:last-child")),
        wvals: Array.from(kv3.querySelectorAll(".kv > span:last-child"))
      };
    }
    function updateRail() {
      const ci = D.cities.indexOf(sel);
      const val = currentVal(day, ci);
      const rk = D.cities.map((c, i) => ({ c, v: currentVal(day, i) })).filter((z) => z.v !== null).sort((a, b) => b.v - a.v);
      const rank = rk.findIndex((z) => z.c === sel) + 1;
      const E = railEls;
      E.h3.textContent = (sel || "—") + "市";
      E.sub.textContent = D.dates[day];
      const rv = D.rt.v[day] ? D.rt.v[day][ci] : null;
      const yv = D.series.y[day] ? D.series.y[day][ci] : null;
      const fv = D.series.f[day] ? D.series.f[day][ci] : null;
      const vs = [U.fmt(rv, 2), U.fmt((D.r0.city.find((z) => z.city === sel) || {}).r0, 2),
        U.fmt(yv, 1) + " 例", U.fmt(fv, 1) + " 例", rank ? rank + " / 11" : "—", U.fmt(extVal("p", day, ci), 3)];
      for (let i = 0; i < 6; i++) if (E.vals[i].textContent !== vs[i]) E.vals[i].textContent = vs[i];
      const ws = [sgn(extVal("t", day, ci), 1) + "°C", sgn(extVal("h", day, ci), 1) + " g/m³"];
      for (let i = 0; i < 2; i++) if (E.wvals[i].textContent !== ws[i]) E.wvals[i].textContent = ws[i];
      if (ci !== railCi) {      // 换城市才换数据；同一城市逐日回放不重建图表
        railCi = ci;
        miniChart.setData(D.dates, [{ label: "实测", color: "#1F2A36", width: 1.2, data: D.series.y.map((r) => r[ci]) },
          { label: "预测", color: "#E8590C", width: 1.4, data: D.series.f.map((r) => r[ci]) }]);
      }
    }

    /* ---------- 卡内两侧：三要素同步小图（左）+ 逐城三要素表与Q1方向（右） ---------- */
    const MINI_VB = "140 60 720 1700";
    const MXE = { t: 1, h: 1, r: 1 };
    if (EXT) ["t", "h", "r"].forEach((k) => {
      let mx = 1;
      EXT[k].forEach((row) => row.forEach((v) => { if (v !== null && isFinite(v)) mx = Math.max(mx, Math.abs(v)); }));
      MXE[k] = mx;
    });
    function elemColor(k, v) {
      if (v === null || !isFinite(v)) return "#F1EAE0";
      if (k === "r") return rampColor(RAMP_R, Math.sqrt(Math.max(0, Math.min(1, v / MXE.r))));
      return rampColor(k === "t" ? RAMP_T : RAMP_H, 0.5 + 0.5 * Math.max(-1, Math.min(1, v / MXE[k])));
    }
    const miniPolys = { t: {}, h: {}, r: {} }, miniInfo = {}, tableRows = {};
    let riskRows = [];
    function buildPanels() {
      if (!EXT) { sideL.style.display = "none"; sideR.style.display = "none"; return; }
      const TIT = { t: ["温度距平 T", "°C"], h: ["湿度距平 H", "g/m³"], r: ["降水量", "mm"] };
      ["t", "h", "r"].forEach((k) => {
        const row = U.el("div", "minirow");
        const sv = document.createElementNS(NS, "svg"); sv.setAttribute("viewBox", MINI_VB);
        const gg = document.createElementNS(NS, "g"); sv.appendChild(gg);
        Object.keys(G.polys).forEach((c) => {
          const p = document.createElementNS(NS, "path");
          p.setAttribute("d", G.polys[c]); p.setAttribute("stroke", "#FFFFFF"); p.setAttribute("stroke-width", "2");
          p.style.cursor = "pointer";
          p.addEventListener("click", () => { sel = c; render(); });
          gg.appendChild(p); miniPolys[k][c] = p;
        });
        row.appendChild(sv);
        const info = U.el("div", "miniinfo");
        const ramp = k === "r" ? RAMP_R : k === "t" ? RAMP_T : RAMP_H;
        info.innerHTML = "<div style='font-weight:800;font-size:12px;color:#7C2D12'>" + TIT[k][0] +
          " <span style='color:#8496A6;font-weight:600'>" + TIT[k][1] + "</span></div>" +
          "<div class='kv'><span>全省均值</span><span></span></div>" +
          "<div class='kv'><span>最高城市</span><span></span></div>" +
          "<div style='flex:1'></div>" +
          "<div style='height:8px;border-radius:4px;background:linear-gradient(90deg," +
          ramp.map((s, i, a) => "rgb(" + s.join(",") + ") " + (i / (a.length - 1) * 100).toFixed(0) + "%").join(",") + ")'></div>" +
          "<div style='display:flex;justify-content:space-between;color:#8496A6;font-size:10px'><span>" +
          (k === "r" ? "0" : "−" + U.fmt(MXE[k], 1)) + "</span><span>" + (k === "r" ? "" : "0") + "</span><span>" +
          (k === "r" ? "" : "+") + U.fmt(MXE[k], 1) + "</span></div>";
        row.appendChild(info); sideL.appendChild(row);
        miniInfo[k] = Array.from(info.querySelectorAll(".kv > span:last-child"));
      });
      const tc = U.el("div");
      tc.style.cssText = "background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px";
      tc.innerHTML = "<div style='font-weight:800;font-size:12px;color:#7C2D12;margin-bottom:6px'>11 城 · 当日三要素</div>";
      const tb = document.createElement("table"); tb.className = "mtable";
      tb.innerHTML = "<thead><tr><th style='text-align:left'>城市</th><th>T °C</th><th>H g/m³</th><th>雨 mm</th></tr></thead>";
      const tbody = document.createElement("tbody");
      D.cities.forEach((c) => {
        const tr = document.createElement("tr");
        tr.innerHTML = "<td>" + c + "</td><td></td><td></td><td></td>";
        tr.onclick = () => { sel = c; render(); };
        tbody.appendChild(tr);
        tableRows[c] = Array.from(tr.querySelectorAll("td")).slice(1);
      });
      tb.appendChild(tbody); tc.appendChild(tb); sideR.appendChild(tc);
      const lg = U.el("div");
      lg.style.cssText = "background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px";
      lg.innerHTML = "<div style='font-weight:800;font-size:12px;color:#7C2D12;margin-bottom:4px'>Q1 · 气象影响方向</div>" + q1Chips() +
        "<div style='font-size:10.5px;color:#8496A6;margin-top:6px;line-height:1.5'>面板回归 n=" + EXT.q1_n + " · R²=" + EXT.q1_r2 +
        "；T/H 为对同期气候态距平，降水为当日实况。点击小图或表格行选中城市。</div>";
      sideR.appendChild(lg);
      const rc = U.el("div");
      rc.style.cssText = "background:#fff;border:1px solid var(--line);border-radius:10px;padding:8px";
      rc.innerHTML = "<div style='font-weight:800;font-size:12px;color:#7C2D12;margin-bottom:6px'>当日起升风险 TOP3</div>" +
        [0, 1, 2].map(() => "<div class='kv'><span></span><span></span></div>").join("") +
        "<div style='font-size:10.5px;color:#8496A6;margin-top:6px;line-height:1.5'>融合分=z(近7日强度/季阈值)+0.25·z(源加权迁徙份额)；仅作空间风险参考。</div>";
      sideR.appendChild(rc);
      riskRows = Array.from(rc.querySelectorAll(".kv")).map((d) => [d.querySelector("span:first-child"), d.querySelector("span:last-child")]);
    }
    function updatePanels() {
      if (!EXT) return;
      ["t", "h", "r"].forEach((k) => {
        let sum = 0, n = 0, topC = null, topV = -1e9;
        D.cities.forEach((c, ci) => {
          const v = extVal(k, day, ci);
          const p = miniPolys[k][c]; if (p) setA(p, "fill", elemColor(k, v));
          if (v !== null && isFinite(v)) { sum += v; n++; if (v > topV) { topV = v; topC = c; } }
        });
        const a = miniInfo[k], mean = n ? sum / n : null;
        const s1 = mean === null ? "—" : (k === "r" ? U.fmt(mean, 1) : (mean > 0 ? "+" : "") + U.fmt(mean, 1));
        if (a[0].textContent !== s1) a[0].textContent = s1;
        const s2 = topC ? topC + " " + (k === "r" ? U.fmt(topV, 1) : (topV > 0 ? "+" : "") + U.fmt(topV, 1)) : "—";
        if (a[1].textContent !== s2) a[1].textContent = s2;
      });
      D.cities.forEach((c, ci) => {
        const cells = tableRows[c]; if (!cells) return;
        const vt = extVal("t", day, ci), vh = extVal("h", day, ci), vr = extVal("r", day, ci);
        const st = [sgn(vt, 1), sgn(vh, 1), vr === null ? "—" : U.fmt(vr, 1)];
        const col = [vt === null ? "#8496A6" : vt > 0 ? "#B4232A" : "#1D4ED8",
          vh === null ? "#8496A6" : vh > 0 ? "#0E7C86" : "#B45309", "#1D4ED8"];
        for (let i = 0; i < 3; i++) {
          if (cells[i].textContent !== st[i]) cells[i].textContent = st[i];
          cells[i].style.color = col[i]; cells[i].style.fontWeight = "700"; cells[i].style.textAlign = "right";
        }
        const tr = cells[0].parentNode, on = c === sel;
        if (tr.classList.contains("on") !== on) tr.classList.toggle("on", on);
      });
      const rk = D.cities.map((c, i) => ({ c, v: extVal("risk", day, i) }))
        .filter((z) => z.v !== null && isFinite(z.v)).sort((a, b) => b.v - a.v).slice(0, 3);
      riskRows.forEach((pair, i) => {
        const z = rk[i];
        const s1 = z ? (i + 1) + " · " + z.c : "—", s2 = z ? sgn(z.v, 2) : "";
        if (pair[0].textContent !== s1) pair[0].textContent = s1;
        if (pair[1].textContent !== s2) pair[1].textContent = s2;
        pair[1].style.color = z && z.v > 0 ? "#B4232A" : "#1D4ED8";
        pair[1].style.fontWeight = "800";
      });
    }

    /* ---------- 左控制台 ---------- */
    if (ctx.console) {
      const cw = ctx.console;
      const row = (label, on, fn) => {
        const d = U.el("div", "row ctl" + (on ? " on" : ""));
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
        ["标签数值", () => showVal, (v) => showVal = v],
      ];
      ly.forEach(([lab, get, set]) => {
        row(lab, get(), (e) => { set(!get()); e.currentTarget.classList.toggle("on", get()); render(); applyLayers(); });
      });
      const rows = [];
      const addColors = (list) => list.forEach(([k, lab]) => {
        const d = row(lab, metric === k, () => {
          metric = k; MX = maxima();
          rows.forEach((r) => r.classList.remove("on"));
          d.classList.add("on");
          render(); applyLayers();
        });
        d.classList.add("radio");
        rows.push(d);
      });
      cw.appendChild(U.el("h4", "", "着色 · 疫情"));
      addColors([["pred", "预测值"], ["obs", "实测值"], ["rt", "有效再生数 Rt"]]);
      cw.appendChild(U.el("h4", "", "着色 · 气象 Q1"));
      addColors([["t", "温度距平 T"], ["h", "湿度距平 H"], ["r", "降水量"]]);
      cw.appendChild(U.el("h4", "", "着色 · 迁徙与风险"));
      addColors([["p", "迁徙输入压力"], ["risk", "起升风险"]]);
    }
    buildRail();
    buildPanels();
    syncLabelSize();
    applyLayers();
    render();
  });
})();
