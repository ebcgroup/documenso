import { z } from 'zod';

export const ZRetryEmailJobRequestSchema = z.object({
  id: z.string(),
});

export const ZRetryEmailJobResponseSchema = z.void();

export type TRetryEmailJobRequest = z.infer<typeof ZRetryEmailJobRequestSchema>;
export type TRetryEmailJobResponse = z.infer<typeof ZRetryEmailJobResponseSchema>;
