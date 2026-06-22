import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { jobs } from '@documenso/lib/jobs/client';
import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus } from '@prisma/client';

import { adminProcedure } from '../trpc';
import { getEmailJobTriggerName, isEmailJobId, STALE_PENDING_EMAIL_JOB_AGE_MS } from './email-jobs';
import { ZRetryEmailJobRequestSchema, ZRetryEmailJobResponseSchema } from './retry-email-job.types';

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

    if (backgroundJob.status !== BackgroundJobStatus.FAILED && !isStalePendingJob) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Only failed or stale pending email jobs can be retried',
      });
    }

    await jobs.triggerJob({
      name: getEmailJobTriggerName(jobId),
      payload: backgroundJob.payload ?? {},
    } as Parameters<typeof jobs.triggerJob>[0]);
  });
