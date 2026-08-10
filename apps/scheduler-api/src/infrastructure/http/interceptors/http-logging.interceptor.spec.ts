import { Controller, Get, Module, NotFoundException } from '@nestjs/common'
import { NestFactory, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core'
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify'
import { LoggerModule } from 'nestjs-pino'
import { HttpLoggingInterceptor } from './http-logging.interceptor'
import { GlobalExceptionFilter } from '../filter/global-exception.filter'

/**
 * Real NestJS + Fastify app, not a mocked ExecutionContext — deliberately.
 * A unit test with a plain mocked `reply` object cannot reproduce the actual
 * bug this guards against: RxJS `finalize()` on `next.handle()` fires WHILE
 * an exception is still propagating out of the interceptor chain, BEFORE
 * GlobalExceptionFilter (registered as APP_FILTER, i.e. OUTSIDE the
 * interceptor) gets to call `reply.status(...)`. A mock would just report
 * whatever status you pre-set on it — it can't catch a real ordering bug.
 * Found 2026-07-25: this interceptor was logging every 4xx/5xx response as a
 * fake 200 "success" since it was written, because it read `res.statusCode`
 * at the wrong point in the request lifecycle. Fixed by moving the read to
 * the raw Node response's 'finish' event, which Fastify only fires after the
 * response is actually sent — same guarantee auth-service's Fastify-native
 * `onResponse` hook already had (auth-service was never affected).
 */
describe('HttpLoggingInterceptor — real status code/level, not the pre-exception default', () => {
  let app: NestFastifyApplication
  const seen: any[] = []

  beforeAll(async () => {
    @Controller()
    class TestController {
      @Get('boom')
      boom() {
        throw new NotFoundException('nope')
      }

      @Get('ok')
      ok() {
        return { fine: true }
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
      controllers: [TestController],
      providers: [
        { provide: APP_INTERCEPTOR, useClass: HttpLoggingInterceptor },
        { provide: APP_FILTER, useClass: GlobalExceptionFilter },
      ],
    })
    class TestAppModule {}

    app = await NestFactory.create<NestFastifyApplication>(TestAppModule, new FastifyAdapter(), {
      logger: false,
    })
    await app.init()
    await app.getHttpAdapter().getInstance().ready()
  }, 20000)

  afterAll(async () => {
    await app.close()
  })

  function httpLayerLogsFor(url: string) {
    return seen.filter((l) => l.context === 'HttpLayer' && l.url === url)
  }

  it('a thrown HttpException (404) is logged with the REAL status and at warn level, not a fake 200/info', async () => {
    seen.length = 0
    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/boom' })
    expect(res.statusCode).toBe(404)

    const logs = httpLayerLogsFor('/boom')
    expect(logs).toHaveLength(1)
    expect(logs[0].statusCode).toBe(404)
    expect(logs[0].level).toBe(40) // pino warn
  })

  it('a successful response is still logged correctly at info level', async () => {
    seen.length = 0
    const res = await app.getHttpAdapter().getInstance().inject({ method: 'GET', url: '/ok' })
    expect(res.statusCode).toBe(200)

    const logs = httpLayerLogsFor('/ok')
    expect(logs).toHaveLength(1)
    expect(logs[0].statusCode).toBe(200)
    expect(logs[0].level).toBe(30) // pino info
  })
})
