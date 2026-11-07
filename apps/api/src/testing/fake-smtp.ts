import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';

export interface ReceivedMail { from: string; to: string[]; data: string; authenticated: boolean; secure: boolean }

export interface FakeSmtp {
  port: number;
  mails: ReceivedMail[];
  /** Commandes reçues, dans l'ordre (EHLO, AUTH, MAIL…). */
  commands: string[];
  ca?: string;
  close(): Promise<void>;
}

/** Certificat autosigné pour `localhost` (openssl) ; `null` si openssl est absent : les tests TLS sont alors ignorés. */
export function selfSigned(): { key: string; cert: string } | null {
  const dir = mkdtempSync(join(tmpdir(), 'athena-smtp-'));
  try {
    const run = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'), '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost', '-days', '1'], { stdio: 'ignore' });
    if (run.status !== 0) return null;
    return { key: readFileSync(join(dir, 'k.pem'), 'utf8'), cert: readFileSync(join(dir, 'c.pem'), 'utf8') };
  } catch { return null; } finally { rmSync(dir, { recursive: true, force: true }); }
}

/**
 * Serveur SMTP local pour les tests : en clair, TLS implicite (`tls`) ou avec STARTTLS (`starttls`). `reject` fait refuser le
 * destinataire (550) ; `authPassword` impose AUTH PLAIN avec ce mot de passe.
 */
export async function startFakeSmtp(options: { mode?: 'plain' | 'tls' | 'starttls'; key?: string; cert?: string; reject?: string; authPassword?: string } = {}): Promise<FakeSmtp> {
  const mails: ReceivedMail[] = [];
  const commands: string[] = [];
  const mode = options.mode ?? 'plain';
  const onConnection = (initial: net.Socket) => {
    let sock: net.Socket = initial;
    let secure = mode === 'tls';
    let authed = false;
    let from = '';
    let to: string[] = [];
    let inData = false;
    let data = '';
    let buffer = '';
    const send = (line: string) => sock.write(line + '\r\n');
    const handle = (line: string) => {
      if (inData) {
        data += line + '\r\n';
        if (line === '.') { inData = false; mails.push({ from, to, data: data.slice(0, -3), authenticated: authed, secure }); data = ''; send('250 2.0.0 accepté'); }
        return;
      }
      const command = line.toUpperCase();
      commands.push(line.startsWith('AUTH') ? 'AUTH' : line.split(' ')[0]!);
      if (command.startsWith('EHLO')) {
        sock.write(['250-fake.local', ...(mode === 'starttls' && !secure ? ['250-STARTTLS'] : []), '250 AUTH PLAIN'].join('\r\n') + '\r\n');
      } else if (command === 'STARTTLS') {
        send('220 prêt');
        sock.removeAllListeners('data');
        const wrapped = new tls.TLSSocket(sock, { isServer: true, key: options.key, cert: options.cert });
        sock = wrapped; secure = true; attach(wrapped);
      } else if (command.startsWith('AUTH PLAIN')) {
        const secret = Buffer.from(line.slice(11), 'base64').toString('utf8').split('\0');
        if (options.authPassword !== undefined && secret[2] !== options.authPassword) send('535 5.7.8 identifiants refusés');
        else { authed = true; send('235 2.7.0 ok'); }
      } else if (command.startsWith('MAIL FROM:')) { from = line.slice(10).replace(/[<>]/g, ''); to = []; send('250 ok'); }
      else if (command.startsWith('RCPT TO:')) {
        const rcpt = line.slice(8).replace(/[<>]/g, '');
        if (options.reject && rcpt === options.reject) send('550 5.1.1 destinataire inconnu'); else { to.push(rcpt); send('250 ok'); }
      } else if (command === 'DATA') { inData = true; send('354 fin par <CRLF>.<CRLF>'); }
      else if (command === 'QUIT') { send('221 au revoir'); sock.end(); }
      else send('502 commande inconnue');
    };
    const attach = (s: net.Socket) => {
      s.on('data', (chunk: Buffer) => { buffer += chunk.toString('utf8'); const lines = buffer.split('\r\n'); buffer = lines.pop() ?? ''; for (const l of lines) handle(l); });
      s.on('error', () => undefined);
    };
    attach(sock);
    send('220 fake.local ESMTP');
  };
  const server = mode === 'tls' ? tls.createServer({ key: options.key, cert: options.cert }, onConnection) : net.createServer(onConnection);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return {
    port, mails, commands, ...(options.cert ? { ca: options.cert } : {}),
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); (server as net.Server & { closeAllConnections?: () => void }).closeAllConnections?.(); }),
  };
}
