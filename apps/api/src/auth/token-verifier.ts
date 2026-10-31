import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export interface Principal {
  subject: string;
  username: string;
  email?: string;
  roles: string[];
  groups: string[];
}

export class TokenVerifier {
  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    private readonly keys: JWTVerifyGetKey,
  ) {}

  static forKeycloak(issuer: string, audience: string): TokenVerifier {
    const jwks = createRemoteJWKSet(new URL(`${issuer}/protocol/openid-connect/certs`), {
      cooldownDuration: 30_000,
    });
    return new TokenVerifier(issuer, audience, jwks);
  }

  /** Vérifie signature, émetteur, audience et expiration. Lève une erreur si invalide. */
  async verify(token: string): Promise<Principal> {
    const { payload } = await jwtVerify(token, this.keys, {
      issuer: this.issuer,
      audience: this.audience,
      algorithms: ['RS256', 'ES256', 'PS256'],
      clockTolerance: 5,
    });
    const realmAccess = payload['realm_access'] as { roles?: string[] } | undefined;
    const groups = Array.isArray(payload['groups']) ? (payload['groups'] as string[]) : [];
    const principal: Principal = {
      subject: String(payload.sub),
      username: String(payload['preferred_username'] ?? payload.sub),
      roles: realmAccess?.roles ?? [],
      groups,
    };
    if (typeof payload['email'] === 'string') principal.email = payload['email'];
    return principal;
  }
}
