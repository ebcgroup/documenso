import { ZFindResultResponse, ZFindSearchParamsSchema } from '@documenso/lib/types/search-params';
import BackgroundJobSchema from '@documenso/prisma/generated/zod/modelSchema/BackgroundJobSchema';
import { z } from 'zod';

export const ZEmailJobStatusSchema = z.enum(['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED']);

export const ZFindEmailJobsRequestSchema = ZFindSearchParamsSchema.extend({
  status: ZEmailJobStatusSchema.optional(),
});

export const ZFindEmailJobsResponseSchema = ZFindResultResponse.extend({
  data: BackgroundJobSchema.pick({
    status: true,
    id: true,
    payload: true,
    retried: true,
    maxRetries: true,
    jobId: true,
    name: true,
    version: true,
    submittedAt: true,
    updatedAt: true,
    completedAt: true,
    lastRetriedAt: true,
  })
    .extend({
      canRetry: z.boolean(),
      statusDetail: z.string().nullable(),
    })
    .array(),
});

export type TFindEmailJobsRequest = z.infer<typeof ZFindEmailJobsRequestSchema>;
export type TFindEmailJobsResponse = z.infer<typeof ZFindEmailJobsResponseSchema>;
