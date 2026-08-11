import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common'
import { createHash } from 'crypto'
import type { FastifyRequest } from 'fastify'
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino'
import { Observable, from, of, throwError } from 'rxjs'
import { catchError, map, switchMap } from 'rxjs/operators'
import { LogContext } from '@scheduler/shared-kernel'
import { Prisma } from '@/generated'
import { PrismaService } from '@/infrastructure/database/prisma/prisma.service'

const MUTATION_METHODS = ['POST', 'PATCH', 'PUT', 'DELETE']
const TTL_MS = 24 * 60 * 60 * 1000 // 24h

// Stripe-style fingerprint: detects a client reusing the same idempotency key
// for a genuinely different request (bug, or a copy-pasted key) — that must be
// rejected, not silently answered with the wrong cached response.
function hashRequest(method: string, url: string, body: unknown): string {
  return createHash('sha256')
    .update(`${method} ${url}\n${JSON.stringify(body ?? null)}`)
    .digest('hex')
}

/**
 * Replays the first response for a repeated `X-Idempotency-Key` instead of
 * re-running the handler. Guards against client retries (timeout → resend)
 * double-booking an appointment. Attach per-route (never global) on the
 * booking mutation only.
 *
 * Claim-before-execute (directives/idempotency_strategy.md): the row is
 * inserted with `response: null` BEFORE the handler runs, not after — this
 * closes the concurrent-request window a check-then-run design leaves open
 * (two requests with the same key both see "no record yet" and both run the
 * handler). A second concurrent request now either sees a completed response
 * (replay) or a `response: null` claim-in-progress row (409 — no polling,
 * fail fast, client retries) — it can never reach the handler a second time.
 * On handler failure the claim row is deleted so a legitimate retry with the
 * same key isn't stuck behind a phantom "in progress" for the full 24h TTL.
 *
 * Talks to PrismaService directly (no repository port) — the only consumers
 * of this table are this class and IdempotencyCleanupService, both
 * themselves infrastructure. A port would separate interface from
 * implementation within the SAME layer with no Application-layer consumer on
 * the other side — that's not a Hexagonal boundary, just indirection.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly prisma: PrismaService,
    @InjectPinoLogger(IdempotencyInterceptor.name) private readonly logger: PinoLogger,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const req = context.switchToHttp().getRequest<FastifyRequest>()
    const key = req.headers['x-idempotency-key'] as string | undefined

    if (!key || !MUTATION_METHODS.includes(req.method)) {
      return next.handle()
    }

    const requestHash = hashRequest(req.method, req.url, req.body)

    const existing = await this.prisma.client.idempotencyRecord.findUnique({ where: { key } })
    if (existing) {
      if (existing.requestHash !== requestHash) {
        // Same key, different request — reusing an idempotency key is only ever
        // valid for retrying the EXACT SAME request. Silently replaying the old
        // response here would answer this different request with stale data.
        throw new UnprocessableEntityException(
          'This idempotency key was already used for a different request',
        )
      }
      if (existing.response !== null) return of(existing.response)
      throw new ConflictException('A request with this idempotency key is already in progress')
    }

    try {
      await this.prisma.client.idempotencyRecord.create({
        data: {
          key,
          requestHash,
          response: Prisma.JsonNull,
          expiresAt: new Date(Date.now() + TTL_MS),
        },
      })
    } catch (err) {
      // Lost the race to claim the key — another concurrent request beat us
      // to the `create()` by microseconds. Same outcome as finding it above.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A request with this idempotency key is already in progress')
      }
      throw err
    }

    return next.handle().pipe(
      // The response is persisted BEFORE it is emitted, not alongside it.
      //
      // This used to be a `tap` whose `update()` was never awaited, so the
      // response reached the client while the row still held `response: null`.
      // A client retrying promptly — the double-submitted form this interceptor
      // exists for — then read that null and got `409 already in progress` for a
      // request that had already succeeded, instead of the replayed 201. No
      // double booking (the claim row still blocked the handler), but the wrong
      // answer, and the appointment id was never handed back. Caught by the
      // first test that drove the real HTTP pipeline; the unit spec had mocked
      // the timing away.
      //
      // Cost is one round trip on the response path of a write that already
      // pays for the claim insert. A failed persist is still only logged: the
      // handler's work is committed, so refusing to return it would be worse
      // than a replay that has to re-run.
      switchMap((response) =>
        from(
          this.prisma.client.idempotencyRecord
            .update({ where: { key }, data: { response: response as Prisma.InputJsonValue } })
            .catch((err: unknown) =>
              this.logger.error(
                { context: LogContext.IDEMPOTENCY, err, key },
                'Failed to persist idempotency response',
              ),
            ),
        ).pipe(map(() => response)),
      ),
      catchError((err: unknown) =>
        from(
          this.prisma.client.idempotencyRecord
            .delete({ where: { key } })
            .catch((deleteErr: unknown) => {
              // If THIS delete fails, the claim row (response: null) is stuck for
              // up to 24h TTL, silently blocking a legitimate retry with the same
              // key. The original handler error (`err`) still propagates below
              // either way; this only adds visibility into the cleanup failure.
              this.logger.error(
                { context: LogContext.IDEMPOTENCY, key, err: deleteErr },
                'Failed to delete idempotency claim row after handler failure — stuck until TTL expiry',
              )
            }),
        ).pipe(switchMap(() => throwError(() => err))),
      ),
    )
  }
}
