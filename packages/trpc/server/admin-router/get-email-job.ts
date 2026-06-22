import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus, Prisma } from '@prisma/client';

import { adminProcedure } from '../trpc';
import {
  getEmailJobAdminCancellation,
  getEmailJobStatusDetail,
  getEmailJobTargetSummary,
  isEmailJobId,
  STALE_PENDING_EMAIL_JOB_AGE_MS,
} from './email-jobs';
import { ZGetEmailJobRequestSchema, ZGetEmailJobResponseSchema } from './get-email-job.types';

export const getEmailJobRoute = adminProcedure
  .input(ZGetEmailJobRequestSchema)
  .output(ZGetEmailJobResponseSchema)
  .query(async ({ input, ctx }) => {
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
      include: {
        tasks: {
          orderBy: {
            createdAt: 'desc',
          },
        },
      },
    });

    if (!backgroundJob) {
      throw new AppError(AppErrorCode.NOT_FOUND, {
        message: 'Email job not found',
      });
    }

    if (!isEmailJobId(backgroundJob.jobId)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Only email jobs can be viewed from this route',
      });
    }

    const stalePendingCutoff = new Date(Date.now() - STALE_PENDING_EMAIL_JOB_AGE_MS);
    const payload = backgroundJob.payload as Prisma.JsonValue | null;
    const adminCancellation = await getEmailJobAdminCancellation(backgroundJob.id);

    return {
      ...backgroundJob,
      payload,
      canRetry:
        !adminCancellation &&
        (backgroundJob.status === BackgroundJobStatus.FAILED ||
          (backgroundJob.status === BackgroundJobStatus.PENDING && backgroundJob.submittedAt <= stalePendingCutoff)),
      statusDetail: await getEmailJobStatusDetail(
        {
          id: backgroundJob.id,
          jobId: backgroundJob.jobId,
          payload,
        },
        adminCancellation,
      ),
      target: await getEmailJobTargetSummary({
        jobId: backgroundJob.jobId,
        payload,
      }),
      adminCancellation,
      tasks: backgroundJob.tasks.map((task) => ({
        ...task,
        result: task.result as Prisma.JsonValue | null,
      })),
    };
  });
