import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { LayoutEditor } from './components/LayoutEditor';
import { setLocale } from './i18n';
import type { FieldLite, Layout } from './lib/layout';
import { ArtifactPage } from './pages/ArtifactPage';

const fields: FieldLite[] = [
  { key: 'title', label: 'Titre', type: 'text', semanticRole: 'title' },
  { key: 'severity', label: 'Sévérité', type: 'select' },
  { key: 'assignee', label: 'Responsable', type: 'user' },
  { key: 'description', label: 'Description', type: 'richtext' },
];

function Harness({ initial = null }: { initial?: Layout | null }) {
  const [value, setValue] = useState<Layout | null>(initial);
  return <><LayoutEditor fields={fields} value={value} onChange={setValue} /><output data-testid="value">{JSON.stringify(value)}</output></>;
}
const current = () => JSON.parse(screen.getByTestId('value').textContent!) as Layout | null;
const keys = (l: Layout | null) => l!.sections.map((s) => s.fields.map((f) => f.key));

afterEach(() => setLocale('fr'));

describe('éditeur de disposition', () => {
  it('affiche d’abord la disposition automatique, sans contrôle d’édition, et propose de personnaliser', async () => {
    render(<Harness />);
    expect(screen.getByText(/Disposition automatique/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Reculer/ })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Détails' })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Personnaliser' }));
    expect(keys(current())).toEqual([['title', 'severity', 'assignee'], ['description']]);
    expect(screen.getByText(/Disposition personnalisée/)).toBeInTheDocument();
  });

  it('change la largeur, avance et recule un attribut, au clavier comme à la souris', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Personnaliser' }));
    await user.click(screen.getByRole('button', { name: 'Sévérité : 3 colonnes sur 3' }));
    expect(current()!.sections[0]!.fields.find((f) => f.key === 'severity')!.span).toBe(3);
    expect(screen.getByRole('button', { name: 'Sévérité : 3 colonnes sur 3' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Reculer Sévérité' }));
    expect(keys(current())[0]).toEqual(['severity', 'title', 'assignee']);
    screen.getByRole('button', { name: 'Avancer Titre' }).focus();
    await user.keyboard('{Enter}');
    expect(keys(current())[0]).toEqual(['severity', 'assignee', 'title']);
  });

  it('ajoute une section titrée, y déplace un attribut avec la liste, puis retire un attribut', async () => {
    render(<Harness />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Personnaliser' }));
    await user.click(screen.getByRole('button', { name: 'Ajouter une section' }));
    await user.type(screen.getByLabelText('Titre de la section 3'), 'Suivi');
    await user.selectOptions(screen.getByLabelText('Déplacer vers la section : Responsable'), '2');
    expect(keys(current())).toEqual([['title', 'severity'], ['description'], ['assignee']]);
    expect(current()!.sections[2]!.title).toBe('Suivi');
    await user.click(screen.getByRole('button', { name: 'Retirer Sévérité' }));
    expect(keys(current())).toEqual([['title'], ['description'], ['assignee']]);
    const rest = screen.getByRole('group', { name: 'Attributs non placés' });
    expect(within(rest).getByText('Sévérité')).toBeInTheDocument();
    await user.click(within(rest).getByRole('button', { name: 'Placer Sévérité' }));
    expect(keys(current())[2]).toEqual(['assignee', 'severity']);
    expect(screen.getByText('Tous les attributs sont placés.')).toBeInTheDocument();
  });

  it('revient à la disposition automatique', async () => {
    render(<Harness initial={{ sections: [{ title: 'A', fields: [{ key: 'title', span: 1 }] }] }} />);
    expect(screen.getByRole('group', { name: 'Attributs non placés' })).toHaveTextContent('Sévérité');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Revenir à l’automatique' }));
    expect(current()).toBeNull();
  });
});

describe('fiche artefact : disposition enregistrée', () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    const def = {
      key: 'BUG', name: 'Bugs', historyMode: 'direct',
      layout: { sections: [{ title: 'Résumé', fields: [{ key: 'title', span: 3 }, { key: 'severity', span: 1 }] }, { title: '', fields: [{ key: 'description', span: 2 }] }] },
      fields: fields.map((f) => ({ id: f.key, key: f.key, label: f.label, type: f.type, config: f.type === 'select' ? { options: ['a'] } : {}, required: f.key === 'title', semanticRole: f.semanticRole ?? null })),
      statuses: [{ id: 's1', key: 'open', name: 'Ouvert', category: 'todo' }], transitions: [],
    };
    const art = { id: 'a', key: 'BUG-1', trackerKey: 'BUG', status: 'open', version: 1, values: { title: 'Crash' } };
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      calls.push(url);
      const body = url.endsWith('/artifacts/BUG-1') ? art : url.endsWith('/trackers/BUG') ? def : [];
      return new Response(JSON.stringify(body), { status: 200 });
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('range les attributs en sections et en colonnes, et ajoute à la suite celui qui n’est pas placé', async () => {
    const session: Session = { authenticated: true, user: { username: 'u', name: 'U', email: null, roles: ['athena-user'], groups: [] } };
    render(<ToastProvider><MemoryRouter initialEntries={['/p/ARI/a/BUG-1']}><Routes><Route path="/p/:project/a/:key" element={<ArtifactPage session={session} />} /></Routes></MemoryRouter></ToastProvider>);
    const resume = await screen.findByRole('region', { name: 'Résumé' });
    expect(within(resume).getByRole('heading', { name: 'Résumé' })).toBeInTheDocument();
    const wrapperOf = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)).closest('[class*="ath-span-"]')!;
    expect(wrapperOf('Titre')).toHaveClass('ath-span-3');
    expect(wrapperOf('Sévérité')).toHaveClass('ath-span-1');
    expect(wrapperOf('Description')).toHaveClass('ath-span-2');
    expect(wrapperOf('Responsable')).toHaveClass('ath-span-1'); // non placé : ajouté à la suite, largeur par défaut
    expect(within(resume).queryByLabelText('Description')).toBeNull();
  });
});
