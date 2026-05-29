import {z} from 'zod'

export const createTokenSchema = z.object({
  patientId: z.string(),
  doctorId: z.string(),
  appointmentId: z.string().optional().nullable()
})

export const updateTokenSchema = z.object({
  status: z.enum(['WAITING', 'CALLING', 'COMPLETED', 'SKIPPED'])
});