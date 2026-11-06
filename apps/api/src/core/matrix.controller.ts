import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { Roles, type AuthedRequest } from '../auth/auth.guard';
import { validation } from './errors';
import { OrgResolver } from './http';
import { MatrixService } from './matrix.service';

const TRACKER = /^[A-Z][A-Z0-9]{1,9}$/;
const TYPE = /^[a-z][a-z0-9_]{0,39}$/;

@Controller('v1/projects')
export class MatrixController {
  constructor(
    @Inject(MatrixService) private readonly matrix: MatrixService,
    @Inject(OrgResolver) private readonly orgs: OrgResolver,
  ) {}

  /** Matrice de traçabilité `rows` × `cols` par un type de lien ; tuiles de 500 lignes (`rowOffset`) sur 200 colonnes (`offset`). */
  @Roles('athena-user', 'athena-admin')
  @Get(':project/matrix')
  async get(
    @Req() request: AuthedRequest, @Param('project') project: string,
    @Query('rows') rows = '', @Query('cols') cols = '', @Query('type') type = '', @Query('offset') offset = '0', @Query('rowOffset') rowOffset = '0',
  ) {
    if (!TRACKER.test(rows) || !TRACKER.test(cols) || !TYPE.test(type)) throw validation(['rows, cols (clés de tracker) et type (clé de type de lien) sont requis']);
    const { organizationId, actor } = await this.orgs.resolve(request.principal!);
    return this.matrix.matrix(organizationId, project, rows, cols, type, actor.roles, { colOffset: Number(offset) || 0, rowOffset: Number(rowOffset) || 0 });
  }
}
