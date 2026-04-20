import { Prisma } from '@prisma/client';

import { prisma } from '@documenso/prisma';

export type FindAdminUsersOptions = {
  query?: string;
  organisationId?: string;
  limit?: number;
};

export const findAdminUsers = async ({
  query = '',
  organisationId,
  limit = 20,
}: FindAdminUsersOptions) => {
  const trimmedQuery = query.trim();

  const whereClause = Prisma.validator<Prisma.UserWhereInput>()({
    OR: [
      {
        name: {
          contains: trimmedQuery,
          mode: 'insensitive',
        },
      },
      {
        email: {
          contains: trimmedQuery,
          mode: 'insensitive',
        },
      },
    ],
    ...(organisationId
      ? {
          organisationMember: {
            none: {
              organisationId,
            },
          },
        }
      : {}),
  });

  return await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
    },
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
    take: limit,
  });
};
