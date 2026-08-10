import { Module } from '@nestjs/common'
import { ConfigModule as NestConfigModule } from '@nestjs/config'
import { envConfig } from './env.config'
import { validate } from './env.validation'

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      validate,
      envFilePath: process.env.NODE_ENV === 'production' ? '.env.production' : '../../.env',
      load: [envConfig],
    }),
  ],
})
export class ConfigModule {}
