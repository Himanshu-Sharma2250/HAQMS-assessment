import {z} from 'zod'

export const registerPatientSchema = z.object({
    name: z.string().min(2).trim(),
    email: z.email("Enter Valid Email").optional(),
    phoneNumber: z.string().regex(/^(\+91[\-\s]?)?[0]?(91)?[789]\d{9}$/, {
        message: "Invalid phone number format",
    }),
    age: z.int().min(0).max(150),
    gender: z.string().trim(),
    medicalHistory: z.string().optional()
})