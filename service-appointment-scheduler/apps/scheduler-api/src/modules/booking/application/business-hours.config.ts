import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { BusinessHours } from '../domain/services/business-hours'

/**
 * Reads the four `BUSINESS_HOURS_*`/`SLOT_GRANULARITY_MINUTES` env keys
 * (`src/config/env.config.ts`) into the plain `BusinessHours` value the domain
 * layer's pure functions take. `@nestjs/config` is not one of the imports the
 * application-layer lint rule blocks (only ORM/HTTP/DB and HTTP exceptions
 * are) — see `eslint.config.mjs`.
 *
 * Shared by `BookAppointmentHandler` (validates the requested window) and
 * `CheckAvailabilityHandler` (enumerates the day's grid), so the two agree on
 * what "business hours" means by construction rather than by convention.
 */
@Injectable()
export class BusinessHoursConfig {
  constructor(private readonly config: ConfigService) {}

  get(): BusinessHours {
    return {
      start: this.config.getOrThrow<string>('env.businessHoursStart'),
      end: this.config.getOrThrow<string>('env.businessHoursEnd'),
      timeZone: this.config.getOrThrow<string>('env.businessTimezone'),
      slotGranularityMinutes: this.config.getOrThrow<number>('env.slotGranularityMinutes'),
      days: this.config.getOrThrow<number[]>('env.businessDays'),
      closedDates: this.config.getOrThrow<string[]>('env.businessClosedDates'),
    }
  }
}
