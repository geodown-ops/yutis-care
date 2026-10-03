import { isDeepStrictEqual } from 'node:util';
import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { defaultTemplates, templateKindEnum, type Tx } from '@yutis/db';
import { and, asc, eq, sql } from 'drizzle-orm';
import { Requires } from '../auth/access.js';
import { recordPlatformAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { DEFAULT_TEMPLATES } from './defaults.js';

type TemplateKind = (typeof templateKindEnum.enumValues)[number];

class TemplateVersionDto {
  @ApiProperty({ enum: templateKindEnum.enumValues }) kind!: TemplateKind;
  @ApiProperty() version!: number;
  @ApiProperty({ description: '這次是否發布了新版本' }) changed!: boolean;
}

/**
 * Make the active default templates match the code (src/templates/defaults.ts): a kind whose content differs gets a
 * new active version; the previous one stays for the record. Tenants already onboarded keep their own copies.
 */
export async function syncDefaultTemplates(tx: Tx, actorId: string | null): Promise<TemplateVersionDto[]> {
  const results: TemplateVersionDto[] = [];
  for (const kind of templateKindEnum.enumValues) {
    const content: unknown = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES[kind]));
    const [active] = await tx.select().from(defaultTemplates).where(and(eq(defaultTemplates.kind, kind), eq(defaultTemplates.active, true)));
    if (active && isDeepStrictEqual(active.content, content)) {
      results.push({ kind, version: active.version, changed: false });
      continue;
    }
    const [{ latest }] = await tx.select({ latest: sql<number>`coalesce(max(${defaultTemplates.version}), 0)::int` })
      .from(defaultTemplates).where(eq(defaultTemplates.kind, kind)) as [{ latest: number }];
    if (active) await tx.update(defaultTemplates).set({ active: false }).where(eq(defaultTemplates.id, active.id));
    await tx.insert(defaultTemplates).values({ kind, version: latest + 1, content, active: true, createdBy: actorId });
    results.push({ kind, version: latest + 1, changed: true });
  }
  return results;
}

@ApiTags('templates')
@Controller('templates')
export class TemplatesController {
  @Get()
  @Requires('tenants:read')
  @ApiOperation({ summary: '目前生效的預設範本版本', description: '新租戶開通時複製：分級規則、片語庫、簽核角色、問卷版本。' })
  @ApiOkResponse({ type: [TemplateVersionDto] })
  async list(@Ctx() ctx: RequestContext): Promise<TemplateVersionDto[]> {
    const rows = await ctx.tx.select({ kind: defaultTemplates.kind, version: defaultTemplates.version })
      .from(defaultTemplates).where(eq(defaultTemplates.active, true)).orderBy(asc(defaultTemplates.kind));
    return rows.map(r => ({ ...r, changed: false }));
  }

  @Post('sync')
  @HttpCode(200)
  @Requires('templates:write')
  @ApiOperation({ summary: '把預設範本更新為程式內建的版本', description: '內容有變的類別會發布新版本；已開通的租戶不受影響。' })
  @ApiOkResponse({ type: [TemplateVersionDto] })
  async sync(@Ctx() ctx: RequestContext): Promise<TemplateVersionDto[]> {
    const results = await syncDefaultTemplates(ctx.tx, ctx.user.id);
    await recordPlatformAudit(ctx, {
      action: 'templates.sync', subjectTable: 'default_templates',
      detail: { published: results.filter(r => r.changed).map(r => `${r.kind} v${r.version}`) },
    });
    return results;
  }
}
