import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { AuthedRequest } from '../auth/auth.guard';
import { runAs } from './request-context';

/**
 * Place le sujet authentifié dans le contexte de la requête : toutes les transactions ouvertes par le gestionnaire sont alors
 * filtrées par les listes d'ayants droit (voir `Db.tx`). Les routes publiques (webhooks entrants, session) restent sans sujet.
 */
@Injectable()
export class AccessContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const subject = context.switchToHttp().getRequest<AuthedRequest>().principal?.subject;
    if (!subject) return next.handle();
    return new Observable((subscriber) => runAs(subject, () => next.handle().subscribe(subscriber)));
  }
}
