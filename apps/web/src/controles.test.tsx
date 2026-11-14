import { render, screen } from '@testing-library/react';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { Field } from './api';
import { canWrite, FieldEditor } from './pages/ArtifactPage';

/** T-0133 : contrôles de la charte partout ; champ non modifiable affiché en lecture seule avec sa raison. */
const walk = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const field = (writeRoles: string[] | null): Field => ({ id: 'f', key: 'severity', label: 'Sévérité', type: 'select', config: { options: ['mineure', 'bloquante'] }, required: true, semanticRole: null, writeRoles });

describe('contrôles de formulaire (T-0133)', () => {
  it('aucun select, textarea ni case à cocher nus dans l’application', () => {
    const offenders = walk(join(process.cwd(), 'src'))
      .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
      .flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/<select\b|<textarea\b|<input\b[^>]*type="checkbox"/g)].map((m) => `${f} : ${m[0]}`));
    expect(offenders).toEqual([]);
  });

  it('même règle d’écriture que le serveur : sans restriction, administrateur, ou rôle cité', () => {
    expect(canWrite(field(null), ['athena-team-member'])).toBe(true);
    expect(canWrite(field(['athena-pm']), ['athena-pm'])).toBe(true);
    expect(canWrite(field(['athena-pm']), ['athena-admin'])).toBe(true);
    expect(canWrite(field(['athena-pm']), ['athena-team-member'])).toBe(false);
  });

  it('un champ que l’utilisateur ne peut pas modifier est en lecture seule, avec la raison', () => {
    const commit = vi.fn();
    render(<FieldEditor field={field(['athena-pm'])} value="bloquante" roles={['athena-team-member']} onCommit={commit} />);
    const input = screen.getByLabelText(/Sévérité/);
    expect(input).toHaveValue('bloquante');
    expect(input).toHaveAttribute('readonly');
    expect(input).toHaveAccessibleDescription('Lecture seule : modifiable par athena-pm.');
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('le même champ reste modifiable pour un rôle autorisé', () => {
    render(<FieldEditor field={field(['athena-pm'])} value="bloquante" roles={['athena-pm']} onCommit={vi.fn()} />);
    expect(screen.getByRole('combobox', { name: /Sévérité/ })).toHaveClass('ath-select');
  });
});

describe('sous-navigation et boutons-icônes (T-0134)', () => {
  const read = (f: string) => readFileSync(join(process.cwd(), 'src', f), 'utf8');
  it('vues du tracker, rapports et paramètres : des onglets-liens, plus de filtres utilisés comme navigation', () => {
    for (const f of ['pages/tracker/TrackerScreen.tsx', 'pages/ReportsPage.tsx', 'pages/SettingsPage.tsx']) {
      expect(read(f)).toContain('<TabLinks');
      expect(read(f)).not.toContain('ath-chip');
    }
  });
  it('les boutons-icônes du rail sont en ton inverse', () => {
    expect(read('App.tsx').match(/className="ath-iconbtn(?! ath-iconbtn--inverse)/g) ?? []).toEqual([]);
    expect(read('components/ThemeToggle.tsx')).toContain('ath-iconbtn--inverse');
  });
});
