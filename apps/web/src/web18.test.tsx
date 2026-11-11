import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ToastProvider } from '@athena/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Session } from './api';
import { NormativeTemplateEditor, stepProblems, type NTracker, type NormativeTemplateEntry } from './components/NormativeTemplateEditor';
import { ProjectTemplateCard } from './components/ProjectTemplateCard';
import { OrgAdminPage } from './pages/OrgAdminPage';

const sent: Array<{ method: string; url: string; body: unknown }> = [];
let status: unknown;
const srs: NTracker = {
  key: 'SRS', name: 'Exigences logicielles', transitions: [], statuses: [{ key: 'draft', name: 'Brouillon', category: 'todo' }],
  fields: [{ key: 'title', label: 'Titre', type: 'text', required: true }, { key: 'category', label: 'Catégorie logicielle', type: 'select', config: { options: ['A', 'B'] } }, { key: 'statement', label: 'Énoncé', type: 'richtext' }],
};
const spatial: NormativeTemplateEntry = {
  key: 'spatial', name: 'Spatial (ECSS)', description: '', builtin: true, trackers: [srs], version: '1.1', versions: ['1.0', '1.1'], parent: null,
  normative: { standards: [], reviews: [{ key: 'pdr', name: 'PDR' }], phases: [], deliverables: [], rules: [], parameters: [], criticality: { label: 'Catégorie', categories: [{ key: 'A', name: 'Catégorie A' }, { key: 'B', name: 'Catégorie B' }] } },
};

beforeEach(() => {
  sent.length = 0;
  status = null;
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = init.method ?? 'GET';
    if (method !== 'GET') sent.push({ method, url: input, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (/\/template\/upgrade-preview$/.test(input)) return ok({ project: 'SAT', template: 'spatial', from: '1.0', to: '1.1', itemsConcerned: 3, trackers: [{ key: 'SRS', name: 'SRS', action: 'update', items: 3, fieldsAdded: [{ key: 'safety_relevant', label: 'S', type: 'select', required: false }], fieldsRelabeled: [], fieldsKept: [], statusesAdded: [], statusesRenamed: [], statusesRemoved: [], transitionsAdded: [] }], rules: { added: [], updated: [], keptLocal: [], retired: [] }, phases: { added: [], removed: [], current: 'requirements', nextCurrent: 'requirements' }, blockers: [], warnings: [] });
    if (method !== 'GET') return ok({ from: 'requirements', to: 'preliminary-design', version: '1.0' });
    if (/\/projects\/SAT\/template$/.test(input)) return ok(status);
    if (/\/v1\/project-templates$/.test(input)) return ok([spatial]);
    if (/\/v1\/(users|tracker-templates|projects)$/.test(input)) return ok([]);
    return new Response(JSON.stringify({ error: 'not_found', message: 'Introuvable.', details: [] }), { status: 404 });
  }));
});
afterEach(() => vi.unstubAllGlobals());

const pm: Session = { authenticated: true, user: { username: 'p', name: 'Paul', email: null, roles: ['athena-user', 'athena-pm'], groups: [] } };
const admin: Session = { authenticated: true, user: { username: 'a', name: 'Alice', email: null, roles: ['athena-admin', 'athena-user'], groups: [] } };
void pm;

describe('validation par étape de l’éditeur de gabarit', () => {
  const f = (normative = {}) => ({ key: 'spatial-b', name: 'B', trackers: [srs], normative: { standards: [], reviews: [], phases: [], deliverables: [], rules: [], parameters: [], ...normative } });
  it('refuse une clé invalide, une phase sans revue et une règle sur un tracker inconnu', () => {
    expect(stepProblems('parent', { ...f(), key: 'Mauvaise Clé' })).toEqual(['La clé du gabarit est en minuscules, chiffres et tirets (2 à 40 caractères).']);
    expect(stepProblems('parent', f())).toEqual([]);
    expect(stepProblems('phases', f({ phases: [{ key: 'design', name: 'Conception', review: 'cdr', deliverables: [] }] }))).toEqual(['La phase design doit se terminer par une revue déclarée.']);
    expect(stepProblems('rules', f({ rules: [{ key: 'r', name: 'R', fromTracker: 'XXX', linkType: 'verifies', direction: 'any', minCount: 1, statuses: [], threshold: { target: 100 } }] }))).toEqual(['La règle r vise un tracker inconnu.']);
    expect(stepProblems('rules', f({ parameters: [{ key: 'cc', label: 'C', byCategory: { A: 90 } }] }))).toEqual(['Déclarez au moins une catégorie pour renseigner des seuils.']);
    expect(stepProblems('standards', f({ standards: [{ key: 'a', name: 'A', edition: '' }] }))).toEqual(['Chaque norme a une clé, un nom et une édition.']);
  });
});

