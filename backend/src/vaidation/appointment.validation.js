import {z} from 'zod'

export const createAppointmentSchema = z.object({
    patientId: z.string(),
    doctorId: z.string(),
    appointmentDate: z.string().trim(),
    reason: z.string().trim()
})

export const getAppointmentSchema = z.object({
    doctorId: z.string().optional().nullable(),
    status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED']).optional().nullable()
})

export const updateAppointmentSchema = z.object({
    status: z.enum(['PENDING', 'COMPLETED', 'CANCELLED'])
})