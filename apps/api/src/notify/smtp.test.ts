import dns from 'node:dns';
import { afterEach, describe, expect, it } from 'vitest';
import { installNoEgress, EgressError, type EgressGuard } from '../testing/no-egress';
import { selfSigned, startFakeSmtp, type FakeSmtp } from '../testing/fake-smtp';
import { buildMessage } from './smtp';
import { mailerFrom } from './mailer-config';
import { SmtpMailer } from './smtp';

let server: FakeSmtp | undefined;
let guard: EgressGuard | undefined;
afterEach(async () => { await server?.close(); server = undefined; guard?.take(); guard?.uninstall(); guard = undefined; });

const decode = (data: string): string => Buffer.from(data.split('\r\n\r\n').slice(1).join('').replace(/\r\n/g, ''), 'base64').toString('utf8');
const mail = { to: 'bob@exemple.lan', subject: 'Résumé', text: 'Bonjour\n.ligne commençant par un point\nÉté' };
const cert = selfSigned();
const tlsTest = cert ? it : it.skip;

describe('client SMTP', () => {
  it('envoie un message en clair : enveloppe, en-têtes, corps UTF-8 intact', async () => {
    server = await startFakeSmtp();
    await new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'none', from: 'athena@exemple.lan' }).send(mail);
    expect(server.commands).toEqual(['EHLO', 'MAIL', 'RCPT', 'DATA', 'QUIT']);
    const m = server.mails[0]!;
    expect(m).toMatchObject({ from: 'athena@exemple.lan', to: ['bob@exemple.lan'], authenticated: false, secure: false });
    expect(m.data).toContain('To: bob@exemple.lan');
    expect(m.data).toContain('Subject: =?UTF-8?B?');
    expect(m.data).toContain('Auto-Submitted: auto-generated');
    expect(decode(m.data)).toBe(mail.text);
  });

  it('s’authentifie (AUTH PLAIN) et signale un refus', async () => {
    server = await startFakeSmtp({ authPassword: 'bon' });
    const options = { host: '127.0.0.1', port: server.port, security: 'none' as const, from: 'athena@exemple.lan', user: 'athena' };
    await new SmtpMailer({ ...options, password: 'bon' }).send(mail);
    expect(server.mails[0]!.authenticated).toBe(true);
    await expect(new SmtpMailer({ ...options, password: 'mauvais' }).send(mail)).rejects.toThrow(/authentification refusé \(535\)/);
  });

  it('refuse l’authentification en clair vers une machine qui n’est pas locale', async () => {
    guard = installNoEgress({ allowHosts: ['smtp.interne.lan'] });
    await expect(new SmtpMailer({ host: 'smtp.interne.lan', port: 25, security: 'none', from: 'a@b.lan', user: 'u', password: 'p' }).send(mail)).rejects.toThrow(/sans chiffrement/);
    expect(guard.violations).toEqual([]); // refus avant toute connexion
  });

  it('un destinataire refusé par le serveur fait échouer l’envoi', async () => {
    server = await startFakeSmtp({ reject: 'bob@exemple.lan' });
    await expect(new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'none', from: 'athena@exemple.lan' }).send(mail)).rejects.toThrow(/destinataire refusé \(550\)/);
    expect(server.mails).toHaveLength(0);
  });

  it('refuse les retours à la ligne dans les adresses et le sujet (injection d’en-têtes)', async () => {
    server = await startFakeSmtp();
    const mailer = new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'none', from: 'athena@exemple.lan' });
    await expect(mailer.send({ ...mail, to: 'bob@exemple.lan\r\nBcc: x@y.z' })).rejects.toThrow(/invalide/);
    await expect(mailer.send({ ...mail, subject: 'a\r\nBcc: x@y.z' })).rejects.toThrow(/invalide/);
    expect(server.commands).toEqual([]);
  });

  tlsTest('TLS implicite avec l’autorité interne fournie', async () => {
    server = await startFakeSmtp({ mode: 'tls', ...cert! });
    await new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'tls', from: 'athena@exemple.lan', ca: server.ca!, tlsServerName: 'localhost' }).send(mail);
    expect(server.mails[0]).toMatchObject({ secure: true });
  });

  tlsTest('STARTTLS : mise à niveau avant AUTH, puis envoi chiffré', async () => {
    server = await startFakeSmtp({ mode: 'starttls', authPassword: 'bon', ...cert! });
    await new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'starttls', from: 'athena@exemple.lan', user: 'athena', password: 'bon', ca: server.ca!, tlsServerName: 'localhost' }).send(mail);
    expect(server.commands.slice(0, 4)).toEqual(['EHLO', 'STARTTLS', 'EHLO', 'AUTH']);
    expect(server.mails[0]).toMatchObject({ secure: true, authenticated: true });
  });

  it('STARTTLS exigé : un serveur qui ne le propose pas est refusé, sans envoi en clair', async () => {
    server = await startFakeSmtp();
    await expect(new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'starttls', from: 'athena@exemple.lan' }).send(mail)).rejects.toThrow(/STARTTLS/);
    expect(server.mails).toHaveLength(0);
  });

  tlsTest('certificat inconnu : refusé', async () => {
    server = await startFakeSmtp({ mode: 'tls', ...cert! });
    await expect(new SmtpMailer({ host: '127.0.0.1', port: server.port, security: 'tls', from: 'athena@exemple.lan', tlsServerName: 'localhost' }).send(mail)).rejects.toThrow();
    expect(server.mails).toHaveLength(0);
  });
});

