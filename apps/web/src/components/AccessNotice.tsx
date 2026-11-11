import { Link } from 'react-router-dom';
import { EmptyState } from '@athena/ui';
import { fr } from '../i18n';

/**
 * Page ou section inaccessible (ADR-0005 § 2.1, T-0144) : dit ce qui manque, qui peut agir et comment revenir.
 * Remplace les messages d'erreur seuls et les bascules silencieuses vers une autre page.
 */
export function AccessNotice({ title, help, back }: { title: string; help: string; back: { to: string; label: string } }) {
  return (
    <div>
      <EmptyState eyebrow={fr.denied.eyebrow} title={title}
        action={<div className="ath-stack"><p>{help}</p><div><Link className="ath-btn ath-btn--ghost" to={back.to}>{back.label}</Link></div></div>} />
    </div>
  );
}

/** Rôles requis, en clair : « aux administrateurs », « aux administrateurs et aux chefs de projet »… */
export function whoOf(roles: readonly string[]): string {
  const names = roles.map((r) => fr.denied.roles[r] ?? r);
  return names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} ${fr.denied.and} ${names[names.length - 1]}`;
}
