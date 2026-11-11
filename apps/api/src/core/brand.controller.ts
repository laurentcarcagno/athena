import { Controller, Delete, Get, HttpCode, Inject, Param, Put, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { RawBody } from '../openapi/body-schema';
import { BrandService } from './brand.service';
import { validation } from './errors';
import { OrgResolver } from './http';

const EVERYONE = ['athena-user', 'athena-admin', 'athena-pm', 'athena-qa'] as const;

/** Icône et logo de marque par thème : lisibles par toute personne connectée, téléversés par l'administration (T-0137). */
@Controller('v1')
export class BrandController {
  constructor(
    @Inject(BrandService) private readonly brand: BrandService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles(...EVERYONE)
  @Get('brand')
  async list(@Req() request: AuthedRequest) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.brand.list(organizationId);
  }

  @Roles(...EVERYONE)
  @Get('brand/:theme/:kind')
  async image(@Req() request: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param('theme') theme: string, @Param('kind') kind: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    const { contentType, data } = await this.brand.read(organizationId, theme, kind);
    // Type strict, jamais deviné ; aucun script ni ressource même si l'image est ouverte seule.
    void reply.header('content-type', contentType);
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('content-security-policy', "sandbox; default-src 'none'");
    void reply.header('cache-control', 'private, max-age=300');
    return new StreamableFile(data);
  }

  @Roles('athena-admin')
  @Put('admin/brand/:theme/:kind')
  @RawBody()
  async upload(@Req() request: AuthedRequest & { body: unknown }, @Param('theme') theme: string, @Param('kind') kind: string) {
    if (!Buffer.isBuffer(request.body)) throw validation(['envoyer l’image brute avec Content-Type: application/octet-stream']);
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.brand.put(organizationId, theme, kind, request.body);
  }

  @Roles('athena-admin')
  @HttpCode(204)
  @Delete('admin/brand/:theme/:kind')
  async remove(@Req() request: AuthedRequest, @Param('theme') theme: string, @Param('kind') kind: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    await this.brand.remove(organizationId, theme, kind);
  }
}
