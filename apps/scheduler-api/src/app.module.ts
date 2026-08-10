import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common'
import { HealthController } from './infrastructure/http/controllers/health.controller'
import { TraceContextMiddleware } from './infrastructure/http/middlewares/trace-context.middleware'
import { HttpLoggingInterceptor } from './infrastructure/http/interceptors/http-logging.interceptor'
import { ResponseInterceptor } from './infrastructure/http/interceptors/response.interceptor'
import { GlobalExceptionFilter } from './infrastructure/http/filter/global-exception.filter'
import { APP_INTERCEPTOR, APP_FILTER } from '@nestjs/core'
import { ScheduleModule } from '@nestjs/schedule'
import { LoggerModule } from 'nestjs-pino'
import { ConfigModule } from './config/config.module'
import { PrismaModule } from './infrastructure/database/prisma/prisma.module'
import { PrismaTxRunnerModule } from './infrastructure/database/prisma/prisma-tx-runner.module'
import { HttpIdempotencyModule } from './infrastructure/http/idempotency/idempotency.module'
import { createLogger } from '@scheduler/shared-kernel'

import { CqrsModule } from './infrastructure/cqrs/cqrs.module'

/**
 * Not ported from Cortex's core-api AppModule (see .ai/plans/init-source.plan.md §8): the
 * multi-tenancy middleware, org-aware rate limiting, Kafka/messaging/outbox
 * modules, saga-compensation infrastructure, and every Cortex domain module
 * (`modules/tenant`, `modules/knowledge`, ...). `modules/` here is empty —
 * the scheduler domain gets its own module(s) added to `imports` below once
 * written.
 */
@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule,
    CqrsModule,
    PrismaModule,
    PrismaTxRunnerModule,
    HttpIdempotencyModule,
    ScheduleModule.forRoot(), // drives IdempotencyCleanupService's nightly @Cron
    LoggerModule.forRootAsync({
      useFactory: () => ({
        pinoHttp: {
          logger: createLogger('scheduler-api'),
          autoLogging: {
            ignore: (req) => req.url === '/health' || req.url === '/metrics',
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
  // Opens the trace-context ALS (AsyncLocalStorage) for every request, as
  // early as possible — no tenant-context middleware ahead of it here (no
  // multi-tenancy modelled, see .ai/plans/init-source.plan.md §4).
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(TraceContextMiddleware).forRoutes('*')
  }
}
