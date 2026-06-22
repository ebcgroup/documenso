import { AppError } from '@documenso/lib/errors/app-error';
import { trpc } from '@documenso/trpc/react';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import { Skeleton } from '@documenso/ui/primitives/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { ArrowLeftIcon, BanIcon, ExternalLinkIcon, RefreshCcwIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router';

const EMAIL_JOB_STATUS_BADGE_VARIANTS = {
  PENDING: 'secondary',
  PROCESSING: 'orange',
  FAILED: 'destructive',
  COMPLETED: 'default',
} as const;

const MANUAL_STOP_REASON = 'Stopped manually from admin email jobs.';

const formatJson = (value: unknown) => {
  return JSON.stringify(value ?? null, null, 2);
};

export default function AdminEmailJobDetailsPage() {
  const { id = '' } = useParams();
  const { _, i18n } = useLingui();
  const { toast } = useToast();

  const {
    data: emailJob,
    isPending: isLoading,
    isLoadingError,
    refetch,
  } = trpc.admin.emailJob.get.useQuery(
    {
      id,
    },
    {
      enabled: Boolean(id),
    },
  );

  const { mutateAsync: retryEmailJob, isPending: isRetrying } = trpc.admin.emailJob.retry.useMutation({
    onSuccess: () => {
      toast({
        title: _(msg`Email job retry queued`),
        variant: 'default',
      });
      void refetch();
    },
    onError: (err) => {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Failed to retry email job`),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const { mutateAsync: cancelEmailJob, isPending: isCancelling } = trpc.admin.emailJob.cancel.useMutation({
    onSuccess: () => {
      toast({
        title: _(msg`Email job stopped`),
        variant: 'default',
      });
      void refetch();
    },
    onError: (err) => {
      const error = AppError.parseError(err);

      toast({
        title: _(msg`Failed to stop email job`),
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const onRetry = async () => {
    if (!emailJob) {
      return;
    }

    await retryEmailJob({
      id: emailJob.id,
    });
  };

  const onCancel = async () => {
    if (!emailJob) {
      return;
    }

    const confirmed = window.confirm(_(msg`Stop this pending email job?`));

    if (!confirmed) {
      return;
    }

    await cancelEmailJob({
      id: emailJob.id,
      reason: MANUAL_STOP_REASON,
    });
  };

  if (isLoading) {
    return (
      <div>
        <Skeleton className="h-9 w-36 rounded-md" />
        <Skeleton className="mt-6 h-8 w-72 rounded-full" />
        <Skeleton className="mt-6 h-40 w-full rounded-md" />
      </div>
    );
  }

  if (isLoadingError || !emailJob) {
    return (
      <div>
        <Button variant="ghost" asChild>
          <Link to="/admin/email-jobs">
            <ArrowLeftIcon className="mr-2 h-4 w-4" />
            <Trans>Email Jobs</Trans>
          </Link>
        </Button>

        <p className="mt-6 text-muted-foreground text-sm">
          <Trans>Email job not found.</Trans>
        </p>
      </div>
    );
  }

  const statusVariant = EMAIL_JOB_STATUS_BADGE_VARIANTS[emailJob.status];
  const canStop = emailJob.status === 'PENDING';

  return (
    <div>
      <Button variant="ghost" asChild>
        <Link to="/admin/email-jobs">
          <ArrowLeftIcon className="mr-2 h-4 w-4" />
          <Trans>Email Jobs</Trans>
        </Link>
      </Button>

      <div className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="font-semibold text-3xl">{emailJob.name}</h2>
          <p className="mt-1 break-all text-muted-foreground text-sm">{emailJob.id}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={!emailJob.canRetry || isCancelling}
            loading={isRetrying}
            onClick={() => void onRetry()}
          >
            {!isRetrying && <RefreshCcwIcon className="mr-2 h-4 w-4" />}
            <Trans>Retry</Trans>
          </Button>

          <Button
            variant="destructive"
            disabled={!canStop || isRetrying}
            loading={isCancelling}
            onClick={() => void onCancel()}
          >
            {!isCancelling && <BanIcon className="mr-2 h-4 w-4" />}
            <Trans>Stop Job</Trans>
          </Button>
        </div>
      </div>

      <hr className="my-6" />

      <h3 className="font-semibold text-lg">
        <Trans>Summary</Trans>
      </h3>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <DetailItem label={<Trans>Status</Trans>}>
          <Badge variant={statusVariant}>{emailJob.status}</Badge>
          {emailJob.statusDetail && <p className="mt-2 text-muted-foreground text-sm">{emailJob.statusDetail}</p>}
        </DetailItem>

        <DetailItem label={<Trans>Retries</Trans>}>
          {emailJob.retried}/{emailJob.maxRetries}
        </DetailItem>

        <DetailItem label={<Trans>Job ID</Trans>}>{emailJob.jobId}</DetailItem>

        <DetailItem label={<Trans>Version</Trans>}>{emailJob.version}</DetailItem>

        <DetailItem label={<Trans>Submitted</Trans>}>
          {i18n.date(emailJob.submittedAt, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </DetailItem>

        <DetailItem label={<Trans>Last Retry</Trans>}>
          {emailJob.lastRetriedAt
            ? i18n.date(emailJob.lastRetriedAt, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : '-'}
        </DetailItem>

        <DetailItem label={<Trans>Completed</Trans>}>
          {emailJob.completedAt
            ? i18n.date(emailJob.completedAt, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : '-'}
        </DetailItem>

        <DetailItem label={<Trans>Updated</Trans>}>
          {i18n.date(emailJob.updatedAt, {
            dateStyle: 'medium',
            timeStyle: 'short',
          })}
        </DetailItem>
      </div>

      <hr className="my-6" />

      <h3 className="font-semibold text-lg">
        <Trans>Targets</Trans>
      </h3>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <DetailItem label={<Trans>User</Trans>}>
          {emailJob.target.user ? (
            <Link className="text-primary hover:underline" to={`/admin/users/${emailJob.target.user.id}`}>
              {emailJob.target.user.email}
            </Link>
          ) : (
            missingTargetLabel(emailJob.target.userId)
          )}
        </DetailItem>

        <DetailItem label={<Trans>Recipient</Trans>}>
          {emailJob.target.recipient?.email ?? missingTargetLabel(emailJob.target.recipientId)}
        </DetailItem>

        <DetailItem label={<Trans>Document</Trans>}>
          {emailJob.target.document ? (
            <Link
              className="inline-flex items-center text-primary hover:underline"
              to={`/admin/documents/${emailJob.target.document.id}`}
            >
              {emailJob.target.document.title}
              <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          ) : (
            missingTargetLabel(emailJob.target.documentId)
          )}
        </DetailItem>
      </div>

      <hr className="my-6" />

      <h3 className="font-semibold text-lg">
        <Trans>Payload</Trans>
      </h3>

      <pre className="mt-4 max-h-[28rem] overflow-auto rounded-md bg-muted p-4 text-xs">
        {formatJson(emailJob.payload)}
      </pre>

      <hr className="my-6" />

      <h3 className="font-semibold text-lg">
        <Trans>Tasks</Trans>
      </h3>

      {emailJob.tasks.length === 0 ? (
        <p className="mt-4 text-muted-foreground text-sm">-</p>
      ) : (
        <div className="mt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Trans>Task</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Status</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Retries</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Completed</Trans>
                </TableHead>
                <TableHead>
                  <Trans>Result</Trans>
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {emailJob.tasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell truncate={false}>
                    <div className="font-medium">{task.name}</div>
                    <div className="break-all text-muted-foreground text-xs">{task.id}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={task.status === 'FAILED' ? 'destructive' : 'secondary'}>{task.status}</Badge>
                  </TableCell>
                  <TableCell>
                    {task.retried}/{task.maxRetries}
                  </TableCell>
                  <TableCell>
                    {task.completedAt
                      ? i18n.date(task.completedAt, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : '-'}
                  </TableCell>
                  <TableCell truncate={false}>
                    <code className="block max-w-[18rem] whitespace-pre-wrap break-words rounded bg-muted px-2 py-1 text-xs">
                      {formatJson(task.result)}
                    </code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

type DetailItemProps = {
  label: ReactNode;
  children: ReactNode;
};

const DetailItem = ({ label, children }: DetailItemProps) => {
  return (
    <div>
      <div className="text-muted-foreground text-sm">{label}</div>
      <div className="mt-1 break-words font-medium text-sm">{children}</div>
    </div>
  );
};

const missingTargetLabel = (id: number | null) => {
  if (!id) {
    return '-';
  }

  return `Missing (${id})`;
};
