import { createHash, randomBytes } from 'node:crypto';
import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { Public } from './auth.guard';
import { SESSION_COOKIE, SESSION_STORE, TOKEN_VERIFIER, WEB_CONFIG, type WebConfig } from './auth.tokens';
import { cookie, csrfToken, parseCookies, safeEqual, sign, unsign, type SessionStore } from './session';
import type { TokenVerifier } from './token-verifier';

interface Req_ {
  headers: Record<string, string | string[] | undefined>;
}
interface Reply_ {
  status(code: number): Reply_;
  header(name: string, value: string | string[]): Reply_;
  send(body?: unknown): Reply_;
}

const OIDC_COOKIE = 'athena_oidc';
const b64url = (buffer: Buffer) => buffer.toString('base64url');

/** `returnTo` : chemin relatif uniquement (pas de redirection ouverte). */
export function safeReturnTo(value: string | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\') || /[\r\n]/.test(value)) return '/';
  return value.slice(0, 500);
}

/**
 * Backend for frontend : OIDC Authorization Code + PKCE. Les jetons Keycloak ne sont jamais envoyés au
 * navigateur ni stockés : la session ne contient que l'identité validée.
 */
@Controller('auth')
export class BffController {
  constructor(
    @Inject(WEB_CONFIG) private readonly config: WebConfig,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  private requireConfigured(reply: Reply_): boolean {
    if (this.config.sessionSecret && this.config.clientSecret) return true;
    reply.status(503).send({ error: 'unavailable', message: 'Authentification web non configurée.', details: [] });
    return false;
  }

  @Public()
  @Get('login')
  login(@Query('returnTo') returnTo: string | undefined, @Res() reply: Reply_): void {
    if (!this.requireConfigured(reply)) return;
    const state = b64url(randomBytes(24));
    const nonce = b64url(randomBytes(24));
    const verifier = b64url(randomBytes(48));
    const challenge = b64url(createHash('sha256').update(verifier).digest());
    const payload = JSON.stringify({ state, nonce, verifier, returnTo: safeReturnTo(returnTo) });
    const url = new URL(`${this.config.issuer}/protocol/openid-connect/auth`);
    url.search = new URLSearchParams({
      client_id: this.config.clientId, response_type: 'code', scope: 'openid profile email',
      redirect_uri: `${this.config.publicUrl}/auth/callback`, state, nonce, code_challenge: challenge, code_challenge_method: 'S256',
    }).toString();
    reply
      .status(302)
      .header('Set-Cookie', cookie(OIDC_COOKIE, sign(this.config.sessionSecret!, Buffer.from(payload).toString('base64url')), { maxAge: 600, secure: this.config.cookieSecure, path: '/auth' }))
      .header('Location', url.toString())
      .header('Cache-Control', 'no-store')
      .send();
  }

  @Public()
  @Get('callback')
  async callback(@Query('code') code: string | undefined, @Query('state') state: string | undefined, @Req() request: Req_, @Res() reply: Reply_): Promise<void> {
    if (!this.requireConfigured(reply)) return;
    const fail = () => reply.status(400).send({ error: 'invalid_login', message: 'Connexion invalide ou expirée.', details: [] });
    const signed = parseCookies(firstHeader(request.headers['cookie']))[OIDC_COOKIE];
    const raw = signed ? unsign(this.config.sessionSecret!, signed) : null;
    if (!raw || !code || !state) return void fail();
    let flow: { state: string; nonce: string; verifier: string; returnTo: string };
    try { flow = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')); } catch { return void fail(); }
    if (!safeEqual(flow.state, state)) return void fail();

    try {
      const response = await fetch(`${this.config.issuer}/protocol/openid-connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code', code, client_id: this.config.clientId, client_secret: this.config.clientSecret!,
          redirect_uri: `${this.config.publicUrl}/auth/callback`, code_verifier: flow.verifier,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        console.warn(`bff: le fournisseur a refusé l'échange de code (HTTP ${response.status})`);
        return void fail();
      }
      const tokens = (await response.json()) as { access_token: string; id_token: string };
      await this.verifier.verifyIdToken(tokens.id_token, this.config.clientId, flow.nonce);
      const principal = await this.verifier.verify(tokens.access_token);
      const id = await this.sessions.create(principal, this.config.sessionTtlSeconds);
      reply
        .status(302)
        .header('Set-Cookie', [
          cookie(SESSION_COOKIE, id, { maxAge: this.config.sessionTtlSeconds, secure: this.config.cookieSecure }),
          cookie(OIDC_COOKIE, '', { maxAge: 0, secure: this.config.cookieSecure, path: '/auth' }),
        ])
        .header('Location', `${this.config.webOrigin}${flow.returnTo}`)
        .header('Cache-Control', 'no-store')
        .send();
    } catch (error) {
      console.warn(`bff: échec de la connexion : ${(error as Error).message.slice(0, 200)}`);
      fail();
    }
  }

  /** État de session pour l'application web : identité non sensible et jeton CSRF. */
  @Public()
  @Get('session')
  async session(@Req() request: Req_, @Res() reply: Reply_): Promise<void> {
    reply.header('Cache-Control', 'no-store');
    const id = parseCookies(firstHeader(request.headers['cookie']))[SESSION_COOKIE];
    const principal = id ? await this.sessions.get(id) : null;
    if (!id || !principal || !this.config.sessionSecret) { reply.status(200).send({ authenticated: false, ...(this.config.protectionLevel ? { protectionLevel: this.config.protectionLevel } : {}) }); return; }
    reply.status(200).send({
      authenticated: true,
      user: { username: principal.username, name: principal.name ?? principal.username, email: principal.email ?? null, roles: principal.roles, groups: principal.groups },
      csrf: csrfToken(this.config.sessionSecret, id),
      ...(this.config.protectionLevel ? { protectionLevel: this.config.protectionLevel } : {}),
    });
  }

  /**
   * Déconnexion initiée par Keycloak (administrateur, désactivation du compte) : révoque toutes les sessions de
   * l'utilisateur. Authentifiée par la signature du jeton de déconnexion, pas par cookie.
   */
  @Public()
  @HttpCode(200)
  @Post('backchannel-logout')
  async backchannelLogout(@Body() body: unknown, @Res() reply: Reply_): Promise<void> {
    const token = typeof (body as { logout_token?: unknown })?.logout_token === 'string' ? (body as { logout_token: string }).logout_token : '';
    try {
      const { subject } = await this.verifier.verifyLogoutToken(token, this.config.clientId);
      await this.sessions.deleteBySubject(subject);
      reply.status(200).header('Cache-Control', 'no-store').send({ revoked: true });
    } catch {
      reply.status(400).header('Cache-Control', 'no-store').send({ error: 'invalid_logout_token', message: 'Jeton de déconnexion invalide.', details: [] });
    }
  }

  @Public()
  @HttpCode(200)
  @Post('logout')
  async logout(@Req() request: Req_, @Res() reply: Reply_): Promise<void> {
    const id = parseCookies(firstHeader(request.headers['cookie']))[SESSION_COOKIE];
    if (id && this.config.sessionSecret) {
      const header = firstHeader(request.headers['x-csrf-token']);
      if (!header || !safeEqual(header, csrfToken(this.config.sessionSecret, id))) {
        reply.status(403).send({ error: 'forbidden', message: 'Jeton CSRF invalide.', details: [] });
        return;
      }
      await this.sessions.delete(id);
    }
    reply
      .status(200)
      .header('Set-Cookie', cookie(SESSION_COOKIE, '', { maxAge: 0, secure: this.config.cookieSecure }))
      .send({ logoutUrl: `${this.config.issuer}/protocol/openid-connect/logout?client_id=${encodeURIComponent(this.config.clientId)}&post_logout_redirect_uri=${encodeURIComponent(this.config.webOrigin)}` });
  }
}

const firstHeader = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
