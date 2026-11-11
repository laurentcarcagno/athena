import { z } from 'zod';
import { Db, type Actor } from './db';
import { validation } from './errors';
import { AtqlError, parse } from '../atql/parser';

/** Genres de widget (ADR-0003 § 2.1) : la grille est fixe, seuls le contenu, l'ordre et la présence se règlent. */
export const WIDGET_KINDS = ['search', 'mentions', 'approvals', 'favorites', 'recents', 'trackers'] as const;

export const WidgetSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/),
  kind: z.enum(WIDGET_KINDS),
  /** Titre libre ; absent pour un widget par défaut, dont le titre suit la langue. */
  title: z.string().trim().min(1).max(100).optional(),
  /** `search` seulement : requête ATQL et périmètre de projets (vide : toute l'organisation). */
  query: z.string().max(2000).optional(),
  projects: z.array(z.string().regex(/^[A-Z][A-Z0-9]{1,9}$/)).max(50).optional(),
  /** Largeur sur la grille de 12 colonnes (ADR-0005, T-0153) : S = 4, M = 6, L = 8, XL = 12. Absente : largeur par défaut du genre. */
  size: z.enum(['S', 'M', 'L', 'XL']).optional(),
});
export const LayoutInput = z.object({ widgets: z.array(WidgetSchema).max(24) });
export type Widget = z.infer<typeof WidgetSchema>;

/** Disposition initiale : Mes tickets, À approuver, Mentions, Échéances de la semaine, Projets favoris, Récents. */
export const DEFAULT_WIDGETS: readonly Widget[] = [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done' },
  { id: 'approvals', kind: 'approvals' },
  { id: 'mentions', kind: 'mentions' },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)' },
  { id: 'favorites', kind: 'favorites' },
  { id: 'recents', kind: 'recents' },
];

/** Portée du tableau de bord : '' (accueil), la clé d'un projet (Vue d'ensemble) ou « clé:avancement » (Avancement, T-0153). */
export const ScopeSchema = z.string().regex(/^([A-Z][A-Z0-9]{1,9}(:avancement)?)?$/);

/** Disposition initiale de la Vue d'ensemble d'un projet : mes tickets, échéances, trackers et mentions de ce projet. */
export const defaultProjectWidgets = (project: string): Widget[] => [
  { id: 'assigned', kind: 'search', query: 'assignee = currentUser() AND category != done', projects: [project] },
  { id: 'due', kind: 'search', query: 'assignee = currentUser() AND category != done AND due <= daysFromNow(7)', projects: [project] },
  { id: 'trackers', kind: 'trackers', projects: [project] },
  { id: 'mentions', kind: 'mentions' },
];

/** Tableau de bord personnel configurable (T-0122) : disposition par personne, défaut sans réglage, réinitialisation. */
export class DashboardService {
  constructor(private readonly db: Db) {}

  async get(organizationId: string, actor: Actor, scope = ''): Promise<{ widgets: Widget[]; isDefault: boolean }> {
    const row = await this.db.tx(organizationId, async (c) => (await c.query('select widgets from dashboard_layout where owner = $1 and scope = $2', [actor.id, scope])).rows[0]);
    return row ? { widgets: row.widgets as Widget[], isDefault: false } : { widgets: scope ? defaultProjectWidgets(scope) : [...DEFAULT_WIDGETS], isDefault: true };
  }

  async put(organizationId: string, input: z.infer<typeof LayoutInput>, actor: Actor, scope = ''): Promise<{ widgets: Widget[]; isDefault: boolean }> {
    const ids = new Set<string>();
    for (const w of input.widgets) {
      if (ids.has(w.id)) throw validation([`widgets : identifiant en double (${w.id})`]);
      ids.add(w.id);
      if (w.kind === 'search') {
        try { parse(w.query ?? ''); } catch (error) {
          if (error instanceof AtqlError) throw validation([`${w.id} : ${error.message}`]);
          throw error;
        }
      } else if (w.query !== undefined) throw validation([`${w.id} : query ne concerne que les widgets de recherche`]);
      else if (w.projects !== undefined && w.kind !== 'trackers') throw validation([`${w.id} : projects ne concerne que les widgets de recherche et de trackers`]);
    }
    await this.db.tx(organizationId, (c) => c.query(
      `insert into dashboard_layout (organization_id, owner, scope, widgets) values ($1,$2,$3,$4)
       on conflict (organization_id, owner, scope) do update set widgets = excluded.widgets, updated_at = now()`,
      [organizationId, actor.id, scope, JSON.stringify(input.widgets)],
    ));
    return { widgets: input.widgets, isDefault: false };
  }

  /** Revient à la disposition par défaut. */
  async reset(organizationId: string, actor: Actor, scope = ''): Promise<void> {
    await this.db.tx(organizationId, (c) => c.query('delete from dashboard_layout where owner = $1 and scope = $2', [actor.id, scope]));
  }
}
