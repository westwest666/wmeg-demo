/* ===========================================================
   WMEG-Charts · 零依赖 SVG 图表库
   LineChart / Heatmap / Bars / Scatter / Spark / Gauge
   交互：悬停十字线、框选缩放、滚轮缩放、双击复位
   =========================================================== */
(function (global) {
  const NS = "http://www.w3.org/2000/svg";
  const D = window.WMEG_DATA || {};

  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      n.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(n);
    return n;
  }
  function h(tag, cls, html, parent) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(v, d) {
    if (v === null || v === undefined || (typeof v === "number" && !isFinite(v))) return "—";
    d = d === undefined ? 1 : d;
    const a = Math.abs(v);
    if (a >= 10000) return (v / 1000).toFixed(0) + "k";
    if (a >= 100) return v.toFixed(d > 0 ? 0 : d);
    if (a >= 10) return v.toFixed(Math.min(d, 1));
    return v.toFixed(d);
  }
  /* 对数坐标刻度：返回原始病例数刻度（0/1/5/10/50/100…），位置在 log10(v+1) 域计算 */
  function logTicks(dmaxLog) {
    const cands = [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000];
    const fit = cands.filter((v) => Math.log10(v + 1) <= dmaxLog + 1e-9);
    if (fit.length <= 6) return fit.length ? fit : [0, 1];
    const out = [fit[0]], stride = Math.ceil((fit.length - 1) / 5);
    for (let i = stride; i < fit.length - 1; i += stride) out.push(fit[i]);
    out.push(fit[fit.length - 1]);
    return out;
  }

  function niceTicks(min, max, n) {
    n = n || 5;
    if (max - min < 1e-12) { max = min + 1; }
    const span = max - min, step0 = span / n;
    const mag = Math.pow(10, Math.floor(Math.log10(step0)));
    const norm = step0 / mag;
    let step;
    if (norm <= 1) step = 1; else if (norm <= 2) step = 2;
    else if (norm <= 2.5) step = 2.5; else if (norm <= 5) step = 5; else step = 10;
    step *= mag;
    const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step * 1e-6; v += step) out.push(+v.toFixed(10));
    return out;
  }
  /* 存活图表登记表：单页路由切换时统一断开 ResizeObserver，避免泄漏 */
  const LIVE = new Set();
  function track(c) {
    // 只登记仍在文档里的实例：路由切换后遗留的 setTimeout 建图不会挂进登记表
    if (!c.host || c.host.isConnected) LIVE.add(c);
    return c;
  }
  function teardown() {
    LIVE.forEach((c) => { try { c.obs && c.obs.disconnect(); } catch (e) { } });
    LIVE.clear();
    const t = document.querySelector(".tipbox");
    if (t) t.style.opacity = 0;
  }
  const TIP = (function () {
    let t = null;
    return function () {
      if (!t) { t = document.createElement("div"); t.className = "tipbox"; document.body.appendChild(t); }
      return t;
    };
  })();

  /* ---------------- 折线图 ---------------- */
  class LineChart {
    constructor(host, opts) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.o = Object.assign({
        dates: [], series: [], height: 0, yFormat: (v) => fmt(v, 1),
        yMin: null, yMax: null, y2: null, y2Min: null, y2Max: null, y2Format: (v) => fmt(v, 2),
        padding: [12, 54, 26, 46], showX: true, brush: true, zoom: true,
        splitRanges: [], bands: [], markers: [], hlines: [], tooltip: null,
        xTickN: 8, minimal: false, onSelect: null, area: false, legend: false, xFormat: null
      }, opts || {});
      this.a = 0; this.b = Math.max(0, this.o.dates.length - 1);
      this.host.classList.add("chart");
      this.svg = el("svg", { preserveAspectRatio: "none" }, this.host);
      this.gGrid = el("g", { class: "grid" }, this.svg);
      this.gAxis = el("g", { class: "axis" }, this.svg);
      this.gMain = el("g", {}, this.svg);
      this.gOver = el("g", {}, this.svg);
      this.obs = new ResizeObserver(() => this.draw());
      this.obs.observe(this.host);
      this._down = null; this._brush = null;
      // 窗口级 mouseup 只注册一次（原实现在每次 draw 里注册，重绘会累积监听器）
      window.addEventListener("mouseup", (ev) => this._onWinUp(ev));
      track(this);
      this.draw();
    }
    _onWinUp(ev) {
      if (this._down === null || !this.o.brush) return;
      const up = this._idxAt(ev, true);
      if (this._brush) this._brush.setAttribute("opacity", 0);
      if (up !== null && this._brush && Math.abs(up - this._down) > 2) {
        const lo = Math.min(this._down, up), hi = Math.max(this._down, up);
        this.setRange(lo, hi);
        if (this.o.onSelect) this.o.onSelect(lo, hi);
      }
      this._down = null;
    }
    setData(dates, series) {
      if (dates) this.o.dates = dates;
      if (series) this.o.series = series;
      this.a = 0; this.b = this.o.dates.length - 1;
      this.draw();
    }
    setRange(a, b) {
      const n = this.o.dates.length - 1;
      this.a = Math.max(0, Math.min(n, a|0));
      this.b = Math.max(this.a + 2, Math.min(n, b|0));
      this.draw();
    }
    reset() { this.setRange(0, this.o.dates.length - 1); }
    resize() { this.draw(); }
    _size() {
      const w = this.host.clientWidth || 600;
      const hh = this.o.height || this.host.clientHeight || 240;
      if (!this.o.height) this.svg.setAttribute("height", hh);
      return [w, hh];
    }
    draw() {
      const o = this.o, [W, H] = this._size();
      if (!o.dates.length) { this.gMain.innerHTML = ""; return; }
      const [pt, pr, pb, pl] = o.padding;
      const x0 = pl, x1 = W - pr, y0 = pt, y1 = H - pb;
      const n = o.dates.length;
      const a = this.a, b = this.b;
      const span = Math.max(1, b - a);
      const X = (i) => x0 + (i - a) / span * (x1 - x0);
      // y 值域
      let vmin = Infinity, vmax = -Infinity;
      o.series.forEach((s) => {
        if (s.axis === 2) return;
        for (let i = a; i <= b; i++) {
          const v = s.data[i];
          if (v === null || v === undefined || !isFinite(v)) continue;
          if (v < vmin) vmin = v; if (v > vmax) vmax = v;
        }
      });
      if (!isFinite(vmin)) { vmin = 0; vmax = 1; }
      if (o.yMin !== null) vmin = o.yMin;
      if (o.yMax !== null) vmax = o.yMax;
      if (vmax === vmin) { vmax = vmin + 1; }
      const pad = (vmax - vmin) * 0.08;
      let dmin = o.yMin !== null ? o.yMin : Math.max(0, vmin - pad);
      let dmax = o.yMax !== null ? o.yMax : vmax + pad;
      // 对数坐标：位置在 log10(v+1) 域，刻度仍标注原始病例数（仅显示变换，数据不变）
      const logY = !!o.logY;
      const tf = (v) => logY ? Math.log10(Math.max(0, v) + 1) : v;
      if (logY) { dmin = 0; dmax = Math.log10(dmax + 1); }
      const Y = (v) => y1 - (tf(v) - dmin) / (dmax - dmin) * (y1 - y0);
      // 第二轴
      let d2min = 0, d2max = 1, Y2 = (v) => y1;
      if (o.y2) {
        let m2 = Infinity, M2 = -Infinity;
        o.series.forEach((s) => {
          if (s.axis !== 2) return;
          for (let i = a; i <= b; i++) {
            const v = s.data[i]; if (v == null || !isFinite(v)) continue;
            if (v < m2) m2 = v; if (v > M2) M2 = v;
          }
        });
        if (!isFinite(m2)) { m2 = 0; M2 = 1; }
        d2min = o.y2Min !== null && o.y2Min !== undefined ? o.y2Min : Math.max(0, m2 - 0.1);
        d2max = o.y2Max !== null && o.y2Max !== undefined ? o.y2Max : M2 + 0.1;
        if (d2max === d2min) d2max = d2min + 1;
        Y2 = (v) => y1 - (v - d2min) / (d2max - d2min) * (y1 - y0);
      }
      this._X = X; this._Y = Y; this._d = { a, b, x0, x1, y0, y1, dmin, dmax, Y2 };
      // ---- 时间分段底纹 ----
      this.gGrid.innerHTML = "";
      this.gAxis.innerHTML = "";
      this.gOver.innerHTML = "";
      (o.splitRanges || []).forEach((r) => {
        const i0 = Math.max(a, r.a0), i1 = Math.min(b, r.a1);
        if (i1 <= i0) return;
        el("rect", { x: X(i0), y: y0, width: Math.max(1, X(i1) - X(i0)), height: y1 - y0,
          fill: r.fill || "#F6FAFC" }, this.gGrid);
      });
      (o.bands || []).forEach((r) => {
        const i0 = Math.max(a, r.a0), i1 = Math.min(b, r.a1);
        if (i1 <= i0) return;
        el("rect", { x: X(i0), y: y0, width: Math.max(1, X(i1) - X(i0)), height: y1 - y0,
          fill: r.fill || "rgba(232,89,12,.06)" }, this.gGrid);
      });
      // ---- 网格 + Y 轴 ----
      const ticks = logY ? logTicks(dmax) : niceTicks(dmin, dmax, o.minimal ? 3 : 5);
      ticks.forEach((v) => {
        const tv = logY ? tf(v) : v;   // 对数模式下刻度的上下限比较也在变换域进行
        if (tv < dmin - 1e-9 || tv > dmax + 1e-9) return;
        const y = Y(v);
        el("line", { x1: x0, x2: x1, y1: y, y2: y }, this.gGrid);
        el("text", { x: x0 - 6, y: y + 3.5, "text-anchor": "end" }, this.gAxis).textContent = o.yFormat(v);
      });
      const hasY2 = (o.series || []).some((s) => s.axis === 2);
      if (o.y2 && hasY2) {
        niceTicks(d2min, d2max, 3).forEach((v) => {
          if (v < d2min - 1e-9 || v > d2max + 1e-9) return;
          const y = Y2(v);
          el("text", { x: x1 + 6, y: y + 3.5, "text-anchor": "start", fill: o.y2color || "#8E44C7" },
            this.gAxis).textContent = o.y2Format(v);
        });
      }
      // ---- X 轴 ----
      if (o.showX) {
        // 刻度数随图宽自适应：窄屏/小视口下避免相邻日期标签叠字
        const nt = Math.min(o.minimal ? 3 : o.xTickN, Math.max(2, Math.floor((x1 - x0) / 72)));
        const spanN = b - a;
        const fmtX = o.xFormat || ((d) => d ? (spanN < 200 ? d.slice(5, 10) : d.slice(2, 7)) : "");
        let prev = null;
        for (let k = 0; k <= nt; k++) {
          const i = Math.round(a + (b - a) * k / nt);
          const lab = fmtX(o.dates[i], i);
          if (lab === prev) continue;      // 短区间里相邻刻度会落在同一天，去重
          prev = lab;
          el("text", { x: X(i), y: y1 + 15, "text-anchor": k === 0 ? "start" : (k === nt ? "end" : "middle") },
            this.gAxis).textContent = lab;
        }
      }
      // ---- 参考线 ----
      (o.hlines || []).forEach((hl) => {
        const y = Y(hl.v);
        if (y < y0 || y > y1) return;
        el("line", { x1: x0, x2: x1, y1: y, y2: y, stroke: hl.color || "#C2185B",
          "stroke-width": hl.width || 1, "stroke-dasharray": hl.dash || "4 4", opacity: hl.opacity || .7 }, this.gOver);
        if (hl.label) el("text", { x: x1 - 4, y: y - 4, "text-anchor": "end", fill: hl.color || "#C2185B",
          "font-size": 9.5 }, this.gOver).textContent = hl.label;
      });
      // ---- 线 ----
      this.gMain.innerHTML = "";
      const clip = el("clipPath", { id: "clip" + (this._id = (this._id || 0) + 1) }, this.gMain);
      el("rect", { x: x0, y: y0 - 4, width: x1 - x0, height: y1 - y0 + 8 }, clip);
      const gs = el("g", { "clip-path": "url(#clip" + this._id + ")" }, this.gMain);
      o.series.forEach((s) => {
        const YY = s.axis === 2 ? Y2 : Y;
        let d = "", pen = false, area = "";
        let firstX = null;
        for (let i = a; i <= b; i++) {
          const v = s.data[i];
          if (v === null || v === undefined || !isFinite(v)) { pen = false; continue; }
          const px = X(i), py = YY(v);
          if (firstX === null) firstX = px;
          d += (pen ? "L" : "M") + px.toFixed(1) + "," + py.toFixed(1);
          pen = true;
        }
        if (s.area && d) {
          area = d + "L" + X(b) + "," + y1 + "L" + firstX + "," + y1 + "Z";
          el("path", { d: area, fill: s.areaColor || s.color, opacity: s.areaOpacity || .10 }, gs);
        }
        if (d) el("path", { d, fill: "none", stroke: s.color, "stroke-width": s.width || 1.6,
          "stroke-dasharray": s.dash || null, "stroke-linejoin": "round", "stroke-linecap": "round",
          opacity: s.opacity === undefined ? 1 : s.opacity }, gs);
      });
      // ---- 事件层 ----
      this.gOver.querySelectorAll(".hit").forEach((n) => n.remove());
      const hit = el("rect", { class: "hit", x: x0, y: y0, width: x1 - x0, height: y1 - y0,
        fill: "transparent", style: "cursor:crosshair" }, this.gOver);
      const hl = el("line", { class: "hover-line", x1: 0, x2: 0, y1: y0, y2: y1, opacity: 0 }, this.gOver);
      const dots = [];
      this._hover = { hit, hl, dots, x0, x1, y0, y1 };
      hit.addEventListener("mousemove", (ev) => this._move(ev));
      hit.addEventListener("mouseleave", () => {
        hl.setAttribute("opacity", 0);
        while (dots.length) { const d = dots.pop(); if (d && d.parentNode) d.parentNode.removeChild(d); }
        TIP().style.opacity = 0;
      });
      // 框选
      const br = el("rect", { class: "brush", x: 0, y: y0, width: 0, height: y1 - y0, opacity: 0 }, this.gOver);
      this._brush = br; this._down = null;
      hit.addEventListener("mousedown", (ev) => {
        const i = this._idxAt(ev);
        if (i === null) return;
        this._down = i;
        br.setAttribute("opacity", 1);
        br.setAttribute("x", X(i)); br.setAttribute("width", 0);
        ev.preventDefault();
      });
      hit.addEventListener("mousemove", (ev) => {
        if (this._down === null) return;
        const cur = this._idxAt(ev, true);
        if (cur === null) return;
        const lo = Math.min(this._down, cur), hi = Math.max(this._down, cur);
        br.setAttribute("x", X(lo)); br.setAttribute("width", Math.max(0, X(hi) - X(lo)));
      });
      hit.addEventListener("dblclick", () => { this.reset(); if (o.onSelect) o.onSelect(0, n - 1); });
      if (o.zoom) {
        hit.addEventListener("wheel", (ev) => {
          ev.preventDefault();
          const i = this._idxAt(ev);
          if (i === null) return;
          const k = ev.deltaY > 0 ? 1.18 : 0.85;
          const da = (i - this.a) * k, db = (this.b - i) * k;
          this.setRange(Math.round(i - da), Math.round(i + db));
          if (o.onSelect) o.onSelect(this.a, this.b);
        }, { passive: false });
      }
    }
    _idxAt(ev, clamp) {
      const d = this._d; if (!d) return null;
      const r = this.svg.getBoundingClientRect();
      const x = ev.clientX - r.left;
      if (clamp) {
        const t = (Math.min(d.x1, Math.max(d.x0, x)) - d.x0) / (d.x1 - d.x0);
        return Math.round(d.a + t * (d.b - d.a));
      }
      if (x < d.x0 || x > d.x1) return null;
      const t = (x - d.x0) / (d.x1 - d.x0);
      return Math.round(d.a + t * (d.b - d.a));
    }
    _move(ev) {
      const o = this.o, i = this._idxAt(ev);
      const H = this._hover; if (!H || i === null) {
        if (H) {
          H.hl.setAttribute("opacity", 0);
          while (H.dots.length) { const d = H.dots.pop(); if (d && d.parentNode) d.parentNode.removeChild(d); }
        }
        TIP().style.opacity = 0;
        return;
      }
      const x = this._X(i);
      H.hl.setAttribute("x1", x); H.hl.setAttribute("x2", x); H.hl.setAttribute("opacity", 1);
      while (H.dots.length) H.dots.pop().remove();
      let rows = o.series.filter((s) => s.showTip !== false).map((s) => {
        const v = s.data[i];
        if (v !== null && v !== undefined && isFinite(v)) {
          // ★ 画到 gOver 里：重绘时 gOver.innerHTML="" 会连带清掉，避免留下"黑点"
          const c = el("circle", { cx: x, cy: (s.axis === 2 ? this._d.Y2(v) : this._Y(v)), r: 2.6,
            fill: "#fff", stroke: s.color, "stroke-width": 1.8, "pointer-events": "none" }, this.gOver);
          H.dots.push(c);
        }
        return { label: s.label, color: s.color, v: o.yFormat(v), raw: v };
      });
      if (o.tooltip) rows = o.tooltip(i, rows) || rows;
      const tip = TIP();
      tip.innerHTML = "<div style='font-weight:700;margin-bottom:3px'>" + (o.dates[i] || "") + "</div>" +
        rows.map((r) => "<div class='r'><span>" + (r.color ? "<i style='display:inline-block;width:8px;height:8px;border-radius:50%;background:" + r.color + ";margin-right:5px'></i>" : "") +
          r.label + "</span><span>" + r.v + "</span></div>").join("");
      tip.style.opacity = 1;
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      let L = ev.clientX + 14, T = ev.clientY - th - 10;
      if (L + tw > innerWidth - 8) L = ev.clientX - tw - 14;
      if (T < 6) T = ev.clientY + 16;
      tip.style.left = L + "px"; tip.style.top = T + "px";
    }
  }

  /* ---------------- 热力图 ---------------- */
  class Heatmap {
    constructor(host, opts) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.o = Object.assign({ rows: [], cols: [], values: [], color: null,
        fmt: (v) => fmt(v, 2), height: 0, cellRadius: 3, labelW: 62, labelH: 18,
        colorScale: ["#F7FBFD", "#D6EEF0", "#7EC8CF", "#2E9AA6", "#0E7C86", "#0B5A62"],
        min: null, max: null, onClick: null, invert: false, title: "", labelEvery: 1 }, opts || {});
      this.host.classList.add("chart");
      this.svg = el("svg", {}, this.host);
      this.obs = new ResizeObserver(() => this.draw()); this.obs.observe(this.host);
      track(this);
      this.draw();
    }
    colorAt(t) {
      const s = this.o.colorScale;
      t = Math.max(0, Math.min(0.9999, t));
      const x = t * (s.length - 1), i = Math.floor(x), f = x - i;
      const c0 = hex(s[i]), c1 = hex(s[Math.min(s.length - 1, i + 1)]);
      return "rgb(" + [0, 1, 2].map((k) => Math.round(c0[k] + (c1[k] - c0[k]) * f)).join(",") + ")";
    }
    draw() {
      const o = this.o, W = this.host.clientWidth || 500;
      const nr = o.rows.length, nc = o.cols.length;
      if (!nr || !nc) { this.svg.innerHTML = ""; return; }
      const H = o.height || this.host.clientHeight || 220;
      this.svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      this.svg.setAttribute("height", H);
      this.svg.innerHTML = "";
      const lw = o.labelW, lh = o.labelH;
      // 单元格从顶部 2px 开始，底部预留 lh 给列标签（旧版从 lh 开始画，
      // 导致最后一行单元格与底部列标签重叠）
      const gw = (W - lw - 4) / nc, gh = (H - lh - 6) / nr;
      let mn = o.min, mx = o.max;
      if (mn === null || mx === null) {
        mn = Infinity; mx = -Infinity;
        o.values.forEach((r, i) => r.forEach((v, j) => {
          if (v == null || !isFinite(v)) return;
          if (v < mn) mn = v; if (v > mx) mx = v;
        }));
        if (!isFinite(mn)) { mn = 0; mx = 1; }
      }
      this._g = { lw, lh, gw, gh, mn, mx };
      for (let i = 0; i < nr; i++) {
        el("text", { x: lw - 6, y: 2 + gh * i + gh / 2 + 3.5, "text-anchor": "end" }, this.svg).textContent = o.rows[i];
        for (let j = 0; j < nc; j++) {
          const v = o.values[i][j];
          const t = (v == null || !isFinite(v)) ? -1 : (v - mn) / (mx - mn || 1);
          const c = t < 0 ? "#F2F5F8" : this.colorAt(o.invert ? 1 - t : t);
          const r = el("rect", { x: lw + gw * j + 1, y: 2 + gh * i + 1, width: Math.max(1, gw - 2),
            height: Math.max(1, gh - 2), rx: o.cellRadius, fill: c }, this.svg);
          r.style.cursor = o.onClick ? "pointer" : "default";
          if (o.onClick) r.addEventListener("click", () => o.onClick(i, j));
          r.addEventListener("mousemove", (ev) => {
            const tip = TIP();
            tip.innerHTML = "<div style='font-weight:700;margin-bottom:2px'>" + o.rows[i] + " · " + o.cols[j] + "</div>" +
              "<div class='r'><span>" + (o.title || "值") + "</span><span>" + (v == null ? "—" : o.fmt(v)) + "</span></div>";
            tip.style.opacity = 1;
            tip.style.left = Math.min(innerWidth - tip.offsetWidth - 8, ev.clientX + 12) + "px";
            tip.style.top = Math.max(6, ev.clientY - tip.offsetHeight - 10) + "px";
          });
          r.addEventListener("mouseleave", () => { TIP().style.opacity = 0; });
          const txt = (v == null) ? "" : String(o.fmt(v));
          const fits = gw > (txt.length * 5.6 + 6) && gh > 15;
          if (fits) {
            const dark = t > 0.55;
            el("text", { x: lw + gw * j + gw / 2, y: 2 + gh * i + gh / 2 + 3.2, "text-anchor": "middle",
              "font-size": Math.min(10, Math.max(7.5, gh * 0.44)), fill: dark ? "#fff" : "#3E5468",
              "pointer-events": "none" }, this.svg).textContent = txt;
          }
        }
      }
      const le = Math.max(1, o.labelEvery | 0);
      o.cols.forEach((c, j) => {
        if (j % le) return;
        el("text", { x: lw + gw * j + gw / 2, y: H - 5, "text-anchor": "middle", "font-size": 9.5,
          fill: "#8496A6" }, this.svg).textContent = c;
      });
    }
  }

  /* ---------------- 横向条形 ---------------- */
  class Bars {
    constructor(host, opts) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.o = Object.assign({ data: [], fmt: (v) => fmt(v, 2), height: 0, labelW: 46,
        color: "#0E7C86", max: null, onClick: null, baseline: null, sort: false }, opts || {});
      this.host.classList.add("chart");
      this.svg = el("svg", {}, this.host);
      this.obs = new ResizeObserver(() => this.draw()); this.obs.observe(this.host);
      track(this);
      this.draw();
    }
    draw() {
      const o = this.o, W = this.host.clientWidth || 300;
      const data = o.sort ? o.data.slice().sort((a, b) => b.v - a.v) : o.data;
      const n = data.length; if (!n) { this.svg.innerHTML = ""; return; }
      const H = o.height || this.host.clientHeight || n * 20 + 8;
      this.svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      this.svg.setAttribute("height", H);
      this.svg.innerHTML = "";
      const lw = o.labelW, vw = 46;
      const rowH = H / n, bh = Math.min(14, rowH * 0.62);
      const mx = o.max || Math.max(...data.map((d) => d.v || 0)) * 1.05 || 1;
      data.forEach((d, i) => {
        const y = rowH * i + (rowH - bh) / 2;
        el("text", { x: lw - 7, y: y + bh / 2 + 3.4, "text-anchor": "end", "font-size": 10.5,
          fill: "#46586A" }, this.svg).textContent = d.k;
        el("rect", { x: lw, y, width: Math.max(1, W - lw - vw), height: bh, rx: 3, fill: "#F0F5F8" }, this.svg);
        const w = Math.max(1, (W - lw - vw) * Math.min(1, (d.v || 0) / mx));
        const rc = el("rect", { x: lw, y, width: w, height: bh, rx: 3,
          fill: d.color || o.color }, this.svg);
        if (o.onClick) { rc.style.cursor = "pointer"; rc.addEventListener("click", () => o.onClick(d)); }
        el("text", { x: W - 2, y: y + bh / 2 + 3.4, "text-anchor": "end", "font-size": 10.5,
          "font-weight": 700, fill: "#14202B" }, this.svg).textContent = o.fmt(d.v);
      });
      if (o.baseline !== null) {
        const x = lw + (W - lw - vw) * Math.min(1, o.baseline / mx);
        el("line", { x1: x, x2: x, y1: 0, y2: H, stroke: "#C2185B", "stroke-dasharray": "3 3",
          "stroke-width": 1 }, this.svg);
      }
    }
  }

  /* ---------------- 散点（实测-预测） ---------------- */
  class Scatter {
    constructor(host, opts) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.o = Object.assign({ x: [], y: [], xLabel: "", yLabel: "", color: "#0E7C86",
        height: 0, r: 2.2, opacity: .5, showLine: true }, opts || {});
      this.host.classList.add("chart");
      this.svg = el("svg", {}, this.host);
      this.obs = new ResizeObserver(() => this.draw()); this.obs.observe(this.host);
      track(this);
      this.draw();
    }
    draw() {
      const o = this.o, W = this.host.clientWidth || 300;
      const H = o.height || this.host.clientHeight || 240;
      this.svg.setAttribute("viewBox", "0 0 " + W + " " + H);
      this.svg.setAttribute("height", H); this.svg.innerHTML = "";
      const pl = 40, pr = 14, pt = 12, pb = o.xLabel ? 34 : 26;
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < o.x.length; i++) {
        const a = o.x[i], b = o.y[i];
        if (!isFinite(a) || !isFinite(b)) continue;
        mn = Math.min(mn, a, b); mx = Math.max(mx, a, b);
      }
      if (!isFinite(mn)) return;
      mx = mx || 1;
      const X = (v) => pl + (v - 0) / mx * (W - pl - pr);
      const Y = (v) => H - pb - (v - 0) / mx * (H - pt - pb);
      for (let k = 0; k <= 4; k++) {
        const v = mx * k / 4;
        el("line", { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), stroke: "#EDF2F6" }, this.svg);
        el("text", { x: pl - 5, y: Y(v) + 3.4, "text-anchor": "end", "font-size": 9.5, fill: "#8496A6" }, this.svg).textContent = fmt(v, 1);
        el("text", { x: X(v), y: H - (o.xLabel ? 20 : 8), "text-anchor": "middle", "font-size": 9.5, fill: "#8496A6" }, this.svg).textContent = fmt(v, 1);
      }
      if (o.showLine) el("line", { x1: X(0), y1: Y(0), x2: X(mx), y2: Y(mx), stroke: "#C9D6E2",
        "stroke-dasharray": "4 4" }, this.svg);
      for (let i = 0; i < o.x.length; i++) {
        const a = o.x[i], b = o.y[i];
        if (!isFinite(a) || !isFinite(b)) continue;
        el("circle", { cx: X(a), cy: Y(b), r: o.r, fill: o.color, opacity: o.opacity }, this.svg);
      }
      // 轴标题独立放在刻度下方居中，避免与第一个刻度（0.0）叠在一起
      el("text", { x: (pl + W - pr) / 2, y: H - 5, "text-anchor": "middle", "font-size": 9.5, fill: "#8496A6" }, this.svg).textContent = o.xLabel;
      el("text", { x: W - pr, y: pt - 2, "text-anchor": "end", "font-size": 9.5, fill: "#8496A6" }, this.svg).textContent = o.yLabel;
    }
  }

  function hex(c) {
    const m = c.replace("#", "");
    return [parseInt(m.substr(0, 2), 16), parseInt(m.substr(2, 2), 16), parseInt(m.substr(4, 2), 16)];
  }
  function legend(items) {
    return "<div class='legend'>" + items.map((it) =>
      "<span>" + (it.dot ? "<i class='dot' style='background:" + it.color + "'></i>"
        : "<i style='background:" + it.color + "'></i>") + it.label + "</span>").join("") + "</div>";
  }
  global.CH = { LineChart, Heatmap, Bars, Scatter, legend, fmt, TIP, niceTicks, el, h, teardown };
  global.CH._live = LIVE;
  global.Chart = global.CH;   // 兼容别名（app.js 里用 Chart.*）
})(window);
