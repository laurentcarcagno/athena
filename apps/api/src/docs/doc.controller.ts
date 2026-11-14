import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { OrgResolver } from '../core/http';
import { DocLinkService } from './doc-link.service';
import { DocReadService } from './doc-read.service';

/**
 * Documents StrictDoc : consultation en lecture seule (liste, arborescence, recherche, nœud, citations). Le seul point d'écriture de ce
 * contrôleur est l'acquittement d'un lien documentaire suspect, qui ne modifie pas le document.
 */
@Controller('v1/projects/:project')
export class DocController {
  constructor(
    @Inject(DocReadService) private readonly docs: DocReadService,
    @Inject(DocLinkService) private readonly links: DocLinkService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('docs')
  async list(@Req() request: AuthedRequest, @Param('project') project: string) {
    return this.docs.documents((await this.orgs.resolve(request.principal!)).organizationId, project);
  }

  /** Recherche par UID (exact, préfixe) ou texte ; `doc` limite à un document. Déclarée avant les routes à paramètre. */
  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('docs/search')
  async search(@Req() request: AuthedRequest, @Param('project') project: string, @Query('q') q = '', @Query('doc') doc?: string) {
    return this.docs.search((await this.orgs.resolve(request.principal!)).organizationId, project, q, doc && /^[a-z0-9_-]+\.[a-z0-9-]+$/.test(doc) ? doc : undefined);
  }

  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('docs/nodes/:uid')
  async node(@Req() request: AuthedRequest, @Param('project') project: string, @Param('uid') uid: string, @Query('source') source?: string) {
    return this.docs.node((await this.orgs.resolve(request.principal!)).organizationId, project, uid, source);
  }

  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('docs/nodes/:uid/citations')
  async citations(@Req() request: AuthedRequest, @Param('project') project: string, @Param('uid') uid: string, @Query('source') source?: string) {
    return this.docs.citations((await this.orgs.resolve(request.principal!)).organizationId, project, uid, source);
  }

  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @Get('docs/:doc/tree')
  async tree(@Req() request: AuthedRequest, @Param('project') project: string, @Param('doc') doc: string) {
    return this.docs.tree((await this.orgs.resolve(request.principal!)).organizationId, project, doc);
  }

  /** Acquitte un lien suspect : la version actuelle de l'exigence devient la référence ; audité au nom de l'utilisateur. */
  @Roles('athena-team-member', 'athena-admin', 'athena-pm')
  @HttpCode(204)
  @Post('artifacts/:key/doc-links/:source/:uid/acknowledge')
  async acknowledge(@Req() request: AuthedRequest, @Param('project') project: string, @Param('key') key: string, @Param('source') source: string, @Param('uid') uid: string) {
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    await this.links.acknowledge(organizationId, project, key, source, uid, actor);
  }
}