describe('éditeur par étapes d’un gabarit normatif', () => {
  const open = (onSaved = vi.fn()) => render(<ToastProvider><NormativeTemplateEditor templates={[spatial]} trackerTemplates={[]} initial={{ isNew: true, parent: { key: 'spatial' }, name: '', key: '', description: '', trackers: [] }} onSaved={onSaved} onCancel={() => undefined} /></ToastProvider>);

  it('n’avance qu’une étape valide, montre l’aperçu du formulaire de ticket et envoie parent et seuils', async () => {
    const onSaved = vi.fn();
    open(onSaved);
    expect(screen.getByRole('heading', { name: 'Étape 1 sur 7 : Parent et identité' })).toBeInTheDocument();
    const next = screen.getByRole('button', { name: 'Étape suivante' });
    expect(next).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('La clé du gabarit');
    await userEvent.type(screen.getByLabelText('Clé'), 'spatial-b');
    await userEvent.type(screen.getByLabelText('Nom'), 'Spatial — catégorie B');
    expect(screen.getByLabelText('Parent')).toHaveValue('spatial');
    expect(next).toBeEnabled();
    await userEvent.click(next); // référentiel
    await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' })); // criticité (hérite, rien à saisir)
    await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' })); // trackers
    expect(screen.getByRole('heading', { name: 'Étape 4 sur 7 : Trackers' })).toBeInTheDocument();
    const cell = screen.getByRole('cell', { name: 'SRS' });
    expect(cell.closest('tr')).toHaveTextContent('Hérité');
    const form = screen.getByRole('form', { name: 'Formulaire d’un ticket SRS' });
    expect(within(form).getByLabelText(/Titre/)).toBeDisabled();
    expect(within(form).getByLabelText(/Titre/).closest('div')).toHaveTextContent('obligatoire');
    expect(within(form).getByLabelText('Catégorie logicielle')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' })); // phases
    await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' })); // règles
    expect(screen.getByRole('heading', { name: 'Étape 6 sur 7 : Règles et seuils' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' })); // publication
    await userEvent.type(screen.getByLabelText('Numéro de version (facultatif, ex. 1.0)'), '1.0');
    await userEvent.click(screen.getByRole('button', { name: 'Publier' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual(['POST /v1/project-templates', 'POST /v1/project-templates/spatial-b/publish']);
    expect(sent[0]!.body).toMatchObject({ key: 'spatial-b', name: 'Spatial — catégorie B', parent: { key: 'spatial' } });
    expect(sent[1]!.body).toEqual({ version: '1.0' });
  });

  it('saisit les seuils par catégorie, vides par défaut, et les envoie au gabarit', async () => {
    render(<ToastProvider><NormativeTemplateEditor templates={[spatial]} trackerTemplates={[]} onSaved={() => undefined} onCancel={() => undefined}
      initial={{ isNew: false, key: 'spatial-b', name: 'B', description: '', trackers: [], parent: { key: 'spatial' }, normative: { ...spatial.normative!, criticality: spatial.normative!.criticality!, parameters: [{ key: 'code-coverage', label: 'Couverture de code', byCategory: { A: null, B: null } }] } }} /></ToastProvider>);
    for (let i = 0; i < 5; i++) await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' }));
    const a = screen.getByLabelText('Couverture de code · A');
    expect(a).toHaveValue(null);
    expect(screen.getByText(/aucun seuil n’est imposé par défaut/)).toBeInTheDocument();
    await userEvent.type(a, '90');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer le brouillon' }));
    await waitFor(() => expect(sent.find((s) => s.method === 'PUT')).toBeTruthy());
    expect((sent.find((s) => s.method === 'PUT')!.body as { normative: { parameters: Array<{ byCategory: unknown }> } }).normative.parameters[0]!.byCategory).toEqual({ A: 90, B: null });
  });

  it('ne présente aucune violation d’accessibilité (axe) à l’étape des trackers', async () => {
    const { container } = open();
    await userEvent.type(screen.getByLabelText('Clé'), 'spatial-b');
    await userEvent.type(screen.getByLabelText('Nom'), 'B');
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole('button', { name: 'Étape suivante' }));
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html.slice(0, 90)).join(' | ')}`)).toEqual([]);
  });
});

describe('création de projet depuis un gabarit', () => {
  it('propose la version et la catégorie de criticité du gabarit choisi', async () => {
    render(<ToastProvider><MemoryRouter initialEntries={['/org']}><Routes><Route path="/org" element={<OrgAdminPage session={admin} />} /></Routes></MemoryRouter></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: '+ Nouveau projet' }));
    const select = await screen.findByLabelText(/^Gabarit/);
    expect(screen.queryByLabelText('Version du gabarit')).toBeNull();
    await userEvent.selectOptions(select, 'spatial');
    const version = await screen.findByLabelText('Version du gabarit');
    expect(within(version).getAllByRole('option').map((o) => o.textContent)).toEqual(['Dernière publiée', '1.1', '1.0']);
    await userEvent.selectOptions(version, '1.0');
    await userEvent.selectOptions(screen.getByLabelText('Catégorie de criticité'), 'B');
    await userEvent.type(screen.getByLabelText(/^Clé du projet/), 'SAT');
    await userEvent.type(screen.getByLabelText('Nom du projet'), 'Satellite');
    await userEvent.click(screen.getByRole('button', { name: 'Créer le projet' }));
    await waitFor(() => expect(sent.find((s) => s.url === '/v1/projects')).toBeTruthy());
    expect(sent.find((s) => s.url === '/v1/projects')!.body).toEqual({ key: 'SAT', name: 'Satellite', template: 'spatial', templateVersion: '1.0', criticality: 'B' });
  });
});

describe('carte Gabarit et phase du projet', () => {
  const phase = (met: boolean) => ({ key: 'requirements', name: 'Exigences', review: 'srr', next: 'preliminary-design', canAdvance: met, criteria: [{ label: 'Tous les RID de la revue SRR sont clos', manual: false, met, remaining: met ? 0 : 2 }] });
  const base = { templateKey: 'spatial', version: '1.0', latest: '1.1', upgradable: true, criticality: 'B', phase: 'requirements', drift: { trackersAdded: ['EXTRA'], trackers: [{ key: 'SRS', fieldsAdded: ['owner'], statusesAdded: ['frozen'], transitionsAdded: [] }], total: 3 } };

  it('montre la phase en cours, ses critères non remplis et l’écart au gabarit ; le passage est bloqué', async () => {
    status = { ...base, phaseCheck: phase(false) };
    render(<ToastProvider><ProjectTemplateCard project="SAT" canManage /></ToastProvider>);
    expect(await screen.findByText('Exigences')).toBeInTheDocument();
    expect(screen.getByText('Tous les RID de la revue SRR sont clos')).toBeInTheDocument();
    expect(screen.getByText('Non rempli · 2 restants')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Passer à la phase preliminary-design' })).toBeDisabled();
    expect(screen.getByText('3 ajouts propres au projet')).toBeInTheDocument();
    expect(screen.getByText('Tracker ajouté : EXTRA')).toBeInTheDocument();
    expect(screen.getByText('SRS · champs ajoutés : owner')).toBeInTheDocument();
    expect(screen.getByText('SRS · états ajoutés : frozen')).toBeInTheDocument();
    expect(screen.getByText('La version 1.1 du gabarit est disponible.')).toBeInTheDocument();
  });

  it('passe à la phase suivante quand les critères sont remplis, et ouvre le rapport d’impact de la montée', async () => {
    status = { ...base, phaseCheck: phase(true) };
    render(<ToastProvider><ProjectTemplateCard project="SAT" canManage /></ToastProvider>);
    await userEvent.click(await screen.findByRole('button', { name: 'Passer à la phase preliminary-design' }));
    await waitFor(() => expect(sent.some((s) => /phase\/advance$/.test(s.url))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Aperçu de la montée' }));
    expect(await screen.findByRole('heading', { name: 'Montée de version du gabarit : 1.0 → 1.1' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Appliquer la montée' }));
    await waitFor(() => expect(sent.some((s) => /template\/upgrade$/.test(s.url))).toBe(true));
  });

  it('n’offre ni passage de phase ni montée à un simple lecteur, et reste absente sans gabarit', async () => {
    status = { ...base, phaseCheck: phase(true) };
    const { container } = render(<ToastProvider><ProjectTemplateCard project="SAT" canManage={false} /></ToastProvider>);
    await screen.findByText('Exigences');
    expect(screen.queryByRole('button', { name: /Passer à la phase|Aperçu de la montée/ })).toBeNull();
    const results = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  it('est absente pour un projet sans gabarit', async () => {
    status = { templateKey: null };
    render(<ToastProvider><ProjectTemplateCard project="SAT" canManage /></ToastProvider>);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText('Gabarit et phase')).toBeNull();
  });
});
