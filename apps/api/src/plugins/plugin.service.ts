import type { Permission } from './manifest';
import { Db, type Actor } from '../core/db';
import { conflict, forbidden, notFound, validation } from '../core/errors';
import type { FieldTypeRegistry } from '../core/field-types';
import { audit } from '../core/tracker.service';
import { PluginHost, type HostOptions, type PluginApi } from './host';
import { ManifestSchema, verifyPackage, type PluginPackage, type Trust } from './manifest';

export const QUOTA = { maxKeys: 100, maxValueBytes: 64 * 1024, maxTotalBytes: 1024 * 1024 };

const newer = (a: string, b: string): boolean => {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) > (pb[i] ?? 0);
  return false;
};

export interface ArtifactReader {
  /** Clé `PROJET/CLÉ` (par exemple `ARI/BUG-1`). */
  read(organizationId: string, ref: string): Promise<unknown>;
}

/**
 * Cycle de vie des plugins : installation (paquet signé, permissions accordées ⊆ permissions déclarées),
 * activation par organisation, types de champ fournis par les plugins (échec fermé : une valeur est refusée
 * si le plugin est arrêté), stockage borné par quotas.
 *
 * Limite connue : le registre de types de champ est global au processus, les types d'un plugin sont donc
 * visibles par toutes les organisations tant que l'un d'elles l'a activé (registre par organisation : à faire).
 */
export class PluginService {
  private readonly hosts = new Map<string, PluginHost>();

  constructor(
    private readonly db: Db,
    private readonly registry: FieldTypeRegistry,
    private readonly trust: Trust,
    private readonly artifacts: ArtifactReader,
    private readonly hostOptions?: HostOptions,
  ) {}

  async install(organizationId: string, pkg: PluginPackage, granted: Permission[], actor: Actor): Promise<{ id: string; version: string }> {
    const verified = verifyPackage(pkg, this.trust);
    if (!verified.ok) throw validation([verified.reason]);
    const manifest = verified.manifest;
    const excess = granted.filter((p) => !manifest.permissions.includes(p));
    if (excess.length) throw validation([`permissions non déclarées par le plugin : ${excess.join(', ')}`]);
    await this.db.tx(organizationId, async (c) => {
      const existing = (await c.query('select version from plugin_installation where plugin_id = $1', [manifest.id])).rows[0];
      if (existing && !newer(manifest.version, existing.version)) {
        throw conflict(`Version ${manifest.version} non supérieure à la version installée ${existing.version}.`);
      }
      await c.query(
        `insert into plugin_installation (organization_id, plugin_id, version, manifest, code, signature, granted_permissions, installed_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8)
         on conflict (organization_id, plugin_id) do update set version = excluded.version, manifest = excluded.manifest,
           code = excluded.code, signature = excluded.signature, granted_permissions = excluded.granted_permissions,
           installed_by = excluded.installed_by, installed_at = now()`,
        [organizationId, manifest.id, manifest.version, JSON.stringify(manifest), pkg.code, pkg.signature, granted, actor.id],
      );
      await audit(c, organizationId, actor, 'plugin.install', `plugin:${manifest.id}`, { version: manifest.version, granted });
    });
    await this.stop(organizationId, manifest.id);
    return { id: manifest.id, version: manifest.version };
  }

