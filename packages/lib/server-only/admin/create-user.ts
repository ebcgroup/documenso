import crypto from 'node:crypto';

import { Role } from '@prisma/client';

import { prisma } from '@documenso/prisma';

import { forgotPassword } from '../user/forgot-password';
import { createUser } from '../user/create-user';

export type CreateAdminUserOptions = {
  name: string;
  email: string;
};

const generateTemporaryPassword = () => {
  return `${crypto.randomBytes(24).toString('base64url')}Aa1!`;
};

export const createAdminUser = async ({ name, email }: CreateAdminUserOptions) => {
  const user = await createUser({
    name,
    email,
    password: generateTemporaryPassword(),
  });

  const verifiedUser = await prisma.user.update({
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

  await forgotPassword({
    email: verifiedUser.email,
  });

  return verifiedUser;
};
