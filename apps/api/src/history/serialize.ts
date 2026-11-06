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
export function serializeArtifact(snapshot: Snapshot, aliases: string[] = []): string {
  return stringify(
    {
      schema: SCHEMA_VERSION,
      key: snapshot.key,
      ...(aliases.length > 0 ? { aliases: [...aliases].sort() } : {}),
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
