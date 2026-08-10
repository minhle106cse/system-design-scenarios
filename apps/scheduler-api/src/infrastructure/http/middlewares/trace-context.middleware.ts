import { Injectable, NestMiddleware } from '@nestjs/common'
import type { FastifyRequest } from 'fastify'
import { runWithTraceContext, startTraceContext } from '@scheduler/shared-kernel'

// Opens the trace-context ALS for the WHOLE request (middleware, not
// interceptor — an interceptor's Observable subscribe runs outside the ALS
// scope). Reuses the traceId of an inbound `traceparent` header (a request
// forwarded by another instrumented caller) or starts a new trace otherwise;
// mints a fresh spanId for this service's own handling either way.
@Injectable()
export class TraceContextMiddleware implements NestMiddleware {
  use(req: FastifyRequest, _res: unknown, next: () => void): void {
    const header = req.headers['traceparent']
    const inbound = Array.isArray(header) ? header[0] : header
    runWithTraceContext(startTraceContext(inbound), () => next())
  }
}
