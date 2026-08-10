import { registerAs } from '@nestjs/config'
import { validate } from './env.validation'

/**
 * Single source of truth for defaults is envValidationSchema — this factory
 * only reshapes the already-validated/coerced env into camelCase, it never
 * re-declares a default value (that would drift silently from the schema).
 */
export const envConfig = registerAs('env', () => {
  const env = validate(process.env)
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS,
    logLevel: env.LOG_LEVEL,
  }
})
