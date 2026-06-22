import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import { useUpdateSearchParams } from '@documenso/lib/client-only/hooks/use-update-search-params';
import { trpc } from '@documenso/trpc/react';
import { Badge } from '@documenso/ui/primitives/badge';
import { Button } from '@documenso/ui/primitives/button';
import type { DataTableColumnDef } from '@documenso/ui/primitives/data-table';
import { DataTable } from '@documenso/ui/primitives/data-table';
import { DataTablePagination } from '@documenso/ui/primitives/data-table-pagination';
import { Input } from '@documenso/ui/primitives/input';
import { Skeleton } from '@documenso/ui/primitives/skeleton';
import { TableCell } from '@documenso/ui/primitives/table';
import { useToast } from '@documenso/ui/primitives/use-toast';
import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import { RefreshCcwIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

const EMAIL_JOB_STATUSES = ['PENDING', 'PROCESSING', 'FAILED', 'COMPLETED'] as const;

const payloadSummary = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return '-';
  }

  const entries = Object.entries(payload).slice(0, 4);

  if (entries.length === 0) {
    return '{}';
  }

  return entries
    .map(([key, value]) => `${key}: ${typeof value === 'string' || typeof value === 'number' ? value : '[...]'}`)
    .join(', ');
};

export default function AdminEmailJobsPage() {
  const { _, i18n } = useLingui();
  const { toast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const updateSearchParams = useUpdateSearchParams();

  const page = searchParams?.get?.('page') ? Number(searchParams.get('page')) : undefined;
  const perPage = searchParams?.get?.('perPage') ? Number(searchParams.get('perPage')) : undefined;
  const query = searchParams?.get?.('query') ?? '';
  const status = searchParams?.get?.('status') ?? undefined;

  const [searchQuery, setSearchQuery] = useState(query);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 500);

  useEffect(() => {
    if (debouncedSearchQuery === query) {
      return;
    }

    const params = new URLSearchParams(searchParams?.toString());

    params.set('query', debouncedSearchQuery);
    params.set('page', '1');

    if (debouncedSearchQuery === '') {
      params.delete('query');
    }

    setSearchParams(params);
  }, [debouncedSearchQuery, query, searchParams, setSearchParams]);

  const {
    data: findEmailJobsData,
    isPending: isLoading,
    isLoadingError,
    refetch,
  } = trpc.admin.emailJob.find.useQuery(
    {
      page: page || 1,
      perPage: perPage || 20,
      query,
      status: EMAIL_JOB_STATUSES.find((value) => value === status),
    },
    {
      placeholderData: (previousData) => previousData,
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
    onError: () => {
      toast({
        title: _(msg`Failed to retry email job`),
        variant: 'destructive',
      });
    },
  });

  const results = findEmailJobsData ?? {
    data: [],
    perPage: 20,
    currentPage: 1,
    totalPages: 1,
  };

  const columns = useMemo(() => {
    return [
      {
        header: _(msg`Job`),
        accessorKey: 'name',
        cell: ({ row }) => (
          <div className="min-w-[14rem]">
            <div className="font-medium">{row.original.name}</div>
            <div className="text-muted-foreground text-xs">{row.original.id}</div>
            <div className="text-muted-foreground text-xs">{row.original.jobId}</div>
          </div>
        ),
      },
      {
        header: _(msg`Status`),
        accessorKey: 'status',
        cell: ({ row }) => {
          const statusVariant = row.original.status === 'FAILED' ? 'destructive' : 'secondary';

          return <Badge variant={statusVariant}>{row.original.status}</Badge>;
        },
      },
      {
        header: _(msg`Retries`),
        accessorKey: 'retried',
        cell: ({ row }) => `${row.original.retried}/${row.original.maxRetries}`,
      },
      {
        header: _(msg`Submitted`),
        accessorKey: 'submittedAt',
        cell: ({ row }) =>
          i18n.date(row.original.submittedAt, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
      },
      {
        header: _(msg`Last Retry`),
        accessorKey: 'lastRetriedAt',
        cell: ({ row }) => {
          if (!row.original.lastRetriedAt) {
            return <span className="text-muted-foreground">-</span>;
          }

          return i18n.date(row.original.lastRetriedAt, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        },
      },
      {
        header: _(msg`Completed`),
        accessorKey: 'completedAt',
        cell: ({ row }) => {
          if (!row.original.completedAt) {
            return <span className="text-muted-foreground">-</span>;
          }

          return i18n.date(row.original.completedAt, {
            dateStyle: 'medium',
            timeStyle: 'short',
          });
        },
      },
      {
        header: _(msg`Payload`),
        accessorKey: 'payload',
        cell: ({ row }) => (
          <code className="block max-w-[16rem] truncate rounded bg-muted px-2 py-1 text-xs">
            {payloadSummary(row.original.payload)}
          </code>
        ),
      },
      {
        header: _(msg`Actions`),
        id: 'actions',
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            disabled={!row.original.canRetry || isRetrying}
            onClick={() => void retryEmailJob({ id: row.original.id })}
          >
            <RefreshCcwIcon className="mr-2 h-4 w-4" />
            <Trans>Retry</Trans>
          </Button>
        ),
      },
    ] satisfies DataTableColumnDef<(typeof results)['data'][number]>[];
  }, [_, i18n, isRetrying, retryEmailJob]);

  const onPaginationChange = (newPage: number, newPerPage: number) => {
    updateSearchParams({
      page: newPage,
      perPage: newPerPage,
    });
  };

  return (
    <div>
      <h2 className="font-semibold text-4xl">
        <Trans>Email Jobs</Trans>
      </h2>

      <p className="mt-2 text-muted-foreground text-sm">
        <Trans>Review email background jobs and manually retry failed or stale pending jobs.</Trans>
      </p>

      <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
        <Input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={_(msg`Search by job name, job id, or record id`)}
          className="md:max-w-sm"
        />

        <div className="flex flex-wrap gap-2">
          <Button
            variant={!status ? 'secondary' : 'ghost'}
            onClick={() =>
              updateSearchParams({
                status: null,
                page: 1,
              })
            }
          >
            <Trans>All</Trans>
          </Button>

          {EMAIL_JOB_STATUSES.map((emailJobStatus) => (
            <Button
              key={emailJobStatus}
              variant={status === emailJobStatus ? 'secondary' : 'ghost'}
              onClick={() =>
                updateSearchParams({
                  status: emailJobStatus,
                  page: 1,
                })
              }
            >
              {emailJobStatus}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative mt-6">
        <DataTable
          columns={columns}
          data={results.data}
          perPage={results.perPage ?? 20}
          currentPage={results.currentPage ?? 1}
          totalPages={results.totalPages ?? 1}
          onPaginationChange={onPaginationChange}
          error={{
            enable: isLoadingError,
          }}
          skeleton={{
            enable: isLoading,
            rows: 3,
            component: (
              <>
                <TableCell className="py-4 pr-4">
                  <Skeleton className="h-4 w-40 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-20 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-16 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-24 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-4 w-32 rounded-full" />
                </TableCell>
                <TableCell>
                  <Skeleton className="h-8 w-20 rounded-md" />
                </TableCell>
              </>
            ),
          }}
        >
          {(table) => <DataTablePagination additionalInformation="VisibleCount" table={table} />}
        </DataTable>
      </div>
    </div>
  );
}