describe('non-sortie du résumé (T-0077)', () => {
  const env = { SMTP_PORT: 25, SMTP_SECURITY: 'starttls' as const, DIGEST_ENABLED: true };

  it('sans SMTP configuré, ou désactivé, aucun client n’existe : aucune connexion ne peut s’ouvrir', () => {
    expect(mailerFrom({ ...env })).toBeNull();
    expect(mailerFrom({ ...env, SMTP_HOST: 'smtp.interne.lan' })).toBeNull(); // pas d’expéditeur
    expect(mailerFrom({ ...env, SMTP_HOST: 'smtp.interne.lan', SMTP_FROM: 'athena@interne.lan', DIGEST_ENABLED: false })).toBeNull();
    expect(mailerFrom({ ...env, SMTP_HOST: 'smtp.interne.lan', SMTP_FROM: 'athena@interne.lan' })).not.toBeNull();
  });

  it('un relais hors du réseau interne est refusé par le garde, avant toute résolution de nom', async () => {
    guard = installNoEgress({ allowHosts: ['smtp.interne.lan'] });
    const lookups: string[] = [];
    const original = dns.lookup;
    dns.lookup = ((host: string, ...rest: unknown[]) => { lookups.push(host); return (original as (...a: unknown[]) => unknown)(host, ...rest); }) as typeof dns.lookup;
    try {
      const error = await new SmtpMailer({ host: 'smtp.public-mail.net', port: 25, security: 'none', from: 'a@b.lan' }).send(mail).then(() => null, (e: unknown) => e);
      expect(error).toBeInstanceOf(EgressError);
      expect(guard.take()).toEqual(['smtp.public-mail.net (net)']);
    } finally { dns.lookup = original; }
  });
});

describe('message', () => {
  it('lignes de 76 caractères au plus, date et identifiant présents', () => {
    const m = buildMessage('a@b.lan', { to: 'c@d.lan', subject: 'x', text: 'é'.repeat(500) }, new Date('2026-11-07T08:00:00Z'), 'id-1@athena');
    expect(m).toContain('Date: Sat, 07 Nov 2026 08:00:00 GMT');
    expect(m).toContain('Message-ID: <id-1@athena>');
    expect(Math.max(...m.split('\r\n').map((l) => l.length))).toBeLessThanOrEqual(76);
  });
});
