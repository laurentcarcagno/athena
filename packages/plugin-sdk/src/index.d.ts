export type Permission = 'storage' | 'artifacts:read';

export interface AthenaApi {
  log(...messages: unknown[]): void;
  /** Requiert la permission `storage`. Quotas : 100 clés, 64 Ko par valeur, 1 Mo au total. */
  storage: {
    get(key: string): Promise<unknown>;
    set(key: string, value: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  /** Requiert la permission `artifacts:read`. Clé de la forme `PROJET/CLÉ`. */
  artifacts: { get(ref: string): Promise<unknown> };
}

export interface FieldTypeDefinition {
  /** Retourne `null` si la valeur est valide, sinon un message d'erreur sobre. */
  validate(value: unknown, config: Record<string, unknown>): string | null | Promise<string | null>;
}

export type HookEvent = 'artifact.created' | 'artifact.updated' | 'artifact.transitioned';

export interface HookPayload {
  type: HookEvent;
  key: string;
  project: string;
  version: number;
  actor: string;
  /** Noms des champs modifiés (les valeurs ne sont jamais transmises : champs confidentiels). */
  changedFields: string[];
}

/** Contexte d'une action : jamais de valeurs de champ. */
export interface ActionContext { key?: string; version?: number; actor: string }

export interface PluginDefinition {
  /** Actions de workflow appelables à la demande ; le résultat JSON est borné à 100 Ko. */
  actions?: Record<string, (context: ActionContext) => unknown | Promise<unknown>>;
  /** Widgets de tableau de bord : renvoient un modèle de données (jamais de HTML). */
  widgets?: Record<string, (context: { project: string }) => unknown | Promise<unknown>>;
  fieldTypes?: Record<string, FieldTypeDefinition>;
  hooks?: Partial<Record<HookEvent, (payload: HookPayload) => void | Promise<void>>>;
}

export interface Manifest {
  id: string;
  name: string;
  version: string;
  athena: string;
  publisher: string;
  permissions: Permission[];
  contributes: { fieldTypes?: string[]; hooks?: HookEvent[]; actions?: string[]; widgets?: string[] };
}

export interface PluginPackage {
  manifest: Manifest;
  code: string;
  signature: string;
}

declare global {
  const athena: AthenaApi;
  // eslint-disable-next-line no-var
  var plugin: PluginDefinition | undefined;
}

export function definePlugin(definition: PluginDefinition): PluginDefinition;
export function generateKeys(): { publicKey: string; privateKey: string };
export function checkManifest(manifest: Partial<Manifest>): string[];
export function pack(manifest: Manifest, code: string, privateKeyPem: string): PluginPackage;
export function verifyPackage(pkg: PluginPackage, publicKeyPem: string): boolean;
export function packageDigest(manifest: unknown, code: string): Buffer;
