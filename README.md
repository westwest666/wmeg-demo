# WMEG-Net 演示站点 · v6（多页 · 7:2:1 任意区间）

## 目录

```
网站/
├─ index.html      全省总览（聚合拟合/预测 · R0 · Rt · 流行季）
├─ map.html        时空传播（分级着色 · 迁徙流 · 时间轴）
├─ city.html       城市剖析（任意时段 · 放大 · 导出）
├─ rt.html         再生数（模型/实测 Rt · 各季 R0）
├─ model.html      模型诊断（误差结构 · 基线对照）
├─ data.html       数据与滑窗（切分 · 长度扫描 · 区间训练控制台）
├─ mig.html        迁徙流（覆盖审计 · A/B 结论）
├─ manual.html     使用说明
├─ assets/
│   ├─ app.css  app.js  core.js  charts.js
│   ├─ page-*.js   各页渲染
│   └─ data.js     ★ 当前轮次数据快照（由 site_build.py 生成）
├─ runs/<id>/data.js  其他已训练区间的快照（轮次下拉用）
├─ data/latest.json   同一份数据的纯 JSON
├─ 使用说明.md / 交接文档.md
└─ 启动网站.bat      起服务 + 训练控制台（http://127.0.0.1:8899/）
```

## 重要

- **本目录是生成物**。改版式 → 改 `pipeline/templates/site/`；改数据 → 跑 `python pipeline\site_build.py`。
- 数据以 `<script>` 注入（`window.WMEG_DATA`），因此**双击 index.html 用 file:// 打开也能完整运行**。
- 深链：`index.html?run=<run_id>` 可直接打开某个已训练区间，页面间切页会保留该参数。
- 无任何外部依赖（无 CDN、无字体、无构建步骤）。
