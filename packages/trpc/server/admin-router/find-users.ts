import { findAdminUsers } from '@documenso/lib/server-only/admin/find-users';

import { adminProcedure } from '../trpc';
import { ZFindUsersRequestSchema, ZFindUsersResponseSchema } from './find-users.types';

export const findUsersRoute = adminProcedure
  .input(ZFindUsersRequestSchema)
  .output(ZFindUsersResponseSchema)
  .query(async ({ input, ctx }) => {
    const { organisationId, query } = input;

    ctx.logger.info({
      input: {
        organisationId,
        query,
      },
    });

    return await findAdminUsers(input);
  });
