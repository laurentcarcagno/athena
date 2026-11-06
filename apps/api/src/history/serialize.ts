import { stringify } from 'yaml';
import type { Snapshot } from '../core/artifact.service';

export const SCHEMA_VERSION = 1;

/** Chemin du fichier d'un artefact dans le dépôt d'historique (plan § 4.1). */
export function artifactPath(snapshot: Pick<Snapshot, 'key' | 'tracker'>): string {
  return `trackers/${snapshot.tracker}/artifacts/${snapshot.key}.yaml`;
}

/**
 * YAML déterministe : clés triées, pas de repli de ligne. Deux sérialisations du même état
 * sont identiques octet pour octet, ce qui évite les commits sans changement réel.
 */
export function serializeArtifact(snapshot: Snapshot, aliases: string[] = [], marking: { exportControl?: string | null; masked?: boolean } = {}): string {
  return stringify(
    {
      schema: SCHEMA_VERSION,
      key: snapshot.key,
      ...(aliases.length > 0 ? { aliases: [...aliases].sort() } : {}),
      tracker: snapshot.tracker,
      status: snapshot.status,
      version: snapshot.version,
      // Contrôle export : le marquage suit l'item (une reconstruction le rétablit) ; `masked` signale des valeurs absentes faute de chiffrement.
      ...(marking.exportControl ? { exportControl: marking.exportControl } : {}),
      ...(marking.masked ? { masked: true } : {}),
      values: snapshot.values,
    },
    { sortMapEntries: true, lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' },
  );
}

export function repositoryName(organizationKey: string, projectKey: string): string {
  return `athena-history-${organizationKey}-${projectKey}`.toLowerCase();
}

export interface TrackerYaml {
  layout?: unknown;
  type?: string;
  key: string;
  name: string;
  schemaVersion: number;
  fields: Array<{ key: string; label: string; type: string; config: unknown; required: boolean; isContent?: boolean; semanticRole: string | null; readRoles?: string[] | null; writeRoles?: string[] | null }>;
  statuses: Array<{ key: string; name: string; category: string }>;
  transitions: Array<{ name: string; from: string | null; to: string; conditions: unknown; validators: unknown; postActions: unknown }>;
}

export const trackerPath = (key: string): string => `trackers/${key}/tracker.yaml`;

/** Définition d'un tracker en YAML déterministe (plan § 4.1 : `tracker.yaml`). */
export function serializeTracker(def: TrackerYaml): string {
  return stringify({ schema: SCHEMA_VERSION, ...def }, { sortMapEntries: true, lineWidth: 0 });
}

/**
 * Valeurs d'un item telles qu'elles sont écrites dans Git. Champs confidentiels chiffrés (OpenBao) ; un item sous contrôle export
 * l'est en entier : Git ne contient alors ni titre ni contenu en clair. Sans OpenBao, ses valeurs sont retirées (`masked`).
 * Les versions déjà committées avant le marquage restent dans l'historique Git (immuable) : le marquage vaut pour la suite.
 */
export async function valuesForGit(
  confidential: { protect(org: string, values: Record<string, unknown>, fields: string[]): Promise<Record<string, unknown>> } | undefined,
  orgKey: string, values: Record<string, unknown>, confidentialFields: string[], exportControl: string | null | undefined,
): Promise<{ values: Record<string, unknown>; masked: boolean }> {
  if (exportControl) {
    if (confidential) return { values: await confidential.protect(orgKey, values, Object.keys(values)), masked: false };
    return { values: {}, masked: true };
  }
  return { values: confidential ? await confidential.protect(orgKey, values, confidentialFields) : values, masked: false };
}
