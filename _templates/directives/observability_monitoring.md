<!-- TEMPLATE — copy into <scenario>/directives/ and specialize.
     SPECIALIZE: whether §1/§3/§4 are live or ⏸ deferred in this scenario; the API port; the Grafana port if it collides with a frontend dev server.
     Do NOT delete a rule that doesn't apply yet — mark it ⏸ with its trigger and keep it.
     Fixed a real bug in a scenario's copy? Port it back here in the SAME task. -->

# SOP: Observability & Monitoring Stack (Prometheus + Grafana)

> Ported from `../service-appointment-scheduler/directives/observability_monitoring.md`. **§2 is
> live and binding here; §1, §3 and §4 describe infrastructure this repo has deliberately deferred**
> (this scenario's plan — Prometheus/Grafana not ported, trigger below).
> Kept in full rather than trimmed: `/metrics` already emits real data, so the day those containers
> are added, the conventions and the two known gotchas below are what should govern them — the
> knowledge is preserved rather than re-derived under time pressure. **Read §2 before adding any
> metric.**

## 1. Stack Topology

> ⏸ **Deferred here.** `docker-compose.yml` runs **Postgres only** — no Prometheus, no Grafana
> containers. **Trigger to build this out**: an
> explicit request, or a debugging need a log line can't answer. What already exists on the app
> side today: `GET /metrics` (`infrastructure/http/controllers/health.controller.ts`, serving
> prom-client's default registry), `collectDefaultMetrics()` in `main.ts`, and the transient-error
> counter from the shared-kernel resilience module. In other words the **scrape target is live and
> correct**; only the scraper and the dashboard are missing.

The target shape once wired (identical to scenario 01's, which is already running it):

```
apps/scheduler-api (/metrics, runs on host) ──► Prometheus (:9090, scrape 15s) ──► Grafana (:3000)
```

No exporters, no Kafka, no Elasticsearch, no alerting provisioning — postgres-exporter's trigger
is the same one it has there: DB-level metrics becoming a real operational question.

| Component | URL | Auth |
|---|---|---|
| Prometheus | `http://localhost:${PROMETHEUS_PORT}` (default `9090`) | none — local dev only |
| Grafana | `http://localhost:${GRAFANA_PORT}` (default `3000`) | Form login — `GRAFANA_USER`/`GRAFANA_PASSWORD` in `.env` |

`apps/scheduler-api` runs **on the host** (hot-reload, see `RUN.md`), so a containerized
Prometheus would scrape it via `host.docker.internal:<API_PORT>` — **use the scenario's own API
port** (scenario 01 is `4002`, scenario 02 is `4102`). A red target means the app isn't running on
the host, not a Prometheus misconfiguration. ⚠️ Grafana's default `3000` collides with a Next.js
dev server — pick a different `GRAFANA_PORT` in any scenario that ships a frontend.

## 2. Metric convention — Gauge vs Counter

- **Gauge** (instantaneous value, read directly): `up`, `process_cpu_seconds_total` is actually a
  Counter (see below) — `nodejs_heap_size_used_bytes` is a real Gauge example.
- **Counter** (only increases, MUST be wrapped in `rate()` to mean anything):
  `scheduler_api_db_transient_error_total` (from `prisma-transient-error.ts`'s
  `makePrismaTransientErrorHelpers`), `process_cpu_seconds_total`. Reading a Counter's raw value
  is meaningless.
- **Histogram** (bucketed distribution, read with `histogram_quantile`): always in **seconds**, never
  milliseconds — `scheduler_api_availability_check_duration_seconds`. Prefer prom-client's
  `startTimer()` over hand-rolled clock arithmetic, and stop the timer in a `finally` so a throwing
  handler is still observed.
- Custom app metrics belong in `apps/scheduler-api/src/infrastructure/observability/<domain>.metrics.ts`
  (`folder_structure_sop.md` reserves that folder; **none exist yet here**). Default process metrics
  come from `collectDefaultMetrics()` in `main.ts`, and the transient-error counter from the
  shared-kernel resilience module — both live today.

**Emit a success metric AFTER the transaction commits, not inside the handler.** A counter
incremented inside `execute()` counts work that a failed COMMIT rolled back — and, because
`CommandBus` retries `P2034`, counts it again on the retry. Use
`ITransactionalCommandHandler.afterCommit`, which runs only after a real commit and is never
retried. Refusal counters are fine inline: they always throw, so nothing was committed to
over-report. (Scenario 01's `BookAppointmentHandler` is the worked example — a real defect found
during its hardening audit. **This rule binds here in advance**: `AutoScheduleHandler` replaces the
whole roster inside one transaction, so a naive "rosters generated" counter incremented inside
`execute()` would over-report on every `P2034` retry in exactly the same way.)

## 3. Recording rules — none yet

Cortex's `rules.yml` computes rates over domain counters (outbox backlog, Kafka consumer lag, DLQ
rate) that don't exist here — nor does a `prometheus.yml`, since §1 is deferred.

The trigger is unchanged from scenario 01's: a recording rule earns its place only when a query is
either slow enough to notice or duplicated across several panels/alerts. At this repo's
cardinality (one service, default process metrics, one transient-error counter) a plain
`rate(...)`/`histogram_quantile(...)` in the panel is cheaper and has one less place to drift.

## 4. Grafana provisioning-as-code

> ⏸ Deferred with §1 — `docker-init/` here holds only `init-dbs.sql`. The rule below is what must
> be followed **when** it is built, and is the reason this section is kept rather than deleted.

**Do not create dashboards/alerts by hand through the UI** — everything lives in
`docker-init/grafana/provisioning/` and is committed to git, so a dashboard is available on any
machine that clones the repo (not dependent on the `grafana_data` volume).

```
docker-init/grafana/provisioning/
├── datasources/datasource.yml      # Prometheus datasource, uid: prometheus (FIXED — panels reference this uid)
└── dashboards/
    ├── dashboard.yml                # provider — points Grafana at this directory
    └── scheduler-overview.json      # service up, CPU, heap, event-loop lag + whatever domain
                                     #   counters exist at that point
```

No `alerting/` directory — Cortex's alert rules (service-down, DLQ rate, consumer lag,
Elasticsearch reachability) all reference infrastructure neither scenario has. Add alert rules
once there's a real SLO to alert on (here that would be something like auto-schedule failure rate
or p95 auto-schedule duration) rather than porting placeholder rules with nothing meaningful to
fire on.

