import { z } from 'zod'

export const createRoleSchema = z.object({
  name: z.string().trim().min(1),
})
export type CreateRoleInput = z.infer<typeof createRoleSchema>

export const updateRoleSchema = z.object({
  name: z.string().trim().min(1).optional(),
})
export type UpdateRoleInput = z.infer<typeof updateRoleSchema>

export const setStaffRolesSchema = z.object({
  roleIds: z.array(z.string()),
})
export type SetStaffRolesInput = z.infer<typeof setStaffRolesSchema>

export const setShiftRoleRequirementsSchema = z.object({
  requirements: z.array(
    z.object({
      roleId: z.string(),
      minCount: z.coerce.number().int().min(0),
    }),
  ),
})
export type SetShiftRoleRequirementsInput = z.infer<typeof setShiftRoleRequirementsSchema>
