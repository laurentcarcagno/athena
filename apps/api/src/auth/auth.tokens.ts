export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
export const SESSION_STORE = Symbol('SESSION_STORE');
export const WEB_CONFIG = Symbol('WEB_CONFIG');
export const PAT_SERVICE = Symbol('PAT_SERVICE');
export const SESSION_COOKIE = 'athena_session';

export interface WebConfig {
  issuer: string;
  clientId: string;
  clientSecret: string | undefined;
  sessionSecret: string | undefined;
  /** URL publique de l'API (redirect_uri OIDC). */
  publicUrl: string;
  /** Origine de l'application web (redirections, contrôle CSRF/Origin). */
  webOrigin: string;
  cookieSecure: boolean;
  sessionTtlSeconds: number;
  /** Niveau de protection de l'instance (vide : aucun) ; affiché en bandeau par l'application web. */
  protectionLevel?: string;
}
