import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SESSION_COOKIE, SESSION_STORE, TOKEN_VERIFIER, WEB_CONFIG, type WebConfig } from './auth.tokens';
import { csrfToken, parseCookies, safeEqual, type SessionStore } from './session';
import { TokenVerifier, type Principal } from './token-verifier';

export { TOKEN_VERIFIER } from './auth.tokens';
export const PUBLIC_KEY = 'athena:public';
export const ROLES_KEY = 'athena:roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  method?: string;
  principal?: Principal;
}

/** Garde globale : tout est protégé sauf les routes marquées @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(WEB_CONFIG) private readonly web: WebConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const match = value ? /^Bearer (.+)$/i.exec(value) : null;

    let principal: Principal;
    if (match?.[1]) {
      try {
        principal = await this.verifier.verify(match[1]);
      } catch {
        throw new UnauthorizedException('Jeton invalide.');
      }
    } else {
      principal = await this.fromSession(request);
    }
    request.principal = principal;

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    if (required?.length && !required.some((role) => principal.roles.includes(role))) {
      throw new ForbiddenException('Droits insuffisants.');
    }
    return true;
  }

  /** Authentification par cookie de session (application web). Les écritures exigent CSRF et Origin. */
  private async fromSession(request: AuthedRequest): Promise<Principal> {
    const cookies = parseCookies(first(request.headers['cookie']));
    const id = cookies[SESSION_COOKIE];
    const principal = id ? await this.sessions.get(id) : null;
    if (!id || !principal || !this.web.sessionSecret) throw new UnauthorizedException('Jeton absent.');
    const method = (request.method ?? 'GET').toUpperCase();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const header = first(request.headers['x-csrf-token']);
      const origin = first(request.headers['origin']);
      if (!header || !safeEqual(header, csrfToken(this.web.sessionSecret, id))) throw new ForbiddenException('Jeton CSRF invalide.');
      if (origin && origin !== this.web.webOrigin) throw new ForbiddenException('Origine refusée.');
    }
    return principal;
  }
}

const first = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);
