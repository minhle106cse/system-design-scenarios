import {
  ConflictException,
  UnprocessableEntityException,
  type CallHandler,
  type ExecutionContext,
} from '@nestjs/common'
import type { PinoLogger } from 'nestjs-pino'
import { of, throwError, firstValueFrom } from 'rxjs'
import { Prisma } from '@/generated'
import { IdempotencyInterceptor } from './idempotency.interceptor'

// In-memory store enforcing the SAME invariant Postgres does — `key` unique,
// `create()` on a duplicate throws P2002 — so the concurrency test below
// exercises the real race the interceptor is meant to close, not a sequence
// of pre-scripted mock returns.
// Every method returns a real Promise (not a bare value) — the interceptor chains
// `.catch()` directly onto `update()`/`delete()` results, exactly like the real
// Prisma client's methods do; a synchronous mock would break that chaining.
class FakeIdempotencyStore {
  private rows = new Map<string, { key: string; requestHash: string; response: unknown }>()

  findUnique = jest.fn(({ where: { key } }: { where: { key: string } }) =>
    Promise.resolve(this.rows.get(key) ?? null),
  )

  create = jest.fn(
    ({ data }: { data: { key: string; requestHash: string; response: unknown } }) => {
      if (this.rows.has(data.key)) {
        return Promise.reject(
          new Prisma.PrismaClientKnownRequestError('Unique constraint', {
            code: 'P2002',
            clientVersion: 'test',
          }),
        )
      }
      const row = {
        key: data.key,
        requestHash: data.requestHash,
        response: data.response === Prisma.JsonNull ? null : data.response,
      }
      this.rows.set(data.key, row)
      return Promise.resolve(row)
    },
  )

  update = jest.fn(
    ({ where: { key }, data }: { where: { key: string }; data: { response: unknown } }) => {
      const row = this.rows.get(key)
      if (!row) return Promise.reject(new Error('not found'))
      row.response = data.response
      return Promise.resolve(row)
    },
  )

  delete = jest.fn(({ where: { key } }: { where: { key: string } }) => {
    this.rows.delete(key)
    return Promise.resolve()
  })
}

function buildContext(
  method: string,
  key?: string,
  options: { url?: string; body?: unknown } = {},
): ExecutionContext {
  const req = {
    method,
    url: options.url ?? '/test',
    body: options.body ?? { default: true },
    headers: key ? { 'x-idempotency-key': key } : {},
    log: { error: jest.fn() },
  }
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext
}

