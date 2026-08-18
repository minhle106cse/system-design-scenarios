import { Controller, Get, Module, NotFoundException } from '@nestjs/common'
import { NestFactory, APP_FILTER } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { LoggerModule } from 'nestjs-pino'
import { GlobalExceptionFilter } from './global-exception.filter'

/**
 * Real NestJS + Fastify app, not a mocked ExecutionContext — deliberately.
 * Found 2026-07-25: this filter used `req.log.error(...)` (direct property
 * access on the Fastify request object) to log truly-unhandled exceptions.
 * Under nestjs-pino + Fastify, `req.log` resolves to a stub object (has an
 * `.error()` method that doesn't throw, but `.level`/`.bindings()` are
 * `undefined` — not a real pino instance) — nestjs-pino wires its logger via
 * Express-style middleware + AsyncLocalStorage, consumed correctly ONLY
 * through DI-injected `PinoLogger`/`Logger`, never through `req.log` directly
 * under Fastify. Net effect: EVERY unhandled exception (real bugs — null
 * pointers, unexpected type errors, etc.) in core-api/notification-service/
 * search-service was logged with ZERO trace of the actual error message or
 * stack trace, silently, since this filter was written. auth-service was
 * NEVER affected — it's a hand-rolled Fastify app that passes the real pino
 * instance directly via `loggerInstance`, so `req.log` there IS the real
 * logger. Fixed by switching to `@InjectPinoLogger` (the same DI pattern
 * every other logging call site in the codebase already uses), which reads
 * from the same AsyncLocalStorage nestjs-pino actually populates correctly.
 */
describe('GlobalExceptionFilter — a truly unhandled exception is logged with its REAL message/stack', () => {
  it('logs context=ExceptionFilter with the real error, not silently dropped', async () => {
    const seen: any[] = []

    @Controller()
    class ThrowingController {
      @Get('crash')
      crash() {
        throw new Error('unexpected null pointer somewhere')
      }
    }

    @Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'debug',
            stream: { write: (line: string) => seen.push(JSON.parse(line)) },
          },
        }),
      ],
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    })
    class TestAppModule {}

    const app = await NestFactory.create<NestFastifyApplication>(
      TestAppModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/crash' })
    expect(res.statusCode).toBe(500)

    await app.close()

    const exceptionLogs = seen.filter((l) => l.context === 'ExceptionFilter')
    expect(exceptionLogs).toHaveLength(1)
    expect(exceptionLogs[0].msg).toBe('Unhandled exception')
    expect(exceptionLogs[0].err.message).toBe('unexpected null pointer somewhere')
    expect(exceptionLogs[0].err.stack).toContain('ThrowingController.crash')
  }, 20000)

  it('does NOT log via this filter for a recognized HttpException (avoids duplicating the HTTP-boundary log)', async () => {
    const seen: any[] = []

    @Controller()
    class ThrowingController {
      @Get('notfound')
      notFound() {
        throw new NotFoundException('nope')
      }
    }

    @Module({
      imports: [
        LoggerModule.forRoot({
          pinoHttp: {
            level: 'debug',
            stream: { write: (line: string) => seen.push(JSON.parse(line)) },
          },
        }),
      ],
      controllers: [ThrowingController],
      providers: [{ provide: APP_FILTER, useClass: GlobalExceptionFilter }],
    })
    class TestAppModule {}

    const app = await NestFactory.create<NestFastifyApplication>(
      TestAppModule,
      new FastifyAdapter(),
      {
        logger: false,
      },
    )
    await app.init()
    await app.getHttpAdapter().getInstance().ready()

    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/notfound' })
    expect(res.statusCode).toBe(404)

    await app.close()

    expect(seen.filter((l) => l.context === 'ExceptionFilter')).toHaveLength(0)
  }, 20000)
})
