import { describe, expect, it } from 'vitest'
import { describeRoleShortfall } from './role-copy'
import type { Role, RoleShortfall, Shift } from './api-client'

const roleById = new Map<string, Role>([
  ['r1', { id: 'r1', scheduleId: 'sched', name: 'Supervisor' }],
])
const shiftById = new Map<string, Shift>([
  ['sh1', { id: 'sh1', scheduleId: 'sched', label: 'Morning', startMinute: 420, endMinute: 900 }],
])

describe('describeRoleShortfall', () => {
  it('names the role, the day+shift, and tells the manager what to do', () => {
    const shortfall: RoleShortfall = {
      day: 5,
      shiftId: 'sh1',
      roleId: 'r1',
      required: 1,
      assigned: 0,
    }
    const msg = describeRoleShortfall(shortfall, roleById, shiftById)
    expect(msg).toContain('Supervisor')
    expect(msg).toContain('Morning')
    expect(msg).toMatch(/no Supervisor/)
    expect(msg).toMatch(/Assign one, or lower the requirement/)
  })

  it('reports a partial shortfall distinctly from a total one', () => {
    const shortfall: RoleShortfall = {
      day: 5,
      shiftId: 'sh1',
      roleId: 'r1',
      required: 4,
      assigned: 3,
    }
    const msg = describeRoleShortfall(shortfall, roleById, shiftById)
    expect(msg).toMatch(/3\/4 Supervisor/)
  })

  it('falls back to a generic role name and day label when the ids are unknown', () => {
    const shortfall: RoleShortfall = {
      day: 1,
      shiftId: 'ghost',
      roleId: 'ghost',
      required: 1,
      assigned: 0,
    }
    const msg = describeRoleShortfall(shortfall, roleById, shiftById)
    expect(msg).toContain('a required role')
    expect(msg).toContain('Mon')
  })
})
