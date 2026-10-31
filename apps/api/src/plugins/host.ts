import { fork, type ChildProcess } from 'node:child_process';
import { dirname, join } from 'node:path';
import type { Manifest, Permission } from './manifest';

export interface PluginApi {
  log(message: string): void;
  storageGet(key: string): Promise<unknown>;
  storageSet(key: string, value: unknown): Promise<void>;
  storageDelete(key: string): Promise<void>;
  artifactGet(key: string): Promise<unknown>;
}

export interface HostOptions {
  /** Délai maximal d'un appel (ms). Au-delà, le processus est tué. */
  callTimeoutMs: number;
  /** Mémoire maximale du tas du plugin (Mo). */
  maxMemoryMb: number;
}
export const defaultHostOptions: HostOptions = { callTimeoutMs: 2000, maxMemoryMb: 48 };

export class PluginCrashed extends Error {}
export class PluginTimeout extends Error {}
export class PluginError extends Error {}

const RUNNER = join(__dirname, 'runner.cjs');

/**
 * Hôte d'un plugin : un processus Node par plugin, lancé avec le modèle de permissions (aucune écriture
 * disque, aucun processus enfant, aucun worker), mémoire bornée, délai par appel, API figée.
 * Les permissions déclarées dans le manifeste (et accordées) sont contrôlées ICI, côté hôte.
 */
export class PluginHost {
  private child: ChildProcess | null = null;
  private nextId = 1;
  private readonly waiting = new Map<number, { resolve: (v: string | undefined) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  fieldTypes: string[] = [];
  hooks: string[] = [];
  actions: string[] = [];
  widgets: string[] = [];

  constructor(
    readonly manifest: Manifest,
    private readonly code: string,
    private readonly granted: Set<Permission>,
    private readonly api: PluginApi,
    private readonly options: HostOptions = defaultHostOptions,
  ) {}

  async start(): Promise<void> {
    const child = fork(RUNNER, [], {
      execArgv: ['--experimental-permission', `--allow-fs-read=${dirname(RUNNER)}`, `--max-old-space-size=${this.options.maxMemoryMb}`, '--disable-proto=delete'],
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      env: {},
      serialization: 'json',
    });
    this.child = child;
    child.on('message', (m: any) => this.onMessage(m));
    child.on('exit', () => this.onExit());
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new PluginCrashed('démarrage trop long')), 5000);
      const handler = (m: any) => { if (m?.type === 'ready') { clearTimeout(timer); child.off('message', handler); resolve(); } };
      child.on('message', handler);
      child.once('exit', () => { clearTimeout(timer); reject(new PluginCrashed('le plugin s\'est arrêté au démarrage')); });
    });
    const info = JSON.parse((await this.request({ type: 'load', code: this.code })) ?? '{}') as { fieldTypes: string[]; hooks: string[]; actions?: string[]; widgets?: string[] };
    const declaredTypes = new Set(this.manifest.contributes.fieldTypes);
    const declaredHooks = new Set(this.manifest.contributes.hooks);
    // Un plugin ne peut contribuer que ce que son manifeste (donc sa signature) déclare.
    this.fieldTypes = info.fieldTypes.filter((n) => declaredTypes.has(n));
    this.hooks = info.hooks.filter((n) => declaredHooks.has(n as never));
    this.actions = (info.actions ?? []).filter((n) => this.manifest.contributes.actions.includes(n));
    this.widgets = (info.widgets ?? []).filter((n) => this.manifest.contributes.widgets.includes(n));
  }

  async validateFieldType(name: string, value: unknown, config: unknown): Promise<string | null> {
    const result = await this.request({ type: 'call', kind: 'fieldType', name, args: JSON.stringify([value, config]) });
    const parsed = result === undefined ? null : (JSON.parse(result) as unknown);
    return typeof parsed === 'string' ? parsed : null;
  }

  async runHook(name: string, payload: unknown): Promise<void> {
    await this.request({ type: 'call', kind: 'hook', name, args: JSON.stringify([payload]) });
  }

  /** Exécute une action déclarée ; le résultat (JSON) est borné à 100 Ko. */
  async runAction(name: string, payload: unknown): Promise<unknown> {
    return this.callJson('action', name, payload);
  }

  /** Calcule le modèle de données d'un widget. */
  async runWidget(name: string, context: unknown): Promise<unknown> {
    return this.callJson('widget', name, context);
  }

  private async callJson(kind: 'action' | 'widget', name: string, input: unknown): Promise<unknown> {
    const list = kind === 'action' ? this.actions : this.widgets;
    if (!list.includes(name)) throw new PluginError(`${kind === 'action' ? 'Action' : 'Widget'} inconnu : ${name}`);
    const result = await this.request({ type: 'call', kind, name, args: JSON.stringify([input]) });
    if (result !== undefined && result.length > 100_000) throw new PluginError('résultat trop volumineux');
    return result === undefined ? null : JSON.parse(result);
  }

  stop(): void {
    this.child?.kill('SIGKILL');
    this.child = null;
  }

  private request(message: Record<string, unknown>): Promise<string | undefined> {
    const child = this.child;
    if (!child || !child.connected) return Promise.reject(new PluginCrashed('plugin arrêté'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new PluginTimeout(`délai dépassé (${this.options.callTimeoutMs} ms)`));
        this.stop(); // un plugin qui dépasse son délai est arrêté (boucle infinie, blocage)
      }, this.options.callTimeoutMs);
      this.waiting.set(id, { resolve, reject, timer });
      child.send({ ...message, id });
    });
  }

  private onMessage(message: { type: string; id?: number; result?: string; error?: string; method?: string; args?: string }): void {
    if (message.type === 'done' && message.id !== undefined) {
      const entry = this.waiting.get(message.id);
      if (!entry) return;
      this.waiting.delete(message.id);
      clearTimeout(entry.timer);
      if (message.error) entry.reject(new PluginError(message.error));
      else entry.resolve(message.result);
    } else if (message.type === 'rpc' && message.id !== undefined) {
      void this.rpc(message.id, message.method ?? '', message.args ?? '[]');
    }
  }

  private async rpc(id: number, method: string, argsJson: string): Promise<void> {
    try {
      if (argsJson.length > 100_000) throw new Error('message trop volumineux');
      const args = JSON.parse(argsJson) as unknown[];
      const need = (permission: Permission) => {
        if (!this.granted.has(permission)) throw new Error(`permission refusée : ${permission}`);
      };
      let result: unknown;
      switch (method) {
        case 'log': this.api.log(String(args[0])); break;
        case 'storage.get': need('storage'); result = await this.api.storageGet(String(args[0])); break;
        case 'storage.set': need('storage'); await this.api.storageSet(String(args[0]), args[1]); break;
        case 'storage.delete': need('storage'); await this.api.storageDelete(String(args[0])); break;
        case 'artifacts.get': need('artifacts:read'); result = await this.api.artifactGet(String(args[0])); break;
        default: throw new Error(`appel inconnu : ${method}`);
      }
      this.child?.send({ type: 'rpc-result', id, result: result === undefined ? undefined : JSON.stringify(result) });
    } catch (error) {
      this.child?.send({ type: 'rpc-result', id, error: (error as Error).message.slice(0, 200) });
    }
  }

  private onExit(): void {
    for (const [id, entry] of this.waiting) {
      clearTimeout(entry.timer);
      entry.reject(new PluginCrashed('le plugin s\'est arrêté (mémoire ou erreur fatale)'));
      this.waiting.delete(id);
    }
    this.child = null;
  }
}
