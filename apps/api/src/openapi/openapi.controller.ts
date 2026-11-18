import { Controller, Get, Inject, Optional } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { Roles } from '../auth/auth.guard';
import { AgileController } from '../agile/agile.controller';
import { BffController } from '../auth/bff.controller';
import { AttachmentController } from '../core/attachment.controller';
import { SavedFilterController } from '../atql/saved-filter.controller';
import { CoreController } from '../core/core.controller';
import { HealthController } from '../health/health.controller';
import { IntegrationsController } from '../integrations/integrations.controller';
import { buildOpenApi } from './openapi';

@Controller('v1')
export class OpenApiController {
  /** Liste de repli (sans conteneur Nest, par exemple en test unitaire) ; dans l'application, tous les contrôleurs de tous les modules sont découverts. */
  private static readonly FALLBACK: Array<new (...args: never[]) => unknown> = [HealthController, BffController, CoreController, AttachmentController, SavedFilterController, AgileController, IntegrationsController, OpenApiController];
  private document: Record<string, unknown> | null = null;

  constructor(@Optional() @Inject(ModulesContainer) private readonly modules?: ModulesContainer) {}

  /** Tous les contrôleurs enregistrés : le contrat ne peut plus oublier une route ajoutée dans un module. */
  private controllers(): Array<new (...args: never[]) => unknown> {
    if (!this.modules) return OpenApiController.FALLBACK;
    const found = new Set<new (...args: never[]) => unknown>();
    for (const module of this.modules.values()) for (const wrapper of module.controllers.values()) if (typeof wrapper.metatype === 'function') found.add(wrapper.metatype as never);
    return [...found];
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get('openapi.json')
  spec() {
    this.document ??= buildOpenApi(this.controllers());
    return this.document;
  }
}
