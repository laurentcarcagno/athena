import { z } from 'zod';
import { Db, type Actor } from './db';

/** Préférences personnelles : chaque valeur est facultative, `null` efface la préférence. */
export const PreferenceInput = z.object({
  home: z.enum(['work', 'projects']).nullable().optional(),
  locale: z.enum(['fr', 'en']).nullable().optional(),
  theme: z.enum(['system', 'light', 'dark']).nullable().optional(),
  density: z.enum(['normal', 'compact']).nullable().optional(),
}).strict();
export type PreferenceInput = z.infer<typeof PreferenceInput>;
export interface Preferences { home: 'work' | 'projects' | null; locale: 'fr' | 'en' | null; theme: 'system' | 'light' | 'dark' | null; density: 'normal' | 'compact' | null }

const COLUMNS = ['home', 'locale', 'theme', 'density'] as const;

/** Préférences de la personne (accueil, langue, thème, densité), enregistrées sur son compte. */
export class PreferenceService {
  constructor(private readonly db: Db) {}

  async get(organizationId: string, actor: Actor): Promise<Preferences> {
    const row = await this.db.tx(organizationId, async (c) => (await c.query('select home, locale, theme, density from user_preference where owner = $1', [actor.id])).rows[0]);
    return { home: row?.home ?? null, locale: row?.locale ?? null, theme: row?.theme ?? null, density: row?.density ?? null };
  }

  /** Met à jour les seules clés présentes ; les autres gardent leur valeur. */
  async put(organizationId: string, input: PreferenceInput, actor: Actor): Promise<Preferences> {
    const current = await this.get(organizationId, actor);
    const next: Preferences = { ...current };
    for (const key of COLUMNS) if (input[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = input[key];
    await this.db.tx(organizationId, (c) => c.query(
      `insert into user_preference (organization_id, owner, home, locale, theme, density) values ($1,$2,$3,$4,$5,$6)
       on conflict (organization_id, owner) do update set home = excluded.home, locale = excluded.locale, theme = excluded.theme, density = excluded.density, updated_at = now()`,
      [organizationId, actor.id, next.home, next.locale, next.theme, next.density],
    ));
    return next;
  }
}
