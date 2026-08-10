import { Controller, Get, Query, UsePipes } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger'
import type { z } from 'zod'
import { QueryBus } from '@scheduler/shared-kernel'
import { ZodValidationPipe } from '@/infrastructure/http/pipes/zod-validation.pipe'
import { CheckAvailabilityQuery } from '../../application/queries/check-availability/check-availability.query'
import type { AvailabilityDto } from '../../application/queries/booking.dto'
import { checkAvailabilityQuerySchema } from '../schemas/check-availability.schema'
import { availabilityResponseSchema, errorResponseSchema } from '../schemas/responses.schema'

/** `docs/06_api_contracts.md` — `GET /api/v1/availability`. Implements UC-2. No transaction, no lock (ADR-0003 §2.6). */
@Controller('availability')
export class AvailabilityController {
  constructor(private readonly queryBus: QueryBus) {}

  @Get()
  @UsePipes(new ZodValidationPipe(checkAvailabilityQuerySchema))
  @ApiOperation({
    summary: 'Free slots for a dealership, service type and day (UC-2)',
    description:
      'Reports COUNTS of free bays and qualified technicians per slot, not their ids — this is a projection, ' +
      'not a reservation, and a slot reported free here can still lose the race to POST /appointments (ADR-0003 §2.6). ' +
      'Slots already in the past, and days the dealership is closed, are omitted.',
  })
  @ApiQuery({ name: 'dealershipId', required: true, format: 'uuid' })
  @ApiQuery({ name: 'serviceTypeId', required: true, format: 'uuid' })
  @ApiQuery({
    name: 'date',
    required: true,
    example: '2026-08-17',
    description: 'YYYY-MM-DD, interpreted in BUSINESS_TIMEZONE',
  })
  @ApiResponse({
    status: 200,
    description:
      'Available slots — an empty list when the day is closed, fully booked, or in the past',
    schema: availabilityResponseSchema,
  })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR — missing or malformed query parameter',
    schema: errorResponseSchema,
  })
  @ApiResponse({ status: 404, description: 'SERVICE_TYPE_NOT_FOUND', schema: errorResponseSchema })
  async check(
    @Query() query: z.infer<typeof checkAvailabilityQuerySchema>,
  ): Promise<AvailabilityDto> {
    return this.queryBus.execute(
      new CheckAvailabilityQuery(query.dealershipId, query.serviceTypeId, query.date),
    )
  }
}
