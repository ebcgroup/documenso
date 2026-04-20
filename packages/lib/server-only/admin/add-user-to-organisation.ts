import { OrganisationMemberInviteStatus, type OrganisationMemberRole } from '@prisma/client';

import { syncMemberCountWithStripeSeatPlan } from '@documenso/ee/server-only/stripe/update-subscription-item-quantity';
import { prisma } from '@documenso/prisma';

import { AppError, AppErrorCode } from '../../errors/app-error';
import { validateIfSubscriptionIsRequired } from '../../utils/billing';
import { addUserToOrganisation } from '../organisation/accept-organisation-invitation';

export type AddUserToOrganisationOptions = {
  userId: number;
  organisationId: string;
  organisationRole: OrganisationMemberRole;
};

export const adminAddUserToOrganisation = async ({
  userId,
  organisationId,
  organisationRole,
}: AddUserToOrganisationOptions) => {
  const [user, organisation] = await Promise.all([
    prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
        email: true,
      },
    }),
    prisma.organisation.findFirst({
      where: {
        id: organisationId,
      },
      include: {
        groups: true,
        members: {
          select: {
            id: true,
            userId: true,
          },
        },
        invites: {
          where: {
            status: OrganisationMemberInviteStatus.PENDING,
          },
        },
        organisationClaim: true,
        subscription: true,
      },
    }),
  ]);

  if (!user) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'User not found',
    });
  }

  if (!organisation) {
    throw new AppError(AppErrorCode.NOT_FOUND, {
      message: 'Organisation not found',
    });
  }

  const isUserPartOfOrganisation = organisation.members.some((member) => member.userId === user.id);

  if (isUserPartOfOrganisation) {
    throw new AppError(AppErrorCode.ALREADY_EXISTS, {
      message: 'User is already a member of this organisation',
    });
  }

  const pendingInvitesToDelete = organisation.invites.filter(
    (invite) => invite.email.toLowerCase() === user.email.toLowerCase(),
  );

  const totalMemberCountWithInvites =
    organisation.members.length + organisation.invites.length + 1 - pendingInvitesToDelete.length;

  const subscription = validateIfSubscriptionIsRequired(organisation.subscription);

  if (subscription) {
    await syncMemberCountWithStripeSeatPlan(
      subscription,
      organisation.organisationClaim,
      totalMemberCountWithInvites,
    );
  }

  await prisma.$transaction(async (tx) => {
    await addUserToOrganisation({
      userId: user.id,
      organisationId: organisation.id,
      organisationGroups: organisation.groups,
      organisationMemberRole: organisationRole,
      bypassEmail: true,
      tx,
    });

    if (pendingInvitesToDelete.length > 0) {
      await tx.organisationMemberInvite.deleteMany({
        where: {
          id: {
            in: pendingInvitesToDelete.map((invite) => invite.id),
          },
        },
      });
    }
  });
};
