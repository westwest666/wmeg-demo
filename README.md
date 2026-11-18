# WMEG-Net 演示站点 · v7（单页应用）

整站只有 **一个网页**（`index.html`）：左侧栏点击后在同一页面内切换视图，不刷新、不跳页；
地址栏用 hash 记录位置，可直接分享。

## 视图与地址

| 视图 | 地址 |
|---|---|
| 全省总览 | `index.html` 或 `index.html#/index` |
| 时空传播 | `index.html#/map` |
| 城市剖析 | `index.html#/city?city=太原` |
| 再生数 Rt | `index.html#/rt` |
| 模型诊断 | `index.html#/model` |
| 数据与滑窗 | `index.html#/data` |
| 迁徙流 | `index.html#/mig` |
| 使用说明 | `index.html#/manual` |

切换已训练区间：加 `run=<run_id>`，如 `index.html#/index?run=run_full_1525`。

> `map.html` / `city.html` / … 这 7 个文件已退化为**跳转壳**（`city.html?city=大同` → `index.html#/city?city=大同`），
> 旧链接与之前发出去的地址仍然可用。

## 目录

```
index.html          ★ 唯一入口（SPA 外壳）
map.html … manual.html   7 个跳转壳（兼容旧链接）
assets/
  app.css  app.js(路由/外壳)  core.js(注册表)  charts.js(自研 SVG 图表，含 teardown)
  page-*.js         各视图渲染函数，WMEG.register(id, fn) 注册
  data.js           ★ 当前轮次数据快照（site_build.py 生成）
runs/<id>/data.js   其他已训练区间的快照（区间下拉用）
data/latest.json    同一份数据的纯 JSON
```

## 重要

- **本目录是生成物**：改版式改 `pipeline/templates/site/`；改数据跑 `python pipeline\site_build.py`。
- 数据以 `<script>` 注入（`window.WMEG_DATA`），**双击 index.html 用 file:// 打开也能完整运行**。
- 无外部依赖（无 CDN、无字体、无构建步骤）；视图切换时会统一 `CH.teardown()` 断开图表观察器。
