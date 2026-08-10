import { CommandBus, type RetryPolicy } from './command-bus.js'
import type { ICommand } from './interfaces/command.interface.js'
import type {
  ISagaCommandHandler,
  ITransactionalCommandHandler,
} from './interfaces/command-handler.interface.js'
import type { SagaContext } from './interfaces/saga-context.interface.js'
import type { ISagaCompensationStore } from './interfaces/saga-compensation-store.interface.js'
import type { ITxRunner } from '../database/tx-scope.js'
import {
  CommandHandlerNotFoundError,
  DuplicateCommandHandlerError,
  NestedSagaDispatchError,
  UnknownHandlerKindError,
} from './errors/cqrs.error.js'
import type { ILogger } from '../logger/index.js'

interface TestScope {
  writes: string[]
}

const makeCommand = (name = 'TestCommand'): ICommand => ({ name })

/** Records every transaction opened, so "fresh transaction per retry" is observable. */
class FakeTxRunner implements ITxRunner<TestScope> {
  readonly opened: TestScope[] = []

  async run<R>(fn: (repos: TestScope) => Promise<R>): Promise<R> {
    const scope: TestScope = { writes: [] }
    this.opened.push(scope)
    return fn(scope)
  }
}

const makeLogger = (): jest.Mocked<ILogger> =>
  ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }) as unknown as jest.Mocked<ILogger>

