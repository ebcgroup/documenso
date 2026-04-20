import { z } from 'zod';

import UserSchema from '@documenso/prisma/generated/zod/modelSchema/UserSchema';

export const ZFindUsersRequestSchema = z.object({
  query: z.string().default(''),
  organisationId: z.string().optional(),
});

export const ZFindUsersResponseSchema = z.array(
  UserSchema.pick({
    id: true,
    name: true,
    email: true,
  }),
);

export type TFindUsersRequest = z.infer<typeof ZFindUsersRequestSchema>;
export type TFindUsersResponse = z.infer<typeof ZFindUsersResponseSchema>;
