import { QueryBus } from './query-bus.js'
import type { IQuery } from './interfaces/query.interface.js'
import type { IQueryHandler } from './interfaces/query-handler.interface.js'
import type { ILogger } from '../logger/index.js'
import { QueryHandlerNotFoundError } from './errors/cqrs.error.js'

const makeQuery = (name = 'TestQuery'): IQuery => ({ name }) as unknown as IQuery

describe('QueryBus', () => {
  let bus: QueryBus
  let logger: jest.Mocked<ILogger>

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<ILogger>
    bus = new QueryBus(logger)
  })

  it('throws QueryHandlerNotFoundError when no handler is registered', async () => {
    await expect(bus.execute(makeQuery('Unregistered'))).rejects.toThrow(QueryHandlerNotFoundError)
  })

  it('dispatches to the right handler and returns its result', async () => {
    const handler: jest.Mocked<IQueryHandler<IQuery, unknown>> = {
      execute: jest.fn().mockResolvedValue({ id: 1 }),
    }
    bus.register('TestQuery', handler)

    const result = await bus.execute(makeQuery('TestQuery'))

    expect(result).toEqual({ id: 1 })
    expect(handler.execute).toHaveBeenCalledTimes(1)
  })

  it('only logs at debug level (not info/error) — the query bus is high-frequency, avoid log spam', async () => {
    const handler: jest.Mocked<IQueryHandler<IQuery, unknown>> = {
      execute: jest.fn().mockResolvedValue('ok'),
    }
    bus.register('TestQuery', handler)

    await bus.execute(makeQuery('TestQuery'))

    expect(logger.debug).toHaveBeenCalledTimes(2) // before + after
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('propagates a handler error without swallowing it', async () => {
    const err = new Error('query failed')
    const handler: jest.Mocked<IQueryHandler<IQuery, unknown>> = {
      execute: jest.fn().mockRejectedValue(err),
    }
    bus.register('TestQuery', handler)

    await expect(bus.execute(makeQuery('TestQuery'))).rejects.toBe(err)
  })
})