describe('CommandBus', () => {
  let logger: jest.Mocked<ILogger>
  let txRunner: FakeTxRunner

  // baseDelay 0 so the jitter backoff doesn't slow the suite down.
  const makeBus = (
    isTransient: (e: unknown) => boolean = () => false,
    compensationStore?: ISagaCompensationStore,
    retryPolicy: RetryPolicy = { maxRetries: 3, baseDelayMs: 0, maxDelayMs: 0 },
  ) =>
    new CommandBus(
      logger,
      txRunner,
      { isTransient, recordObservation: () => {} },
      retryPolicy,
      compensationStore,
    )

  beforeEach(() => {
    logger = makeLogger()
    txRunner = new FakeTxRunner()
  })

  const txHandler = (
    fn: (command: ICommand, tx: TestScope) => Promise<unknown>,
  ): ITransactionalCommandHandler<ICommand, unknown, TestScope> => ({
    kind: 'transactional',
    execute: fn,
  })

  const sagaHandler = (
    fn: (command: ICommand, ctx: SagaContext) => Promise<unknown>,
    dispatches: readonly string[] = [],
  ): ISagaCommandHandler<ICommand, unknown> => ({
    kind: 'saga',
    dispatches,
    execute: fn,
  })

  describe('register — boot-time validation', () => {
    it('throws DuplicateCommandHandlerError when registering 2 handlers for the same command', () => {
      const bus = makeBus()
      bus.register(
        'TestCommand',
        txHandler(async () => 'a'),
      )

      expect(() =>
        bus.register(
          'TestCommand',
          txHandler(async () => 'b'),
        ),
      ).toThrow(DuplicateCommandHandlerError)
    })

    it('allows registering a saga handler with no TxScope needed', () => {
      const bus = makeBus()
      expect(() =>
        bus.register(
          'SagaCommand',
          sagaHandler(async () => 'ok'),
        ),
      ).not.toThrow()
    })

    it('throws UnknownHandlerKindError when a handler is missing `kind` (neither transactional nor saga)', () => {
      const bus = makeBus()
      const malformed = { execute: async () => 'never' } as unknown as ITransactionalCommandHandler<
        ICommand,
        unknown,
        TestScope
      >

      expect(() => bus.register('TestCommand', malformed)).toThrow(UnknownHandlerKindError)
    })
  })

  describe('RetryPolicy — validation at construction', () => {
    it('throws RangeError when maxRetries is negative or NaN, instead of the retry loop never running', () => {
      expect(() =>
        makeBus(undefined, undefined, { maxRetries: -1, baseDelayMs: 0, maxDelayMs: 0 }),
      ).toThrow(RangeError)
      expect(() =>
        makeBus(undefined, undefined, { maxRetries: Number.NaN, baseDelayMs: 0, maxDelayMs: 0 }),
      ).toThrow(RangeError)
    })
  })

  describe('transactional handler', () => {
    it('throws CommandHandlerNotFoundError when nothing is registered', async () => {
      const bus = makeBus()
      await expect(bus.execute(makeCommand('Unregistered'))).rejects.toThrow(
        CommandHandlerNotFoundError,
      )
    })

    it('runs the handler INSIDE a transaction and returns its result', async () => {
      const bus = makeBus()
      bus.register(
        'TestCommand',
        txHandler(async (_cmd, tx) => {
          tx.writes.push('insert')
          return 'ok'
        }),
      )

      const result = await bus.execute(makeCommand())

      expect(result).toBe('ok')
      expect(txRunner.opened).toHaveLength(1)
      expect(txRunner.opened[0].writes).toEqual(['insert'])
    })

    it('calls afterCommit ONLY AFTER the transaction has resolved, with execute()\'s return value', async () => {
      const bus = makeBus()
      const afterCommit = jest.fn()
      let afterCommitCalledBeforeReturn = false
      bus.register('TestCommand', {
        kind: 'transactional',
        execute: async () => {
          afterCommitCalledBeforeReturn = afterCommit.mock.calls.length > 0
          return 'ok'
        },
        afterCommit,
      })

      await bus.execute(makeCommand())

      expect(afterCommitCalledBeforeReturn).toBe(false)
      expect(afterCommit).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'TestCommand' }),
        'ok',
      )
    })

    it('does NOT call afterCommit when execute() throws', async () => {
      const bus = makeBus()
      const afterCommit = jest.fn()
      bus.register('TestCommand', {
        kind: 'transactional',
        execute: async () => {
          throw new Error('boom')
        },
        afterCommit,
      })

      await expect(bus.execute(makeCommand())).rejects.toThrow('boom')
      expect(afterCommit).not.toHaveBeenCalled()
    })

    it('swallows an afterCommit error — a command that ALREADY committed must not surface an error just because logging failed', async () => {
      const bus = makeBus()
      bus.register('TestCommand', {
        kind: 'transactional',
        execute: async () => 'ok',
        afterCommit: () => {
          throw new Error('audit sink down')
        },
      })

      await expect(bus.execute(makeCommand())).resolves.toBe('ok')
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ command: 'TestCommand' }),
        expect.stringContaining('afterCommit threw'),
      )
    })

    it('awaits an async afterCommit — its rejection is also swallowed, not an unhandled rejection', async () => {
      const bus = makeBus()
      bus.register('TestCommand', {
        kind: 'transactional',
        execute: async () => 'ok',
        afterCommit: async () => {
          throw new Error('async audit sink down')
        },
      })

      await expect(bus.execute(makeCommand())).resolves.toBe('ok')
    })
  })

  describe('retry — transactional only, each attempt opens a NEW transaction', () => {
    it('retries a transient error and opens a new transaction for each attempt', async () => {
      const bus = makeBus((e) => (e as Error).message === 'deadlock')
      let attempts = 0
      bus.register(
        'TestCommand',
        txHandler(async (_cmd, tx) => {
          attempts++
          tx.writes.push(`attempt-${attempts}`)
          if (attempts < 3) throw new Error('deadlock')
          return 'recovered'
        }),
      )

      const result = await bus.execute(makeCommand())

      expect(result).toBe('recovered')
      expect(attempts).toBe(3)
      // 3 separate transactions — not a retry inside one already-aborted transaction.
      expect(txRunner.opened).toHaveLength(3)
      expect(txRunner.opened.map((s) => s.writes)).toEqual([
        ['attempt-1'],
        ['attempt-2'],
        ['attempt-3'],
      ])
    })

    it('does NOT retry a non-transient error', async () => {
      const bus = makeBus(() => false)
      let attempts = 0
      bus.register(
        'TestCommand',
        txHandler(async () => {
          attempts++
          throw new Error('business rule violated')
        }),
      )

      await expect(bus.execute(makeCommand())).rejects.toThrow('business rule violated')
      expect(attempts).toBe(1)
      expect(txRunner.opened).toHaveLength(1)
    })

    it('throws the original error after exhausting maxRetries', async () => {
      const bus = makeBus(() => true)
      let attempts = 0
      bus.register(
        'TestCommand',
        txHandler(async () => {
          attempts++
          throw new Error('deadlock')
        }),
      )

      await expect(bus.execute(makeCommand())).rejects.toThrow('deadlock')
      expect(attempts).toBe(4) // first attempt + 3 retries
    })

    it('does NOT retry a saga (a saga\'s side effects can\'t be rolled back)', async () => {
      const bus = makeBus(() => true)
      let attempts = 0
      bus.register(
        'SagaCommand',
        sagaHandler(async () => {
          attempts++
          throw new Error('deadlock')
        }),
      )

      await expect(bus.execute(makeCommand('SagaCommand'))).rejects.toThrow('deadlock')
      expect(attempts).toBe(1)
    })
  })

  describe('saga — compensation stack', () => {
    it('runs compensation in REVERSE order when execute fails', async () => {
      const bus = makeBus()
      const undone: string[] = []
      bus.register(
        'SagaCommand',
        sagaHandler(async (_cmd, ctx) => {
          ctx.onCompensate({ type: 'undo-1', payload: {} }, async () => {
            undone.push('undo-step-1')
          })
          ctx.onCompensate({ type: 'undo-2', payload: {} }, async () => {
            undone.push('undo-step-2')
          })
          throw new Error('step 3 failed')
        }),
      )

      await expect(bus.execute(makeCommand('SagaCommand'))).rejects.toThrow('step 3 failed')
      expect(undone).toEqual(['undo-step-2', 'undo-step-1'])
    })

    it('does NOT run compensation when the saga succeeds', async () => {
      const bus = makeBus()
      const undone: string[] = []
      bus.register(
        'SagaCommand',
        sagaHandler(async (_cmd, ctx) => {
          ctx.onCompensate({ type: 'undo', payload: {} }, async () => {
            undone.push('undo')
          })
          return 'ok'
        }),
      )

      await expect(bus.execute(makeCommand('SagaCommand'))).resolves.toBe('ok')
      expect(undone).toEqual([])
    })

    it('an error in compensation must NOT mask the original error', async () => {
      const bus = makeBus()
      bus.register(
        'SagaCommand',
        sagaHandler(async (_cmd, ctx) => {
          ctx.onCompensate({ type: 'undo', payload: {} }, async () => {
            throw new Error('compensation blew up')
          })
          throw new Error('original failure')
        }),
      )

      await expect(bus.execute(makeCommand('SagaCommand'))).rejects.toThrow('original failure')
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        expect.stringContaining('Compensation step failed'),
      )
    })

    it('records to compensationStore when compensation itself fails — durable storage, not just a log line', async () => {
      const recordFailed = jest.fn().mockResolvedValue(undefined)
      const store: ISagaCompensationStore = { recordFailed }
      const bus = makeBus(() => false, store)
      const compensationError = new Error('cancel-provisioned-user blew up')
      bus.register(
        'SagaCommand',
        sagaHandler(async (_cmd, ctx) => {
          ctx.onCompensate(
            { type: 'cancel-provisioned-user', payload: { userId: 'u-1' } },
            async () => {
              throw compensationError
            },
          )
          throw new Error('original failure')
        }),
      )

      await expect(bus.execute(makeCommand('SagaCommand'))).rejects.toThrow('original failure')

      expect(recordFailed).toHaveBeenCalledWith(
        'SagaCommand',
        { type: 'cancel-provisioned-user', payload: { userId: 'u-1' } },
        compensationError,
      )
    })

    it('does NOT call compensationStore when compensation itself succeeds', async () => {
      const recordFailed = jest.fn().mockResolvedValue(undefined)
      const store: ISagaCompensationStore = { recordFailed }
      const bus = makeBus(() => false, store)
      bus.register(
        'SagaCommand',
        sagaHandler(async (_cmd, ctx) => {
          ctx.onCompensate({ type: 'undo', payload: {} }, async () => {})
          throw new Error('original failure')
        }),
      )

      await expect(bus.execute(makeCommand('SagaCommand'))).rejects.toThrow('original failure')
      expect(recordFailed).not.toHaveBeenCalled()
    })

    it('ctx.dispatch routes back through the bus (a saga orchestrating a transactional command)', async () => {
      const bus = makeBus()
      bus.register(
        'InnerCommand',
        txHandler(async (_cmd, tx) => {
          tx.writes.push('inner-write')
          return 'inner-result'
        }),
      )
      bus.register(
        'SagaCommand',
        sagaHandler(async (_cmd, ctx) => ctx.dispatch<string>(makeCommand('InnerCommand')), [
          'InnerCommand',
        ]),
      )

      const result = await bus.execute(makeCommand('SagaCommand'))

      expect(result).toBe('inner-result')
      expect(txRunner.opened).toHaveLength(1)
      expect(txRunner.opened[0].writes).toEqual(['inner-write'])
    })

    it('throws NestedSagaDispatchError immediately at register() (boot-time), not waiting for runtime — regardless of registration order', () => {
      // Outer registered first, inner second: violation only becomes visible
      // once InnerSaga lands, so it must throw from THAT register() call.
      const busOuterFirst = makeBus()
      busOuterFirst.register(
        'OuterSaga',
        sagaHandler(async (_cmd, ctx) => ctx.dispatch(makeCommand('InnerSaga')), ['InnerSaga']),
      )
      expect(() =>
        busOuterFirst.register(
          'InnerSaga',
          sagaHandler(async () => 'inner-result'),
        ),
      ).toThrow(NestedSagaDispatchError)

      // Inner registered first, outer second: violation becomes visible when
      // OuterSaga lands, so THAT call must throw instead.
      const busInnerFirst = makeBus()
      busInnerFirst.register(
        'InnerSaga2',
        sagaHandler(async () => 'inner-result'),
      )
      expect(() =>
        busInnerFirst.register(
          'OuterSaga2',
          sagaHandler(async (_cmd, ctx) => ctx.dispatch(makeCommand('InnerSaga2')), ['InnerSaga2']),
        ),
      ).toThrow(NestedSagaDispatchError)
    })
  })

  describe('logging — fixed pipeline, always the outermost wrapper', () => {
    it('logs info on start and on success (with durationMs)', async () => {
      const bus = makeBus()
      bus.register(
        'TestCommand',
        txHandler(async () => 'ok'),
      )

      await bus.execute(makeCommand())

      expect(logger.info).toHaveBeenCalledWith(expect.anything(), 'Executing TestCommand...')
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ durationMs: expect.any(Number) }),
        'Successfully executed TestCommand',
      )
    })

    it('logs an error when the handler throws', async () => {
      const bus = makeBus()
      bus.register(
        'TestCommand',
        txHandler(async () => {
          throw new Error('boom')
        }),
      )

      await expect(bus.execute(makeCommand())).rejects.toThrow('boom')
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ err: expect.any(Error) }),
        'Failed to execute TestCommand',
      )
    })
  })
})
