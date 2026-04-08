import { msg } from '@lingui/core/macro';
import type { Organisation, Prisma } from '@prisma/client';
import { OrganisationMemberInviteStatus } from '@prisma/client';
import { nanoid } from 'nanoid';

import { syncMemberCountWithStripeSeatPlan } from '@documenso/ee/server-only/stripe/update-subscription-item-quantity';
import { mailer } from '@documenso/email/mailer';
import { NEXT_PUBLIC_WEBAPP_URL } from '@documenso/lib/constants/app';
import { ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP } from '@documenso/lib/constants/organisations';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { isOrganisationRoleWithinUserHierarchy } from '@documenso/lib/utils/organisations';
import { prisma } from '@documenso/prisma';
import type { TCreateOrganisationMemberInvitesRequestSchema } from '@documenso/trpc/server/organisation-router/create-organisation-member-invites.types';

import { getI18nInstance } from '../../client-only/providers/i18n-server';
import { generateDatabaseId } from '../../universal/id';
import { validateIfSubscriptionIsRequired } from '../../utils/billing';
import { buildOrganisationWhereQuery } from '../../utils/organisations';
import { getEmailContext } from '../email/get-email-context';
import { getMemberOrganisationRole } from '../team/get-member-roles';

export type CreateOrganisationMemberInvitesOptions = {
  userId: number;
  userName: string;
  organisationId: string;
  invitations: TCreateOrganisationMemberInvitesRequestSchema['invitations'];
};

/**
 * Invite organisation members via email to join a organisation.
 */
export const createOrganisationMemberInvites = async ({
  userId,
  userName,
  organisationId,
  invitations,
}: CreateOrganisationMemberInvitesOptions): Promise<void> => {
  const organisation = await prisma.organisation.findFirst({
    where: buildOrganisationWhereQuery({
      organisationId,
      userId,
      roles: ORGANISATION_MEMBER_ROLE_PERMISSIONS_MAP['MANAGE_ORGANISATION'],
    }),
    include: {
      members: {
        select: {
          user: {
            select: {
              id: true,
              email: true,
            },
          },
        },
      },
      invites: {
        where: {
          status: OrganisationMemberInviteStatus.PENDING,
        },
      },
      organisationGlobalSettings: true,
      organisationClaim: true,
      subscription: true,
    },
  });

  if (!organisation) {
    throw new AppError(AppErrorCode.NOT_FOUND);
  }

  const { organisationClaim } = organisation;

  const subscription = validateIfSubscriptionIsRequired(organisation.subscription);

  const currentOrganisationMemberRole = await getMemberOrganisationRole({
    organisationId: organisation.id,
    reference: {
      type: 'User',
      id: userId,
    },
  });

  const organisationMemberEmails = organisation.members.map((member) => member.user.email);
  const organisationMemberInviteEmails = organisation.invites.map((invite) => invite.email);

  const usersToInvite = invitations.filter((invitation) => {
    // Filter out users that are already members of the organisation.
    if (organisationMemberEmails.includes(invitation.email)) {
      return false;
    }

    // Filter out users that have already been invited to the organisation.
    if (organisationMemberInviteEmails.includes(invitation.email)) {
      return false;
    }

    return true;
  });

  const unauthorizedRoleAccess = usersToInvite.some(
    ({ organisationRole }) =>
      !isOrganisationRoleWithinUserHierarchy(currentOrganisationMemberRole, organisationRole),
  );

  if (unauthorizedRoleAccess) {
    throw new AppError(AppErrorCode.UNAUTHORIZED, {
      message: 'User does not have permission to set high level roles',
    });
  }

  const organisationMemberInvites: Prisma.OrganisationMemberInviteCreateManyInput[] =
    usersToInvite.map(({ email, organisationRole }) => ({
      id: generateDatabaseId('member_invite'),
      email,
      organisationId,
      organisationRole,
      token: nanoid(32),
    }));

  const numberOfCurrentMembers = organisation.members.length;
  const numberOfCurrentInvites = organisation.invites.length;
  const numberOfNewInvites = organisationMemberInvites.length;

  const totalMemberCountWithInvites =
    numberOfCurrentMembers + numberOfCurrentInvites + numberOfNewInvites;

  // Handle billing for seat based plans.
  if (subscription) {
    await syncMemberCountWithStripeSeatPlan(
      subscription,
      organisationClaim,
      totalMemberCountWithInvites,
    );
  }

  await prisma.organisationMemberInvite.createMany({
    data: organisationMemberInvites,
  });

  const sendEmailResult = await Promise.allSettled(
    organisationMemberInvites.map(async ({ email, token }) =>
      sendOrganisationMemberInviteEmail({
        email,
        token,
        organisation,
        senderName: userName,
      }),
    ),
  );

  const sendEmailResultErrorList = sendEmailResult.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );

  if (sendEmailResultErrorList.length > 0) {
    console.error(JSON.stringify(sendEmailResultErrorList));

    throw new AppError('EmailDeliveryFailed', {
      message: 'Failed to send invite emails to one or more users.',
      userMessage: `Failed to send invites to ${sendEmailResultErrorList.length}/${organisationMemberInvites.length} users.`,
    });
  }
};

