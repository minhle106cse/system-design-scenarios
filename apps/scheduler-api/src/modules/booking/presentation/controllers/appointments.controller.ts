import { Body, Controller, HttpCode, Param, Post, UseInterceptors, UsePipes } from '@nestjs/common'
import { ApiBody, ApiHeader, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger'
import type { z } from 'zod'
import { CommandBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { IdempotencyInterceptor } from '@/infrastructure/http/idempotency/idempotency.interceptor'
import { BookAppointmentCommand } from '../../application/commands/book-appointment/book-appointment.command'
import { CancelAppointmentCommand } from '../../application/commands/cancel-appointment/cancel-appointment.command'
import type { AppointmentSummaryDto } from '../../application/commands/appointment-summary.dto'
import { bookAppointmentSchema } from '../schemas/book-appointment.schema'
import { cancelAppointmentParamsSchema } from '../schemas/cancel-appointment.schema'
import {
  appointmentResponseSchema,
  errorResponseSchema,
  toOpenApiSchema,
} from '../schemas/responses.schema'

/**
 * Translates HTTP into Commands and pushes them to `CommandBus` — never
 * touches Prisma/`@/generated` directly (`directives/cqrs_pattern.md` §Folder
 * Structure, point 7; lint-enforced by `eslint.config.mjs`'s presentation block).
 *
 * The `schema:` values on every decorator are generated from the same Zod
 * schemas the pipe validates against (`responses.schema.ts`), so the published
 * OpenAPI spec cannot describe a contract the code does not enforce.
 */
@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly commandBus: CommandBus) {}

  /**
   * `docs/06_api_contracts.md` — `POST /api/v1/appointments`. Implements UC-1.
   *
   * `IdempotencyInterceptor` is applied here ONLY (per-route, never globally —
   * `directives/idempotency_strategy.md`): a double-submitted booking form
   * must not create two appointments.
   */
  @Post()
  @HttpCode(201)
  @UsePipes(new ZodValidationPipe(bookAppointmentSchema))
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Book an appointment (UC-1)',
    description:
      'The server selects the service bay and the qualified technician — the request does not name them. ' +
      '`endAt` is derived from `ServiceType.durationMinutes`. See docs/adr/0003-availability-and-selection-policy.md.',
  })
  @ApiHeader({
    name: 'X-Idempotency-Key',
    required: false,
    description:
      'UUID. Strongly recommended: protects a double-submitted form from creating two appointments. ' +
      'Re-sending the identical body with the same key replays the cached 201; a different body returns 422.',
  })
  @ApiBody({
    schema: toOpenApiSchema(bookAppointmentSchema),
    examples: {
      weekdayMorning: {
        summary: 'Oil change on a Monday morning',
        value: {
          customerId: '019febdf-f550-7629-92fa-bdb238413b95',
          vehicleId: '019febdf-f566-73fe-bc73-1eea9ea1e6db',
          dealershipId: '019febdf-f345-753b-9399-e74a9dbf3524',
          serviceTypeId: '019febdf-f44a-7521-86e1-b9407a425780',
          startAt: '2026-08-17T10:00:00Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Appointment created',
    schema: appointmentResponseSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — malformed body, or `startAt` is in the past',
    schema: errorResponseSchema,
  })
  @ApiResponse({
    status: 404,
    description:
      'CUSTOMER_NOT_FOUND | VEHICLE_NOT_FOUND | DEALERSHIP_NOT_FOUND | SERVICE_TYPE_NOT_FOUND',
    schema: errorResponseSchema,
  })
  @ApiResponse({
    status: 409,
    description:
      'APPOINTMENT_SLOT_CONFLICT — no free bay/technician, or lost the race to a concurrent request (ADR-0002). ' +
      '`error.details.reason` distinguishes the five cases. Also returned by the idempotency interceptor when the same key is still in flight.',
    schema: errorResponseSchema,
  })
  @ApiResponse({
    status: 422,
    description:
      'APPOINTMENT_OUTSIDE_BUSINESS_HOURS (`details.reason`: `closed_day` | `outside_hours`) | ' +
      'VEHICLE_NOT_OWNED_BY_CUSTOMER. A 422 from the idempotency interceptor instead means the same key was reused with a different body.',
    schema: errorResponseSchema,
  })
  async book(@Body() body: z.infer<typeof bookAppointmentSchema>): Promise<AppointmentSummaryDto> {
    return this.commandBus.execute(
      new BookAppointmentCommand(
        body.customerId,
        body.vehicleId,
        body.dealershipId,
        body.serviceTypeId,
        new Date(body.startAt),
      ),
    )
  }

  /**
   * `docs/06_api_contracts.md` — `POST /api/v1/appointments/:id/cancel`.
   * Implements UC-3. Idempotent on an already-CANCELLED appointment (see
   * `CancelAppointmentHandler`) — no `X-Idempotency-Key` needed for that
   * property, unlike the booking endpoint.
   */
  @Post(':id/cancel')
  @HttpCode(200)
  @UsePipes(new ZodValidationPipe(cancelAppointmentParamsSchema))
  @ApiOperation({
    summary: 'Cancel an appointment (UC-3)',
    description:
      'Idempotent: cancelling an already-CANCELLED appointment returns 200 unchanged. ' +
      'The freed window becomes bookable immediately — the exclusion constraints are scoped to status = SCHEDULED.',
  })
  @ApiParam({ name: 'id', format: 'uuid', description: 'Appointment id' })
  @ApiResponse({
    status: 200,
    description: 'Cancelled (or already was)',
    schema: appointmentResponseSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — `id` is not a UUID',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 404, description: 'APPOINTMENT_NOT_FOUND', schema: errorResponseSchema })
  @ApiResponse({
    status: 409,
    description: 'APPOINTMENT_NOT_CANCELLABLE — the appointment is already COMPLETED',
    schema: errorResponseSchema,
  })
  async cancel(
    @Param() params: z.infer<typeof cancelAppointmentParamsSchema>,
  ): Promise<AppointmentSummaryDto> {
    return this.commandBus.execute(new CancelAppointmentCommand(params.id))
  }
}
