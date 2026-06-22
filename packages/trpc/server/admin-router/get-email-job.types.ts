import BackgroundJobSchema from '@documenso/prisma/generated/zod/modelSchema/BackgroundJobSchema';
import { z } from 'zod';

const ZEmailJobTargetSchema = z.object({
  userId: z.number().nullable(),
  documentId: z.number().nullable(),
  recipientId: z.number().nullable(),
  user: z
    .object({
      id: z.number(),
      email: z.string(),
    })
    .nullable(),
  document: z
    .object({
      id: z.string(),
      title: z.string(),
      status: z.string(),
    })
    .nullable(),
  recipient: z
    .object({
      id: z.number(),
      email: z.string(),
    })
    .nullable(),
});

const ZEmailJobAdminCancellationSchema = z
  .object({
    reason: z.string().nullable(),
    cancelledAt: z.string().nullable(),
    cancelledByUserId: z.number().nullable(),
    cancelledByUserEmail: z.string().nullable(),
  })
  .nullable();

const ZEmailJobTaskSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: z.enum(['PENDING', 'COMPLETED', 'FAILED']),
  result: z.unknown().nullable(),
  retried: z.number(),
  maxRetries: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  completedAt: z.date().nullable(),
});

export const ZGetEmailJobRequestSchema = z.object({
  id: z.string(),
});

export const ZGetEmailJobResponseSchema = BackgroundJobSchema.pick({
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
    target: ZEmailJobTargetSchema,
    adminCancellation: ZEmailJobAdminCancellationSchema,
    tasks: ZEmailJobTaskSchema.array(),
  })
  .nullable();

export type TGetEmailJobRequest = z.infer<typeof ZGetEmailJobRequestSchema>;
export type TGetEmailJobResponse = z.infer<typeof ZGetEmailJobResponseSchema>;
