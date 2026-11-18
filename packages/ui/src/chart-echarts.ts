/** Module chargé à la demande (import dynamique) : ECharts à la carte, rendu SVG seulement (T-0188). */
import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { BarChart, LineChart, HeatmapChart, ScatterChart, RadarChart, TreemapChart, SankeyChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent, LegendComponent, MarkLineComponent, DatasetComponent, RadarComponent } from 'echarts/components';

echarts.use([SVGRenderer, BarChart, LineChart, HeatmapChart, ScatterChart, RadarChart, TreemapChart, SankeyChart, GridComponent, TooltipComponent, AriaComponent, LegendComponent, MarkLineComponent, DatasetComponent, RadarComponent]);
export { echarts };
