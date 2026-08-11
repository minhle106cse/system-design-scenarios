import { config } from 'dotenv'
import { join } from 'path'
config({ path: join(process.cwd(), '../../.env') })
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.SCHEDULER_DATABASE_URL!,
  },
})
