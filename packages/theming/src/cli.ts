import { check, formatIssues, type Contract } from './check.js';
import { emitCss } from './css.js';
import type { Theme } from './tokens.js';

export interface CliIo {
  readFile(path: string): string;
  writeFile(path: string, content: string): void;
  log(message: string): void;
  error(message: string): void;
}

const USAGE = `Usage :
  theming check --contract <contrat.json> <thème.json>…
  theming build --contract <contrat.json> --out <fichier.css> [--prefix <préfixe>] [--default <thème>] <thème.json>…
Le contrôle échoue (code 1) si un thème manque un jeton obligatoire ou une paire de contraste du contrat.
La génération contrôle d'abord : un thème non conforme n'est jamais émis.`;

function parse(argv: readonly string[]): { command: string | undefined; flags: Map<string, string>; files: string[] } {
  const [command, ...rest] = argv;
  const flags = new Map<string, string>();
  const files: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i]!;
    if (arg.startsWith('--')) {
      const value = rest[i + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${arg} attend une valeur`);
      flags.set(arg.slice(2), value);
      i += 1;
    } else files.push(arg);
  }
  return { command, flags, files };
}

/** Point d'entrée de la ligne de commande ; rend le code de sortie. */
export function runCli(argv: readonly string[], io: CliIo): number {
  let args: ReturnType<typeof parse>;
  try {
    args = parse(argv);
  } catch (e) {
    io.error(`${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const contractPath = args.flags.get('contract');
  if ((args.command !== 'check' && args.command !== 'build') || !contractPath || args.files.length === 0) {
    io.error(USAGE);
    return 2;
  }
  const contract = JSON.parse(io.readFile(contractPath)) as Contract;
  const themes = args.files.map((f) => JSON.parse(io.readFile(f)) as Theme);
  const issues = check(themes, contract);
  if (issues.length) {
    io.error(formatIssues(issues));
    return 1;
  }
  if (args.command === 'check') {
    io.log(`${themes.length} thème(s) conforme(s) dans ${contract.modes.length} mode(s).`);
    return 0;
  }
  const out = args.flags.get('out');
  if (!out) {
    io.error(USAGE);
    return 2;
  }
  const prefix = args.flags.get('prefix');
  const defaultTheme = args.flags.get('default');
  io.writeFile(out, emitCss(themes, contract, { ...(prefix ? { prefix } : {}), ...(defaultTheme ? { defaultTheme } : {}) }));
  io.log(`${out} écrit.`);
  return 0;
}
