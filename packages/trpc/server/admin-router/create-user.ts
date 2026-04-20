import { createAdminUser } from '@documenso/lib/server-only/admin/create-user';

import { adminProcedure } from '../trpc';
import { ZCreateUserRequestSchema, ZCreateUserResponseSchema } from './create-user.types';

export const createUserRoute = adminProcedure
  .input(ZCreateUserRequestSchema)
  .output(ZCreateUserResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { email, name } = input;

    ctx.logger.info({
      input: {
        email,
        name,
      },
    });

    const user = await createAdminUser(input);

    return {
      userId: user.id,
    };
  });
