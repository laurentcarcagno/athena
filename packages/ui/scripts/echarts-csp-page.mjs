import { echarts } from './echarts-entry.mjs';
const el = document.getElementById('c');
const chart = echarts.init(el, null, { renderer: 'svg', width: 480, height: 300 });
chart.setOption({
  aria: { enabled: true, decal: { show: true } },
  tooltip: { trigger: 'axis', renderMode: 'richText' },
  legend: { data: ['A', 'B'] },
  xAxis: { type: 'category', data: ['L', 'M', 'M', 'J'] },
  yAxis: { type: 'value' },
  series: [
    { name: 'A', type: 'bar', data: [3, 5, 2, 6], markLine: { data: [{ type: 'average' }] } },
    { name: 'B', type: 'line', data: [1, 4, 3, 5] },
  ],
});
window.__ready = true;
