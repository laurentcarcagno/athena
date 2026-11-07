import { readFileSync } from 'node:fs';
import { SmtpMailer, type Mailer } from './smtp';

export interface MailerEnv {
  SMTP_HOST?: string | undefined;
  SMTP_PORT: number;
  SMTP_SECURITY: 'none' | 'starttls' | 'tls';
  SMTP_USER?: string | undefined;
  SMTP_PASSWORD?: string | undefined;
  SMTP_FROM?: string | undefined;
  SMTP_CA_FILE?: string | undefined;
  DIGEST_ENABLED: boolean;
}

/**
 * Messagerie du résumé quotidien, ou `null` : sans `SMTP_HOST` et `SMTP_FROM`, ou avec `DIGEST_ENABLED=false`, rien n'est configuré,
 * aucun client n'est créé et aucune connexion ne sera jamais ouverte (instance en réseau isolé).
 */
export function mailerFrom(env: MailerEnv): Mailer | null {
  if (!env.DIGEST_ENABLED || !env.SMTP_HOST || !env.SMTP_FROM) return null;
  return new SmtpMailer({
    host: env.SMTP_HOST, port: env.SMTP_PORT, security: env.SMTP_SECURITY, from: env.SMTP_FROM,
    ...(env.SMTP_USER ? { user: env.SMTP_USER, password: env.SMTP_PASSWORD ?? '' } : {}),
    ...(env.SMTP_CA_FILE ? { ca: readFileSync(env.SMTP_CA_FILE, 'utf8') } : {}),
  });
}
