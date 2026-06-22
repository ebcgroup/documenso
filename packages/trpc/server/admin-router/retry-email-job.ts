import { NEXT_PRIVATE_INTERNAL_WEBAPP_URL } from '@documenso/lib/constants/app';
import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { jobs } from '@documenso/lib/jobs/client';
import { sign } from '@documenso/lib/server-only/crypto/sign';
import { env } from '@documenso/lib/utils/env';
import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus } from '@prisma/client';

import { adminProcedure } from '../trpc';
import {
  getEmailJobAdminCancellation,
  getEmailJobTriggerName,
  isEmailJobId,
  STALE_PENDING_EMAIL_JOB_AGE_MS,
} from './email-jobs';
import { ZRetryEmailJobRequestSchema, ZRetryEmailJobResponseSchema } from './retry-email-job.types';

const isLocalJobsProvider = () => {
  const jobsProvider = env('NEXT_PRIVATE_JOBS_PROVIDER');

  return !jobsProvider || jobsProvider === 'local';
};

export const retryEmailJobRoute = adminProcedure
  .input(ZRetryEmailJobRequestSchema)
  .output(ZRetryEmailJobResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { id } = input;

    ctx.logger.info({
      input: {
        id,
      },
    });

    const backgroundJob = await prisma.backgroundJob.findUnique({
      where: {
        id,
      },
    });

    if (!backgroundJob) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Email job not found',
      });
    }

    const jobId = backgroundJob.jobId;

    if (!isEmailJobId(jobId)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Only email jobs can be retried from this route',
      });
    }

    const isStalePendingJob =
      backgroundJob.status === BackgroundJobStatus.PENDING &&
      backgroundJob.submittedAt <= new Date(Date.now() - STALE_PENDING_EMAIL_JOB_AGE_MS);
    const adminCancellation = await getEmailJobAdminCancellation(backgroundJob.id);

    if (adminCancellation) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Manually stopped email jobs cannot be retried',
      });
    }

    if (backgroundJob.status !== BackgroundJobStatus.FAILED && !isStalePendingJob) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Only failed or stale pending email jobs can be retried',
      });
    }

    if (isStalePendingJob && isLocalJobsProvider()) {
      const payload = backgroundJob.payload ?? {};
      const data = {
        name: getEmailJobTriggerName(jobId),
        payload,
      };

      const response = await fetch(`${NEXT_PRIVATE_INTERNAL_WEBAPP_URL()}/api/jobs/${jobId}/${backgroundJob.id}`, {
        method: 'POST',
        body: JSON.stringify(data),
        headers: {
          'Content-Type': 'application/json',
          'X-Job-Id': backgroundJob.id,
          'X-Job-Signature': sign(data),
          'X-Job-Retry': '1',
        },
      });

      if (!response.ok) {
        ctx.logger.warn({
          message: 'Email job retry endpoint returned a non-OK response',
          status: response.status,
          response: await response.text().catch(() => null),
        });
      }

      return;
    }

    await jobs.triggerJob({
      name: getEmailJobTriggerName(jobId),
      payload: backgroundJob.payload ?? {},
    } as Parameters<typeof jobs.triggerJob>[0]);
  });
