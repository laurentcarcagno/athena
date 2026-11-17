import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { setFeatures, useFeature } from './lib/features';

/** Interrupteurs de fonctionnalité (lot 17, T-0186) : actifs tant qu'ils sont inconnus, puis selon l'organisation. */
function Probe() {
  return <p>{useFeature('ppm.portfolios') ? 'actif' : 'inactif'} · {useFeature('ppm.capacity') ? 'capacité' : 'sans capacité'}</p>;
}
const view = () => render(<MemoryRouter initialEntries={['/']}><Routes><Route path="/" element={<Probe />} /></Routes></MemoryRouter>);

afterEach(() => act(() => setFeatures(null)));

describe('interrupteurs de fonctionnalité', () => {
  it('une fonctionnalité inconnue de l’interface est active (on n’efface rien sur une simple attente)', () => {
    view();
    expect(screen.getByText('actif · capacité')).toBeInTheDocument();
  });
  it('suit la valeur de l’organisation, et se met à jour sans rechargement', () => {
    view();
    act(() => setFeatures({ 'ppm.portfolios': false, 'ppm.capacity': false }));
    expect(screen.getByText('inactif · sans capacité')).toBeInTheDocument();
    act(() => setFeatures({ 'ppm.portfolios': true, 'ppm.capacity': false }));
    expect(screen.getByText('actif · sans capacité')).toBeInTheDocument();
  });
});
