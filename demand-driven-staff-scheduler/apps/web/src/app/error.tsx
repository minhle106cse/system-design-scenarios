'use client'

import { useEffect, useState } from 'react'
import { Banner } from '@/components/ui/banner'
import { Button } from '@/components/ui/button'

/**
 * The route-segment error boundary for every screen. It exists for one specific, reproducible
 * first impression: `npm run dev` starts `apps/scheduler-api` and `apps/web` in parallel, and the
 * API — Nest + Prisma — takes noticeably longer to accept connections than Next takes to serve a
 * page. Anyone who opens http://localhost:3000 in that window gets a server-side `fetch` failure
 * inside `page.tsx`, and without this file Next renders its own unhandled-error screen: a stack
 * trace in development, a bare "Application error" in production. Neither tells a first-time
 * reader the one thing that is actually true — the API is not up yet, wait a moment and retry.
 *
 * `frontend_standard.md` §1 rule 3 already required this of every in-page fetch ("if a fetch
 * fails, the screen shows that it failed and what the user can do next"); the rule was applied to
 * every mutation and to none of the initial server-side loads, which are exactly the ones a cold
 * start breaks.
 *
 * ⚠️ **The retry is a full page reload, on purpose — two tidier versions were tried and both
 * failed the actual test.** With the API deliberately stopped, the page loaded into this boundary,
 * the API restarted, and the button clicked: `reset()` alone left the error screen exactly where
 * it was, and so did `router.refresh()` followed by `reset()`. Next's error boundary recovers a
 * *client* render from a payload it still holds; a root-segment server render that threw leaves
 * nothing valid to re-render from, so the boundary re-mounts against the same failed state.
 * `window.location.reload()` is the one that works, because it throws the whole client state away
 * and asks the server from scratch — which, for "the backend wasn't up yet", is exactly the right
 * amount of retrying. Do not "simplify" this into `reset()`; the tidier code is the code that
 * doesn't recover.
 */
export default function ErrorBoundary({ error }: { readonly error: Error & { digest?: string } }) {
  const [retrying, setRetrying] = useState(false)

  useEffect(() => {
    // Kept: the banner explains the likely cause, the console keeps the actual one.
    console.error(error)
  }, [error])

  function retry() {
    setRetrying(true)
    window.location.reload()
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Couldn&apos;t load this screen
      </h1>
      <div className="mt-4">
        <Banner tone="error">
          <p className="font-medium">The scheduling service didn&apos;t answer.</p>
          <p className="mt-1">
            If you have just run <code className="font-mono text-xs">npm run dev</code>, the API on
            port 4102 may still be starting — give it a few seconds and try again. If it keeps
            failing, check that Postgres is up (<code className="font-mono text-xs">npm run infra:up</code>)
            and that the API terminal shows no errors.
          </p>
        </Banner>
      </div>
      <div className="mt-4">
        <Button onClick={retry} disabled={retrying}>
          {retrying ? 'Retrying…' : 'Try again'}
        </Button>
      </div>
    </main>
  )
}
