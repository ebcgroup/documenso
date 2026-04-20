import { z } from 'zod';

import { ZPasswordSchema } from '@documenso/lib/utils/password-schema';
import { zEmail } from '@documenso/lib/utils/zod';

export const ZCreateUserRequestSchema = z.object({
  email: zEmail(),
  password: ZPasswordSchema,
});

export const ZCreateUserResponseSchema = z.object({
  userId: z.number(),
});

export type TCreateUserRequest = z.infer<typeof ZCreateUserRequestSchema>;
export type TCreateUserResponse = z.infer<typeof ZCreateUserResponseSchema>;
