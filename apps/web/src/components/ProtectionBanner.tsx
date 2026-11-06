import { fr } from '../i18n';

/**
 * Bandeau fixe du niveau de protection de l'instance, en tête de chaque page. Annoncé par les lecteurs d'écran (rôle « note »
 * étiqueté). Jamais rouge : le rouge de la charte est réservé à la cérémonie.
 */
export function ProtectionBanner({ level }: { level: string | undefined }) {
  if (!level) return null;
  return <div className="ath-protection" role="note" aria-label={fr.protection.label}>{level}</div>;
}
