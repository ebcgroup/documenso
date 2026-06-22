import { prisma } from '@documenso/prisma';
import { seedUser } from '@documenso/prisma/seed/users';
import { expect, test } from '@playwright/test';
import { BackgroundJobStatus } from '@prisma/client';

import { apiSignin } from '../fixtures/authentication';

test.describe.configure({ mode: 'parallel' });

test('[ADMIN][EMAIL_JOBS]: admin can view and retry failed email jobs', async ({ page }) => {
  const { user: adminUser } = await seedUser({
    isAdmin: true,
  });
  const { user: emailRecipient } = await seedUser();

  const failedJob = await prisma.backgroundJob.create({
    data: {
      id: `test-email-job-${Date.now()}`,
      jobId: 'send.admin.user.created.email',
      name: 'Send Admin User Created Email',
      version: '1.0.0',
      status: BackgroundJobStatus.FAILED,
      payload: {
        userId: emailRecipient.id,
      },
      retried: 3,
      maxRetries: 3,
      submittedAt: new Date(Date.now() - 10 * 60 * 1000),
      completedAt: new Date(),
    },
  });

  await apiSignin({
    page,
    email: adminUser.email,
    redirectPath: '/admin/email-jobs?status=FAILED',
  });

  await expect(page.getByRole('heading', { name: 'Email Jobs' })).toBeVisible();
  await expect(page.getByText('Send Admin User Created Email')).toBeVisible();
  await expect(page.getByText(failedJob.id)).toBeVisible();

  const jobsBeforeRetry = await prisma.backgroundJob.count({
    where: {
      jobId: failedJob.jobId,
      payload: {
        path: ['userId'],
        equals: emailRecipient.id,
      },
    },
  });

  const failedJobRow = page.getByRole('row').filter({
    hasText: failedJob.id,
  });

  await failedJobRow.getByRole('link', { name: 'View' }).click();

  await expect(page).toHaveURL(new RegExp(`/admin/email-jobs/${failedJob.id}$`));
  await expect(page.getByText(emailRecipient.email)).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();

  await expect
    .poll(
      async () =>
        await prisma.backgroundJob.count({
          where: {
            jobId: failedJob.jobId,
            payload: {
              path: ['userId'],
              equals: emailRecipient.id,
            },
          },
        }),
      {
        timeout: 10000,
      },
    )
    .toBeGreaterThan(jobsBeforeRetry);
});

test('[ADMIN][EMAIL_JOBS]: admin can stop pending email jobs', async ({ page }) => {
  const { user: adminUser } = await seedUser({
    isAdmin: true,
  });
  const { user: emailRecipient } = await seedUser();

  const pendingJob = await prisma.backgroundJob.create({
    data: {
      id: `test-email-job-${Date.now()}`,
      jobId: 'send.admin.user.created.email',
      name: 'Send Admin User Created Email',
      version: '1.0.0',
      status: BackgroundJobStatus.PENDING,
      payload: {
        userId: emailRecipient.id,
      },
      submittedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    },
  });

  await apiSignin({
    page,
    email: adminUser.email,
    redirectPath: `/admin/email-jobs/${pendingJob.id}`,
  });

  await expect(page.getByRole('heading', { name: 'Send Admin User Created Email' })).toBeVisible();

  page.on('dialog', (dialog) => void dialog.accept());

  await page.getByRole('button', { name: 'Stop Job' }).click();

  await expect
    .poll(
      async () => {
        const job = await prisma.backgroundJob.findUnique({
          where: {
            id: pendingJob.id,
          },
          select: {
            status: true,
            tasks: {
              select: {
                name: true,
              },
            },
          },
        });

        return {
          status: job?.status,
          taskNames: job?.tasks.map((task) => task.name) ?? [],
        };
      },
      {
        timeout: 10000,
      },
    )
    .toEqual({
      status: BackgroundJobStatus.FAILED,
      taskNames: ['Admin cancellation'],
    });
});

test('[ADMIN][EMAIL_JOBS]: unauthenticated user cannot access email jobs', async ({ page }) => {
  await page.goto('/admin/email-jobs');

  await expect(page).not.toHaveURL(/\/admin\/email-jobs$/);
  await expect(page.getByRole('heading', { name: 'Email Jobs' })).not.toBeVisible();
});
