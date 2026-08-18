import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { HealthController } from './infrastructure/http/controllers/health.controller'
import { TraceContextMiddleware } from './infrastructure/http/middlewares/trace-context.middleware'
import { HttpLoggingInterceptor } from './infrastructure/http/interceptors/http-logging.interceptor'
import { ResponseInterceptor } from './infrastructure/http/interceptors/response.interceptor'
import { GlobalExceptionFilter } from './infrastructure/http/filter/global-exception.filter'
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core'
import { LoggerModule } from 'nestjs-pino'
import { ConfigModule } from './config/config.module'
import { PrismaModule } from './infrastructure/database/prisma/prisma.module'
import { PrismaTxRunnerModule } from './infrastructure/database/prisma/prisma-tx-runner.module'
import { createLogger } from '@scheduler/shared-kernel'

import { CqrsModule } from './infrastructure/cqrs/cqrs.module'
import { SchedulingModule } from './modules/scheduling/scheduling.module'

/**
 * Not ported from ../service-appointment-scheduler's AppModule
 * (backend-architecture-reversal.plan.md §6): the HTTP idempotency interceptor + its nightly
 * cleanup cron (no append-only mutation exists here — auto-schedule is a full replace, CSV import
 * is an upsert, same reasoning as init plan §1) and Prometheus/Grafana wiring beyond the plain
 * /metrics endpoint (deferred, explicit trigger). `SchedulingModule` is the first (and, at this
 * scope, only) domain module.
 */
@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule,
    CqrsModule,
    PrismaModule,
    PrismaTxRunnerModule,
    SchedulingModule,
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          logger: createLogger('scheduler-api'),
          autoLogging: {
            ignore: (req: { url?: string }) => req.url === '/health' || req.url === '/metrics',
          },
          customAttributeKeys: {
            req: 'request',
            res: 'response',
            err: 'error',
            responseTime: 'responseTime',
          },
        },
      }),
    }),
  ],
  providers: [
    HttpLoggingInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: HttpLoggingInterceptor,
    },
    ResponseInterceptor,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    GlobalExceptionFilter,
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    TraceContextMiddleware,
  ],
})
export class AppModule implements NestModule {
  // Opens the trace-context ALS (AsyncLocalStorage) for every request, as early as possible — no
  // tenant-context middleware ahead of it here (no multi-tenancy, no auth — out of scope).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceContextMiddleware).forRoutes('*')
  }
}
