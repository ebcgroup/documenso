import { z } from 'zod';

import { zEmail } from '@documenso/lib/utils/zod';

export const ZCreateUserRequestSchema = z.object({
  name: z.string().min(1),
  email: zEmail(),
});

export const ZCreateUserResponseSchema = z.object({
  userId: z.number(),
});

export type TCreateUserRequest = z.infer<typeof ZCreateUserRequestSchema>;
export type TCreateUserResponse = z.infer<typeof ZCreateUserResponseSchema>;
