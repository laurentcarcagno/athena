export interface LoopStats {
  name: string;
  runs: number;
  failures: number;
  lastRunAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
}

export interface LoopOptions {
  intervalMs: number;
  /** Plafond du recul exponentiel après des échecs consécutifs. */
  maxBackoffMs?: number;
  log?: (message: string) => void;
}

/**
 * Boucle périodique tolérante aux pannes : une erreur n'arrête jamais le worker, l'intervalle double à chaque
 * échec consécutif (jusqu'au plafond) puis revient à la normale au premier succès. Arrêt propre : `stop()`
 * attend la fin du cycle en cours.
 */
export class WorkerLoop {
  readonly stats: LoopStats;
  private stopping = false;
  private running: Promise<void> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private wake: (() => void) | null = null;

  constructor(
    readonly name: string,
    private readonly task: () => Promise<unknown>,
    private readonly options: LoopOptions,
  ) {
    this.stats = { name, runs: 0, failures: 0, lastRunAt: null, lastError: null, consecutiveFailures: 0 };
  }

  start(): void {
    if (this.running) return;
    this.running = this.loop();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    this.wake?.();
    await this.running;
  }

  /** Exécute un cycle immédiatement (utilisé par les tests et les arrêts propres). */
  async runOnce(): Promise<void> {
    try {
      await this.task();
      this.stats.consecutiveFailures = 0;
      this.stats.lastError = null;
    } catch (error) {
      this.stats.failures += 1;
      this.stats.consecutiveFailures += 1;
      this.stats.lastError = (error as Error).message.slice(0, 200);
      this.options.log?.(`${this.name}: échec : ${this.stats.lastError}`);
    } finally {
      this.stats.runs += 1;
      this.stats.lastRunAt = Date.now();
    }
  }

  private delay(): number {
    const max = this.options.maxBackoffMs ?? 60_000;
    return Math.min(this.options.intervalMs * 2 ** Math.min(this.stats.consecutiveFailures, 10), max);
  }

  private async loop(): Promise<void> {
    while (!this.stopping) {
      await this.runOnce();
      if (this.stopping) break;
      await new Promise<void>((resolve) => {
        this.wake = resolve;
        this.timer = setTimeout(resolve, this.delay());
      });
    }
  }
}
