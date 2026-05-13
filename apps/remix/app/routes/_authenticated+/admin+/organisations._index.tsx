import { OrganisationType } from '@prisma/client';
import { useEffect, useState } from 'react';

import { useLingui } from '@lingui/react/macro';
import { useLocation, useSearchParams } from 'react-router';
import { z } from 'zod';

import { useDebouncedValue } from '@documenso/lib/client-only/hooks/use-debounced-value';
import { Input } from '@documenso/ui/primitives/input';
import { Tabs, TabsList, TabsTrigger } from '@documenso/ui/primitives/tabs';

import { SettingsHeader } from '~/components/general/settings-header';
import { AdminOrganisationsTable } from '~/components/tables/admin-organisations-table';

const ZOrganisationAdminSearchParamsSchema = z.object({
  query: z
    .string()
    .optional()
    .catch(() => undefined),
  type: z
    .nativeEnum(OrganisationType)
    .optional()
    .catch(() => undefined),
});

export default function Organisations() {
  const { t } = useLingui();

  const [searchParams, setSearchParams] = useSearchParams();
  const { pathname } = useLocation();

  const parsedSearchParams = ZOrganisationAdminSearchParamsSchema.parse(
    Object.fromEntries(searchParams ?? []),
  );

  const [searchQuery, setSearchQuery] = useState(() => parsedSearchParams.query ?? '');

  const debouncedSearchQuery = useDebouncedValue(searchQuery, 500);
  const selectedOrganisationType = parsedSearchParams.type ?? OrganisationType.ORGANISATION;

  /**
   * Handle debouncing the search query.
   */
  useEffect(() => {
    const params = new URLSearchParams(searchParams?.toString());

    params.set('query', debouncedSearchQuery);

    if (debouncedSearchQuery === '') {
      params.delete('query');
    }

    // If nothing  to change then do nothing.
    if (params.toString() === searchParams?.toString()) {
      return;
    }

    setSearchParams(params);
  }, [debouncedSearchQuery, pathname, searchParams]);

  return (
    <div>
      <SettingsHeader hideDivider title={t`Manage organisations`} subtitle={t`Search and manage all organisations`} />

      <div className="mt-4">
        <Tabs
          value={selectedOrganisationType}
          onValueChange={(value) => {
            const params = new URLSearchParams(searchParams?.toString());

            params.set('type', value);
            params.set('page', '1');

            setSearchParams(params);
          }}
        >
          <TabsList className="mb-4">
            <TabsTrigger value={OrganisationType.ORGANISATION}>
              {t`Organisations`}
            </TabsTrigger>
            <TabsTrigger value={OrganisationType.PERSONAL}>{t`Personal`}</TabsTrigger>
          </TabsList>
        </Tabs>

        <Input
          defaultValue={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={t`Search by organisation ID, name, customer ID or owner email`}
          className="mb-4"
        />

        <AdminOrganisationsTable organisationType={selectedOrganisationType} />
      </div>
    </div>
  );
}
