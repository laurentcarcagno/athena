import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/auth.guard';
import { AgileController } from '../agile/agile.controller';
import { BffController } from '../auth/bff.controller';
import { AttachmentController } from '../core/attachment.controller';
import { CoreController } from '../core/core.controller';
import { HealthController } from '../health/health.controller';
import { IntegrationsController } from '../integrations/integrations.controller';
import { buildOpenApi } from './openapi';

@Controller('v1')
export class OpenApiController {
  private readonly document = buildOpenApi([HealthController, BffController, CoreController, AttachmentController, AgileController, IntegrationsController, OpenApiController]);

  @Roles('athena-user', 'athena-admin')
  @Get('openapi.json')
  spec() {
    return this.document;
  }
}
