import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// @ts-expect-error module JS sans types
import { lintSource } from '../scripts/lint-design.mjs';

/** T-0139 : palette de données des graphiques, surface des couches flottantes, page de connexion générée. */
const read = (path: string) => readFileSync(join(__dirname, path), 'utf8');
const styles = ['styles/views.css', 'styles/tickets.css', 'styles/mobile-charts.css', 'styles/containers.css', 'styles/shell.css', 'styles/topbar.css'].map(read).join('\n');
const rule = (selector: string) => new RegExp(`${selector.replace(/[.[\]]/g, (c) => `\\${c}`)} \\{([^}]*)\\}`).exec(styles)?.[1] ?? '';
const login = join(__dirname, '..', '..', '..', 'deploy', 'dev', 'keycloak', 'themes', 'athena', 'login', 'resources', 'css');

describe('graphiques et couches flottantes (T-0139)', () => {
  it('chaque série de graphique prend une couleur de la palette de données, jamais l’action ni un signal', () => {
    const series = ['.ath-bar__fill', '.ath-gantt__fill', '.ath-stackbar__seg--todo', '.ath-stackbar__seg--in_progress', '.ath-stackbar__seg--done', '.ath-burndown__remaining', '.ath-burndown__dot'];
    for (const selector of series) {
      const body = rule(selector);
      expect(body, selector).toMatch(/var\(--ath-data-\d\)/);
      expect(body, selector).not.toMatch(/--ath-(action|state|border-focus|text-link)/);
    }
    // Les trois catégories de la barre empilée se distinguent.
    expect(new Set(['todo', 'in_progress', 'done'].map((c) => /--ath-data-\d/.exec(rule(`.ath-stackbar__seg--${c}`))?.[0])).size).toBe(3);
  });

  it('menus, panneaux et modale reposent sur la surface flottante', () => {
    for (const selector of ['.ath-modal', '.ath-breadcrumb__menu', '.ath-suggest__list', '.ath-notify__panel', '.ath-mention-input__list']) {
      expect(rule(selector), selector).toContain('var(--ath-surface-raised)');
    }
  });

  it('page de connexion : règles sur jetons seulement (lint), feuille générée avec les jetons clair et sombre', () => {
    const source = readFileSync(join(login, 'login.source.css'), 'utf8');
    expect(lintSource(source, 'login.source.css')).toEqual([]);
    const css = readFileSync(join(login, 'login.css'), 'utf8');
    expect(css).toMatch(/^\/\* Généré par packages\/ui\/scripts\/build-login\.mjs/);
    expect(css).toContain(':root:not([data-theme]) {');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain(source.trim().split('\n').at(-1));
  });
});
