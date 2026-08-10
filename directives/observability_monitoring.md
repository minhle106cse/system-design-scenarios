# SOP: Observability & Monitoring Stack (Prometheus + Grafana)

> Rewritten for this repo's actual stack — verified against `docker-compose.yml` and
> `docker-init/`, not carried over from Cortex's 5-service/Kafka/Elasticsearch topology (see
> `.ai/plans/init-source.plan.md` §7). Read this when adding a metric, a dashboard panel, or debugging why Grafana
> shows no data.

## 1. Stack Topology

```
apps/scheduler-api (/metrics, runs on host) ──► Prometheus (:9090, scrape 15s) ──► Grafana (:3000)
```

No exporters, no Kafka, no Elasticsearch, no alerting provisioning at T1/T2 — see
`docker-init/prometheus/prometheus.yml`'s own comments for the deferred seams
(postgres-exporter's trigger: DB-level metrics become a real operational question).

Started with plain `docker compose up -d` (no `--profile monitoring` gate — this repo includes T2
by default, see `.ai/plans/init-source.plan.md` §1).

| Component | URL | Auth |
|---|---|---|
| Prometheus | `http://localhost:${PROMETHEUS_PORT}` (default `9090`) | none — local dev only |
| Grafana | `http://localhost:${GRAFANA_PORT}` (default `3000`) | Form login — `GRAFANA_USER`/`GRAFANA_PASSWORD` in `.env` |

`apps/scheduler-api` runs **on the host** (hot-reload, see `RUN.md`), so the containerized
Prometheus scrapes it via `host.docker.internal:4002`. A red target in Prometheus means the app
isn't running on the host, not a Prometheus misconfiguration.

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
- Custom app metrics live in `apps/scheduler-api/src/infrastructure/observability/booking.metrics.ts`;
  default process metrics come from `collectDefaultMetrics()` in `main.ts`, and the transient-error
  counter from the shared-kernel resilience module.

**Emit a success metric AFTER the transaction commits, not inside the handler.** A counter
incremented inside `execute()` counts work that a failed COMMIT rolled back — and, because
`CommandBus` retries `P2034`, counts it again on the retry. Use
`ITransactionalCommandHandler.afterCommit`, which runs only after a real commit and is never
retried. Refusal counters are fine inline: they always throw, so nothing was committed to
over-report. (`BookAppointmentHandler` is the worked example — this was a real defect found during
the hardening audit.)

## 3. Recording rules — none yet

Cortex's `rules.yml` computes rates over domain counters (outbox backlog, Kafka consumer lag, DLQ
rate) that don't exist here. `docker-init/prometheus/prometheus.yml` has no `rule_files` entry.

⚠️ **The trigger named here has now fired** — the booking domain does expose its own counters
(`scheduler_api_booking_attempt_total`, `scheduler_api_availability_check_duration_seconds`), and the
Grafana dashboard queries them directly. A recording rule is still not warranted: the dashboard's
`rate(...)`/`histogram_quantile(...)` expressions are cheap at this cardinality, and a recording rule
would add a second place for the same query to drift. Revisit when a query is either slow enough to
notice or duplicated across several panels/alerts.

## 4. Grafana provisioning-as-code

**Do not create dashboards/alerts by hand through the UI** — everything lives in
`docker-init/grafana/provisioning/` and is committed to git, so a dashboard is available on any
machine that clones the repo (not dependent on the `grafana_data` volume).

```
docker-init/grafana/provisioning/
├── datasources/datasource.yml      # Prometheus datasource, uid: prometheus (FIXED — panels reference this uid)
└── dashboards/
    ├── dashboard.yml                # provider — points Grafana at this directory
    └── scheduler-overview.json      # 6 panels: service up, CPU, heap, event-loop lag,
                                     #   booking attempts by outcome, availability p95
                                     #   + 1 "deferred" text panel (idempotency counters)
```

No `alerting/` directory at init — Cortex's alert rules (service-down, DLQ rate, consumer lag,
Elasticsearch reachability) all reference infrastructure this repo doesn't have. Add alert rules
once there's a real SLO to alert on (e.g. booking-conflict rate, p95 availability-check latency)
rather than porting placeholder rules with nothing meaningful to fire on.

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
