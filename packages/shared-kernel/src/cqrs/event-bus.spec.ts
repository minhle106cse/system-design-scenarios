import { EventBus } from './event-bus.js'
import type { IEvent } from './interfaces/event.interface.js'
import type { IEventHandler } from './interfaces/event-handler.interface.js'
import type { ILogger } from '../logger/index.js'

const makeEvent = (name = 'TestEvent'): IEvent => ({ name }) as unknown as IEvent

// EventBus's publish() doesn't await the handler (fire-and-forget via EventEmitter) —
// use flushPromises to drain the microtask queue before asserting.
const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

describe('EventBus', () => {
  let bus: EventBus
  let logger: jest.Mocked<ILogger>

  beforeEach(() => {
    logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<ILogger>
    bus = new EventBus(logger)
  })

  it('calls every registered handler for the matching event name', async () => {
    const handler: jest.Mocked<IEventHandler<IEvent>> = {
      handle: jest.fn().mockResolvedValue(undefined),
    }
    bus.register('TestEvent', handler)

    bus.publish(makeEvent('TestEvent'))
    await flushPromises()

    expect(handler.handle).toHaveBeenCalledTimes(1)
  })

  it('publishing an event with no registered handler does not throw (fire-and-forget), but MUST log a warning (previously silent)', async () => {
    expect(() => bus.publish(makeEvent('NoHandlerEvent'))).not.toThrow()
    await flushPromises()

    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ context: 'EventBus', eventName: 'NoHandlerEvent' }),
      'No handler registered — event published with zero listeners',
    )
  })

  it('publishing an event that HAS a handler does NOT log the "no handler" warning', async () => {
    const handler: jest.Mocked<IEventHandler<IEvent>> = {
      handle: jest.fn().mockResolvedValue(undefined),
    }
    bus.register('TestEvent', handler)

    bus.publish(makeEvent('TestEvent'))
    await flushPromises()

    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('supports multiple handlers for the same event name', async () => {
    const handler1: jest.Mocked<IEventHandler<IEvent>> = {
      handle: jest.fn().mockResolvedValue(undefined),
    }
    const handler2: jest.Mocked<IEventHandler<IEvent>> = {
      handle: jest.fn().mockResolvedValue(undefined),
    }
    bus.register('TestEvent', handler1)
    bus.register('TestEvent', handler2)

    bus.publish(makeEvent('TestEvent'))
    await flushPromises()

    expect(handler1.handle).toHaveBeenCalledTimes(1)
    expect(handler2.handle).toHaveBeenCalledTimes(1)
  })

  it('a failing handler is caught and logged, and must NOT crash the emitter or block other handlers', async () => {
    const failing: jest.Mocked<IEventHandler<IEvent>> = {
      handle: jest.fn().mockRejectedValue(new Error('handler boom')),
    }
    const healthy: jest.Mocked<IEventHandler<IEvent>> = {
      handle: jest.fn().mockResolvedValue(undefined),
    }
    bus.register('TestEvent', failing)
    bus.register('TestEvent', healthy)

    expect(() => bus.publish(makeEvent('TestEvent'))).not.toThrow()
    await flushPromises()

    expect(healthy.handle).toHaveBeenCalledTimes(1)
    expect(logger.error).toHaveBeenCalledTimes(1)
  })
})
