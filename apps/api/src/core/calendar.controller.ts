import { Body, Controller, Get, Inject, Put, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { BodySchema } from '../openapi/body-schema';
import { CalendarInput, CalendarService } from './calendar.service';
import { OrgResolver, parseBody } from './http';

/** Calendrier de l'organisation : lisible par toute personne connectée, modifiable par l'administration. */
@Controller('v1')
export class CalendarController {
  constructor(
    @Inject(CalendarService) private readonly calendar: CalendarService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pm', 'athena-qa')
  @Get('calendar')
  async get(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.calendar.get(organizationId);
  }

  @Roles('athena-admin')
  @Put('admin/calendar')
  @BodySchema(CalendarInput)
  async put(@Req() request: AuthedRequest, @Body() body: unknown) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.calendar.put(organizationId, parseBody(CalendarInput, body), actor);
  }
}
