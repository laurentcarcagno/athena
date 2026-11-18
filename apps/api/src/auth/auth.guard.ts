import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PAT_SERVICE, SESSION_COOKIE, SESSION_STORE, TOKEN_VERIFIER, WEB_CONFIG, type WebConfig } from './auth.tokens';
import { PAT_PREFIX, type PatService } from './pat.service';
import { csrfToken, parseCookies, safeEqual, type SessionStore } from './session';
import { TokenVerifier, type Principal } from './token-verifier';

export { TOKEN_VERIFIER } from './auth.tokens';
export const PUBLIC_KEY = 'athena:public';
export const ROLES_KEY = 'athena:roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Rôles effectifs. Ancien nom `athena-user` accepté (renommé `athena-team-member`). L'assurance qualité, le manager et le PMO ont aussi les droits
 * d'un membre d'équipe ; le directeur n'a ceux d'un membre qu'en lecture (GET, HEAD) : il consulte tout, ne modifie rien.
 */
export const withUserRole = (roles: readonly string[], method = 'POST'): string[] => {
  const out = roles.map((r) => (r === 'athena-user' ? 'athena-team-member' : r));
  const readOnly = ['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());
  const grants = out.includes('athena-qa') || out.includes('athena-manager') || out.includes('athena-pmo') || (out.includes('athena-director') && readOnly);
  if (grants && !out.includes('athena-team-member')) out.push('athena-team-member');
  return out;
};

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
    @Optional() @Inject(PAT_SERVICE) private readonly pats?: PatService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const match = value ? /^Bearer (.+)$/i.exec(value) : null;

    let principal: Principal;
    if (match?.[1]?.startsWith(PAT_PREFIX)) {
      // Jeton d'accès personnel : la portée `read` n'autorise que la lecture, `write` les écritures dans la limite des rôles figés à la création.
      const pat = this.pats ? await this.pats.verify(match[1]).catch(() => null) : null;
      if (!pat) throw new UnauthorizedException('Jeton invalide.');
      if (pat.patScope === 'read' && !['GET', 'HEAD', 'OPTIONS'].includes((request.method ?? 'GET').toUpperCase())) throw new ForbiddenException('Jeton en lecture seule.');
      principal = pat;
    } else if (match?.[1]) {
      try {
        principal = await this.verifier.verify(match[1]);
      } catch {
        throw new UnauthorizedException('Jeton invalide.');
      }
    } else {
      principal = await this.fromSession(request);
    }
    // Assurance qualité : les droits d'un utilisateur (déclarer, commenter, lier, suivre : la revue est son métier), plus la décision
    // d'approbation que seul son rôle peut prendre. Jamais administrateur ni chef de projet : pas de configuration, de baseline ni de planning.
    principal = { ...principal, roles: withUserRole(principal.roles, request.method ?? 'GET') };
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
