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
import { TokenVerifier, type Principal } from './token-verifier';

export const TOKEN_VERIFIER = Symbol('TOKEN_VERIFIER');
export const PUBLIC_KEY = 'athena:public';
export const ROLES_KEY = 'athena:roles';

export const Public = () => SetMetadata(PUBLIC_KEY, true);
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

export interface AuthedRequest {
  headers: Record<string, string | string[] | undefined>;
  principal?: Principal;
}

/** Garde globale : tout est protégé sauf les routes marquées @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(TOKEN_VERIFIER) private readonly verifier: TokenVerifier,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;

    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const header = request.headers['authorization'];
    const value = Array.isArray(header) ? header[0] : header;
    const match = value ? /^Bearer (.+)$/i.exec(value) : null;
    if (!match?.[1]) throw new UnauthorizedException('Jeton absent.');

    let principal: Principal;
    try {
      principal = await this.verifier.verify(match[1]);
    } catch {
      throw new UnauthorizedException('Jeton invalide.');
    }
    request.principal = principal;

    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, targets);
    if (required?.length && !required.some((role) => principal.roles.includes(role))) {
      throw new ForbiddenException('Droits insuffisants.');
    }
    return true;
  }
}