### 4.1 ⚠️ Known gotcha, carried from Cortex — changing a datasource `uid` after first provisioning crash-loops Grafana

**Symptom:** `Failed to provision data sources: Datasource provisioning error: data source not
found` → the container restart-loops forever, `:3000` never comes up.

**Cause:** Grafana persists the old datasource record (auto-generated UID) in the `grafana_data`
volume. Adding a fixed `uid:` to `datasource.yml` after it has already run once means the old
record no longer matches the new UID → provisioning reconcile fails → the whole `provisioning`
module fails → the container never becomes healthy.

**Fix:** `deleteDatasources` at the top of `datasource.yml` (already present) so Grafana cleans up
the old record by name before recreating it with the fixed UID:

```yaml
deleteDatasources:
  - name: Prometheus
    orgId: 1
```

No need to delete the volume. Re-apply this if a datasource's `uid` is ever changed later.

## 5. ⚠️ Scope note — what the backend must remember vs what's platform tooling

**Backend must understand deeply, not forget** (this is system design, lives in app code):
- Which metrics are worth measuring and why.
- Reading/interpreting the numbers when debugging — Gauge vs Counter, reading lag/rate correctly.
- Alert threshold design and the reasoning behind it, once alerts exist — an SLO/reliability
  decision, not syntax.

**Outside backend IC scope — understanding the concept is enough, no need to memorize syntax:**
- Prometheus recording-rule YAML syntax, Grafana's alerting pipeline syntax. Platform/SRE
  concern — reach for docs or AI assistance when needed, don't memorize.

## 🔗 Related

- `directives/logging_standard.md` — Pino structured logging (a different observability axis than metrics)
- `directives/resilience_patterns.md` — retry is the source of `scheduler_api_db_transient_error_total`
