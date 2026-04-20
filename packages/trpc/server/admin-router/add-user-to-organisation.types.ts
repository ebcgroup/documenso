import { OrganisationMemberRole } from '@prisma/client';
import { z } from 'zod';

export const ZAddUserToOrganisationRequestSchema = z.object({
  organisationId: z.string(),
  userId: z.number().min(1),
  organisationRole: z.nativeEnum(OrganisationMemberRole),
});

export const ZAddUserToOrganisationResponseSchema = z.void();

export type TAddUserToOrganisationRequest = z.infer<typeof ZAddUserToOrganisationRequestSchema>;
