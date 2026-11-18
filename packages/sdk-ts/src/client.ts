// Code généré par tools/gen-sdk.mjs depuis le contrat OpenAPI : ne pas modifier à la main.
// Contrat : Athena API 0.1.0

export interface AthenaClientOptions { baseUrl: string; token: string; fetch?: typeof fetch }
export class AthenaError extends Error { constructor(readonly status: number, readonly body: unknown) { super(`HTTP ${status}`); } }

export class AthenaClient {
  constructor(private readonly options: AthenaClientOptions) {}

  /** Appel brut : chemin avec paramètres déjà remplacés. Lève AthenaError si le statut n’est pas 2xx. */
  async request<T = unknown>(method: string, path: string, init: { query?: Record<string, string | number | boolean | undefined>; body?: unknown } = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const response = await (this.options.fetch ?? fetch)(url, {
      method, headers: { Authorization: `Bearer ${this.options.token}`, ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    const text = await response.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : undefined;
    if (!response.ok) throw new AthenaError(response.status, data);
    return data as T;
  }

  private path(template: string, params: Record<string, string>): string { return template.replace(/\{(\w+)\}/g, (_m, k: string) => encodeURIComponent(params[k] ?? '')); }

  readonly access = {
    /** GET /v1/projects/{project}/export-control · rôles : athena-admin, athena-pm */
    exportMembers: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/export-control', path), { query }),
    /** GET /v1/projects/{project}/access-lists · rôles : athena-admin, athena-pm */
    list: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/access-lists', path), { query }),
    /** DELETE /v1/projects/{project}/access-lists · rôles : athena-admin, athena-pm */
    remove: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/access-lists', path), { query }),
    /** PUT /v1/projects/{project}/access-lists · rôles : athena-admin, athena-pm */
    set: (path: { project: string }, body: { tracker?: unknown; members: Array<string> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/access-lists', path), { body, query }),
    /** PUT /v1/projects/{project}/export-control · rôles : athena-admin, athena-pm */
    setExportMembers: (path: { project: string }, body: { members: Array<string> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/export-control', path), { body, query }),
    /** PUT /v1/projects/{project}/artifacts/{key}/marking · rôles : athena-admin, athena-pm */
    setMarking: (path: { project: string; key: string }, body: { exportControl: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/artifacts/{key}/marking', path), { body, query }),
  };

  readonly agile = {
    /** POST /v1/projects/{project}/sprints/{id}/items · rôles : athena-team-member, athena-admin */
    addItem: (path: { project: string; id: string }, body: { artifact: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/sprints/{id}/items', path), { body, query }),
    /** POST /v1/projects/{project}/releases/{id}/items · rôles : athena-team-member, athena-admin */
    assignRelease: (path: { project: string; id: string }, body: { artifact: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/releases/{id}/items', path), { body, query }),
    /** GET /v1/projects/{project}/backlog · rôles : athena-team-member, athena-admin */
    backlog: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/backlog', path), { query }),
    /** GET /v1/projects/{project}/boards/{board} · rôles : athena-team-member, athena-admin */
    board: (path: { project: string; board: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/boards/{board}', path), { query }),
    /** GET /v1/projects/{project}/boards · rôles : athena-team-member, athena-admin */
    boardList: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/boards', path), { query }),
    /** GET /v1/projects/{project}/sprints/{id}/burndown · rôles : athena-team-member, athena-admin */
    burndown: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/sprints/{id}/burndown', path), { query }),
    /** POST /v1/projects/{project}/sprints/{id}/close · rôles : athena-admin, athena-pm */
    close: (path: { project: string; id: string }, body: { moveTo?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/sprints/{id}/close', path), { body, query }),
    /** GET /v1/projects/{project}/quality · rôles : athena-team-member, athena-admin, athena-pm */
    codeQuality: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/quality', path), { query }),
    /** POST /v1/projects/{project}/boards · rôles : athena-admin, athena-pm */
    createBoard: (path: { project: string }, body: { key: string; name: string; trackerKeys: Array<string>; columns: Array<{ name: string; statuses: Array<string>; wipLimit?: number }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/boards', path), { body, query }),
    /** POST /v1/projects/{project}/releases · rôles : athena-admin, athena-pm */
    createRelease: (path: { project: string }, body: { name: string; startsOn: string; endsOn: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/releases', path), { body, query }),
    /** POST /v1/projects/{project}/sprints · rôles : athena-admin, athena-pm */
    createSprint: (path: { project: string }, body: { name: string; goal?: string; startsOn: string; endsOn: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/sprints', path), { body, query }),
    /** GET /v1/projects/{project}/dashboard · rôles : athena-team-member, athena-admin */
    dashboard: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/dashboard', path), { query }),
    /** GET /v1/projects/{project}/flow · rôles : athena-team-member, athena-admin */
    flow: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/flow', path), { query }),
    /** GET /v1/projects/{project}/artifacts/{key}/sprint · rôles : athena-team-member, athena-admin */
    itemSprint: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/sprint', path), { query }),
    /** GET /v1/projects/{project}/kpis · rôles : athena-team-member, athena-admin, athena-pm */
    kpis: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/kpis', path), { query }),
    /** POST /v1/projects/{project}/boards/{board}/cards/{key}/move · rôles : athena-team-member, athena-admin */
    move: (path: { project: string; board: string; key: string }, body: { column: string; version: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/boards/{board}/cards/{key}/move', path), { body, query }),
    /** GET /v1/projects/{project}/pipelines · rôles : athena-team-member, athena-admin, athena-pm */
    pipelineRuns: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/pipelines', path), { query }),
    /** POST /v1/projects/{project}/releases/{id}/publish · rôles : athena-admin, athena-pm */
    publishRelease: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/releases/{id}/publish', path), { query }),
    /** POST /v1/projects/{project}/backlog/rank · rôles : athena-admin, athena-pm */
    rankBacklog: (path: { project: string }, body: { key: string; after: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/backlog/rank', path), { body, query }),
    /** GET /v1/projects/{project}/releases/{id}/items · rôles : athena-team-member, athena-admin */
    releaseItems: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/releases/{id}/items', path), { query }),
    /** DELETE /v1/projects/{project}/sprints/{id}/items/{key} · rôles : athena-admin, athena-pm */
    removeItem: (path: { project: string; id: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/sprints/{id}/items/{key}', path), { query }),
    /** GET /v1/projects/{project}/roadmap · rôles : athena-team-member, athena-admin */
    roadmap: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/roadmap', path), { query }),
    /** GET /v1/projects/{project}/sprints/{id} · rôles : athena-team-member, athena-admin */
    sprint: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/sprints/{id}', path), { query }),
    /** GET /v1/projects/{project}/sprints · rôles : athena-team-member, athena-admin */
    sprintList: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/sprints', path), { query }),
    /** POST /v1/projects/{project}/sprints/{id}/start · rôles : athena-admin, athena-pm */
    start: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/sprints/{id}/start', path), { query }),
    /** DELETE /v1/projects/{project}/releases/{id}/items/{key} · rôles : athena-admin, athena-pm */
    unassignRelease: (path: { project: string; id: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/releases/{id}/items/{key}', path), { query }),
    /** GET /v1/projects/{project}/velocity · rôles : athena-team-member, athena-admin */
    velocity: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/velocity', path), { query }),
  };

  readonly allocation = {
    /** POST /v1/projects/{p}/allocations · rôles : athena-admin, athena-pm */
    add: (path: { p: string }, body: { project: string; subject?: string; team?: string; roleLabel?: string; from: string; to?: unknown; fte: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{p}/allocations', path), { body, query }),
    /** GET /v1/projects/{p}/allocations · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    list: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{p}/allocations', path), { query }),
    /** DELETE /v1/projects/{p}/allocations/{id} · rôles : athena-admin, athena-pm */
    remove: (path: { p: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{p}/allocations/{id}', path), { query }),
  };

  readonly appearance = {
    /** GET /v1/appearance · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    get: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/appearance', {}), { query }),
    /** PUT /v1/admin/appearance · rôles : athena-admin */
    put: (body: { defaultTheme: string; allowedThemes: Array<string> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/admin/appearance', {}), { body, query }),
  };

  readonly approval = {
    /** POST /v1/projects/{project}/approvals/{type}/{ref}/decision · rôles : athena-qa */
    decide: (path: { project: string; type: string; ref: string }, body: { decision: "approved" | "rejected"; comment?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/approvals/{type}/{ref}/decision', path), { body, query }),
    /** GET /v1/projects/{project}/approvals · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    list: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/approvals', path), { query }),
    /** PUT /v1/projects/{project}/approvals/{type}/{ref}/required · rôles : athena-admin, athena-pm */
    setRequired: (path: { project: string; type: string; ref: string }, body: { required: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/approvals/{type}/{ref}/required', path), { body, query }),
  };

  readonly attachment = {
    /** GET /v1/projects/{project}/artifacts/{key}/attachments/{id} · rôles : athena-team-member, athena-admin */
    download: (path: { project: string; key: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/attachments/{id}', path), { query }),
    /** GET /v1/projects/{project}/artifacts/{key}/attachments · rôles : athena-team-member, athena-admin */
    list: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/attachments', path), { query }),
    /** DELETE /v1/projects/{project}/artifacts/{key}/attachments/{id} · rôles : athena-team-member, athena-admin */
    remove: (path: { project: string; key: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/artifacts/{key}/attachments/{id}', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/attachments · rôles : athena-team-member, athena-admin */
    upload: (path: { project: string; key: string }, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/attachments', path), { body, query }),
  };

  readonly bff = {
    /** POST /auth/backchannel-logout · public */
    backchannelLogout: (body: Record<string, unknown>, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/auth/backchannel-logout', {}), { body, query }),
    /** GET /auth/callback · public */
    callback: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/auth/callback', {}), { query }),
    /** GET /auth/login · public */
    login: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/auth/login', {}), { query }),
    /** POST /auth/logout · public */
    logout: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/auth/logout', {}), { query }),
    /** GET /auth/session · public */
    session: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/auth/session', {}), { query }),
  };

  readonly brand = {
    /** GET /v1/brand/{theme}/{kind} · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    image: (path: { theme: string; kind: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/brand/{theme}/{kind}', path), { query }),
    /** GET /v1/brand · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/brand', {}), { query }),
    /** DELETE /v1/admin/brand/{theme}/{kind} · rôles : athena-admin */
    remove: (path: { theme: string; kind: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/admin/brand/{theme}/{kind}', path), { query }),
    /** PUT /v1/admin/brand/{theme}/{kind} · rôles : athena-admin */
    upload: (path: { theme: string; kind: string }, body?: unknown, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/admin/brand/{theme}/{kind}', path), { body, query }),
  };

  readonly calendar = {
    /** GET /v1/calendar · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    get: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/calendar', {}), { query }),
    /** PUT /v1/admin/calendar · rôles : athena-admin */
    put: (body: { workDays: Array<number>; holidays: Array<{ day: string; label: string }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/admin/calendar', {}), { body, query }),
  };

  readonly capacity = {
    /** GET /v1/capacity/absences · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    absences: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/capacity/absences', {}), { query }),
    /** POST /v1/capacity/absences · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    addAbsence: (body: { subject: string; from: string; to: string; kind?: "leave" | "training" | "other"; halfDay?: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/capacity/absences', {}), { body, query }),
    /** POST /v1/capacity/availability · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    addAvailability: (body: { subject: string; from: string; to?: unknown; ratio: number; workdayMinutes?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/capacity/availability', {}), { body, query }),
    /** GET /v1/capacity/availability · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    availability: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/capacity/availability', {}), { query }),
    /** DELETE /v1/capacity/absences/{id} · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    removeAbsence: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/capacity/absences/{id}', path), { query }),
    /** DELETE /v1/capacity/availability/{id} · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    removeAvailability: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/capacity/availability/{id}', path), { query }),
    /** GET /v1/capacity · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    view: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/capacity', {}), { query }),
  };

  readonly core = {
    /** POST /v1/projects/{project}/artifacts/{key}/comments · rôles : athena-team-member, athena-admin */
    addComment: (path: { project: string; key: string }, body: { body: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/comments', path), { body, query }),
    /** POST /v1/projects/{project}/trackers/{tracker}/fields · rôles : athena-admin, athena-pm, athena-team-member */
    addField: (path: { project: string; tracker: string }, body: { key: string; label?: string; type?: string; fromShared?: string; config?: Record<string, unknown>; readRoles?: Array<string>; writeRoles?: Array<string>; required?: boolean; isContent?: boolean; semanticRole?: "title" | "description" | "status" | "assignee" | "due_date" | "estimate" | "priority" | "version" | "start_date" | "progress" | "remaining" | "probability" | "impact" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/trackers/{tracker}/fields', path), { body, query }),
    /** POST /v1/projects/{project}/trackers/{tracker}/statuses · rôles : athena-admin, athena-pm, athena-team-member */
    addStatus: (path: { project: string; tracker: string }, body: { key: string; name: string; category: "todo" | "in_progress" | "done"; color?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/trackers/{tracker}/statuses', path), { body, query }),
    /** POST /v1/projects/{project}/trackers/{tracker}/transitions · rôles : athena-admin, athena-pm, athena-team-member */
    addTransition: (path: { project: string; tracker: string }, body: { name: string; from: string | null; to: string; conditions?: Array<unknown>; validators?: Array<unknown>; postActions?: Array<unknown> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/trackers/{tracker}/transitions', path), { body, query }),
    /** POST /v1/projects/{project}/links/{id}/clear-suspect · rôles : athena-team-member, athena-admin */
    clearSuspect: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/links/{id}/clear-suspect', path), { query }),
    /** GET /v1/projects/{project}/artifacts/{key}/comments · rôles : athena-team-member, athena-admin */
    comments: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/comments', path), { query }),
    /** POST /v1/projects/{project}/trackers/{tracker}/artifacts · rôles : athena-team-member, athena-admin */
    createArtifact: (path: { project: string; tracker: string }, body: { values: Record<string, unknown> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/trackers/{tracker}/artifacts', path), { body, query }),
    /** POST /v1/projects/{project}/link-types · rôles : athena-admin, athena-pm */
    createLinkType: (path: { project: string }, body: { key: string; outwardLabel: string; inwardLabel: string; hierarchical?: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/link-types', path), { body, query }),
    /** POST /v1/projects · rôles : athena-admin */
    createProject: (body: { key: string; name: string; template?: string; templateVersion?: string; criticality?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects', {}), { body, query }),
    /** POST /v1/projects/{project}/trackers · rôles : athena-admin, athena-pm */
    createTracker: (path: { project: string }, body: { layout?: { sections: Array<{ title: string; fields: Array<unknown> }> }; typeKey?: unknown; key: string; name: string; description?: string; fields: Array<{ key: string; label: string; type: string; config?: Record<string, unknown>; required?: boolean; isContent?: boolean; semanticRole?: "title" | "description" | "status" | "assignee" | "due_date" | "estimate" | "priority" | "version" | "start_date" | "progress" | "remaining" | "probability" | "impact" }>; statuses: Array<{ key: string; name: string; category: "todo" | "in_progress" | "done"; color?: unknown }>; transitions: Array<{ name: string; from: string | null; to: string; conditions?: Array<unknown>; validators?: Array<unknown>; postActions?: Array<unknown> }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/trackers', path), { body, query }),
    /** GET /v1/projects/{project}/trackers/{tracker}/fields/{field}/impact · rôles : athena-admin */
    fieldImpact: (path: { project: string; tracker: string; field: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/trackers/{tracker}/fields/{field}/impact', path), { query }),
    /** GET /v1/projects/{project}/artifacts/{key} · rôles : athena-team-member, athena-admin */
    getArtifact: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}', path), { query }),
    /** GET /v1/projects/{project}/trackers/{tracker} · rôles : athena-team-member, athena-admin */
    getTracker: (path: { project: string; tracker: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/trackers/{tracker}', path), { query }),
    /** PUT /v1/projects/{project}/trackers/{tracker}/admins/{subject} · rôles : athena-admin, athena-pm */
    grantTrackerAdmin: (path: { project: string; tracker: string; subject: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/trackers/{tracker}/admins/{subject}', path), { query }),
    /** GET /v1/projects/{project}/artifacts/{key}/history · rôles : athena-team-member, athena-admin */
    history: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/history', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/links · rôles : athena-team-member, athena-admin */
    link: (path: { project: string; key: string }, body: { to: string; type: string; lagDays?: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/links', path), { body, query }),
    /** GET /v1/projects/{project}/artifacts/{key}/links · rôles : athena-team-member, athena-admin */
    listLinks: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/links', path), { query }),
    /** GET /v1/projects/{project}/link-types · rôles : athena-team-member, athena-admin */
    listLinkTypes: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/link-types', path), { query }),
    /** GET /v1/projects · rôles : athena-team-member, athena-admin */
    listProjects: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects', {}), { query }),
    /** GET /v1/projects/{project}/trackers · rôles : athena-team-member, athena-admin */
    listTrackers: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/trackers', path), { query }),
    /** PATCH /v1/projects/{project}/trackers/{tracker}/statuses/{status} · rôles : athena-admin, athena-pm, athena-team-member */
    patchStatus: (path: { project: string; tracker: string; status: string }, body: { name?: string; category?: "todo" | "in_progress" | "done"; color?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/trackers/{tracker}/statuses/{status}', path), { body, query }),
    /** DELETE /v1/projects/{project}/trackers/{tracker}/fields/{field} · rôles : athena-admin, athena-pm, athena-team-member */
    removeField: (path: { project: string; tracker: string; field: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/trackers/{tracker}/fields/{field}', path), { query }),
    /** DELETE /v1/projects/{project}/links/{id} · rôles : athena-team-member, athena-admin */
    removeLink: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/links/{id}', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/restore · rôles : athena-team-member, athena-admin */
    restore: (path: { project: string; key: string }, body: { version: number; expectedVersion: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/restore', path), { body, query }),
    /** DELETE /v1/projects/{project}/trackers/{tracker}/admins/{subject} · rôles : athena-admin, athena-pm */
    revokeTrackerAdmin: (path: { project: string; tracker: string; subject: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/trackers/{tracker}/admins/{subject}', path), { query }),
    /** GET /v1/projects/{project}/search · rôles : athena-team-member, athena-admin */
    search: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/search', path), { query }),
    /** PATCH /v1/projects/{project}/trackers/{tracker}/history-mode · rôles : athena-admin, athena-pm, athena-team-member */
    setHistoryMode: (path: { project: string; tracker: string }, body: { mode: "direct" | "merge_request" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/trackers/{tracker}/history-mode', path), { body, query }),
    /** PATCH /v1/projects/{project}/trackers/{tracker}/layout · rôles : athena-admin, athena-pm, athena-team-member */
    setLayout: (path: { project: string; tracker: string }, body: { layout: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/trackers/{tracker}/layout', path), { body, query }),
    /** PATCH /v1/projects/{project}/trackers/{tracker}/type · rôles : athena-admin, athena-pm, athena-team-member */
    setType: (path: { project: string; tracker: string }, body: { typeKey: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/trackers/{tracker}/type', path), { body, query }),
    /** GET /v1/projects/{project}/trackers/{tracker}/admins · rôles : athena-team-member, athena-admin */
    trackerAdmins: (path: { project: string; tracker: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/trackers/{tracker}/admins', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/transitions · rôles : athena-team-member, athena-admin */
    transition: (path: { project: string; key: string }, body: { name: string; version: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/transitions', path), { body, query }),
    /** PATCH /v1/projects/{project}/artifacts/{key} · rôles : athena-team-member, athena-admin */
    updateArtifact: (path: { project: string; key: string }, body: { values: Record<string, unknown>; version: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/artifacts/{key}', path), { body, query }),
    /** PATCH /v1/projects/{project}/trackers/{tracker}/fields/{field} · rôles : athena-admin, athena-pm, athena-team-member */
    updateField: (path: { project: string; tracker: string; field: string }, body: { label?: string; required?: boolean; isContent?: boolean; readRoles?: unknown; writeRoles?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/trackers/{tracker}/fields/{field}', path), { body, query }),
  };

  readonly coverage = {
    /** POST /v1/coverage-rules · rôles : athena-admin */
    createOrg: (body: { name: string; fromTracker: string; linkType: string; direction?: "in" | "out" | "any"; minCount?: number; statuses?: Array<string>; threshold?: { target?: number; warning?: number }; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/coverage-rules', {}), { body, query }),
    /** POST /v1/projects/{project}/coverage-rules · rôles : athena-admin */
    createProject: (path: { project: string }, body: { name: string; fromTracker: string; linkType: string; direction?: "in" | "out" | "any"; minCount?: number; statuses?: Array<string>; threshold?: { target?: number; warning?: number }; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/coverage-rules', path), { body, query }),
    /** GET /v1/projects/{project}/coverage · rôles : athena-team-member, athena-admin */
    evaluate: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/coverage', path), { query }),
    /** GET /v1/coverage-rules · rôles : athena-team-member, athena-admin */
    orgRules: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/coverage-rules', {}), { query }),
    /** DELETE /v1/coverage-rules/{key} · rôles : athena-admin */
    removeOrg: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/coverage-rules/{key}', path), { query }),
    /** DELETE /v1/projects/{project}/coverage-rules/{key} · rôles : athena-admin */
    removeProject: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/coverage-rules/{key}', path), { query }),
    /** PUT /v1/coverage-rules/{key} · rôles : athena-admin */
    updateOrg: (path: { key: string }, body: { name: string; fromTracker: string; linkType: string; direction?: "in" | "out" | "any"; minCount?: number; statuses?: Array<string>; threshold?: { target?: number; warning?: number } }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/coverage-rules/{key}', path), { body, query }),
    /** PUT /v1/projects/{project}/coverage-rules/{key} · rôles : athena-admin */
    updateProject: (path: { project: string; key: string }, body: { name: string; fromTracker: string; linkType: string; direction?: "in" | "out" | "any"; minCount?: number; statuses?: Array<string>; threshold?: { target?: number; warning?: number } }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/coverage-rules/{key}', path), { body, query }),
  };

  readonly dashboard = {
    /** GET /v1/me/approvals · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    awaiting: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/approvals', {}), { query }),
    /** GET /v1/me/dashboard/catalog · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    catalog: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/dashboard/catalog', {}), { query }),
    /** GET /v1/me/dashboard · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    get: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/dashboard', {}), { query }),
    /** PUT /v1/me/dashboard · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    put: (body: { widgets: Array<{ id: string; kind: "search" | "mentions" | "approvals" | "favorites" | "recents" | "trackers" | "indicators" | "flow" | "velocity" | "release" | "tracker-status" | "activity" | "chart" | "general-info" | "global-progress" | "key-indicators" | "health" | "sprint-progress" | "pipelines" | "quality" | "badges" | "portfolio-health" | "portfolio-tiles"; title?: string; query?: string; projects?: Array<string>; size?: "S" | "M" | "L" | "XL"; field?: string; form?: "donut" | "bars" | "count"; x?: number; y?: number; w?: number; h?: number; project?: string; period?: "7d" | "30d" | "sprint" }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/me/dashboard', {}), { body, query }),
    /** DELETE /v1/me/dashboard · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    reset: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/me/dashboard', {}), { query }),
  };

  readonly dependency = {
    /** POST /v1/dependencies · rôles : athena-admin, athena-pmo */
    add: (body: { from: string; to: string; lagDays?: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/dependencies', {}), { body, query }),
    /** GET /v1/portfolios/{key}/dependencies · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    graph: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/dependencies', path), { query }),
    /** POST /v1/dependencies/propagate · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    propagate: (body: { ticket: string; shiftDays: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/dependencies/propagate', {}), { body, query }),
    /** DELETE /v1/dependencies/{id} · rôles : athena-admin, athena-pmo */
    remove: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/dependencies/{id}', path), { query }),
  };

  readonly doc = {
    /** POST /v1/projects/{project}/artifacts/{key}/doc-links/{source}/{uid}/acknowledge · rôles : athena-team-member, athena-admin, athena-pm */
    acknowledge: (path: { project: string; key: string; source: string; uid: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/doc-links/{source}/{uid}/acknowledge', path), { query }),
    /** GET /v1/projects/{project}/docs/nodes/{uid}/citations · rôles : athena-team-member, athena-admin, athena-pm */
    citations: (path: { project: string; uid: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/docs/nodes/{uid}/citations', path), { query }),
    /** GET /v1/projects/{project}/docs · rôles : athena-team-member, athena-admin, athena-pm */
    list: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/docs', path), { query }),
    /** GET /v1/projects/{project}/docs/nodes/{uid} · rôles : athena-team-member, athena-admin, athena-pm */
    node: (path: { project: string; uid: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/docs/nodes/{uid}', path), { query }),
    /** GET /v1/projects/{project}/docs/search · rôles : athena-team-member, athena-admin, athena-pm */
    search: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/docs/search', path), { query }),
    /** GET /v1/projects/{project}/docs/{doc}/tree · rôles : athena-team-member, athena-admin, athena-pm */
    tree: (path: { project: string; doc: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/docs/{doc}/tree', path), { query }),
  };

  readonly feature = {
    /** GET /v1/features · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/features', {}), { query }),
    /** PUT /v1/admin/features/{key} · rôles : athena-admin */
    set: (path: { key: string }, body: { enabled: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/admin/features/{key}', path), { body, query }),
  };

  readonly finance = {
    /** POST /v1/finance/actuals · rôles : athena-admin, athena-finance */
    actual: (body: { project: string; category: string; period: string; amount: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/finance/actuals', {}), { body, query }),
    /** POST /v1/finance/budget · rôles : athena-admin, athena-finance */
    budget: (body: { project: string; category: string; phase?: string; kind: "initial" | "amendment" | "arbitration"; amount: number; reason?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/finance/budget', {}), { body, query }),
    /** GET /v1/finance/categories · rôles : athena-admin, athena-finance, athena-pmo, athena-director */
    categories: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/finance/categories', {}), { query }),
    /** PUT /v1/finance/categories · rôles : athena-admin, athena-finance */
    category: (body: { key: string; name: string; kind: "internal" | "external" | "license" | "hardware" | "service" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/finance/categories', {}), { body, query }),
    /** POST /v1/finance/commitments · rôles : athena-admin, athena-finance */
    commitment: (body: { project: string; category: string; amount: number; reference?: string; committedOn: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/finance/commitments', {}), { body, query }),
    /** PUT /v1/finance/forecasts · rôles : athena-admin, athena-finance */
    forecast: (body: { project: string; category: string; period: string; amount: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/finance/forecasts', {}), { body, query }),
    /** POST /v1/finance/actuals/import · rôles : athena-admin, athena-finance */
    importActuals: (body: { fileName: string; content: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/finance/actuals/import', {}), { body, query }),
    /** GET /v1/finance/projects/{p} · rôles : athena-admin, athena-finance, athena-pmo, athena-director */
    project: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/finance/projects/{p}', path), { query }),
    /** POST /v1/finance/rates · rôles : athena-admin, athena-finance */
    rate: (body: { subject?: string; roleLabel?: string; hourlyRate: number; validFrom: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/finance/rates', {}), { body, query }),
    /** GET /v1/finance/rates · rôles : athena-admin, athena-finance */
    rates: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/finance/rates', {}), { query }),
    /** GET /v1/finance/projects/{p}/time-cost · rôles : athena-admin, athena-finance */
    timeCost: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/finance/projects/{p}/time-cost', path), { query }),
  };

  readonly graphql = {
    /** GET /v1/graphql · rôles : athena-team-member, athena-admin */
    get: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/graphql', {}), { query }),
    /** POST /v1/graphql · rôles : athena-team-member, athena-admin */
    post: (body: { query: string; variables?: Record<string, unknown>; operationName?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/graphql', {}), { body, query }),
  };

  readonly health = {
    /** GET /v1/admin/ping · rôles : athena-admin */
    adminPing: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/admin/ping', {}), { query }),
    /** GET /healthz · public */
    health: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/healthz', {}), { query }),
    /** GET /v1/me */
    me: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me', {}), { query }),
  };

  readonly integrations = {
    /** POST /v1/projects/{project}/code-repos · rôles : athena-admin */
    addCodeRepo: (path: { project: string }, body: { path: string; defaultBranch?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/code-repos', path), { body, query }),
    /** GET /v1/projects/{project}/artifacts/{key}/backports · rôles : athena-team-member, athena-admin */
    backports: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/backports', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/backports/cancel · rôles : athena-admin */
    cancelBackport: (path: { project: string; key: string }, body: { branch: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/backports/cancel', path), { body, query }),
    /** GET /v1/projects/{project}/artifacts/{key}/code-refs · rôles : athena-team-member, athena-admin */
    codeRefs: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/code-refs', path), { query }),
    /** GET /v1/projects/{project}/code-repos · rôles : athena-team-member, athena-admin */
    codeRepos: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/code-repos', path), { query }),
    /** GET /v1/projects/{project}/docs/{source}/coverage · rôles : athena-team-member, athena-admin */
    coverage: (path: { project: string; source: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/docs/{source}/coverage', path), { query }),
    /** POST /v1/projects/{project}/baselines · rôles : athena-admin, athena-pm */
    createBaseline: (path: { project: string }, body: { name: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/baselines', path), { body, query }),
    /** POST /v1/projects/{project}/artifacts/{key}/branch · rôles : athena-team-member, athena-admin */
    createBranch: (path: { project: string; key: string }, body: { type: "bugfix" | "feature"; repo?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/branch', path), { body, query }),
    /** POST /v1/projects/{project}/inbound-sources · rôles : athena-admin */
    createInbound: (path: { project: string }, body: { name: string; mapping: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/inbound-sources', path), { body, query }),
    /** POST /v1/projects/{project}/artifacts/{key}/merge-request · rôles : athena-team-member, athena-admin */
    createMergeRequest: (path: { project: string; key: string }, body: { branch: string; repo?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/merge-request', path), { body, query }),
    /** POST /v1/projects/{project}/automations · rôles : athena-admin, athena-pm */
    createRule: (path: { project: string }, body: Record<string, unknown>, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/automations', path), { body, query }),
    /** POST /v1/webhooks · rôles : athena-admin */
    createWebhook: (body: { url: string; eventTypes: Array<string>; description?: string; exportControlOk?: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/webhooks', {}), { body, query }),
    /** GET /v1/webhooks/{id}/deliveries · rôles : athena-admin */
    deliveries: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/webhooks/{id}/deliveries', path), { query }),
    /** GET /v1/projects/{project}/baselines-diff · rôles : athena-team-member, athena-admin */
    diffBaselines: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/baselines-diff', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/doc-links · rôles : athena-team-member, athena-admin */
    docLink: (path: { project: string; key: string }, body: { source: string; uid: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/doc-links', path), { body, query }),
    /** GET /v1/projects/{project}/artifacts/{key}/doc-links · rôles : athena-team-member, athena-admin */
    docLinks: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/doc-links', path), { query }),
    /** GET /v1/projects/{project}/dora · rôles : athena-team-member, athena-admin */
    dora: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/dora', path), { query }),
    /** GET /v1/projects/{project}/baselines-diff/export · rôles : athena-team-member, athena-admin */
    exportBaselineDiff: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/baselines-diff/export', path), { query }),
    /** GET /v1/field-types · rôles : athena-team-member, athena-admin */
    fieldTypeNames: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/field-types', {}), { query }),
    /** POST /v1/projects/{project}/integrations/gitlab · rôles : athena-admin */
    gitlabIntegration: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/integrations/gitlab', path), { query }),
    /** POST /v1/projects/{project}/integrations/history · rôles : athena-admin */
    historyIntegration: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/integrations/history', path), { query }),
    /** POST /v1/projects/{project}/import · rôles : athena-admin */
    importData: (path: { project: string }, body: { source: "jira" | "tuleap"; content: unknown; config: unknown; statusMap: Record<string, unknown>; dryRun?: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/import', path), { body, query }),
    /** POST /v1/projects/{project}/docs/{source}/index · rôles : athena-admin */
    indexDocs: (path: { project: string; source: string }, body: { files: Array<{ path: string; content: string }>; gitSha?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/docs/{source}/index', path), { body, query }),
    /** POST /v1/plugins · rôles : athena-admin */
    installPlugin: (body: { package: { manifest: unknown; code: string; signature: string }; granted?: Array<"storage" | "artifacts:read"> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/plugins', {}), { body, query }),
    /** GET /v1/projects/{project}/baselines · rôles : athena-team-member, athena-admin */
    listBaselines: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/baselines', path), { query }),
    /** GET /v1/plugins · rôles : athena-admin */
    listPlugins: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/plugins', {}), { query }),
    /** GET /v1/projects/{project}/automations · rôles : athena-team-member, athena-admin */
    listRules: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/automations', path), { query }),
    /** GET /v1/webhooks · rôles : athena-admin */
    listWebhooks: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/webhooks', {}), { query }),
    /** GET /v1/widgets · rôles : athena-team-member, athena-admin */
    listWidgets: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/widgets', {}), { query }),
    /** POST /v1/projects/{project}/history/migrate-keys · rôles : athena-admin */
    migrateKeys: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/history/migrate-keys', path), { query }),
    /** POST /v1/projects/{project}/artifacts/{key}/backports · rôles : athena-team-member, athena-admin */
    planBackports: (path: { project: string; key: string }, body: { branches: Array<string> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/backports', path), { body, query }),
    /** POST /v1/plugins/{id}/actions/{name} · rôles : athena-team-member, athena-admin */
    pluginAction: (path: { id: string; name: string }, body: { key?: string; version?: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/plugins/{id}/actions/{name}', path), { body, query }),
    /** POST /v1/projects/{project}/plugins/{id}/connectors/{name} · rôles : athena-team-member, athena-admin */
    pluginConnector: (path: { project: string; id: string; name: string }, body: { payload: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/plugins/{id}/connectors/{name}', path), { body, query }),
    /** GET /v1/plugins/{id}/widgets/{name} · rôles : athena-team-member, athena-admin */
    pluginWidget: (path: { id: string; name: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/plugins/{id}/widgets/{name}', path), { query }),
    /** POST /v1/projects/{project}/rebuild · rôles : athena-admin */
    rebuild: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/rebuild', path), { query }),
    /** POST /hooks/in/gitlab/{org}/{project} · public */
    receiveGitlab: (path: { org: string; project: string }, body: Record<string, unknown>, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/hooks/in/gitlab/{org}/{project}', path), { body, query }),
    /** POST /hooks/in/history/{org}/{project} · public */
    receiveHistory: (path: { org: string; project: string }, body: Record<string, unknown>, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/hooks/in/history/{org}/{project}', path), { body, query }),
    /** POST /hooks/in/source/{org}/{project}/{name} · public */
    receiveInbound: (path: { org: string; project: string; name: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/hooks/in/source/{org}/{project}/{name}', path), { query }),
    /** GET /v1/projects/{project}/releases/{id}/notes · rôles : athena-team-member, athena-admin */
    releaseNotes: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/releases/{id}/notes', path), { query }),
    /** POST /v1/webhooks/deliveries/{id}/replay · rôles : athena-admin */
    replay: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/webhooks/deliveries/{id}/replay', path), { query }),
    /** GET /v1/automations/{id}/runs · rôles : athena-admin, athena-pm */
    ruleRuns: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/automations/{id}/runs', path), { query }),
    /** POST /v1/projects/{project}/docs/{source}/sync · rôles : athena-admin */
    syncDocs: (path: { project: string; source: string }, body: { repo: string; ref?: string; path?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/docs/{source}/sync', path), { body, query }),
    /** POST /v1/plugins/{id}/{state} · rôles : athena-admin */
    togglePlugin: (path: { id: string; state: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/plugins/{id}/{state}', path), { query }),
    /** POST /v1/automations/{id}/{state} · rôles : athena-admin, athena-pm */
    toggleRule: (path: { id: string; state: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/automations/{id}/{state}', path), { query }),
    /** DELETE /v1/plugins/{id} · rôles : athena-admin */
    uninstallPlugin: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/plugins/{id}', path), { query }),
    /** POST /v1/projects/{project}/docs/{source}/writeback · rôles : athena-admin */
    writebackDocs: (path: { project: string; source: string }, body: { repo: string; ref?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/docs/{source}/writeback', path), { body, query }),
  };

  readonly itemApproval = {
    /** POST /v1/projects/{project}/artifacts/{key}/approval/decision · rôles : athena-team-member, athena-admin, athena-qa */
    decide: (path: { project: string; key: string }, body: { decision: "approved" | "rejected"; comment?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/artifacts/{key}/approval/decision', path), { body, query }),
    /** GET /v1/projects/{project}/trackers/{tracker}/approval-flow · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    flow: (path: { project: string; tracker: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/trackers/{tracker}/approval-flow', path), { query }),
    /** PUT /v1/projects/{project}/trackers/{tracker}/approval-flow · rôles : athena-admin, athena-pm */
    setFlow: (path: { project: string; tracker: string }, body: { enabled: boolean; steps: Array<{ name: string; kind: "review" | "approval"; approvers?: Array<string>; role?: unknown; minApprovals?: number }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/trackers/{tracker}/approval-flow', path), { body, query }),
    /** GET /v1/projects/{project}/artifacts/{key}/approval · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    state: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/approval', path), { query }),
  };

  readonly lifecycle = {
    /** GET /v1/lifecycle · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    config: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/lifecycle', {}), { query }),
    /** GET /v1/projects/{p}/lifecycle · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    forProject: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{p}/lifecycle', path), { query }),
    /** PUT /v1/admin/lifecycle · rôles : athena-admin */
    put: (body: { states: Array<{ key: string; name: string; category: "pipeline" | "active" | "suspended" | "closed" | "cancelled" | "archived"; hidden?: boolean }>; transitions: Array<{ from: string; to: string; roles: Array<"manager" | "pmo"> }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/admin/lifecycle', {}), { body, query }),
    /** DELETE /v1/admin/lifecycle · rôles : athena-admin */
    reset: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/admin/lifecycle', {}), { query }),
    /** POST /v1/projects/{p}/lifecycle/transition · rôles : athena-admin, athena-pmo, athena-pm */
    transition: (path: { p: string }, body: { to: string; reason?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{p}/lifecycle/transition', path), { body, query }),
  };

  readonly linkType = {
    /** POST /v1/link-types · rôles : athena-admin */
    create: (body: { outwardLabel: string; inwardLabel: string; hierarchical?: boolean; propagatesSuspect?: boolean; ordered?: boolean; pairs?: Array<{ from: string; to: string }>; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/link-types', {}), { body, query }),
    /** GET /v1/link-types · rôles : athena-team-member, athena-admin */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/link-types', {}), { query }),
    /** DELETE /v1/link-types/{key} · rôles : athena-admin */
    remove: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/link-types/{key}', path), { query }),
    /** PUT /v1/link-types/{key} · rôles : athena-admin */
    update: (path: { key: string }, body: { outwardLabel: string; inwardLabel: string; hierarchical?: boolean; propagatesSuspect?: boolean; ordered?: boolean; pairs?: Array<{ from: string; to: string }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/link-types/{key}', path), { body, query }),
  };

  readonly matrix = {
    /** GET /v1/projects/{project}/matrix · rôles : athena-team-member, athena-admin */
    get: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/matrix', path), { query }),
  };

  readonly member = {
    /** GET /v1/projects/{project}/members · rôles : athena-team-member, athena-admin, athena-pm */
    list: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/members', path), { query }),
    /** DELETE /v1/projects/{project}/members/{subject} · rôles : athena-admin, athena-pm */
    remove: (path: { project: string; subject: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/members/{subject}', path), { query }),
    /** PUT /v1/projects/{project}/members/{subject} · rôles : athena-admin, athena-pm */
    set: (path: { project: string; subject: string }, body: { role: "manager" | "member" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/members/{subject}', path), { body, query }),
    /** GET /v1/users · rôles : athena-admin, athena-pmo, athena-pm */
    users: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/users', {}), { query }),
  };

  readonly metrics = {
    /** GET /metrics · public */
    scrape: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/metrics', {}), { query }),
  };

  readonly normative = {
    /** DELETE /v1/projects/{project}/tailoring/{category}/{clause} · rôles : athena-admin, athena-pm */
    clearTailoring: (path: { project: string; category: string; clause: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/tailoring/{category}/{clause}', path), { query }),
    /** GET /v1/projects/{project}/conformity · rôles : athena-team-member, athena-admin, athena-pm */
    conformity: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/conformity', path), { query }),
    /** GET /v1/projects/{project}/conformity/export · rôles : athena-team-member, athena-admin, athena-pm */
    conformityExport: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/conformity/export', path), { query }),
    /** POST /v1/projects/{project}/clauses/import · rôles : athena-admin, athena-pm */
    importClauses: (path: { project: string }, body: { csv: string; standard?: string; tracker?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/clauses/import', path), { body, query }),
    /** PUT /v1/projects/{project}/tailoring · rôles : athena-admin, athena-pm */
    setTailoring: (path: { project: string }, body: { clause: string; category?: string; applicability: "applicable" | "not_applicable" | "modified"; justification?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/tailoring', path), { body, query }),
    /** GET /v1/projects/{project}/tailoring · rôles : athena-team-member, athena-admin, athena-pm */
    tailoring: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/tailoring', path), { query }),
  };

  readonly notify = {
    /** GET /v1/me/notification-digest · rôles : athena-team-member, athena-admin, athena-qa */
    digestSettings: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/notification-digest', {}), { query }),
    /** GET /v1/me/notifications · rôles : athena-team-member, athena-admin, athena-qa */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/notifications', {}), { query }),
    /** GET /v1/projects/{project}/artifacts/{key}/mentionable · rôles : athena-team-member, athena-admin */
    mentionable: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/artifacts/{key}/mentionable', path), { query }),
    /** GET /v1/me/notification-prefs · rôles : athena-team-member, athena-admin, athena-qa */
    prefs: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/notification-prefs', {}), { query }),
    /** POST /v1/me/notifications/read · rôles : athena-team-member, athena-admin, athena-qa */
    read: (body: { ids?: Array<string>; all?: boolean; read?: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/me/notifications/read', {}), { body, query }),
    /** PUT /v1/me/notification-digest · rôles : athena-team-member, athena-admin, athena-qa */
    setDigest: (body: { enabled: boolean; hour: number; timezone: string; locale: "fr" | "en" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/me/notification-digest', {}), { body, query }),
    /** PUT /v1/me/notification-prefs/{event} · rôles : athena-team-member, athena-admin, athena-qa */
    setPref: (path: { event: string }, body: { enabled: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/me/notification-prefs/{event}', path), { body, query }),
    /** GET /v1/me/events · rôles : athena-team-member, athena-admin, athena-qa */
    stream: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/events', {}), { query }),
    /** POST /v1/projects/{project}/subscriptions · rôles : athena-team-member, athena-admin, athena-qa */
    subscribe: (path: { project: string }, body: { scope: "item" | "tracker" | "view"; ref: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/subscriptions', path), { body, query }),
    /** GET /v1/projects/{project}/subscriptions · rôles : athena-team-member, athena-admin, athena-qa */
    subscriptions: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/subscriptions', path), { query }),
    /** DELETE /v1/subscriptions/{id} · rôles : athena-team-member, athena-admin, athena-qa */
    unsubscribe: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/subscriptions/{id}', path), { query }),
  };

  readonly openApi = {
    /** GET /v1/openapi.json · rôles : athena-team-member, athena-admin */
    spec: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/openapi.json', {}), { query }),
  };

  readonly pat = {
    /** POST /v1/me/tokens · rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance */
    create: (body: { name: string; scope?: "read" | "write"; expiresInDays: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/me/tokens', {}), { body, query }),
    /** GET /v1/me/tokens · rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/tokens', {}), { query }),
    /** DELETE /v1/me/tokens/{id} · rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance */
    revoke: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/me/tokens/{id}', path), { query }),
  };

  readonly pin = {
    /** PUT /v1/me/pins/favorite · rôles : athena-team-member, athena-admin */
    favorite: (body: { kind: "project" | "tracker" | "view" | "item"; project: string; ref: string; label: string; favorite: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/me/pins/favorite', {}), { body, query }),
    /** GET /v1/me/pins · rôles : athena-team-member, athena-admin */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/pins', {}), { query }),
    /** PUT /v1/me/pins/order · rôles : athena-team-member, athena-admin */
    order: (body: { ids: Array<string> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/me/pins/order', {}), { body, query }),
    /** POST /v1/me/pins/visit · rôles : athena-team-member, athena-admin */
    visit: (body: { kind: "project" | "tracker" | "view" | "item"; project: string; ref: string; label: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/me/pins/visit', {}), { body, query }),
  };

  readonly planning = {
    /** POST /v1/projects/{project}/schedule/apply · rôles : athena-admin, athena-pm */
    apply: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/schedule/apply', path), { query }),
    /** GET /v1/projects/{project}/schedule/baselines · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    baselines: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/schedule/baselines', path), { query }),
    /** PATCH /v1/projects/{project}/schedule/tasks/{key} · rôles : athena-admin, athena-pm */
    editTask: (path: { project: string; key: string }, body: { start?: string; due?: string; duration?: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/schedule/tasks/{key}', path), { body, query }),
    /** GET /v1/projects/{project}/schedule · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    get: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/schedule', path), { query }),
    /** PATCH /v1/projects/{project}/schedule/links/{id} · rôles : athena-admin, athena-pm */
    setLag: (path: { project: string; id: string }, body: { lagDays: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/schedule/links/{id}', path), { body, query }),
  };

  readonly portfolio = {
    /** GET /v1/portfolios/{key}/actions · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    actions: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/actions', path), { query }),
    /** GET /v1/portfolios/{key}/alerts · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    alerts: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/alerts', path), { query }),
    /** POST /v1/portfolios · rôles : athena-admin, athena-pmo */
    create: (body: { key: string; name: string; description?: string; owner?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios', {}), { body, query }),
    /** POST /v1/portfolios/{key}/decisions/{id}/apply · rôles : athena-admin, athena-finance */
    decisionApply: (path: { key: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/decisions/{id}/apply', path), { query }),
    /** POST /v1/portfolios/{key}/decisions · rôles : athena-admin, athena-pmo */
    decisionCreate: (path: { key: string }, body: { project: string; kind: "continue" | "suspend" | "stop" | "close" | "change"; rationale: string; conditions?: string; owner?: string; dueOn?: string; reviewId?: string; costDelta?: number; scheduleDeltaDays?: number; budgetCategory?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/decisions', path), { body, query }),
    /** GET /v1/portfolios/{key}/decisions · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    decisionList: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/decisions', path), { query }),
    /** GET /v1/portfolios/{key}/gates · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    gates: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/gates', path), { query }),
    /** GET /v1/portfolios/{key} · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    get: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}', path), { query }),
    /** GET /v1/portfolios/{key}/health · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    health: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/health', path), { query }),
    /** GET /v1/portfolios · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios', {}), { query }),
    /** GET /v1/portfolios/{key}/milestone-trend/{project} · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    milestoneTrend: (path: { key: string; project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/milestone-trend/{project}', path), { query }),
    /** DELETE /v1/portfolios/{key} · rôles : athena-admin, athena-pmo */
    remove: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/portfolios/{key}', path), { query }),
    /** DELETE /v1/portfolios/{key}/projects/{project} · rôles : athena-admin, athena-pmo, athena-pm */
    removeProject: (path: { key: string; project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/portfolios/{key}/projects/{project}', path), { query }),
    /** PUT /v1/portfolios/{key}/snapshot-retention · rôles : athena-admin, athena-pmo */
    retention: (path: { key: string }, body: { weeks: unknown; reviewMonths: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/portfolios/{key}/snapshot-retention', path), { body, query }),
    /** POST /v1/portfolios/{key}/reviews · rôles : athena-admin, athena-pmo */
    reviewCreate: (path: { key: string }, body: { heldOn: string; summary?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/reviews', path), { body, query }),
    /** GET /v1/portfolios/{key}/reviews/{id} · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    reviewGet: (path: { key: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/reviews/{id}', path), { query }),
    /** GET /v1/portfolios/{key}/reviews · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    reviewList: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/reviews', path), { query }),
    /** PATCH /v1/portfolios/{key}/reviews/{id} · rôles : athena-admin, athena-pmo */
    reviewPatch: (path: { key: string; id: string }, body: { summary?: string; state?: "draft" | "held" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/portfolios/{key}/reviews/{id}', path), { body, query }),
    /** GET /v1/portfolios/{key}/risks · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    risks: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/risks', path), { query }),
    /** GET /v1/portfolios/{key}/roadmap · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    roadmap: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/roadmap', path), { query }),
    /** PUT /v1/portfolios/{key}/projects/{project} · rôles : athena-admin, athena-pmo, athena-pm */
    setProject: (path: { key: string; project: string }, body: { health?: unknown; note?: string; kind?: "delivery" | "pilot"; purpose?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/portfolios/{key}/projects/{project}', path), { body, query }),
    /** GET /v1/portfolios/{key}/snapshots/compare · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    snapshotCompare: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/snapshots/compare', path), { query }),
    /** GET /v1/portfolios/{key}/snapshots/{id} · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    snapshotGet: (path: { key: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/snapshots/{id}', path), { query }),
    /** GET /v1/portfolios/{key}/snapshots · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    snapshotList: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/snapshots', path), { query }),
    /** POST /v1/portfolios/{key}/snapshots · rôles : athena-admin, athena-pmo */
    snapshotTake: (path: { key: string }, body: { kind?: "manual" | "review"; label?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/snapshots', path), { body, query }),
    /** GET /v1/portfolios/summary · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    summaries: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/summary', {}), { query }),
    /** GET /v1/portfolios/{key}/trend · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    trend: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/trend', path), { query }),
    /** PATCH /v1/portfolios/{key} · rôles : athena-admin, athena-pmo */
    update: (path: { key: string }, body: { name?: string; description?: string; owner?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/portfolios/{key}', path), { body, query }),
    /** GET /v1/portfolios/usage · rôles : athena-admin, athena-pmo */
    usageReport: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/usage', {}), { query }),
  };

  readonly ppmSettings = {
    /** GET /v1/ppm-settings · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    get: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/ppm-settings', {}), { query }),
    /** PUT /v1/admin/ppm-settings · rôles : athena-admin */
    put: (body: { workdayMinutes?: number; snapshotFrequency?: "weekly" | "monthly"; snapshotWeeklyRetentionWeeks?: number; snapshotReviewRetentionMonths?: unknown; overloadPercent?: number; statusNoteStaleDays?: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/admin/ppm-settings', {}), { body, query }),
  };

  readonly preference = {
    /** GET /v1/me/preferences · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    get: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/preferences', {}), { query }),
    /** PUT /v1/me/preferences · rôles : athena-team-member, athena-admin, athena-pm, athena-qa */
    put: (body: { home?: unknown; locale?: unknown; theme?: unknown; density?: unknown; family?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/me/preferences', {}), { body, query }),
  };

  readonly prioritization = {
    /** POST /v1/requests/{ticket}/convert · rôles : athena-admin, athena-pmo */
    convert: (path: { ticket: string }, body: { project: string; name: string; template?: string; version?: string; criticality?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/requests/{ticket}/convert', path), { body, query }),
    /** GET /v1/portfolios/{key}/earned-value · rôles : athena-admin, athena-finance, athena-pmo, athena-director */
    earnedValue: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/earned-value', path), { query }),
    /** POST /v1/portfolios/{key}/scoring-model · rôles : athena-admin, athena-pmo */
    model: (path: { key: string }, body: { criteria: Array<{ key: string; label: string; weight: number; scaleMin: number; scaleMax: number; direction: "higher" | "lower" }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/scoring-model', path), { body, query }),
    /** POST /v1/objectives · rôles : athena-admin, athena-pmo */
    objective: (body: { key: string; name: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/objectives', {}), { body, query }),
    /** GET /v1/portfolios/{key}/objectives · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    objectiveFlow: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/objectives', path), { query }),
    /** POST /v1/objectives/{key}/projects · rôles : athena-admin, athena-pmo */
    objectiveLink: (path: { key: string }, body: { project: string; weight?: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/objectives/{key}/projects', path), { body, query }),
    /** GET /v1/portfolios/{key}/ranking · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    ranking: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/ranking', path), { query }),
    /** POST /v1/requests/{ticket}/refuse · rôles : athena-admin, athena-pmo */
    refuse: (path: { ticket: string }, body: { reason: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/requests/{ticket}/refuse', path), { body, query }),
    /** POST /v1/portfolios/{key}/scenarios · rôles : athena-admin, athena-pmo */
    scenarioCreate: (path: { key: string }, body: { name: string; changes: Array<unknown> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/scenarios', path), { body, query }),
    /** GET /v1/portfolios/{key}/scenarios/{id}/evaluate · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    scenarioEvaluate: (path: { key: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/scenarios/{id}/evaluate', path), { query }),
    /** GET /v1/portfolios/{key}/scenarios · rôles : athena-admin, athena-pmo, athena-pm, athena-director */
    scenarioList: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/portfolios/{key}/scenarios', path), { query }),
    /** POST /v1/portfolios/{key}/scores · rôles : athena-admin, athena-pmo */
    score: (path: { key: string }, body: { ticket: string; criterion: string; value: number }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/portfolios/{key}/scores', path), { body, query }),
  };

  readonly privacy = {
    /** POST /v1/admin/users/{subject}/erase · rôles : athena-admin */
    erase: (path: { subject: string }, body: { confirm: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/admin/users/{subject}/erase', path), { body, query }),
    /** GET /v1/me/data-export · rôles : athena-team-member, athena-admin, athena-pm, athena-pmo, athena-director, athena-finance */
    exportMine: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/me/data-export', {}), { query }),
    /** GET /v1/admin/users/{subject}/data-export · rôles : athena-admin */
    exportOf: (path: { subject: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/admin/users/{subject}/data-export', path), { query }),
  };

  readonly projectMeta = {
    /** GET /v1/projects/{p}/meta · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    get: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{p}/meta', path), { query }),
    /** PATCH /v1/projects/{p}/meta · rôles : athena-admin, athena-pm */
    patch: (path: { p: string }, body: { plannedStart?: unknown; plannedEnd?: unknown; sponsorSubject?: unknown; description?: string; capacityGranularity?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{p}/meta', path), { body, query }),
  };

  readonly projectOverview = {
    /** GET /v1/projects/{project}/activity · rôles : athena-team-member, athena-admin */
    activity: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/activity', path), { query }),
    /** GET /v1/projects/{project}/modules · rôles : athena-team-member, athena-admin */
    modules: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/modules', path), { query }),
    /** GET /v1/projects/{project}/overview · rôles : athena-team-member, athena-admin */
    overviewOf: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/overview', path), { query }),
  };

  readonly projectTemplate = {
    /** POST /v1/projects/{project}/template/phase/advance · rôles : athena-admin, athena-pm, athena-qa */
    advance: (path: { project: string }, body: { decision?: "go" | "go_with_reserves" | "no_go"; note?: string; heldOn?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/template/phase/advance', path), { body, query }),
    /** PUT /v1/projects/{project}/template/phase/criteria · rôles : athena-admin, athena-pm */
    checkCriterion: (path: { project: string }, body: { stage: "exit" | "entry"; label: string; checked: boolean; note?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/template/phase/criteria', path), { body, query }),
    /** PUT /v1/projects/{project}/template/phases/{phase} · rôles : athena-admin, athena-pm */
    phaseDates: (path: { project: string; phase: string }, body: { plannedStart?: unknown; plannedEnd?: unknown; reviewPlannedOn?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/template/phases/{phase}', path), { body, query }),
    /** POST /v1/projects/{project}/template/upgrade-preview · rôles : athena-admin */
    preview: (path: { project: string }, body: { version?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/template/upgrade-preview', path), { body, query }),
    /** GET /v1/projects/{project}/template · rôles : athena-team-member, athena-admin */
    status: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/template', path), { query }),
    /** POST /v1/projects/{project}/template/upgrade · rôles : athena-admin */
    upgrade: (path: { project: string }, body: { version?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/template/upgrade', path), { body, query }),
  };

  readonly savedFilter = {
    /** POST /v1/projects/{project}/filters · rôles : athena-team-member, athena-admin */
    create: (path: { project: string }, body: { name: string; query: string; shared?: boolean; trackerKey?: string; view?: string; columns?: Array<string>; isDefault?: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{project}/filters', path), { body, query }),
    /** GET /v1/projects/{project}/filters · rôles : athena-team-member, athena-admin */
    list: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/filters', path), { query }),
    /** DELETE /v1/projects/{project}/filters/{id} · rôles : athena-team-member, athena-admin */
    remove: (path: { project: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/filters/{id}', path), { query }),
    /** PATCH /v1/projects/{project}/filters/{id} · rôles : athena-team-member, athena-admin */
    setDefault: (path: { project: string; id: string }, body: { isDefault: boolean }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/projects/{project}/filters/{id}', path), { body, query }),
  };

  readonly search = {
    /** POST /v1/searches · rôles : athena-team-member, athena-admin */
    create: (body: { name: string; query: string; projects?: Array<string> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/searches', {}), { body, query }),
    /** GET /v1/search/facets · rôles : athena-team-member, athena-admin */
    facets: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/search/facets', {}), { query }),
    /** GET /v1/searches · rôles : athena-team-member, athena-admin */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/searches', {}), { query }),
    /** DELETE /v1/searches/{id} · rôles : athena-team-member, athena-admin */
    remove: (path: { id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/searches/{id}', path), { query }),
    /** GET /v1/search · rôles : athena-team-member, athena-admin */
    search: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/search', {}), { query }),
  };

  readonly sharedField = {
    /** DELETE /v1/shared-fields/{key} · rôles : athena-admin */
    deleteOrg: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/shared-fields/{key}', path), { query }),
    /** DELETE /v1/projects/{project}/shared-fields/{key} · rôles : athena-admin, athena-pm */
    deleteProject: (path: { project: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{project}/shared-fields/{key}', path), { query }),
    /** GET /v1/shared-fields · rôles : athena-team-member, athena-admin */
    listOrg: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/shared-fields', {}), { query }),
    /** GET /v1/projects/{project}/shared-fields · rôles : athena-team-member, athena-admin */
    listProject: (path: { project: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/shared-fields', path), { query }),
    /** PUT /v1/shared-fields/{key} · rôles : athena-admin */
    putOrg: (path: { key: string }, body: { label: string; type: string; config?: Record<string, unknown> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/shared-fields/{key}', path), { body, query }),
    /** PUT /v1/projects/{project}/shared-fields/{key} · rôles : athena-admin, athena-pm */
    putProject: (path: { project: string; key: string }, body: { label: string; type: string; config?: Record<string, unknown> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/projects/{project}/shared-fields/{key}', path), { body, query }),
  };

  readonly statusNote = {
    /** GET /v1/projects/{p}/status-notes · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    list: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{p}/status-notes', path), { query }),
    /** POST /v1/projects/{p}/status-notes · rôles : athena-admin, athena-pm */
    write: (path: { p: string }, body: { schedule: "ok" | "attention" | "critical"; scope: "ok" | "attention" | "critical"; risk: "ok" | "attention" | "critical"; resources?: unknown; cost?: unknown; comment?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{p}/status-notes', path), { body, query }),
  };

  readonly team = {
    /** POST /v1/teams · rôles : athena-admin, athena-pmo */
    create: (body: { key: string; name: string; description?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/teams', {}), { body, query }),
    /** GET /v1/teams/{key} · rôles : athena-admin, athena-pmo, athena-pm, athena-manager, athena-director */
    get: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/teams/{key}', path), { query }),
    /** GET /v1/teams · rôles : athena-admin, athena-pmo, athena-pm, athena-manager, athena-director */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/teams', {}), { query }),
    /** GET /v1/teams/{key}/load · rôles : athena-admin, athena-pmo, athena-pm, athena-manager, athena-director */
    load: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/teams/{key}/load', path), { query }),
    /** DELETE /v1/teams/{key} · rôles : athena-admin, athena-pmo */
    remove: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/teams/{key}', path), { query }),
    /** DELETE /v1/teams/{key}/members/{subject} · rôles : athena-admin, athena-pmo */
    removeMember: (path: { key: string; subject: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/teams/{key}/members/{subject}', path), { query }),
    /** PUT /v1/teams/{key}/members/{subject} · rôles : athena-admin, athena-pmo */
    setMember: (path: { key: string; subject: string }, body: { role: "manager" | "member" }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/teams/{key}/members/{subject}', path), { body, query }),
    /** PATCH /v1/teams/{key} · rôles : athena-admin, athena-pmo */
    update: (path: { key: string }, body: { name?: string; description?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PATCH', this.path('/v1/teams/{key}', path), { body, query }),
  };

  readonly template = {
    /** POST /v1/project-templates · rôles : athena-admin */
    create: (body: { key: string; name: string; description?: string; trackers?: Array<{ layout?: unknown; typeKey?: unknown; key: string; name: string; description?: string; fields: Array<{ key: unknown; label: unknown; type: unknown; config?: unknown; required?: unknown; semanticRole?: unknown; isContent?: unknown; readRoles?: unknown; writeRoles?: unknown }>; statuses: Array<{ key: unknown; name: unknown; category: unknown; color?: unknown }>; transitions: Array<{ name: unknown; from: unknown; to: unknown; conditions?: unknown; validators?: unknown; postActions?: unknown }> }>; fromProject?: { project: string; trackers?: Array<string> }; trackerTemplates?: Array<string>; normative?: { standards?: Array<{ key: string; name: string; edition: string; date?: string; url?: string }>; criticality?: { label: string; categories: Array<{ key: unknown; name: unknown }> }; reviews?: Array<{ key: string; name: string }>; phases?: Array<{ key: string; name: string; review: string; entryCriteria?: Array<unknown>; exitCriteria?: Array<unknown>; deliverables?: Array<unknown>; qaDecides?: boolean }>; deliverables?: Array<{ key: string; name: string; document?: string; categories?: Array<unknown> }>; rules?: Array<{ key: string; name: string; fromTracker: string; linkType: string; direction?: "in" | "out" | "any"; minCount?: number; statuses?: Array<unknown>; threshold?: { target?: unknown; warning?: unknown } }>; parameters?: Array<{ key: string; label: string; unit?: string; byCategory?: Record<string, unknown> }>; marking?: { fields?: Array<string> }; mandatory?: Array<string>; remove?: Array<string> }; parent?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/project-templates', {}), { body, query }),
    /** GET /v1/project-templates/{key}/export · rôles : athena-admin */
    exportYaml: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/project-templates/{key}/export', path), { query }),
    /** POST /v1/project-templates/import · rôles : athena-admin */
    importYaml: (body: { yaml: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/project-templates/import', {}), { body, query }),
    /** GET /v1/project-templates · rôles : athena-admin */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/project-templates', {}), { query }),
    /** POST /v1/project-templates/{key}/publish · rôles : athena-admin */
    publish: (path: { key: string }, body: { version?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/project-templates/{key}/publish', path), { body, query }),
    /** DELETE /v1/project-templates/{key} · rôles : athena-admin */
    remove: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/project-templates/{key}', path), { query }),
    /** GET /v1/project-templates/{key}/resolved · rôles : athena-admin */
    resolved: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/project-templates/{key}/resolved', path), { query }),
    /** PUT /v1/project-templates/{key} · rôles : athena-admin */
    update: (path: { key: string }, body: { name: string; description?: string; trackers: Array<{ layout?: unknown; typeKey?: unknown; key: string; name: string; description?: string; fields: Array<{ key: unknown; label: unknown; type: unknown; config?: unknown; required?: unknown; semanticRole?: unknown; isContent?: unknown; readRoles?: unknown; writeRoles?: unknown }>; statuses: Array<{ key: unknown; name: unknown; category: unknown; color?: unknown }>; transitions: Array<{ name: unknown; from: unknown; to: unknown; conditions?: unknown; validators?: unknown; postActions?: unknown }> }>; normative?: { standards?: Array<{ key: string; name: string; edition: string; date?: string; url?: string }>; criticality?: { label: string; categories: Array<{ key: unknown; name: unknown }> }; reviews?: Array<{ key: string; name: string }>; phases?: Array<{ key: string; name: string; review: string; entryCriteria?: Array<unknown>; exitCriteria?: Array<unknown>; deliverables?: Array<unknown>; qaDecides?: boolean }>; deliverables?: Array<{ key: string; name: string; document?: string; categories?: Array<unknown> }>; rules?: Array<{ key: string; name: string; fromTracker: string; linkType: string; direction?: "in" | "out" | "any"; minCount?: number; statuses?: Array<unknown>; threshold?: { target?: unknown; warning?: unknown } }>; parameters?: Array<{ key: string; label: string; unit?: string; byCategory?: Record<string, unknown> }>; marking?: { fields?: Array<string> }; mandatory?: Array<string>; remove?: Array<string> }; parent?: unknown }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/project-templates/{key}', path), { body, query }),
    /** GET /v1/project-templates/{key}/versions · rôles : athena-admin */
    versions: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/project-templates/{key}/versions', path), { query }),
  };

  readonly trackerTemplate = {
    /** POST /v1/tracker-templates · rôles : athena-admin */
    create: (body: { key: string; name: string; description?: string; tracker?: { layout?: unknown; typeKey?: unknown; key: string; name: string; description?: string; fields: Array<{ key: string; label: string; type: string; config?: Record<string, unknown>; required?: boolean; semanticRole?: "title" | "description" | "status" | "assignee" | "due_date" | "estimate" | "priority" | "version" | "start_date" | "progress" | "remaining" | "probability" | "impact"; isContent?: boolean; readRoles?: Array<unknown>; writeRoles?: Array<unknown> }>; statuses: Array<{ key: string; name: string; category: "todo" | "in_progress" | "done"; color?: unknown }>; transitions: Array<{ name: string; from: string | null; to: string; conditions?: Array<unknown>; validators?: Array<unknown>; postActions?: Array<unknown> }> }; fromTracker?: { project: string; tracker: string } }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/tracker-templates', {}), { body, query }),
    /** GET /v1/tracker-templates · rôles : athena-admin, athena-pm */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/tracker-templates', {}), { query }),
    /** DELETE /v1/tracker-templates/{key} · rôles : athena-admin */
    remove: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/tracker-templates/{key}', path), { query }),
    /** PUT /v1/tracker-templates/{key} · rôles : athena-admin */
    update: (path: { key: string }, body: { name: string; description?: string; tracker: { layout?: unknown; typeKey?: unknown; key: string; name: string; description?: string; fields: Array<{ key: string; label: string; type: string; config?: Record<string, unknown>; required?: boolean; semanticRole?: "title" | "description" | "status" | "assignee" | "due_date" | "estimate" | "priority" | "version" | "start_date" | "progress" | "remaining" | "probability" | "impact"; isContent?: boolean; readRoles?: Array<unknown>; writeRoles?: Array<unknown> }>; statuses: Array<{ key: string; name: string; category: "todo" | "in_progress" | "done"; color?: unknown }>; transitions: Array<{ name: string; from: string | null; to: string; conditions?: Array<unknown>; validators?: Array<unknown>; postActions?: Array<unknown> }> } }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/tracker-templates/{key}', path), { body, query }),
  };

  readonly trackerType = {
    /** POST /v1/tracker-types · rôles : athena-admin */
    create: (body: { name: string; description?: string; category: "engineering" | "development" | "verification" | "management"; defaultViews: Array<"tableau" | "board" | "arbre" | "matrice" | "document" | "timeline" | "calendrier">; baseFields?: Array<{ key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown>; semanticRole?: "title" | "description" | "status" | "assignee" | "due_date" | "estimate" | "priority" | "version" | "start_date" | "progress" | "remaining" | "probability" | "impact" }>; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/tracker-types', {}), { body, query }),
    /** GET /v1/tracker-types · rôles : athena-team-member, athena-admin */
    list: (query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/tracker-types', {}), { query }),
    /** DELETE /v1/tracker-types/{key} · rôles : athena-admin */
    remove: (path: { key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/tracker-types/{key}', path), { query }),
    /** PUT /v1/tracker-types/{key} · rôles : athena-admin */
    update: (path: { key: string }, body: { name: string; description?: string; category: "engineering" | "development" | "verification" | "management"; defaultViews: Array<"tableau" | "board" | "arbre" | "matrice" | "document" | "timeline" | "calendrier">; baseFields?: Array<{ key: string; label: string; type: string; required?: boolean; config?: Record<string, unknown>; semanticRole?: "title" | "description" | "status" | "assignee" | "due_date" | "estimate" | "priority" | "version" | "start_date" | "progress" | "remaining" | "probability" | "impact" }> }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('PUT', this.path('/v1/tracker-types/{key}', path), { body, query }),
  };

  readonly tree = {
    /** GET /v1/projects/{project}/trackers/{tracker}/tree · rôles : athena-team-member, athena-admin */
    children: (path: { project: string; tracker: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{project}/trackers/{tracker}/tree', path), { query }),
  };

  readonly worklog = {
    /** POST /v1/projects/{p}/artifacts/{key}/worklog · rôles : athena-team-member, athena-admin, athena-pm, athena-manager */
    add: (path: { p: string; key: string }, body: { day: string; minutes: number; comment?: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('POST', this.path('/v1/projects/{p}/artifacts/{key}/worklog', path), { body, query }),
    /** GET /v1/projects/{p}/artifacts/{key}/worklog · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    forTicket: (path: { p: string; key: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{p}/artifacts/{key}/worklog', path), { query }),
    /** GET /v1/projects/{p}/planned-vs-consumed · rôles : athena-team-member, athena-admin, athena-pmo, athena-pm, athena-qa, athena-manager, athena-director */
    plannedVsConsumed: (path: { p: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('GET', this.path('/v1/projects/{p}/planned-vs-consumed', path), { query }),
    /** DELETE /v1/projects/{p}/worklog/{id} · rôles : athena-team-member, athena-admin, athena-pm, athena-manager */
    remove: (path: { p: string; id: string }, query?: Record<string, string | number | boolean | undefined>): Promise<unknown> => this.request('DELETE', this.path('/v1/projects/{p}/worklog/{id}', path), { query }),
  };

}
