/* 传播预警 · 导师四问雏形（Q1 气象归因 / Q2 迁移指标 / Q3-4 下一个热点回溯）
   数据：data/advisor_proto.json（pipeline/advisor_proto.py 生成） */
(function (global) {
  const W = (global.WMEG = global.WMEG || {});
  W.pages = W.pages || {};
  const MN = {
    combo: "乘性 P×S×Wx", PxWx: "P×Wx", Panom: "季距平P×Wx", P: "时变压力 P",
    momentum: "动量(原始)", momN: "动量/阈值", mix: "动量/阈值+0.5zP",
    static: "静态压力", pop: "人口规模", random: "随机基线"
  };
  const Q1N = {
    z_tavg_anom_lag0: "气温距平 · 当周", z_tavg_anom_lag7: "气温距平 · 滞后1周",
    z_tavg_anom_lag14: "气温距平 · 滞后2周", z_tavg_anom_lag21: "气温距平 · 滞后3周",
    z_AH_anom_lag0: "绝对湿度距平 · 当周", z_AH_anom_lag7: "绝对湿度距平 · 滞后1周",
    z_AH_anom_lag14: "绝对湿度距平 · 滞后2周", z_AH_anom_lag21: "绝对湿度距平 · 滞后3周",
    cold_dry_7d: "冷干日占比 · 7天", g_lag7: "上周增速(自回归)"
  };
  W.pages.warn = function (main, rail, ctx) {
    const U = ctx.U;
    const hold = U.el("div", "card pad", "<h3>传播预警 · 四问雏形</h3><p style='color:#5B6B7B;font-size:12px'>正在加载 analysis 结果…</p>");
    main.appendChild(hold);
    U.api("data/advisor_proto.json?v=20261127g").then(function (R) {
      main.innerHTML = "";
      if (!R || R.ok === false || !R.q1) {
        main.appendChild(U.el("div", "card pad", "<h3>缺少结果</h3><p style='font-size:12px;color:#5B6B7B'>请先运行 python pipeline\\advisor_proto.py 生成 data/advisor_proto.json</p>"));
        return;
      }
      const q1 = R.q1, q2 = R.q2, q34 = R.q34;

      /* ---- Q1 ---- */
      const c1 = U.card(main, "Q1 · 温度 / 湿度影响", "城市+月份固定效应面板 · 周增速对气象距平分布滞后回归 · n=" + U.num(q1.n, 0) + " · R²=" + q1.r2);
      const tb = U.el("table", "t");
      tb.innerHTML = "<thead><tr><th>气象项</th><th>系数</th><th>t 值</th><th>判读</th></tr></thead>";
      const tbd = U.el("tbody");
      q1.terms.forEach(function (t) {
        const sig = Math.abs(t.t) >= 2;
        const dir = t.coef < 0 ? "负向" : "正向";
        const tr = U.el("tr");
        tr.innerHTML = "<td>" + (Q1N[t.name] || t.name) + "</td><td class='r'>" + t.coef.toFixed(4) +
          "</td><td class='r'>" + t.t.toFixed(2) + "</td><td>" +
          (sig ? "<span class='badge " + (t.coef < 0 ? "cool" : "warm") + "'>" + dir + "显著</span>" : "<span class='badge mut'>不显著</span>") + "</td>";
        tbd.appendChild(tr);
      });
      tb.appendChild(tbd);
      c1.bd.appendChild(tb);
      const lagbox = U.el("div"); lagbox.style.height = "170px"; lagbox.style.flex = "0 0 auto"; c1.bd.appendChild(lagbox);
      const lags = ["当周", "滞后1周", "滞后2周", "滞后3周"];
      const pick = (p) => q1.terms.filter((t) => t.name.indexOf(p) === 0).map((t) => t.coef);
      const dT = pick("z_tavg_anom"), dH = pick("z_AH_anom");
      setTimeout(() => new CH.LineChart(lagbox, {
        dates: lags, minimal: true, brush: false, zoom: false, height: 170, padding: [10, 40, 34, 46],
        xFormat: (d) => d, yMin: Math.min.apply(null, dT.concat(dH)) - 0.004,
        yFormat: (v) => U.fmt(v, 3), hlines: [{ v: 0, color: "#9AA8B5", opacity: .5 }],
        series: [
          { label: "气温距平系数", color: "#C2410C", width: 1.8, dots: true, data: dT },
          { label: "绝对湿度距平系数", color: "#0E7C86", width: 1.8, dots: true, data: dH }
        ]
      }), 20);
      c1.bd.insertAdjacentHTML("beforeend", "<div style='margin-top:6px'>" + CH.legend([
        { color: "#C2410C", dot: true, label: "气温距平" }, { color: "#0E7C86", dot: true, label: "绝对湿度距平" }]) + "</div>");
      c1.bd.insertAdjacentHTML("beforeend", "<p class='note'>读法：系数为「该气象项 +1 个标准差」对下周增速的对数影响。暖距平滞后 1 周负向、干距平当周负向（越干增长越快）、冷干占比正向，与流感冷干偏好一致；滞后 2 周湿度正号为流行季内的回弹振荡，不作因果解读。</p>");

      /* ---- Q2 ---- */
      const c2 = U.card(main, "Q2 · 迁移指标影响", "时变输入压力 P_i(t)=Σ_j s_ji(t)·I_j(t−3)/N_j · 与未来增速 lead-lag");
      const kv2 = U.el("div", "kvs");
      U.kv(kv2, "面板回归 zP 系数", q2.reg_zP.coef.toFixed(4) + "（t=" + q2.reg_zP.t + "）");
      U.kv(kv2, "时变曲线峰值", "lag " + q2.peak_daily.lag + " 天 · r=" + q2.peak_daily.r);
      U.kv(kv2, "静态曲线峰值", "lag " + q2.peak_static.lag + " 天 · r=" + q2.peak_static.r);
      U.kv(kv2, "迁徙观测日占比(2020起)", U.pct(q2.obs_days_frac, 1));
      c2.bd.appendChild(kv2);
      const lb2 = U.el("div"); lb2.style.height = "180px"; lb2.style.flex = "0 0 auto"; c2.bd.appendChild(lb2);
      const rD = q2.curve_daily.map((o) => o.r), rS = q2.curve_static.map((o) => o.r);
      setTimeout(() => new CH.LineChart(lb2, {
        dates: q2.curve_daily.map((o) => o.lag + "d"), minimal: true, brush: false, zoom: false,
        height: 180, padding: [10, 40, 34, 46], yFormat: (v) => U.fmt(v, 3),
        xFormat: (d) => d, yMin: Math.min.apply(null, rD.concat(rS)) - 0.004,
        hlines: [{ v: 0, color: "#9AA8B5", opacity: .5 }],
        series: [
          { label: "时变份额 P(t)", color: "#2F7FC1", width: 1.8, dots: true, data: rD },
          { label: "静态份额 P̄", color: "#94A3B8", width: 1.4, dash: "4 3", data: rS }
        ]
      }), 20);
      c2.bd.insertAdjacentHTML("beforeend", "<div style='margin-top:6px'>" + CH.legend([
        { color: "#2F7FC1", dot: true, label: "时变份额" }, { color: "#94A3B8", dash: true, label: "静态份额" }]) + "</div>");
      c2.bd.insertAdjacentHTML("beforeend", "<p class='note'>读法：迁移压力对增速的边际解释量小但显著（t=" + q2.reg_zP.t + "），时变略优于静态；它的价值不在总量幅度，而在 Q3/4 的空间排序与提前量。</p>");

      /* ---- Q3/4 ---- */
      const c3 = U.card(main, "Q3/4 · 下一个热点回溯", "6 流行季 · " + q34.methods[0].n + " 个滚动评估点 · 预测 top1/top3 是否命中实际下一个起升城市", [
        { label: U.icon("csv") + " JSON", title: "下载完整结果", fn: () => U.download("advisor_proto.json", JSON.stringify(R, null, 1), "application/json") }
      ]);
      const g3 = U.el("div", "grid2");
      const b1 = U.el("div"); b1.style.height = "230px"; b1.style.flex = "0 0 auto";
      const b3 = U.el("div"); b3.style.height = "230px"; b3.style.flex = "0 0 auto";
      g3.appendChild(b1); g3.appendChild(b3); c3.bd.appendChild(g3);
      const rnd = q34.methods.find((m) => m.name === "random");
      setTimeout(() => {
        new CH.Bars(b1, { data: q34.methods.map((m) => ({ k: MN[m.name] || m.name, v: m.hit1 })), labelW: 108, fmt: (v) => U.pct(v, 1), color: "#0E7C86", baseline: rnd.hit1, height: 230 });
        new CH.Bars(b3, { data: q34.methods.map((m) => ({ k: MN[m.name] || m.name, v: m.hit3 })), labelW: 108, fmt: (v) => U.pct(v, 1), color: "#2F7FC1", baseline: rnd.hit3, height: 230 });
      }, 20);
      c3.bd.insertAdjacentHTML("beforeend", "<p class='note'>左：hit@1（竖线为随机基线 " + U.pct(rnd.hit1, 1) + "）；右：hit@3（随机 " + U.pct(rnd.hit3, 1) + "）。命中时平均提前天数：" +
        q34.methods.filter((m) => m.lead_mean).map((m) => (MN[m.name] || m.name) + " " + m.lead_mean + "d").join(" · ") + "</p>");
      const tb3 = U.el("table", "t");
      tb3.innerHTML = "<thead><tr><th>流行季</th><th>评估点</th><th>动量 hit1</th><th>融合 hit1</th><th>融合 hit3</th><th>乘性 hit3</th></tr></thead>";
      const td3 = U.el("tbody");
      q34.per_season.forEach(function (s) {
        const tr = U.el("tr");
        tr.innerHTML = "<td>" + s.season + "</td><td class='r'>" + s.n + "</td><td class='r'>" + s.mom_h1 + "/" + s.n +
          "</td><td class='r'>" + s.mix_h1 + "/" + s.n + "</td><td class='r'>" + s.mix_h3 + "/" + s.n + "</td><td class='r'>" + s.combo_h3 + "/" + s.n + "</td>";
        td3.appendChild(tr);
      });
      tb3.appendChild(td3); c3.bd.appendChild(tb3);
      c3.bd.insertAdjacentHTML("beforeend", "<p class='note'>雏形结论：阈值归一化动量是最强基线（hit1 " + U.pct(q34.methods.find((m) => m.name === "momN").hit1, 1) + "）；迁移压力单独 hit1 与随机相当，但命中时提前 " + q34.methods.find((m) => m.name === "P").lead_mean + " 天（约为动量 2 倍）→ 迁移是方向性早期信号而非点名器；乘性 S 与 λ=0.5 加性融合在本原型均未跑赢基线，融合形式待改进。</p>");

      /* ---- 当前风险榜 ---- */
      const c4 = U.card(main, "当前风险榜 · " + q34.latest_date, "score = P×S×Wx 原型口径 · 仅供演示，非发布预警");
      const b4 = U.el("div"); b4.style.height = "250px"; b4.style.flex = "0 0 auto"; c4.bd.appendChild(b4);
      setTimeout(() => new CH.Bars(b4, { data: q34.latest_rank.map((r) => ({ k: r.city.replace("市", ""), v: r.score })), labelW: 52, fmt: (v) => U.fmt(v, 3), color: "#C2410C", height: 250 }), 20);
      const kv4 = U.el("div", "kvs");
      q34.latest_rank.slice(0, 3).forEach(function (r, i) {
        U.kv(kv4, "TOP" + (i + 1) + " " + r.city, "P=" + r.P + " · S=" + r.S + " · Wx=" + r.Wx);
      });
      c4.bd.appendChild(kv4);

      /* ---- rail ---- */
      const r1 = U.card(rail, "四问雏形结论", "prototype · 可复算");
      const ul = U.el("ul", "bullets");
      [
        "Q1 有影响：暖距平滞后1周负向(t−4.7)、干距平当周负向(t−4.5)、冷干占比正向(t2.7)。",
        "Q2 影响小但显著：zP 系数 t=" + q2.reg_zP.t + "；时变份额略优于静态；价值在排序与提前量。",
        "Q3 能概率排序：归一化动量 hit3 " + U.pct(q34.methods.find((m) => m.name === "momN").hit3, 1) + " vs 随机 " + U.pct(rnd.hit3, 1) + "。",
        "Q4 迁移给方向与提前量（命中提前 " + q34.methods.find((m) => m.name === "P").lead_mean + "d），单独点名≈随机；融合形式是下一步。"
      ].forEach((s) => ul.appendChild(U.el("li", null, s)));
      r1.bd.appendChild(ul);
      const r2 = U.card(rail, "口径与局限", "advisor_proto.py");
      const ul2 = U.el("ul", "bullets");
      ul2.appendChild(U.el("li", null, "起升判定：" + R.meta.onset_rule));
      ul2.appendChild(U.el("li", null, "评分：" + R.meta.score));
      R.limits.forEach((s) => ul2.appendChild(U.el("li", null, s)));
      r2.bd.appendChild(ul2);
    });
  };
})(window);