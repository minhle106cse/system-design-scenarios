import { FastifyRequest } from 'fastify'
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable, map } from 'rxjs'
import { ApiResponse, buildSuccessBody } from '@scheduler/shared-kernel'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>()

    return next.handle().pipe(
      map((data) => {
        if (data instanceof ApiResponse) {
          return buildSuccessBody({ data: data.data, message: data.message, requestId: req.id })
        }
        return buildSuccessBody({ data: data as unknown, requestId: req.id })
      }),
    )
  }
}
