import { BadRequestException, Controller, HttpCode, Param, Post, Req } from '@nestjs/common'
import { ApiConsumes, ApiOperation } from '@nestjs/swagger'
import { CommandBus } from '@scheduler/shared-kernel'
import type { FastifyRequest } from 'fastify'
import type { MultipartFile } from '@fastify/multipart'
import { ImportDemandCommand } from '../../application/commands/import-demand/import-demand.command'

/**
 * `@fastify/multipart`'s own `declare module 'fastify' { interface FastifyRequest { file: ... } }`
 * augmentation doesn't reach this file: root hoists `@fastify/multipart` to the top-level
 * `node_modules`, but `fastify` itself is a nested, non-hoisted copy under `apps/scheduler-api/`
 * (Phase C's `@nestjs/platform-fastify` version-pin fix, `.ai/GOTCHAS.md`) — the augmentation's
 * `import('fastify')` resolves to a DIFFERENT physical file than the one this app imports, so
 * TypeScript never merges the two. Typing the request by hand sidesteps the mismatch entirely
 * rather than fighting node_modules layout for one method on one route.
 */
type MultipartRequest = FastifyRequest & { file(): Promise<MultipartFile | undefined> }

/** Brief §2.3 — upload the transaction (demand) CSV. Never a bare 500 (business-requirements #9). */
@Controller('schedules/:scheduleId/demand')
export class DemandController {
  constructor(private readonly commandBus: CommandBus) {}

  @Post('import')
  @HttpCode(200)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Import the demand CSV (brief §2.3) — replaces on re-import' })
  async import(@Param('scheduleId') scheduleId: string, @Req() req: FastifyRequest) {
    // Not a ZodValidationPipe case: the request-shape check here is "is there an uploaded file at
    // all", not a field-shaped body — `@fastify/multipart` (registered in bootstrap/fastify.ts) is
    // what makes `req.file()` exist. Everything CSV-content-shaped past this point is the parser's
    // job (`demand-csv.parser.ts`), returning a structured result rather than throwing —
    // `directives/zod_validation.md` governs request validation, not this domain-specific contract.
    const file = await (req as MultipartRequest).file()
    if (!file) throw new BadRequestException('No CSV file uploaded (expected a "file" field)')

    const buffer = await file.toBuffer()
    return this.commandBus.execute(new ImportDemandCommand(scheduleId, buffer.toString('utf-8')))
  }
}
