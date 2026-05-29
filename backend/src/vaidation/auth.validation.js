import {z} from 'zod'

export const registerSchema = z.object({
    name: z.string().trim(),
    email: z.email("Enter valid email").trim(),
    password: z.string().min(8, "Min length of password should be 8"),
    role: z.enum(["ADMIN", "DOCTOR", "RECEPTIONIST"]).default("RECEPTIONIST")
})

export const loginSchema = z.object({
    email: z.email("Enter valid email").trim(),
    password: z.string().min(8, "Min length of password should be 8")
})