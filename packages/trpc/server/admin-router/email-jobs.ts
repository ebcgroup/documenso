import { ONE_MINUTE } from '@documenso/lib/constants/time';

export const EMAIL_JOB_IDS = [
  'send.admin.user.created.email',
  'send.signup.confirmation.email',
  'send.document.cancelled.emails',
  'send.document.completed.emails',
  'send.document.created.from.direct.template.email',
  'send.organisation-limit-alert.email',
  'send.organisation-member-joined.email',
  'send.organisation-member-left.email',
  'send.owner.recipient.expired.email',
  'send.password.reset.success.email',
  'send.recipient.signed.email',
  'send.signing.rejected.emails',
  'send.signing.requested.email',
  'send.team-deleted.email',
] as const;

export const STALE_PENDING_EMAIL_JOB_AGE_MS = 5 * ONE_MINUTE;

type EmailJobId = (typeof EMAIL_JOB_IDS)[number];

export const isEmailJobId = (jobId: string): jobId is (typeof EMAIL_JOB_IDS)[number] => {
  return EMAIL_JOB_IDS.includes(jobId as EmailJobId);
};

export const getEmailJobTriggerName = (jobId: EmailJobId) => {
  return jobId;
};
