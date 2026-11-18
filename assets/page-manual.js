/* 使用说明页（所有操作提示与口径集中在此，不在主页面展示） */
(function () {
  const U = new Proxy({}, { get: (_, k) => window.APP.U[k] });
  const HTML = String.raw`<div class="doc">
<h1>WMEG-Net 山西省流感样病例时空传播演示系统 · 使用说明</h1>
<p>本系统由「数据管线 → 模型训练 → 站点生成」三部分组成。站点本身是<b>生成物</b>：所有页面只负责渲染
<code>assets/data.js</code> 里的一份数据快照，换数据不需要改页面代码。</p>

<h2>一、页面导览</h2>
<table>
<tr><th>页面</th><th>内容</th><th>关键操作</th></tr>
<tr><td>全省总览</td><td>山西省 11 市聚合的拟合与预测曲线、KPI、R₀/Rt 概览、11 市小多图</td><td>点击小多图进入城市剖析；点击流行季行缩放主图</td></tr>
<tr><td>时空传播</td><td>地图分级着色、19 对接壤边、36 条迁徙流、逐日时间轴</td><td>滚轮缩放、拖动平移、双击复位、点击城市选中、▶ 播放</td></tr>
<tr><td>城市剖析</td><td>单城市实测/预测/机理头曲线、分段指标、分步长误差、月度分布</td><td>框选或滚轮缩放、日期区间、预设区间、导出 CSV、放大查看</td></tr>
<tr><td>再生数 Rt</td><td>全省与各市 R_t 全时序、各流行季 R₀、模型 R_t 与观测反演对照</td><td>框选放大；点击城市卡片进入剖析</td></tr>
<tr><td>模型诊断</td><td>城市×步长误差热力图、观测-预测散点、分季度误差、逐城指标表</td><td>滚动查看长表</td></tr>
<tr><td>数据与滑窗</td><td>7:2:1 切分示意、数据集长度扫描、全部已训练区间、病例覆盖热力图</td><td>点击表行切换轮次；左侧控制台发起新训练</td></tr>
<tr><td>迁徙流</td><td>百度迁徙覆盖审计、迁徙强度与 ILI 同步性、城际流动结构、先验 A/B 实验</td><td>悬停查看数值</td></tr>
<tr><td>使用说明</td><td>本页</td><td>—</td></tr>
</table>

<h2>二、交互速查</h2>
<h3>图表</h3>
<ul>
<li><b>悬停</b>：显示十字线与当日全部序列数值。</li>
<li><b>拖拽</b>：在绘图区按住左键横向拖动 = 框选放大；松手后视图即切换到该区间。</li>
<li><b>滚轮</b>：以光标位置为中心缩放时间轴。</li>
<li><b>双击</b>：复位到全区间。</li>
<li><b>放大按钮</b>（卡片右上角 <code>⤢</code>）：在独立大窗中查看同一张图，支持同样的框选/缩放；<br>
城市剖析页的放大窗还会实时显示选中区间的 RMSE / MAE / nRMSE / PCC。</li>
<li><b>导出</b>（<code>⇩</code>）：把当前区间导出为 CSV（日期、分段、实测、预测、机理头）。</li>
</ul>
<h3>地图</h3>
<ul>
<li>滚轮缩放（1×–12×）、按住拖动平移、双击复位；右下角按钮 <code>+</code> <code>−</code> <code>⟲</code> 同效。</li>
<li>点击任一城市＝选中，右侧栏显示该市当日数值、全省排名与指标，并可跳转城市剖析。</li>
<li>左下角色阶说明随「着色」选项变化：预测值 / 实测值 / 偏差 / 有效再生数 Rt。</li>
</ul>
<h3>左侧栏</h3>
<ul>
<li>点击底部 <code>‹</code> / <code>›</code> 收起或展开侧栏，状态会记住。</li>
<li>侧栏上半部分是页面导航（超链接切换页面），下半部分是当前页的控制台。</li>
</ul>

<h2>三、数据口径</h2>
<h3>病例</h3>
<ul>
<li>11 个地级市、2015-01-01 → 2025-12-31 共 4018 天；<code>cases_smooth</code> 为 <b>7 日平移平均</b>后的日报告量，前 6 天为空。</li>
<li>2023 年起监测口径变化，病例数量级整体抬升约一个数量级，因此跨区间比较必须使用 <b>nRMSE / R²</b>，不能直接比 RMSE。</li>
</ul>
<h3>切分</h3>
<ul>
<li>按<b>天数</b>顺序 7:2:1 切分：前 70% 训练、中间 20% 验证、最后 10% 测试，绝不交叉、绝不打乱。</li>
<li>模型用 20 天滑动窗口预测未来 12 天；测试段逐日曲线由重叠窗口的多步预测<b>按目标日等权平均</b>得到。</li>
<li>各段末尾 <code>window + horizon = 32</code> 天因凑不满一个完整样本而无预测值，属正常。</li>
</ul>
<h3>指标</h3>
<ul>
<li><b>RMSE / MAE</b>：原始病例数空间。</li>
<li><b>nRMSE</b> = RMSE ÷ 该集合实测均值（与量纲无关，跨区间可比）。</li>
<li><b>PCC</b>：Pearson 相关系数；<b>R²</b> = 1 − SS_res/SS_tot；<b>sMAPE</b>：对称平均绝对百分比误差。</li>
<li><b>省级</b>指标＝先把 11 市逐日求和，再计算指标；<b>池化</b>指标＝把所有城市-日样本放在一起算。</li>
</ul>
<h3>再生数</h3>
<ul>
<li>机理头逐日输出 βt；<b>Rt = βt / γ</b>，γ = 1/3.5 d⁻¹（流感感染期约 3.5 天）。</li>
<li><b>R₀</b> 取每个流行季（7 月 → 次年 6 月）内 7 日平滑 Rt 的最大值，是「峰值传播强度」意义下的上界估计，不等于疫情初期的严格 R₀。</li>
<li>观测反演采用 Wallinga–Teunis 简化式，仅作独立对照（见「再生数 Rt」页右栏散点）。</li>
</ul>
<h3>迁徙</h3>
<ul>
<li>百度「城市迁徙」只公开部分日期：2020-01-10 → 2025-12-31 共 2183 天中仅 1254 天有数据（57.4%）。</li>
<li>因此迁徙仅作为<b>静态图先验</b>（城际份额结构），不作为逐日外生输入；是否采用以 A/B 实验为准，页面有对照结果。</li>
</ul>

<h2>四、按数据集区间训练（核心功能）</h2>
<p>只要给定数据集的起止日期，系统会自动按 7:2:1 切分、训练一轮、产出全新参数与全套指标，并归档到
<code>pipeline/runs/&lt;run_id&gt;/</code>。</p>
<h3>命令行</h3>
<pre><code># 默认区间 2015-01-01 → 2025-12-31，7:2:1，种子 0，120 轮
python pipeline\run_range.py --start 2015-01-01 --end 2025-12-31

# 指定预算
python pipeline\run_range.py --start 2020-01-01 --end 2025-12-31 --epochs 300 --seeds 0,1,2

# 只构建数据、不训练（自检切分是否合理）
python pipeline\run_range.py --start 2019-01-01 --end 2025-12-31 --dry-run</code></pre>
<h3>网页控制台</h3>
<p>「数据与滑窗」页左栏选择起止日期 → 点「按此区间训练」。该按钮调用服务端 <code>POST /api/run</code>；</p>
<ul>
<li>若使用 <code>python pipeline\server.py</code> 启动站点，则直接排队训练，完成后刷新页面即可在轮次下拉中出现新区间；</li>
<li>若用静态方式（file:// 或任意静态服务器）打开，则按钮会提示对应的命令行。</li>
</ul>

<h2>五、管线与部署</h2>
<pre><code># 1) 数据画像 + 迁徙图先验（数据更新后跑一次）
python pipeline\profile_data.py
python pipeline\build_migration_prior.py

# 2) 按区间训练（可批量排队）
python pipeline\sliding.py --plan sweep          # 数据集长度扫描
python pipeline\sliding.py --plan migration      # 迁徙先验 A/B

# 3) 生成站点
python pipeline\site_build.py                    # 默认取覆盖区间最长的已完成轮次

# 4) 本地服务（含 /api/run 控制台）
python pipeline\server.py --port 8899
# 浏览器打开 http://127.0.0.1:8899/</code></pre>
<p>训练解释器必须是带 torch 的那个（见 <code>pipeline/config/pipeline.json</code> 的
<code>runtime.python_exe</code>）；站点生成与数据画像可以用任意带 pandas 的 Python。</p>

<h2>六、常见问题</h2>
<ul>
<li><b>为什么测试段末尾几十天没有曲线？</b> 需要 20 天窗口 + 12 步预测才能凑一个样本，段尾 32 天自然空缺。</li>
<li><b>为什么 2023 年之后误差看起来更大？</b> 是数量级变化导致的绝对误差放大，请看 nRMSE 与 R²。</li>
<li><b>换一台机器训练速度不同？</b> 默认自动选 CUDA，没有 GPU 时退回 CPU，单轮时间约 5–20 倍。</li>
<li><b>轮次下拉里某些区间打不开？</b> 站点只打包默认轮次的数据；其他轮次需要随站点一起生成（<code>site_build.py</code>）或由服务端提供。</li>
</ul>

<h2>七、局限与声明</h2>
<ul>
<li>病例为流感样病例（ILI）报告量，受就诊行为、监测口径与报告制度影响，模型学到的是「报告量动力学」而非真实感染数。</li>
<li>迁徙数据仅作结构先验，逐日缺口过大；页面上的流向箭头为外部参照，不代表模型已使用。</li>
<li>R₀/Rt 为机理头反演值，其绝对水平依赖 γ 的取值假设，<b>趋势与相对比较</b>比绝对值更可靠。</li>
<li>所有区间均为单种子（seed 0）结果；多种子集成可显著降低方差，需要时把 <code>--seeds</code> 改成 <code>0,1,2</code> 重跑。</li>
</ul>
</div>`;

  window.WMEG.register("manual", function (main, rail, ctx) {
    main.parentElement.classList.add("norail");
    main.className = "main";
    const w = U.el("div", "card pad");
    w.style.cssText = "max-width:1000px;margin:0 auto;width:100%";
    const bd = U.el("div", "");
    bd.innerHTML = HTML;
    w.appendChild(bd);
    main.appendChild(w);
    if (ctx.console) {
      ctx.console.appendChild(U.el("h4", "", "目录"));
      [["一、页面导览", "#a1"], ["二、交互速查", "#a2"], ["三、数据口径", "#a3"],
       ["四、按区间训练", "#a4"], ["五、管线与部署", "#a5"], ["六、常见问题", "#a6"]].forEach(([t]) => {
        const d = U.el("div", "nav");
        d.style.margin = "0 8px";
        d.innerHTML = "<span class='lbl'>" + t + "</span>";
        ctx.console.appendChild(d);
      });
    }
  });
})();
