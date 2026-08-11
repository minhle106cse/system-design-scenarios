import { randomUUID } from 'crypto'
import type { IncomingMessage } from 'http'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from '../app.module'
import { setupFastify } from './fastify'
import { Logger } from 'nestjs-pino'

export async function buildServer() {
  const adapter = new FastifyAdapter({
    logger: false,
    bodyLimit: 10 * 1024 * 1024,
    genReqId: (req: IncomingMessage) => {
      const header = req.headers['x-request-id']
      return Array.isArray(header) ? header[0] : (header ?? randomUUID())
    },
  })

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, adapter, {
    bufferLogs: true,
  })

  app.useLogger(app.get(Logger))
  app.setGlobalPrefix('api/v1', { exclude: ['health', 'metrics'] })
  // Zod validation is applied per-route (@UsePipes(new ZodValidationPipe(schema)),
  // see infrastructure/http/pipes/zod-validation.pipe.ts) — no global pipe here.
  // No enableShutdownHooks() here — it calls app.close() with no timeout on
  // SIGTERM, so a hung request would block shutdown forever. main.ts owns
  // the shutdown handler instead, wrapped in a forced-exit timeout
  // (directives/resilience_patterns.md).

  await setupFastify(app)
  await app.init()

  return app
}
