import { prisma } from '@documenso/prisma';
import { sha256 } from '@noble/hashes/sha2';
import { BackgroundJobStatus, Prisma } from '@prisma/client';
import { CronExpressionParser } from 'cron-parser';
import type { Context as HonoContext } from 'hono';

import { ONE_DAY } from '../../constants/time';
import { verify } from '../../server-only/crypto/verify';
import {
  type JobDefinition,
  type JobRunIO,
  NonRetryableJobError,
  type SimpleTriggerJobOptions,
  ZSimpleTriggerJobOptionsSchema,
} from './_internal/job';
import type { Json } from './_internal/json';
import { BaseJobProvider } from './base';

/**
 * Build a deterministic BackgroundJob ID for a cron run so that multiple
 * instances of the local provider racing to enqueue the same slot will
 * collide on the primary key instead of creating duplicates.
 */
const createCronRunId = (jobId: string, scheduledFor: Date): string => {
  const key = `cron:${jobId}:${scheduledFor.toISOString()}`;
  const hash = Buffer.from(sha256(key)).toString('hex').slice(0, 24);

  return `cron_${hash}`;
};

type CronJobEntry = {
  definition: JobDefinition;
  cron: string;
  lastTickAt: Date;
};

const CRON_POLL_INTERVAL_MS = 30_000; // 30 seconds
const CRON_POLL_JITTER_MS = 5_000; // 0-5 seconds random offset
const PENDING_JOB_SWEEP_LIMIT = 50;
const PENDING_JOB_RECOVERY_AGE_MS = ONE_DAY;

export class LocalJobProvider extends BaseJobProvider {
  private static _instance: LocalJobProvider;

  private _jobDefinitions: Record<string, JobDefinition> = {};
  private _cronJobs: CronJobEntry[] = [];
  private _cronPoller: NodeJS.Timeout | null = null;
  private _queuedJobIds = new Set<string>();

  private constructor() {
    super();
  }

  static getInstance() {
    if (!LocalJobProvider._instance) {
      LocalJobProvider._instance = new LocalJobProvider();
    }

    return LocalJobProvider._instance;
  }

  public defineJob<N extends string, T>(definition: JobDefinition<N, T>) {
    this._jobDefinitions[definition.id] = {
      ...definition,
      enabled: definition.enabled ?? true,
    };

    if (definition.trigger.cron && definition.enabled !== false) {
      const alreadyRegistered = this._cronJobs.some((job) => job.definition.id === definition.id);

      if (!alreadyRegistered) {
        this._cronJobs.push({
          definition: {
            ...definition,
            enabled: definition.enabled ?? true,
          },
          cron: definition.trigger.cron,
          lastTickAt: new Date(),
        });

        console.log(`[JOBS]: Registered cron job ${definition.id} (${definition.trigger.cron})`);
      }
    }
  }

  /**
   * Start the single cron poller for all registered cron jobs.
   *
   * Must be called explicitly at application startup after all jobs have been
   * defined. The poller runs every 30 seconds (+ random jitter to avoid
   * thundering herd across instances) and evaluates all registered cron jobs
   * for due slots.
   *
   * For each due slot it creates a BackgroundJob row with a deterministic ID.
   * If the insert succeeds the job is dispatched; if it fails with a unique
   * constraint violation (P2002) another instance already claimed that slot.
   */
  public override startCron() {
    if (this._cronPoller) {
      return;
    }

    const tick = () => {
      const jitter = Math.floor(Math.random() * CRON_POLL_JITTER_MS);

      this._cronPoller = setTimeout(() => {
        void this.processTick().finally(tick);
      }, CRON_POLL_INTERVAL_MS + jitter);
    };

    void this.processTick().catch((error) => {
      console.error('[JOBS]: Initial local job poll failed', error);
    });

    tick();

    console.log(`[JOBS]: Started local job poller for ${this._cronJobs.length} cron job(s)`);
  }

  private async processTick() {
    await this.processPendingJobs();

    if (this._cronJobs.length > 0) {
      await this.processCronTick();
    }
  }

  private async processPendingJobs() {
    const registeredJobIds = Object.keys(this._jobDefinitions);

    if (registeredJobIds.length === 0) {
      return;
    }

    const recoverableSubmittedAt = new Date(Date.now() - PENDING_JOB_RECOVERY_AGE_MS);

    const pendingJobs = await prisma.backgroundJob.findMany({
      where: {
        status: BackgroundJobStatus.PENDING,
        submittedAt: {
          gte: recoverableSubmittedAt,
        },
        jobId: {
          in: registeredJobIds,
        },
      },
      take: PENDING_JOB_SWEEP_LIMIT,
      orderBy: {
        submittedAt: 'asc',
      },
    });

    for (const job of pendingJobs) {
      const definition = this._jobDefinitions[job.jobId];

      if (!definition || !definition.enabled) {
        continue;
      }

      this.queueJobProcessing({
        jobId: job.id,
        definition,
        payload: job.payload ?? {},
        isRetry: job.retried > 0 || job.updatedAt.getTime() !== job.submittedAt.getTime(),
      });
    }
  }

