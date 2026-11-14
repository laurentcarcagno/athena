import type { Meta, StoryObj } from '@storybook/react';
import { Btn, Card, EmptyState, FilterChip, StatCard, StatusPill, Tag } from '../src/components';

const meta: Meta = { title: 'Athena/Composants' };
export default meta;
type Story = StoryObj;

export const Boutons: Story = {
  render: () => (
    <div className="ath-row">
      <Btn>Action</Btn><Btn variant="deep">Secondaire</Btn><Btn variant="ghost">Discret</Btn><Btn variant="danger">Cérémonie</Btn><Btn disabled>Indisponible</Btn>
    </div>
  ),
};

export const Pastilles: Story = {
  render: () => (
    <div className="ath-row">
      <StatusPill>Par défaut</StatusPill><StatusPill kind="info">À faire</StatusPill><StatusPill kind="warning">En cours</StatusPill>
      <StatusPill kind="success">Terminé</StatusPill><StatusPill kind="danger">Bloqué</StatusPill>
    </div>
  ),
};

export const Etiquettes: Story = {
  render: () => <div className="ath-row"><Tag>défaut</Tag><Tag variant="solid">plein</Tag><Tag variant="accent">accent</Tag><Tag variant="ghost">discret</Tag></div>,
};

export const Filtre: Story = { render: () => <FilterChip label="ATQL" value="status = open" active onClear={() => undefined} /> };

export const Carte: Story = {
  render: () => <Card title="Détails" meta="v3"><p>Contenu de la carte, angles droits, aucune ombre.</p></Card>,
};

export const Indicateur: Story = { render: () => <StatCard label="Ouverts" value={12} delta="30 total" /> };

export const EtatVide: Story = { render: () => <EmptyState eyebrow="Aucun résultat" title="Aucun artefact ne correspond à la requête." action={<Btn variant="ghost">Réinitialiser</Btn>} /> };
