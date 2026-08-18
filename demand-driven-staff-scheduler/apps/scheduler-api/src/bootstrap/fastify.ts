import { NestFastifyApplication } from '@nestjs/platform-fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import compress from '@fastify/compress'
import multipart from '@fastify/multipart'
import { setupSwagger } from './swagger'

export async function setupFastify(app: NestFastifyApplication) {
  const fastify = app.getHttpAdapter().getInstance()

  await fastify.register(cors, {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  })

  await fastify.register(helmet)

  // /health and /metrics: skip compression — small, low-traffic, infra-only
  // responses gain nothing from it, and Prometheus's scrape cadence is not
  // worth risking a compression-plugin edge case on. NestJS's @Get() doesn't
  // expose Fastify's route `config` directly, so set it via onRoute (must run
  // before compress registers its own onRoute hook, which reads
  // routeOptions.config.compress at route-registration time).
  fastify.addHook('onRoute', (routeOptions) => {
    if (routeOptions.url === '/health' || routeOptions.url === '/metrics') {
      routeOptions.config = { ...routeOptions.config, compress: false }
    }
  })

  await fastify.register(compress, {
    encodings: ['gzip', 'deflate', 'br'],
  })

  // The demand CSV import (brief §2.3) is the only multipart endpoint in the service — the whole
  // week's grid is at most 168 cells (24h × 7d), so 5MB is generous headroom, not a real limit.
  await fastify.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  })

  setupSwagger(app)
}