  /** Démarre les plugins activés de l'organisation et enregistre leurs types de champ. */
  async loadEnabled(organizationId: string): Promise<string[]> {
    const rows = await this.db.tx(organizationId, async (c) =>
      (await c.query('select plugin_id, manifest, code, signature, granted_permissions from plugin_installation where enabled')).rows,
    );
    const started: string[] = [];
    for (const row of rows) {
      const key = `${organizationId}:${row.plugin_id}`;
      if (this.hosts.has(key)) continue;
      // Le paquet est revérifié à chaque démarrage : une altération en base empêche l'exécution.
      const verified = verifyPackage({ manifest: row.manifest, code: row.code, signature: row.signature }, this.trust);
      if (!verified.ok) { console.error(`plugins: ${row.plugin_id} ignoré (${verified.reason})`); continue; }
      const manifest = ManifestSchema.parse(row.manifest);
      const host = new PluginHost(manifest, row.code, new Set(row.granted_permissions as Permission[]), this.apiFor(organizationId, manifest.id), this.hostOptions);
      try {
        await host.start();
      } catch (error) {
        host.stop();
        console.error(`plugins: démarrage de ${row.plugin_id} impossible : ${(error as Error).message}`);
        continue;
      }
      this.hosts.set(key, host);
      for (const type of host.fieldTypes) {
        const name = `${manifest.id}.${type}`;
        this.registry.unregister(name);
        this.registry.register(name, {
          validate: async (value, config) => {
            try {
              return await host.validateFieldType(type, value, config);
            } catch {
              return 'validation indisponible (plugin arrêté ou en erreur)'; // échec fermé
            }
          },
        });
      }
      started.push(manifest.id);
    }
    return started;
  }

  async stop(organizationId: string, pluginId: string): Promise<void> {
    const key = `${organizationId}:${pluginId}`;
    this.hosts.get(key)?.stop();
    this.hosts.delete(key);
  }

  async setEnabled(organizationId: string, pluginId: string, enabled: boolean, actor: Actor): Promise<void> {
    await this.db.tx(organizationId, async (c) => {
      const result = await c.query('update plugin_installation set enabled = $2 where plugin_id = $1', [pluginId, enabled]);
      if (result.rowCount === 0) throw notFound(`Plugin ${pluginId}`);
      await audit(c, organizationId, actor, enabled ? 'plugin.enable' : 'plugin.disable', `plugin:${pluginId}`);
    });
    if (!enabled) await this.stop(organizationId, pluginId);
  }

  async list(organizationId: string) {
    return this.db.tx(organizationId, async (c) =>
      (await c.query('select plugin_id as id, version, enabled, granted_permissions as permissions, manifest->>\'name\' as name from plugin_installation order by plugin_id')).rows,
    );
  }

  shutdown(): void {
    for (const host of this.hosts.values()) host.stop();
    this.hosts.clear();
  }

  private apiFor(organizationId: string, pluginId: string): PluginApi {
    return {
      log: (message) => console.log(`plugin ${pluginId}: ${message}`),
      storageGet: (key) =>
        this.db.tx(organizationId, async (c) => (await c.query('select value from plugin_storage where plugin_id = $1 and key = $2', [pluginId, key])).rows[0]?.value),
      storageSet: (key, value) =>
        this.db.tx(organizationId, async (c) => {
          const json = JSON.stringify(value ?? null);
          const size = Buffer.byteLength(json);
          if (size > QUOTA.maxValueBytes) throw new Error('valeur trop volumineuse');
          const usage = (await c.query('select count(*)::int as n, coalesce(sum(size),0)::int as total, bool_or(key = $2) as has from plugin_storage where plugin_id = $1', [pluginId, key])).rows[0];
          if (!usage.has && usage.n >= QUOTA.maxKeys) throw new Error('quota de clés dépassé');
          if (usage.total + size > QUOTA.maxTotalBytes) throw new Error('quota de stockage dépassé');
          await c.query(
            `insert into plugin_storage (organization_id, plugin_id, key, value, size) values ($1,$2,$3,$4,$5)
             on conflict (organization_id, plugin_id, key) do update set value = excluded.value, size = excluded.size, updated_at = now()`,
            [organizationId, pluginId, key, json, size],
          );
        }),
      storageDelete: (key) =>
        this.db.tx(organizationId, async (c) => { await c.query('delete from plugin_storage where plugin_id = $1 and key = $2', [pluginId, key]); }),
      artifactGet: (ref) => this.artifacts.read(organizationId, ref),
    };
  }
}

export { forbidden };
