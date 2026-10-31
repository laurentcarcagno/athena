import { Controller, Get, Req } from '@nestjs/common';
import { Public, Roles, type AuthedRequest } from '../auth/auth.guard';

@Controller()
export class HealthController {
  @Public()
  @Get('healthz')
  health() {
    return { status: 'ok' };
  }

  @Get('v1/me')
  me(@Req() request: AuthedRequest) {
    return request.principal;
  }

  @Roles('athena-admin')
  @Get('v1/admin/ping')
  adminPing() {
    return { admin: true };
  }
}
