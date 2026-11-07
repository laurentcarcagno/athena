import net from 'node:net';
import os from 'node:os';
import tls from 'node:tls';

export interface Mail { to: string; subject: string; text: string }
export interface Mailer { send(mail: Mail): Promise<void> }

export interface SmtpOptions {
  host: string;
  port: number;
  /** `tls` : TLS dès la connexion (port 465) ; `starttls` : mise à niveau en cours de session (port 587) ; `none` : en clair (relais interne). */
  security: 'none' | 'starttls' | 'tls';
  from: string;
  user?: string;
  password?: string;
  /** Autorité de certification interne (PEM) ; sinon les autorités du système. */
  ca?: string;
  /** Nom attendu dans le certificat quand on se connecte par adresse IP (défaut : l'hôte). */
  tlsServerName?: string;
  timeoutMs?: number;
  /** Nom annoncé dans EHLO (défaut : nom de la machine). */
  helo?: string;
}

const CRLF = '\r\n';
const clean = (value: string, what: string): string => {
  if (/[\r\n\0]/.test(value)) throw new Error(`SMTP : ${what} invalide (retour à la ligne)`);
  return value;
};
const address = (value: string, what: string): string => {
  const v = clean(value, what).trim();
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(v)) throw new Error(`SMTP : ${what} invalide`);
  return v;
};
const isLoopback = (host: string): boolean => host === 'localhost' || host === '::1' || /^127(\.\d{1,3}){3}$/.test(host);

/** Sujet en ASCII ou encodé (RFC 2047). */
const encodeHeader = (value: string): string => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`);

/** Message RFC 5322 : texte UTF-8 en base64 (aucune ligne trop longue, aucun point en début de ligne à protéger). */
export function buildMessage(from: string, mail: Mail, now = new Date(), messageId = `${crypto.randomUUID()}@athena`): string {
  const body = Buffer.from(mail.text, 'utf8').toString('base64').replace(/(.{76})/g, `$1${CRLF}`);
  return [
    `From: ${clean(from, 'expéditeur')}`, `To: ${clean(mail.to, 'destinataire')}`, `Subject: ${encodeHeader(clean(mail.subject, 'sujet'))}`,
    `Date: ${now.toUTCString()}`, `Message-ID: <${messageId}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64',
    'Auto-Submitted: auto-generated', '', body, '',
  ].join(CRLF);
}

/** Lecteur de réponses SMTP (une réponse peut tenir sur plusieurs lignes `250-…` puis `250 …`). */
class Channel {
  private buffer = '';
  private lines: string[] = [];
  private waiter: ((error?: Error) => void) | null = null;
  private failure: Error | null = null;
  constructor(readonly socket: net.Socket) {
    socket.on('data', (chunk: Buffer) => { this.buffer += chunk.toString('utf8'); const parts = this.buffer.split(CRLF); this.buffer = parts.pop() ?? ''; this.lines.push(...parts); this.wake(); });
    socket.on('error', (error) => { this.failure = error; this.wake(error); });
    socket.on('close', () => { this.failure ??= new Error('SMTP : connexion fermée par le serveur'); this.wake(); });
  }
  private wake(error?: Error): void { const w = this.waiter; this.waiter = null; w?.(error); }
  async reply(): Promise<{ code: number; lines: string[] }> {
    const collected: string[] = [];
    for (;;) {
      while (this.lines.length > 0) {
        const line = this.lines.shift()!;
        collected.push(line);
        const m = /^(\d{3})([ -])/.exec(line);
        if (!m) throw new Error(`SMTP : réponse illisible : ${line.slice(0, 80)}`);
        if (m[2] === ' ') return { code: Number(m[1]), lines: collected };
      }
      if (this.failure) throw this.failure;
      await new Promise<void>((resolve, reject) => { this.waiter = (e) => (e ? reject(e) : resolve()); });
    }
  }
  write(text: string): void { this.socket.write(text); }
}

/** Client SMTP minimal (EHLO, STARTTLS, AUTH PLAIN, un message). Aucune dépendance ; la connexion passe par `net`/`tls`, donc par le garde de sortie des tests. */
export class SmtpMailer implements Mailer {
  constructor(private readonly options: SmtpOptions) {}

  async send(mail: Mail): Promise<void> {
    const o = this.options;
    const from = address(o.from, 'expéditeur');
    const to = address(mail.to, 'destinataire');
    const message = buildMessage(from, { ...mail, to });
    if (o.user && o.security === 'none' && !isLoopback(o.host)) throw new Error('SMTP : authentification refusée sans chiffrement hors boucle locale');
    const timeoutMs = o.timeoutMs ?? 15_000;
    const tlsOptions = { host: o.host, servername: o.tlsServerName ?? o.host, ...(o.ca ? { ca: o.ca } : {}) };
    let socket: net.Socket = o.security === 'tls' ? tls.connect({ ...tlsOptions, port: o.port }) : net.connect({ host: o.host, port: o.port });
    socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP : délai dépassé')));
    let channel = new Channel(socket);
    const expect = async (codes: number[], what: string) => {
      const r = await channel.reply();
      if (!codes.includes(r.code)) throw new Error(`SMTP : ${what} refusé (${r.code})`);
      return r;
    };
    const command = async (line: string, codes: number[], what: string) => { channel.write(line + CRLF); return expect(codes, what); };
    try {
      await expect([220], 'accueil');
      const helo = o.helo ?? os.hostname();
      let caps = (await command(`EHLO ${helo}`, [250], 'EHLO')).lines.map((l) => l.slice(4).toUpperCase());
      if (o.security === 'starttls') {
        if (!caps.includes('STARTTLS')) throw new Error('SMTP : le serveur ne propose pas STARTTLS');
        await command('STARTTLS', [220], 'STARTTLS');
        socket.removeAllListeners('data');
        socket = tls.connect({ ...tlsOptions, socket });
        socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP : délai dépassé')));
        channel = new Channel(socket);
        caps = (await command(`EHLO ${helo}`, [250], 'EHLO')).lines.map((l) => l.slice(4).toUpperCase());
      }
      if (o.user) {
        const token = Buffer.from(`\0${clean(o.user, 'identifiant')}\0${clean(o.password ?? '', 'mot de passe')}`).toString('base64');
        await command(`AUTH PLAIN ${token}`, [235], 'authentification');
      }
      await command(`MAIL FROM:<${from}>`, [250], 'expéditeur');
      await command(`RCPT TO:<${to}>`, [250, 251], 'destinataire');
      await command('DATA', [354], 'DATA');
      channel.write(message.replace(/^\./gm, '..') + `.${CRLF}`);
      await expect([250], 'message');
      channel.write(`QUIT${CRLF}`);
      await channel.reply().catch(() => undefined); // fermeture propre ; le message est déjà accepté
    } finally {
      socket.destroy();
    }
  }
}
