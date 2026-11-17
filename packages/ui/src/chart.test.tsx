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
});
