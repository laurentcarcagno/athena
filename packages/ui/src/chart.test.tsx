import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Chart } from './chart.js';
import { buildChartOption, type ChartTokens } from './chart-option.js';

const tokens: ChartTokens = { data: ['#1', '#2', '#3', '#4', '#5', '#6', '#7', '#8'], text: '#t', textMute: '#m', border: '#b', surface: '#s', fontFamily: 'F' };
const input = { type: 'bar' as const, title: 'Tickets par statut', categories: ['À faire', 'En cours'], series: [{ name: 'Tickets', data: [4, 2] }] };

describe('Chart (T-0189)', () => {
  it('option : palette des jetons, aria et motifs actifs, infobulle dans le SVG, jamais de couleur littérale', () => {
    const o = buildChartOption(input, tokens) as any;
    expect(o.color).toEqual(tokens.data);
    expect(o.aria).toMatchObject({ enabled: true, decal: { show: true } });
    expect(o.tooltip.renderMode).toBe('richText');
    expect(o.animation).toBe(false);
    expect(o.legend).toBeUndefined();
    expect(buildChartOption({ ...input, series: [...input.series, { name: 'B', data: [1, 1] }] }, tokens)).toHaveProperty('legend.top', 0);
    expect(JSON.stringify(o)).not.toMatch(/#[0-9a-f]{3,6}\b(?<!#[1-8t mbs])/i);
  });

  it('la vue tableau offre les mêmes données, avec un lien vers chaque objet source', async () => {
    render(<Chart {...input} hrefFor={(c) => `/p/X?statut=${encodeURIComponent(c)}`} />);
    const toggle = screen.getByRole('button', { name: 'Tableau' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('link', { name: 'En cours' })).toHaveAttribute('href', '/p/X?statut=En%20cours');
    expect(screen.getByRole('cell', { name: '4' })).toBeInTheDocument();
  });

  it('nuage de points : un point libellé par catégorie, abscisse et ordonnée des deux séries, repères pointillés', () => {
    const o = buildChartOption({ type: 'scatter', title: 'CPI et SPI', categories: ['ARI', 'LUM'], series: [{ name: 'CPI', data: [1.2, 0.8] }, { name: 'SPI', data: [1, 0.7] }], reference: { x: 1, y: 1 } }, tokens) as any;
    expect(o.series[0].type).toBe('scatter');
    expect(o.series[0].data).toEqual([{ name: 'ARI', value: [1.2, 1] }, { name: 'LUM', value: [0.8, 0.7] }]);
    expect(o.series[0].label.show).toBe(true); // chaque point porte son libellé
    expect(o.series[0].markLine.data).toEqual([{ xAxis: 1 }, { yAxis: 1 }]);
    expect(o.xAxis.name).toBe('CPI');
    expect(o.yAxis.name).toBe('SPI');
  });

  it('radar, treemap et sankey : options construites depuis les mêmes catégories et séries, couleurs de la palette', () => {
    const radar = buildChartOption({ type: 'radar', title: 'Critères', categories: ['Valeur', 'Coût', 'Risque'], series: [{ name: 'A', data: [8, 4, 2] }, { name: 'B', data: [3, 9, 5] }] }, tokens) as any;
    expect(radar.radar.indicator).toEqual([{ name: 'Valeur', max: 9 }, { name: 'Coût', max: 9 }, { name: 'Risque', max: 9 }]);
    expect(radar.series[0].data).toEqual([{ name: 'A', value: [8, 4, 2] }, { name: 'B', value: [3, 9, 5] }]);
    expect(radar.color).toEqual(tokens.data);
    const tree = buildChartOption({ type: 'treemap', title: 'Budget', categories: ['Logiciel', 'Prestations'], series: [{ name: 'k€', data: [60, 40] }] }, tokens) as any;
    expect(tree.series[0].data).toEqual([{ name: 'Logiciel', value: 60 }, { name: 'Prestations', value: 40 }]);
    const flow = buildChartOption({ type: 'sankey', title: 'Flux', categories: ['Objectif', 'Projet A'], series: [{ name: 'Sortant', data: [10, 0] }], links: [{ source: 'Objectif', target: 'Projet A', value: 10 }] }, tokens) as any;
    expect(flow.series[0].links).toEqual([{ source: 'Objectif', target: 'Projet A', value: 10 }]);
    expect(flow.series[0].data).toEqual([{ name: 'Objectif' }, { name: 'Projet A' }]);
  });
});
