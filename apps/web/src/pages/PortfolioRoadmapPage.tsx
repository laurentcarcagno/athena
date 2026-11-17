import { Link, useParams } from 'react-router-dom';
import { PageHeader } from '@athena/ui';
import { RoadmapView } from '../components/RoadmapView';
import { fr } from '../i18n';

/** `/portefeuilles/:clé/roadmap` : la roadmap consolidée du portefeuille (lecture seule : les dates se modifient dans chaque projet). */
export function PortfolioRoadmapPage() {
  const { key = '' } = useParams();
  return (
    <>
      <PageHeader title={`${fr.pfRoadmap.title} · ${key}`} actions={<Link className="ath-link" to={`/portefeuilles/${key}`}>{fr.steer.back}</Link>} />
      <RoadmapView portfolio={key} />
    </>
  );
}