  private async processCronTick() {
    for (const cronJob of this._cronJobs) {
      try {
        const dueSlots = this.getDueCronSlots(cronJob);

        cronJob.lastTickAt = new Date();

        if (dueSlots.length === 0) {
          continue;
        }

        // Only take the latest slot — sweep-style jobs don't need to catch up
        // every missed slot after downtime, just the most recent one.
        const scheduledFor = dueSlots[dueSlots.length - 1];
        const deterministicId = createCronRunId(cronJob.definition.id, scheduledFor);

        const pendingJob = await prisma.backgroundJob
          .create({
            data: {
              id: deterministicId,
              jobId: cronJob.definition.id,
              name: cronJob.definition.name,
              version: cronJob.definition.version,
              payload: { scheduledFor: scheduledFor.toISOString() },
            },
          })
          .catch((error: unknown) => {
            // P2002 = unique constraint violation — another instance already enqueued this slot.
            if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
              return null;
            }

            throw error;
          });

        if (!pendingJob) {
          continue;
        }

        this.queueJobProcessing({
          jobId: pendingJob.id,
          definition: cronJob.definition,
          payload: { scheduledFor: scheduledFor.toISOString() },
          isRetry: false,
        });
      } catch (error) {
        console.error(`[JOBS]: Cron tick failed for ${cronJob.definition.id}`, error);
      }
    }
  }

  /**
   * Use cron-parser to find all cron slots that are due between the last tick
   * and now.
   */
  private getDueCronSlots(cronJob: CronJobEntry): Date[] {
    const expr = CronExpressionParser.parse(cronJob.cron, {
      currentDate: cronJob.lastTickAt,
    });

    const now = new Date();
    const slots: Date[] = [];

    let next = expr.next();

    while (next.toDate() <= now) {
      slots.push(next.toDate());
      next = expr.next();
    }

    return slots;
  }

  public async triggerJob(options: SimpleTriggerJobOptions) {
    const eligibleJobs = Object.values(this._jobDefinitions).filter((job) => job.trigger.name === options.name);

    await Promise.all(
      eligibleJobs.map(async (job) => {
        // Ideally we will change this to a createMany with returning later once we upgrade Prisma
        // @see: https://github.com/prisma/prisma/releases/tag/5.14.0
        const pendingJob = await prisma.backgroundJob.create({
          data: {
            jobId: job.id,
            name: job.name,
            version: job.version,
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            payload: options.payload as Prisma.InputJsonValue,
          },
        });

        this.queueJobProcessing({
          jobId: pendingJob.id,
          definition: job,
          payload: options.payload,
          isRetry: false,
        });
      }),
    );
  }

  public getApiHandler(): (c: HonoContext) => Promise<Response | void> {
    return async (c: HonoContext) => {
      const req = c.req;

      if (req.method !== 'POST') {
        return c.text('Method not allowed', 405);
      }

      const jobId = req.header('x-job-id');
      const signature = req.header('x-job-signature');
      const isRetry = req.header('x-job-retry') !== undefined;

      const options = await req
        .json()
        .then(async (data) => ZSimpleTriggerJobOptionsSchema.parseAsync(data))
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        .then((data) => data as SimpleTriggerJobOptions)
        .catch(() => null);

      if (!options) {
        return c.text('Bad request', 400);
      }

      const definition = this._jobDefinitions[options.name];

      if (typeof jobId !== 'string' || typeof signature !== 'string' || typeof options !== 'object') {
        return c.text('Bad request', 400);
      }

      if (!definition) {
        return c.text('Job not found', 404);
      }

      if (definition && !definition.enabled) {
        console.log('Attempted to trigger a disabled job', options.name);

        return c.text('Job not found', 404);
      }

      if (!signature || !verify(options, signature)) {
        return c.text('Unauthorized', 401);
      }

      const didProcessJob = await this.processJob({
        jobId,
        definition,
        payload: options.payload,
        isRetry,
      });

      if (!didProcessJob) {
        return c.text('Job not found', 404);
      }

      return c.text('OK', 200);
    };
  }

  private queueJobProcessing(options: {
    jobId: string;
    definition: JobDefinition;
    payload: unknown;
    isRetry: boolean;
  }) {
    if (this._queuedJobIds.has(options.jobId)) {
      return;
    }

    this._queuedJobIds.add(options.jobId);

    setTimeout(() => {
      void this.processJob(options)
        .catch((error) => {
          console.error(`[JOBS]: Failed to process queued job ${options.definition.id}/${options.jobId}`, error);
        })
        .finally(() => {
          this._queuedJobIds.delete(options.jobId);
        });
    }, 0);
  }

  private async processJob(options: {
    jobId: string;
    definition: JobDefinition;
    payload: unknown;
    isRetry: boolean;
  }) {
    const { jobId, definition, isRetry } = options;

    let payload = options.payload;

    if (definition.trigger.schema) {
      const result = definition.trigger.schema.safeParse(payload);

      if (!result.success) {
        const backgroundJob = await prisma.backgroundJob
          .update({
            where: {
              id: jobId,
              status: BackgroundJobStatus.PENDING,
            },
            data: {
              status: BackgroundJobStatus.FAILED,
              completedAt: new Date(),
            },
          })
          .catch(() => null);

        return Boolean(backgroundJob);
      }

      payload = result.data;
    }

    console.log(`[JOBS]: Triggering job ${definition.trigger.name} with payload`, payload);

    let backgroundJob = await prisma.backgroundJob
      .update({
        where: {
          id: jobId,
          status: BackgroundJobStatus.PENDING,
        },
        data: {
          status: BackgroundJobStatus.PROCESSING,
          retried: {
            increment: isRetry ? 1 : 0,
          },
          lastRetriedAt: isRetry ? new Date() : undefined,
        },
      })
      .catch(() => null);

    if (!backgroundJob) {
      return false;
    }

    try {
      await definition.handler({
        payload,
        io: this.createJobRunIO(jobId),
      });

      backgroundJob = await prisma.backgroundJob.update({
        where: {
          id: jobId,
          status: BackgroundJobStatus.PROCESSING,
        },
        data: {
          status: BackgroundJobStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    } catch (error) {
      console.log(`[JOBS]: Job ${definition.trigger.name} failed`, error);

      const jobHasNonRetryableError = error instanceof NonRetryableJobError;
      const taskHasExceededRetries = error instanceof BackgroundTaskExceededRetriesError;
      const jobHasExceededRetries =
        backgroundJob.retried >= backgroundJob.maxRetries && !(error instanceof BackgroundTaskFailedError);

      if (jobHasNonRetryableError || taskHasExceededRetries || jobHasExceededRetries) {
        backgroundJob = await prisma.backgroundJob.update({
          where: {
            id: jobId,
            status: BackgroundJobStatus.PROCESSING,
          },
          data: {
            status: BackgroundJobStatus.FAILED,
            completedAt: new Date(),
          },
        });

        return true;
      }

      backgroundJob = await prisma.backgroundJob.update({
        where: {
          id: jobId,
          status: BackgroundJobStatus.PROCESSING,
        },
        data: {
          status: BackgroundJobStatus.PENDING,
        },
      });

      setTimeout(() => {
        this.queueJobProcessing({
          jobId,
          definition,
          payload,
          isRetry: true,
        });
      }, 0);
    }

    return true;
  }

  private createJobRunIO(jobId: string): JobRunIO {
    return {
      runTask: async <T extends void | Json>(cacheKey: string, callback: () => Promise<T>) => {
        const hashedKey = Buffer.from(sha256(cacheKey)).toString('hex');

        let task = await prisma.backgroundJobTask.findFirst({
          where: {
            id: `task-${hashedKey}--${jobId}`,
            jobId,
          },
        });

        if (!task) {
          task = await prisma.backgroundJobTask.create({
            data: {
              id: `task-${hashedKey}--${jobId}`,
              name: cacheKey,
              jobId,
              status: BackgroundJobStatus.PENDING,
            },
          });
        }

        if (task.status === BackgroundJobStatus.COMPLETED) {
          // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
          return task.result as T;
        }

        if (task.retried >= 3) {
          throw new BackgroundTaskExceededRetriesError('Task exceeded retries');
        }

        try {
          const result = await callback();

          task = await prisma.backgroundJobTask.update({
            where: {
              id: task.id,
              jobId,
            },
            data: {
              status: BackgroundJobStatus.COMPLETED,
              result: result === null ? Prisma.JsonNull : result,
              completedAt: new Date(),
            },
          });

          return result;
        } catch (err) {
          task = await prisma.backgroundJobTask.update({
            where: {
              id: task.id,
              jobId,
            },
            data: {
              status: BackgroundJobStatus.PENDING,
              retried: {
                increment: 1,
              },
            },
          });

          console.log(`[JOBS:${task.id}] Task failed`, err);

          throw new BackgroundTaskFailedError('Task failed');
        }
      },
      triggerJob: async (_cacheKey, payload) => await this.triggerJob(payload),
      logger: {
        debug: (...args) => console.debug(`[${jobId}]`, ...args),
        error: (...args) => console.error(`[${jobId}]`, ...args),
        info: (...args) => console.info(`[${jobId}]`, ...args),
        log: (...args) => console.log(`[${jobId}]`, ...args),
        warn: (...args) => console.warn(`[${jobId}]`, ...args),
      },
      // eslint-disable-next-line @typescript-eslint/require-await
      wait: async () => {
        throw new Error('Not implemented');
      },
    };
  }
}

class BackgroundTaskFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundTaskFailedError';
  }
}

class BackgroundTaskExceededRetriesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackgroundTaskExceededRetriesError';
  }
}
