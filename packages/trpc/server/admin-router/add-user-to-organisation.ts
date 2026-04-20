import { adminAddUserToOrganisation } from '@documenso/lib/server-only/admin/add-user-to-organisation';

import { adminProcedure } from '../trpc';
import {
  ZAddUserToOrganisationRequestSchema,
  ZAddUserToOrganisationResponseSchema,
} from './add-user-to-organisation.types';

export const addUserToOrganisationRoute = adminProcedure
  .input(ZAddUserToOrganisationRequestSchema)
  .output(ZAddUserToOrganisationResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { organisationId, organisationRole, userId } = input;

    ctx.logger.info({
      input: {
        organisationId,
        organisationRole,
        userId,
      },
    });

    await adminAddUserToOrganisation(input);
  });
