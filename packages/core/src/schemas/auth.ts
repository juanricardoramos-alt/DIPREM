import { z } from "zod";
import { es } from "../strings/es";

export const esquemaLogin = z.object({
  email: z
    .string()
    .min(1, es.auth.errores.emailRequerido)
    .email(es.auth.errores.emailInvalido),
  password: z.string().min(6, es.auth.errores.passwordCorta),
});

export type DatosLogin = z.infer<typeof esquemaLogin>;
