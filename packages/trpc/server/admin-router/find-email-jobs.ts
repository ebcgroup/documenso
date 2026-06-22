import type { FindResultResponse } from '@documenso/lib/types/search-params';
import { prisma } from '@documenso/prisma';
import { BackgroundJobStatus, Prisma } from '@prisma/client';

import { adminProcedure } from '../trpc';
import {
  EMAIL_JOB_IDS,
  getEmailJobAdminCancellation,
  getEmailJobStatusDetail,
  STALE_PENDING_EMAIL_JOB_AGE_MS,
} from './email-jobs';
import { ZFindEmailJobsRequestSchema, ZFindEmailJobsResponseSchema } from './find-email-jobs.types';

export const findEmailJobsRoute = adminProcedure
  .input(ZFindEmailJobsRequestSchema)
  .output(ZFindEmailJobsResponseSchema)
  .query(async ({ input }) => {
    const { query, page = 1, perPage = 20, status } = input;

    const stalePendingCutoff = new Date(Date.now() - STALE_PENDING_EMAIL_JOB_AGE_MS);

    const whereClause: Prisma.BackgroundJobWhereInput = {
      jobId: {
        in: [...EMAIL_JOB_IDS],
      },
    };

    if (query) {
      whereClause.OR = [
        {
          id: {
            contains: query,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          name: {
            contains: query,
            mode: Prisma.QueryMode.insensitive,
          },
        },
        {
          jobId: {
            contains: query,
            mode: Prisma.QueryMode.insensitive,
          },
        },
      ];
    }

    if (status) {
      whereClause.status = status;
    }

    const [data, count] = await Promise.all([
      prisma.backgroundJob.findMany({
        where: whereClause,
        skip: Math.max(page - 1, 0) * perPage,
        take: perPage,
        orderBy: [
          {
            submittedAt: 'desc',
          },
          {
            id: 'desc',
          },
        ],
      }),
      prisma.backgroundJob.count({
        where: whereClause,
      }),
    ]);

    const dataWithRetryState = await Promise.all(
      data.map(async (job) => {
        const payload = job.payload as Prisma.JsonValue | null;
        const cancellation = await getEmailJobAdminCancellation(job.id);

        return {
          ...job,
          payload,
          canRetry:
            !cancellation &&
            (job.status === BackgroundJobStatus.FAILED ||
              (job.status === BackgroundJobStatus.PENDING && job.submittedAt <= stalePendingCutoff)),
          statusDetail: await getEmailJobStatusDetail(
            {
              id: job.id,
              jobId: job.jobId,
              payload,
            },
            cancellation,
          ),
        };
      }),
    );

    return {
      data: dataWithRetryState,
      count,
      currentPage: Math.max(page, 1),
      perPage,
      totalPages: Math.max(Math.ceil(count / perPage), 1),
    } satisfies FindResultResponse<typeof dataWithRetryState>;
  });
