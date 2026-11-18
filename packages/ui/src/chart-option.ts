/** Option ECharts d'un graphique en barres ou en courbes, calculée sans ECharts (testable), à partir de jetons déjà lus. */
export interface ChartSeries { name: string; data: number[] }
export interface ChartTokens {
  /** `--ath-data-1` à `--ath-data-8`. */
  data: string[]; text: string; textMute: string; border: string; surface: string; fontFamily: string;
}
/**
 * `scatter` : nuage de points. Chaque catégorie est un point libellé ; la première série donne les abscisses, la seconde les ordonnées ; `reference` trace des repères
 * (par exemple CPI = 1 et SPI = 1). La vue tableau reste la même : un point par ligne, une colonne par série.
 */
export interface ChartInput {
  type: 'bar' | 'line' | 'scatter' | 'radar' | 'treemap' | 'sankey'; categories: string[]; series: ChartSeries[]; title: string; unit?: string; reference?: { x?: number; y?: number };
  /** `sankey` : flux entre les catégories (nœuds) ; la première série donne le total sortant de chaque nœud pour la vue tableau. */
  links?: Array<{ source: string; target: string; value: number }>;
}

export const CHART_TOKEN_NAMES = {
  data: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `--ath-data-${n}`),
  text: '--ath-text-default', textMute: '--ath-text-secondary', border: '--ath-border-default', surface: '--ath-surface-raised', fontFamily: '--ath-font-family-sans',
} as const;

/** Lit les jetons sémantiques sur un élément (le thème et le mode courants s'y résolvent). */
export function readChartTokens(el: Element): ChartTokens {
  const style = getComputedStyle(el);
  const get = (name: string) => style.getPropertyValue(name).trim();
  return {
    data: CHART_TOKEN_NAMES.data.map(get), text: get(CHART_TOKEN_NAMES.text), textMute: get(CHART_TOKEN_NAMES.textMute),
    border: get(CHART_TOKEN_NAMES.border), surface: get(CHART_TOKEN_NAMES.surface), fontFamily: get(CHART_TOKEN_NAMES.fontFamily) || 'sans-serif',
  };
}

export function buildChartOption(input: ChartInput, t: ChartTokens): Record<string, unknown> {
  const base = { color: t.data, textStyle: { color: t.text, fontFamily: t.fontFamily }, animation: false, aria: { enabled: true, label: { description: input.title }, decal: { show: true } } };
  const tooltip = { trigger: 'item', renderMode: 'richText', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.text } };
  if (input.type === 'radar') {
    // un axe par catégorie, une surface par série ; l'échelle va jusqu'au maximum des données
    const max = Math.max(1, ...input.series.flatMap((s) => s.data));
    return { ...base, tooltip, legend: input.series.length > 1 ? { top: 0, textStyle: { color: t.text } } : undefined, radar: { indicator: input.categories.map((name) => ({ name, max })), axisName: { color: t.text }, splitLine: { lineStyle: { color: t.border } }, axisLine: { lineStyle: { color: t.border } } },
      series: [{ type: 'radar', areaStyle: { opacity: 0.15 }, data: input.series.map((s) => ({ name: s.name, value: s.data })) }] };
  }
  if (input.type === 'treemap') {
    const values = input.series[0]?.data ?? [];
    return { ...base, tooltip, series: [{ type: 'treemap', roam: false, breadcrumb: { show: false }, label: { show: true, formatter: '{b}', color: t.text }, itemStyle: { borderColor: t.surface }, data: input.categories.map((name, i) => ({ name, value: values[i] ?? 0 })) }] };
  }
  if (input.type === 'sankey') {
    return { ...base, tooltip, series: [{ type: 'sankey', emphasis: { focus: 'adjacency' }, label: { color: t.text }, lineStyle: { color: 'source', opacity: 0.4 }, data: input.categories.map((name) => ({ name })), links: input.links ?? [] }] };
  }
  if (input.type === 'scatter') {
    const [x, y] = [input.series[0], input.series[1]];
    const lines = [...(input.reference?.x !== undefined ? [{ xAxis: input.reference.x }] : []), ...(input.reference?.y !== undefined ? [{ yAxis: input.reference.y }] : [])];
    return {
      color: t.data, textStyle: { color: t.text, fontFamily: t.fontFamily }, animation: false,
      aria: { enabled: true, label: { description: input.title }, decal: { show: true } },
      tooltip: { trigger: 'item', renderMode: 'richText', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.text } },
      grid: { left: 8, right: 24, top: 24, bottom: 8, containLabel: true },
      xAxis: { type: 'value', name: x?.name, nameTextStyle: { color: t.textMute }, scale: true, splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.textMute } },
      yAxis: { type: 'value', name: y?.name, nameTextStyle: { color: t.textMute }, scale: true, splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.textMute } },
      series: [{
        type: 'scatter', symbolSize: 12, label: { show: true, formatter: '{b}', position: 'right', color: t.text },
        data: input.categories.map((name, i) => ({ name, value: [x?.data[i] ?? 0, y?.data[i] ?? 0] })),
        ...(lines.length ? { markLine: { silent: true, symbol: 'none', lineStyle: { color: t.textMute, type: 'dashed' }, label: { color: t.textMute }, data: lines } } : {}),
      }],
    };
  }
  const multi = input.series.length > 1;
  return {
    color: t.data,
    textStyle: { color: t.text, fontFamily: t.fontFamily },
    animation: false,
    aria: { enabled: true, label: { description: input.title }, decal: { show: true } },
    // Infobulle dessinée dans le SVG : l'infobulle HTML écrit des styles en ligne que la CSP refuse (T-0188).
    tooltip: { trigger: 'axis', renderMode: 'richText', backgroundColor: t.surface, borderColor: t.border, textStyle: { color: t.text } },
    legend: multi ? { top: 0, textStyle: { color: t.text } } : undefined,
    grid: { left: 8, right: 16, top: multi ? 32 : 16, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: input.categories, axisLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.textMute } },
    yAxis: { type: 'value', name: input.unit, nameTextStyle: { color: t.textMute }, splitLine: { lineStyle: { color: t.border } }, axisLabel: { color: t.textMute } },
    series: input.series.map((s) => ({ name: s.name, type: input.type, data: s.data, ...(input.type === 'line' ? { symbolSize: 6 } : {}) })),
  };
}
