import { Global, Module, OnApplicationBootstrap } from '@nestjs/common'
import { DiscoveryModule, DiscoveryService } from '@nestjs/core'
import { PinoLogger } from 'nestjs-pino'
import {
  CommandBus,
  QueryBus,
  EventBus,
  COMMAND_HANDLER_METADATA,
  QUERY_HANDLER_METADATA,
  EVENT_HANDLER_METADATA,
  TX_RUNNER,
  type ICommandHandler,
  type IQueryHandler,
  type IEventHandler,
  type ITxRunner,
} from '@scheduler/shared-kernel'
import { transientError } from '../database/prisma/prisma-transient-error'
import type { SchedulerApiRepos } from '../database/prisma/scheduler-api-repos.factory'

/**
 * The command pipeline (logging → retry → transaction) is not assembled
 * here: it lives inside CommandBus as a fixed sequence, so it cannot be wired
 * in the wrong order (docs/adr/0005-transaction-retry-boundary.md §2.3).
 * This module only builds the buses and auto-discovers handlers.
 *
 * No `compensationStore` is injected into CommandBus here — it's optional
 * (see shared-kernel's command-bus.ts) and this service has no saga
 * handlers: scheduling is a single-database operation, one transaction, not a saga. The
 * saga interfaces stay in shared-kernel's public surface regardless (see
 * .ai/plans/backend-architecture-reversal.plan.md §4) so the bus's compensation contract is available the
 * moment a real multi-step flow needs it.
 */
@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: CommandBus,
      useFactory: (logger: PinoLogger, txRunner: ITxRunner<SchedulerApiRepos>) =>
        new CommandBus(logger, txRunner, transientError),
      inject: [PinoLogger, TX_RUNNER],
    },
    {
      provide: QueryBus,
      useFactory: (logger: PinoLogger) => new QueryBus(logger),
      inject: [PinoLogger],
    },
    {
      provide: EventBus,
      useFactory: (logger: PinoLogger) => new EventBus(logger),
      inject: [PinoLogger],
    },
  ],
  exports: [CommandBus, QueryBus, EventBus],
})
export class CqrsModule implements OnApplicationBootstrap {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly eventBus: EventBus,
    private readonly discoveryService: DiscoveryService,
  ) {}

  /**
   * Runs AFTER every module's onModuleInit — discovers and registers every
   * command/query/event handler in the app.
   */
  onApplicationBootstrap() {
    const providers = this.discoveryService.getProviders()

    providers
      .filter((wrapper) => wrapper.instance && !wrapper.isNotMetatype)
      .forEach((wrapper) => {
        const instance = wrapper.instance as object
        const metatype = wrapper.metatype as (new (...args: unknown[]) => unknown) | undefined

        if (metatype) {
          const command = Reflect.getMetadata(COMMAND_HANDLER_METADATA, metatype) as
            { name: string } | undefined
          if (command) {
            this.commandBus.register(command.name, instance as ICommandHandler)
          }

          const query = Reflect.getMetadata(QUERY_HANDLER_METADATA, metatype) as
            { name: string } | undefined
          if (query) {
            this.queryBus.register(query.name, instance as IQueryHandler)
          }

          const event = Reflect.getMetadata(EVENT_HANDLER_METADATA, metatype) as
            { name: string } | undefined
          if (event) {
            this.eventBus.register(event.name, instance as IEventHandler)
          }
        }
      })
  }
}