describe('IdempotencyInterceptor', () => {
  let store: FakeIdempotencyStore
  let interceptor: IdempotencyInterceptor
  let mockLogger: jest.Mocked<PinoLogger>

  beforeEach(() => {
    store = new FakeIdempotencyStore()
    const prisma = { client: { idempotencyRecord: store } } as any
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>
    interceptor = new IdempotencyInterceptor(prisma, mockLogger)
  })

  it('passes through untouched when there is no X-Idempotency-Key header', async () => {
    const handler: CallHandler = { handle: () => of({ ok: true }) }
    const result$ = await interceptor.intercept(buildContext('POST'), handler)

    expect(await firstValueFrom(result$)).toEqual({ ok: true })
    expect(store.create).not.toHaveBeenCalled()
  })

  it('runs the handler and persists the real response on first call with a key', async () => {
    const handlerFn = jest.fn(() => of({ id: '1' }))
    const handler: CallHandler = { handle: handlerFn }

    const result$ = await interceptor.intercept(buildContext('POST', 'key-1'), handler)
    expect(await firstValueFrom(result$)).toEqual({ id: '1' })

    expect(handlerFn).toHaveBeenCalledTimes(1)
    expect(store.update).toHaveBeenCalledWith({
      where: { key: 'key-1' },
      data: { response: { id: '1' } },
    })
  })

  it('logs via the injected logger (not req.log — 2026-07-25, req.log is a silent stub under Fastify+nestjs-pino) when persisting the response fails', async () => {
    store.update.mockImplementationOnce(() => Promise.reject(new Error('db write failed')))
    const handlerFn = jest.fn(() => of({ id: '1' }))

    await firstValueFrom(
      await interceptor.intercept(buildContext('POST', 'key-persist-fail'), { handle: handlerFn }),
    )
    await new Promise((r) => setImmediate(r)) // let the .catch() microtask run

    // jest.Mocked<T> methods referenced inside expect() are a matcher argument,
    // never called detached from `this` — the standard jest-mock false positive.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'key-persist-fail' }),
      'Failed to persist idempotency response',
    )
  })

  it('replays the cached response on a sequential retry, without running the handler again', async () => {
    const handlerFn = jest.fn(() => of({ id: '1' }))
    await firstValueFrom(
      await interceptor.intercept(buildContext('POST', 'key-2'), { handle: handlerFn }),
    )

    const secondHandlerFn = jest.fn(() => of({ id: 'SHOULD NOT RUN' }))
    const result$ = await interceptor.intercept(buildContext('POST', 'key-2'), {
      handle: secondHandlerFn,
    })

    expect(await firstValueFrom(result$)).toEqual({ id: '1' })
    expect(secondHandlerFn).not.toHaveBeenCalled()
  })

  it('deletes the claim and rethrows when the handler fails, so a later retry with the same key is not stuck', async () => {
    const failingHandler: CallHandler = { handle: () => throwError(() => new Error('boom')) }

    await expect(
      firstValueFrom(await interceptor.intercept(buildContext('POST', 'key-3'), failingHandler)),
    ).rejects.toThrow('boom')

    expect(store.delete).toHaveBeenCalledWith({ where: { key: 'key-3' } })

    // Retry with the same key after the failure must run the handler again,
    // not see a phantom "in progress" row.
    const retryHandlerFn = jest.fn(() => of({ id: 'retried' }))
    const result$ = await interceptor.intercept(buildContext('POST', 'key-3'), {
      handle: retryHandlerFn,
    })
    expect(await firstValueFrom(result$)).toEqual({ id: 'retried' })
    expect(retryHandlerFn).toHaveBeenCalledTimes(1)
  })

  it('logs an error when the claim-row delete ITSELF fails after a handler failure (2026-07-25 — previously swallowed silently)', async () => {
    store.delete.mockImplementationOnce(() => Promise.reject(new Error('db unreachable')))
    const failingHandler: CallHandler = { handle: () => throwError(() => new Error('boom')) }

    await expect(
      firstValueFrom(await interceptor.intercept(buildContext('POST', 'key-4'), failingHandler)),
    ).rejects.toThrow('boom') // original handler error still propagates, not the delete error

    // eslint-disable-next-line @typescript-eslint/unbound-method -- see note above
    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'key-4' }),
      expect.stringContaining('Failed to delete idempotency claim row'),
    )
  })

  it('rejects reuse of the same key for a genuinely DIFFERENT request instead of replaying the stale response', async () => {
    const firstHandlerFn = jest.fn(() => of({ spent: 100 }))
    await firstValueFrom(
      await interceptor.intercept(buildContext('POST', 'key-reused', { body: { amount: 100 } }), {
        handle: firstHandlerFn,
      }),
    )

    // Same key, DIFFERENT body — a bug or a copy-pasted key, not a legitimate retry.
    // `intercept()` itself throws synchronously in this case (before returning an
    // Observable), so the call must be INSIDE the promise passed to `.rejects` —
    // awaiting it outside would let the exception escape before `.rejects` attaches.
    const secondHandlerFn = jest.fn(() => of({ spent: 5000 }))
    await expect(
      (async () => {
        const obs = await interceptor.intercept(
          buildContext('POST', 'key-reused', { body: { amount: 5000 } }),
          { handle: secondHandlerFn },
        )
        return firstValueFrom(obs)
      })(),
    ).rejects.toBeInstanceOf(UnprocessableEntityException)

    // Must fail BEFORE running the handler — must not spend 5000 under the guise
    // of "idempotent replay", and must not silently return the {spent:100} response.
    expect(secondHandlerFn).not.toHaveBeenCalled()
  })

  it('CONCURRENCY: only ONE of two simultaneous requests with the same key ever reaches the handler', async () => {
    let handlerCalls = 0
    const makeHandler = (): CallHandler => ({
      handle: () => {
        handlerCalls++
        return of({ ok: true })
      },
    })

    const [resultA, resultB] = await Promise.allSettled([
      interceptor
        .intercept(buildContext('POST', 'key-concurrent'), makeHandler())
        .then((obs) => firstValueFrom(obs)),
      interceptor
        .intercept(buildContext('POST', 'key-concurrent'), makeHandler())
        .then((obs) => firstValueFrom(obs)),
    ])

    expect(handlerCalls).toBe(1) // NOT 2 — this is the bug that was fixed
    const outcomes = [resultA, resultB]
    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled')
    const rejected = outcomes.filter((o) => o.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    if (rejected[0]?.status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(ConflictException)
    }
  })
})
