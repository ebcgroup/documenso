import { z } from 'zod';

import { ZPasswordSchema } from '@documenso/lib/utils/password-schema';
import { zEmail } from '@documenso/lib/utils/zod';

export const ZCurrentPasswordSchema = z
  .string()
  .min(6, { message: 'Must be at least 6 characters in length' })
  .max(72);

export const ZSignInSchema = z.object({
  email: zEmail().min(1),
  password: ZCurrentPasswordSchema,
  totpCode: z.string().trim().optional(),
  backupCode: z.string().trim().optional(),
  csrfToken: z.string().trim(),
});

export type TSignInSchema = z.infer<typeof ZSignInSchema>;

export const ZSignUpSchema = z.object({
  name: z.string().min(1),
  email: zEmail(),
  password: ZPasswordSchema,
  signature: z.string().nullish(),
});

export type TSignUpSchema = z.infer<typeof ZSignUpSchema>;

export const ZForgotPasswordSchema = z.object({
  email: zEmail().min(1),
});

export type TForgotPasswordSchema = z.infer<typeof ZForgotPasswordSchema>;

export const ZResetPasswordSchema = z.object({
  password: ZPasswordSchema,
  token: z.string().min(1),
});

export type TResetPasswordSchema = z.infer<typeof ZResetPasswordSchema>;

export const ZVerifyEmailSchema = z.object({
  token: z.string().min(1),
});

export type TVerifyEmailSchema = z.infer<typeof ZVerifyEmailSchema>;

export const ZResendVerifyEmailSchema = z.object({
  email: zEmail().min(1),
});

export type TResendVerifyEmailSchema = z.infer<typeof ZResendVerifyEmailSchema>;

export const ZUpdatePasswordSchema = z.object({
  currentPassword: ZCurrentPasswordSchema,
  password: ZPasswordSchema,
});

export type TUpdatePasswordSchema = z.infer<typeof ZUpdatePasswordSchema>;
