import { buildServer } from './bootstrap/server'

export async function createApp() {
  return await buildServer()
}
