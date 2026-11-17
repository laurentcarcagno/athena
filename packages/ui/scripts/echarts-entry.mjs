import * as echarts from 'echarts/core';
import { SVGRenderer } from 'echarts/renderers';
import { BarChart, LineChart, HeatmapChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, AriaComponent, LegendComponent, MarkLineComponent, DatasetComponent } from 'echarts/components';
echarts.use([SVGRenderer, BarChart, LineChart, HeatmapChart, GridComponent, TooltipComponent, AriaComponent, LegendComponent, MarkLineComponent, DatasetComponent]);
export { echarts };
