import { Global, Module } from '@nestjs/common'
import { IdempotencyInterceptor } from './idempotency.interceptor'
import { IdempotencyCleanupService } from './idempotency-cleanup.service'

/**
 * HTTP-layer idempotency only (X-Idempotency-Key response caching) — not a
 * message-consumer dedup mechanism (there is no consumer at T1/T2; see
 * directives/idempotency_strategy.md for that separate discipline). Any HTTP
 * module may `@UseInterceptors(IdempotencyInterceptor)` on a route without
 * importing this module (Global), since the interceptor itself is stateless
 * besides PrismaService (already Global). Registered once here instead of
 * copy-pasted as a provider into every consuming module.
 */
@Global()
@Module({
  providers: [IdempotencyInterceptor, IdempotencyCleanupService],
  exports: [IdempotencyInterceptor],
})
export class HttpIdempotencyModule {}