type SendOrganisationMemberInviteEmailOptions = {
  email: string;
  senderName: string;
  token: string;
  organisation: Pick<Organisation, 'id' | 'name'>;
};

/**
 * Send an email to a user inviting them to join a organisation.
 */
export const sendOrganisationMemberInviteEmail = async ({
  email,
  senderName,
  token,
  organisation,
}: SendOrganisationMemberInviteEmailOptions) => {
  const { branding, emailLanguage, senderEmail } = await getEmailContext({
    emailType: 'INTERNAL',
    source: {
      type: 'organisation',
      organisationId: organisation.id,
    },
  });

  const i18n = await getI18nInstance(emailLanguage);
  const baseUrl = NEXT_PUBLIC_WEBAPP_URL();
  const acceptUrl = `${baseUrl}/organisation/invite/${token}`;
  const declineUrl = `${baseUrl}/organisation/decline/${token}`;

  const intro = i18n._(msg`You have been invited to join the following organisation on Documenso:`);
  const invitedBy = i18n._(msg`Invited by`);
  const acceptLabel = i18n._(msg`Accept invitation`);
  const declineLabel = i18n._(msg`Decline invitation`);

  const text = [
    intro,
    organisation.name,
    '',
    `${invitedBy}: ${senderName}`,
    '',
    `${acceptLabel}: ${acceptUrl}`,
    `${declineLabel}: ${declineUrl}`,
  ].join('\n');

  const html = createSimpleOrganisationInviteHtml({
    organisationName: organisation.name,
    senderName,
    acceptUrl,
    declineUrl,
    intro,
    invitedBy,
    acceptLabel,
    declineLabel,
    brandingCompanyDetails: branding.brandingCompanyDetails,
  });

  await mailer.sendMail({
    to: email,
    from: senderEmail,
    subject: i18n._(msg`You have been invited to join ${organisation.name} on Documenso`),
    html,
    text,
  });
};

type CreateSimpleOrganisationInviteHtmlOptions = {
  organisationName: string;
  senderName: string;
  acceptUrl: string;
  declineUrl: string;
  intro: string;
  invitedBy: string;
  acceptLabel: string;
  declineLabel: string;
  brandingCompanyDetails?: string;
};

const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const createSimpleOrganisationInviteHtml = ({
  organisationName,
  senderName,
  acceptUrl,
  declineUrl,
  intro,
  invitedBy,
  acceptLabel,
  declineLabel,
  brandingCompanyDetails,
}: CreateSimpleOrganisationInviteHtmlOptions) => {
  const escapedOrganisationName = escapeHtml(organisationName);
  const escapedSenderName = escapeHtml(senderName);
  const escapedIntro = escapeHtml(intro);
  const escapedInvitedBy = escapeHtml(invitedBy);
  const escapedAcceptLabel = escapeHtml(acceptLabel);
  const escapedDeclineLabel = escapeHtml(declineLabel);
  const escapedBrandingCompanyDetails = brandingCompanyDetails
    ? escapeHtml(brandingCompanyDetails).replaceAll('\n', '<br />')
    : '';

  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:24px;font-family:Arial,sans-serif;color:#0f172a;background:#ffffff;">
    <div style="max-width:600px;margin:0 auto;">
      <h2 style="margin:0 0 16px;">Join ${escapedOrganisationName} on Documenso</h2>
      <p style="margin:0 0 16px;">${escapedIntro}</p>
      <p style="margin:0 0 16px;"><strong>${escapedOrganisationName}</strong></p>
      <p style="margin:0 0 24px;">${escapedInvitedBy}: ${escapedSenderName}</p>
      <p style="margin:0 0 12px;">
        <a href="${acceptUrl}" style="color:#0f172a;">${escapedAcceptLabel}</a>
      </p>
      <p style="margin:0 0 24px;">
        <a href="${declineUrl}" style="color:#475569;">${escapedDeclineLabel}</a>
      </p>
      ${
        escapedBrandingCompanyDetails
          ? `<p style="margin:24px 0 0;color:#64748b;font-size:12px;">${escapedBrandingCompanyDetails}</p>`
          : ''
      }
    </div>
  </body>
</html>`;
};
