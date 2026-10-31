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
export function serializeArtifact(snapshot: Snapshot): string {
  return stringify(
    {
      schema: SCHEMA_VERSION,
      key: snapshot.key,
      tracker: snapshot.tracker,
      status: snapshot.status,
      version: snapshot.version,
      values: snapshot.values,
    },
    { sortMapEntries: true, lineWidth: 0, defaultStringType: 'PLAIN', defaultKeyType: 'PLAIN' },
  );
}

export function repositoryName(organizationKey: string, projectKey: string): string {
  return `athena-history-${organizationKey}-${projectKey}`.toLowerCase();
}
