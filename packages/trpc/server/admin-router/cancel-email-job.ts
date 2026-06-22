import { AppError, AppErrorCode } from '@documenso/lib/errors/app-error';
import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus, BackgroundJobTaskStatus, Prisma } from '@prisma/client';

import { adminProcedure } from '../trpc';
import {
  EMAIL_JOB_ADMIN_CANCELLATION_TASK_NAME,
  getEmailJobAdminCancellationTaskId,
  isEmailJobId,
} from './email-jobs';
import { ZCancelEmailJobRequestSchema, ZCancelEmailJobResponseSchema } from './cancel-email-job.types';

export const cancelEmailJobRoute = adminProcedure
  .input(ZCancelEmailJobRequestSchema)
  .output(ZCancelEmailJobResponseSchema)
  .mutation(async ({ input, ctx }) => {
    const { id, reason } = input;

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

    if (!isEmailJobId(backgroundJob.jobId)) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Only email jobs can be stopped from this route',
      });
    }

    if (backgroundJob.status !== BackgroundJobStatus.PENDING) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Only pending email jobs can be stopped',
      });
    }

    const now = new Date();
    const cancellationReason = reason ?? 'Stopped manually from admin email jobs.';
    const result = {
      reason: cancellationReason,
      cancelledAt: now.toISOString(),
      cancelledByUserId: ctx.user.id,
      cancelledByUserEmail: ctx.user.email,
    } satisfies Prisma.InputJsonObject;

    const cancelledJob = await prisma.backgroundJob
      .update({
        where: {
          id,
          status: BackgroundJobStatus.PENDING,
        },
        data: {
          status: BackgroundJobStatus.FAILED,
          completedAt: now,
        },
      })
      .catch(() => null);

    if (!cancelledJob) {
      throw new AppError(AppErrorCode.INVALID_REQUEST, {
        message: 'Email job is no longer pending',
      });
    }

    await prisma.backgroundJobTask.upsert({
      where: {
        id: getEmailJobAdminCancellationTaskId(id),
      },
      create: {
        id: getEmailJobAdminCancellationTaskId(id),
        name: EMAIL_JOB_ADMIN_CANCELLATION_TASK_NAME,
        jobId: id,
        status: BackgroundJobTaskStatus.FAILED,
        result,
        completedAt: now,
      },
      update: {
        status: BackgroundJobTaskStatus.FAILED,
        result,
        completedAt: now,
      },
    });
  });
