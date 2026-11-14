import { Controller, Delete, Get, HttpCode, Inject, Param, Post, Query, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { AttachmentService, MAX_ATTACHMENT_BYTES } from './attachment.service';
import { OrgResolver } from './http';
import { validation } from './errors';
import { RawBody } from '../openapi/body-schema';

/** Accepte les envois binaires bruts (le client envoie le fichier tel quel, le nom en paramètre). */
export function registerBinaryUpload(fastify: FastifyInstance): void {
  fastify.addContentTypeParser('application/octet-stream', { parseAs: 'buffer', bodyLimit: MAX_ATTACHMENT_BYTES }, (_req, body, done) => done(null, body));
}

@Controller('v1/projects')
export class AttachmentController {
  constructor(
    @Inject(AttachmentService) private readonly attachments: AttachmentService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin')
  @Post(':project/artifacts/:key/attachments')
  @RawBody()
  async upload(@Req() request: AuthedRequest & { body: unknown }, @Param('project') project: string, @Param('key') key: string, @Query('name') name: string | undefined) {
    if (!Buffer.isBuffer(request.body)) throw validation(['envoyer le fichier brut avec Content-Type: application/octet-stream']);
    if (!name) throw validation(['paramètre name requis']);
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.attachments.add(organizationId, project, key, name, String(request.headers['x-file-type'] ?? ''), request.body, actor);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get(':project/artifacts/:key/attachments')
  async list(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    return this.attachments.list(organizationId, project, key);
  }

  @Roles('athena-team-member', 'athena-admin')
  @Get(':project/artifacts/:key/attachments/:id')
  async download(@Req() request: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply, @Param('project') project: string, @Param('key') key: string, @Param('id') id: string) {
    const { organizationId } = await this.orgs.resolve(request.principal!);
    const { meta, data } = await this.attachments.read(organizationId, project, key, id);
    // Toujours en téléchargement, jamais interprété par le navigateur (pas de script servi depuis notre origine).
    void reply.header('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.name)}`);
    void reply.header('x-content-type-options', 'nosniff');
    void reply.header('content-security-policy', "sandbox; default-src 'none'");
    void reply.header('content-type', 'application/octet-stream');
    void reply.header('x-attachment-type', meta.contentType);
    return new StreamableFile(data);
  }

  @Roles('athena-team-member', 'athena-admin')
  @HttpCode(204)
  @Delete(':project/artifacts/:key/attachments/:id')
  async remove(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Param('id') id: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.attachments.remove(organizationId, project, key, id, actor);
  }
}
