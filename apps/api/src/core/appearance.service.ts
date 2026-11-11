import { z } from 'zod';
import { Db } from './db';
import { validation } from './errors';

/** Nom de thème : celui d'un dossier de @nuance/themes (l'application ignore un nom inconnu et revient au thème par défaut). */
const ThemeName = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/);
export const AppearanceInput = z.object({
  defaultTheme: ThemeName,
  /** Thèmes proposés aux personnes ; vide = tous. */
  allowedThemes: z.array(ThemeName).max(50),
}).strict();
export type AppearanceInput = z.infer<typeof AppearanceInput>;
export interface Appearance { defaultTheme: string; allowedThemes: string[] }

/** Apparence de l'organisation (ADR-0004, T-0136) : thème par défaut et thèmes proposés. */
export class AppearanceService {
  constructor(private readonly db: Db) {}

  async get(organizationId: string): Promise<Appearance> {
    const row = await this.db.tx(organizationId, async (c) => (await c.query('select default_theme, allowed_themes from organization_appearance')).rows[0]);
    return { defaultTheme: row?.default_theme ?? 'hemeria', allowedThemes: row?.allowed_themes ?? [] };
  }

  async put(organizationId: string, input: AppearanceInput): Promise<Appearance> {
    const allowed = [...new Set(input.allowedThemes)];
    if (allowed.length && !allowed.includes(input.defaultTheme)) throw validation(['Le thème par défaut doit faire partie des thèmes proposés.']);
    await this.db.tx(organizationId, (c) => c.query(
      `insert into organization_appearance (organization_id, default_theme, allowed_themes) values ($1, $2, $3)
       on conflict (organization_id) do update set default_theme = excluded.default_theme, allowed_themes = excluded.allowed_themes, updated_at = now()`,
      [organizationId, input.defaultTheme, allowed],
    ));
    return { defaultTheme: input.defaultTheme, allowedThemes: allowed };
  }
}
