import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule, type SwaggerCustomOptions } from '@nestjs/swagger'

export function setupSwagger(app: INestApplication) {
  if (process.env.NODE_ENV === 'production') return

  const config = new DocumentBuilder()
    .setTitle('Service Appointment Scheduler')
    .setDescription(
      'Appointment scheduler API — resource-constrained booking with real-time ' +
        'availability checks against service bays and qualified technicians.',
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
    customSiteTitle: 'Scheduler API Docs',
  }

  SwaggerModule.setup('docs', app, document, swaggerOptions)
}
