import { useEffect, useRef } from 'react';
import type { Session } from '../api';
import { fr } from '../i18n';
import { ArtifactView } from '../pages/ArtifactPage';

/** Panneau de détail à droite de la liste : la fiche de l'item sans quitter le tableau. Le focus y entre à l'ouverture. */
export function DetailPanel({ session, project, itemKey, onExpand, onClose, onCanonicalKey }: {
  session: Session; project: string; itemKey: string; onExpand: () => void; onClose: () => void; onCanonicalKey: (key: string) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    // Le focus entre dans le panneau à l'ouverture seulement : J / K gardent le focus où il est.
    if (!opened.current) { opened.current = true; ref.current?.focus(); }
  }, []);
  return (
    <aside ref={ref} className="ath-split__panel" aria-label={fr.detail.panel} tabIndex={-1}>
      <ArtifactView session={session} project={project} itemKey={itemKey} embedded onExpand={onExpand} onClose={onClose} onCanonicalKey={onCanonicalKey} />
    </aside>
  );
}
