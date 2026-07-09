import { ONE_MINUTE } from '@documenso/lib/constants/time';
import { unsafeBuildEnvelopeIdQuery } from '@documenso/lib/utils/envelope';
import { prisma } from '@documenso/prisma';
import { BackgroundJobTaskStatus, DocumentStatus, EnvelopeType, type Prisma } from '@prisma/client';

export const EMAIL_JOB_IDS = [
  'send.admin.user.created.email',
  'send.signup.confirmation.email',
  'send.document.cancelled.emails',
  'send.document.completed.emails',
  'send.document.created.from.direct.template.email',
  'send.document.deleted.emails',
  'send.document.pending.email',
  'send.organisation-limit-alert.email',
  'send.organisation-member-joined.email',
  'send.organisation-member-left.email',
  'send.owner.recipient.expired.email',
  'send.password.reset.success.email',
  'send.recipient.removed.email',
  'send.recipient.signed.email',
  'send.signing.rejected.emails',
  'send.signing.requested.email',
  'send.team-deleted.email',
] as const;

export const STALE_PENDING_EMAIL_JOB_AGE_MS = 5 * ONE_MINUTE;
export const EMAIL_JOB_ADMIN_CANCELLATION_TASK_NAME = 'Admin cancellation';

type EmailJobId = (typeof EMAIL_JOB_IDS)[number];
type EmailJobAdminCancellation = {
  reason: string | null;
  cancelledAt: string | null;
  cancelledByUserId: number | null;
  cancelledByUserEmail: string | null;
} | null;

export const isEmailJobId = (jobId: string): jobId is (typeof EMAIL_JOB_IDS)[number] => {
  return EMAIL_JOB_IDS.includes(jobId as EmailJobId);
};

export const getEmailJobTriggerName = (jobId: EmailJobId) => {
  return jobId;
};

export const getEmailJobAdminCancellationTaskId = (backgroundJobId: string) => {
  return `admin-cancelled--${backgroundJobId}`;
};

export const getPayloadNumber = (payload: Prisma.JsonValue | null, key: string) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, Prisma.JsonValue>;
  const value = record[key];

  return typeof value === 'number' ? value : null;
};

export const getEmailJobAdminCancellationFromResult = (result: Prisma.JsonValue | null) => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    return null;
  }

  const record = result as Record<string, Prisma.JsonValue>;

  return {
    reason: typeof record.reason === 'string' ? record.reason : null,
    cancelledAt: typeof record.cancelledAt === 'string' ? record.cancelledAt : null,
    cancelledByUserId: typeof record.cancelledByUserId === 'number' ? record.cancelledByUserId : null,
    cancelledByUserEmail: typeof record.cancelledByUserEmail === 'string' ? record.cancelledByUserEmail : null,
  };
};

export const getEmailJobAdminCancellation = async (backgroundJobId: string) => {
  const task = await prisma.backgroundJobTask.findFirst({
    where: {
      id: getEmailJobAdminCancellationTaskId(backgroundJobId),
      jobId: backgroundJobId,
      name: EMAIL_JOB_ADMIN_CANCELLATION_TASK_NAME,
      status: BackgroundJobTaskStatus.FAILED,
    },
    select: {
      result: true,
    },
  });

  return getEmailJobAdminCancellationFromResult(task?.result as Prisma.JsonValue | null);
};

export const getEmailJobTargetSummary = async (job: { jobId: string; payload: Prisma.JsonValue | null }) => {
  const userId = getPayloadNumber(job.payload, 'userId');
  const documentId = getPayloadNumber(job.payload, 'documentId');
  const recipientId = getPayloadNumber(job.payload, 'recipientId');

  const [user, document, recipient] = await Promise.all([
    userId
      ? prisma.user.findUnique({
          where: {
            id: userId,
          },
          select: {
            id: true,
            email: true,
          },
        })
      : null,
    documentId
      ? prisma.envelope.findFirst({
          where: unsafeBuildEnvelopeIdQuery(
            {
              type: 'documentId',
              id: documentId,
            },
            EnvelopeType.DOCUMENT,
          ),
          select: {
            id: true,
            title: true,
            status: true,
          },
        })
      : null,
    recipientId
      ? prisma.recipient.findUnique({
          where: {
            id: recipientId,
          },
          select: {
            id: true,
            email: true,
          },
        })
      : null,
  ]);

  return {
    userId,
    documentId,
    recipientId,
    user,
    document,
    recipient,
  };
};

export const getEmailJobStatusDetail = async (
  job: {
    id: string;
    jobId: string;
    payload: Prisma.JsonValue | null;
  },
  cancellation: EmailJobAdminCancellation = null,
) => {
  if (cancellation) {
    return cancellation.reason ?? 'Stopped manually from admin email jobs.';
  }

  const userId = getPayloadNumber(job.payload, 'userId');

  if (
    userId &&
    ['send.admin.user.created.email', 'send.signup.confirmation.email', 'send.password.reset.success.email'].includes(
      job.jobId,
    )
  ) {
    const user = await prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        id: true,
      },
    });

    if (!user) {
      return 'Target user no longer exists.';
    }
  }

  if (job.jobId !== 'send.signing.requested.email') {
    return null;
  }

  const target = await getEmailJobTargetSummary(job);

  if (!target.documentId || !target.recipientId) {
    return 'Signing email payload is missing document or recipient details.';
  }

  if (!target.document) {
    return 'Target document no longer exists.';
  }

  if (target.document.status !== DocumentStatus.PENDING) {
    return 'Target document is no longer pending.';
  }

  if (!target.recipient) {
    return 'Target recipient no longer exists.';
  }

  return null;
};
