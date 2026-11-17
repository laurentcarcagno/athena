import { CanActivate, ExecutionContext, Inject, Injectable, NotFoundException, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthedRequest } from '../auth/auth.guard';
import { Db, type Actor } from '../core/db';
import { OrgResolver } from '../core/http';
import { validation } from '../core/errors';
import { audit } from '../core/tracker.service';

/**
 * Fonctionnalités PPM activables par organisation, avec leur valeur par défaut. Le socle livré (portefeuilles, équipes) est actif ;
 * ce qui n'est pas encore construit (capacité, finances, demandes) est inactif. Ajouter une clé ici suffit à la rendre pilotable.
 */
export const FEATURES = {
  'ppm.portfolios': true,
  'ppm.roadmap': true,
  'ppm.capacity': false,
  'ppm.finance': false,
  'ppm.demand': false,
} as const;
export type FeatureKey = keyof typeof FEATURES;
export const isFeatureKey = (key: string): key is FeatureKey => Object.prototype.hasOwnProperty.call(FEATURES, key);

/** Interrupteurs de l'organisation : la ligne de l'organisation l'emporte, sinon la valeur par défaut. */
@Injectable()
export class FeatureService {
  constructor(private readonly db: Db) {}

  async all(organizationId: string): Promise<Record<FeatureKey, boolean>> {
    const rows = await this.db.tx(organizationId, async (c) => (await c.query('select key, enabled from organization_feature')).rows as Array<{ key: string; enabled: boolean }>);
    const out: Record<string, boolean> = { ...FEATURES };
    for (const r of rows) if (isFeatureKey(r.key)) out[r.key] = r.enabled;
    return out as Record<FeatureKey, boolean>;
  }

  async enabled(organizationId: string, key: FeatureKey): Promise<boolean> {
    return (await this.all(organizationId))[key];
  }

  async set(organizationId: string, key: string, enabled: boolean, actor: Actor): Promise<Record<FeatureKey, boolean>> {
    if (!isFeatureKey(key)) throw validation([`fonctionnalité inconnue : ${key}`]);
    await this.db.tx(organizationId, async (c) => {
      await c.query(
        `insert into organization_feature (organization_id, key, enabled, updated_by) values ($1,$2,$3,$4)
         on conflict (organization_id, key) do update set enabled = excluded.enabled, updated_by = excluded.updated_by, updated_at = now()`,
        [organizationId, key, enabled, actor.id]);
      await audit(c, organizationId, actor, 'feature.set', `feature:${key}`, { enabled });
    });
    return this.all(organizationId);
  }
}

export const FEATURE_KEY = 'athena:feature';
/** Marque une route ou un contrôleur : sans la fonctionnalité, la route est introuvable (404), comme si elle n'existait pas. */
export const RequiresFeature = (key: FeatureKey) => SetMetadata(FEATURE_KEY, key);

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(FeatureService) private readonly features: FeatureService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const key = this.reflector.getAllAndOverride<FeatureKey | undefined>(FEATURE_KEY, [context.getHandler(), context.getClass()]);
    if (!key) return true;
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (!request.principal) return true; // la garde d'authentification a déjà refusé les requêtes anonymes
    const { organizationId } = await this.orgs.resolve(request.principal);
    if (!(await this.features.enabled(organizationId, key))) throw new NotFoundException();
    return true;
  }
}
