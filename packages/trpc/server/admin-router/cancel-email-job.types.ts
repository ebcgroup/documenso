import { z } from 'zod';

export const ZCancelEmailJobRequestSchema = z.object({
  id: z.string(),
  reason: z.string().optional(),
});

export const ZCancelEmailJobResponseSchema = z.void();

export type TCancelEmailJobRequest = z.infer<typeof ZCancelEmailJobRequestSchema>;
export type TCancelEmailJobResponse = z.infer<typeof ZCancelEmailJobResponseSchema>;
