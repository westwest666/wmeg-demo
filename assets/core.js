/* 引导层：必须在页面模块之前加载 */
window.WMEG = window.WMEG || {};
WMEG.pages = WMEG.pages || {};
WMEG.register = function (id, fn) { WMEG.pages[id] = fn; };
WMEG.runs = window.WMEG_RUNS = window.WMEG_RUNS || {};
/* 分段底纹区间（0=训练 1=验证 2=测试） */
WMEG.splitRanges = function (D) {
  const out = [];
  const fills = { 0: "#F3F7FA", 1: "#FFF7E8", 2: "#E9F6F4" };
  let cur = D.split[0], start = 0;
  for (let i = 1; i <= D.split.length; i++) {
    if (i === D.split.length || D.split[i] !== cur) {
      if (cur >= 0) out.push({ a0: start, a1: i - 1, fill: fills[cur] });
      start = i; cur = D.split[i];
    }
  }
  return out;
};
