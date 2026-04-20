import { Role } from '@prisma/client';

import { prisma } from '@documenso/prisma';

import { createUser } from '../user/create-user';

export type CreateAdminUserOptions = {
  email: string;
  password: string;
};

export const createAdminUser = async ({ email, password }: CreateAdminUserOptions) => {
  const user = await createUser({
    email,
    password,
    name: null,
  });

  return await prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      emailVerified: new Date(),
      roles: [Role.USER],
    },
    select: {
      id: true,
      email: true,
    },
  });
};
