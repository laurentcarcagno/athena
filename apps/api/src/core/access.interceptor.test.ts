import { lastValueFrom, defer, of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { AccessContextInterceptor } from './access.interceptor';
import { currentSubject, runAs, runAsSystem } from './request-context';

const ctx = (principal?: { subject: string }) => ({ switchToHttp: () => ({ getRequest: () => ({ principal }) }) }) as never;

describe('contexte d’accès de la requête', () => {
  const interceptor = new AccessContextInterceptor();
  const seen = () => defer(async () => { await new Promise((r) => setTimeout(r, 1)); return currentSubject() ?? null; });

  it('pose le sujet authentifié pour tout le gestionnaire, y compris après des attentes asynchrones', async () => {
    expect(await lastValueFrom(interceptor.intercept(ctx({ subject: 'u-alice' }), { handle: seen }))).toBe('u-alice');
    expect(currentSubject()).toBeUndefined(); // ne fuit pas hors de la requête
  });

  it('deux requêtes simultanées gardent chacune leur sujet', async () => {
    const run = (s: string) => lastValueFrom(interceptor.intercept(ctx({ subject: s }), { handle: seen }));
    expect(await Promise.all([run('a'), run('b'), run('c')])).toEqual(['a', 'b', 'c']);
  });

  it('route publique : aucun sujet ; traitement système : sort du contexte', async () => {
    expect(await lastValueFrom(interceptor.intercept(ctx(undefined), { handle: () => of(currentSubject() ?? null) }))).toBeNull();
    expect(await runAs('u-x', async () => runAsSystem(() => currentSubject() ?? null))).toBeNull();
    expect(await runAs('u-x', async () => currentSubject())).toBe('u-x');
  });
});
