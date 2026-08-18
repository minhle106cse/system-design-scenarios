import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type SwaggerCustomOptions } from '@nestjs/swagger'

export function setupSwagger(app: INestApplication) {
  if (process.env.NODE_ENV === 'production') return

  const config = new DocumentBuilder()
    .setTitle('Demand-Driven Staff Scheduler')
    .setDescription(
      'Staff scheduling API — plans a weekly roster from historical transaction demand, ' +
        'respecting every hard constraint by construction (see docs/adr/0001).',
    )
    .setVersion('1.0.0')
    .build()

  const document = SwaggerModule.createDocument(app, config)

  const swaggerOptions: SwaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
    customSiteTitle: 'Staff Scheduler API Docs',
  }

  SwaggerModule.setup('docs', app, document, swaggerOptions)
}
