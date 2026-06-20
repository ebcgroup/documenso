# Fork Notes

This file tracks intentional EBC fork behavior that still differs from upstream Documenso.
After merging upstream, use this as the checklist for what must still be true.

Last reconciled with upstream: `upstream/main` at Documenso v2.13.0.

## Active Fork Changes

### Email Rendering

Outlook/SendGrid SMTP had issues with React Email preview padding causing HTML email
parts to be truncated. This fork removes React Email `<Preview>` usage from email
templates, including newly added upstream templates.

Important path:

- `packages/email/templates/*.tsx`

Check after upstream merges:

```powershell
rg -n "<Preview|Preview,|previewText" packages/email/templates
```

Expected result: no matches.

Merge note: when upstream adds a new email template, take the upstream template first,
then remove `Preview`, `previewText`, and preview-only `msg` imports before committing.
Documenso v2.13.0 added `admin-user-created.tsx` and `organisation-limit-alert.tsx`; both
also need this fork rule.

### Self-Hosted Background Jobs

Initial document signing emails are sent by the background job system. Manual resend
emails are sent directly from the request path, so resend can work even when background
jobs are misconfigured.

Important files:

- `packages/lib/jobs/client/local.ts`
- `packages/lib/server-only/document/send-document.ts`

Expected behavior:

- Local job submission logs non-OK responses or request failures when the app cannot
  call its own `/api/jobs/...` endpoint.
- Sequential signing filters out already-sent recipients before enqueueing email jobs.

Checks after upstream merges:

```powershell
rg -n "Failed to submit job|Status: \$\{response.status\}" packages/lib/jobs/client/local.ts
rg -n "sendStatus !== SendStatus.SENT" packages/lib/server-only/document/send-document.ts
```

Deployment check:

- In Docker/Dokploy, set `NEXT_PRIVATE_INTERNAL_WEBAPP_URL=http://localhost:3000` when
  using the default `local` jobs provider, or use `NEXT_PRIVATE_JOBS_PROVIDER=bullmq`
  with Redis for more reliable self-hosted production jobs.

### PDF Timestamp Authorities

Classic PDF signing should try all configured timestamp authorities in order. It should
log each attempt, stop on the first successful TSA, and fail signing if every configured
TSA fails.

Important files:

- `packages/signing/index.ts`
- `packages/signing/helpers/tsa.ts`

Expected behavior:

- `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY` is split by comma.
- Each TSA URL is trimmed.
- TSAs are tried in the configured order.
- Logs include the TSA being used and failures.

Check after upstream merges:

```powershell
rg -n "getTimestampAuthorities|Using timestamp authority|Timestamp authority failed" packages/signing
```

CSC/QES watch item: upstream v2.13.0 added a separate CSC signing path under
`packages/ee/server-only/signing/csc/`. That path parses multiple env TSA URLs but still
uses the first URL for env fallback/seal-time paths. If CSC/QES signing is enabled, audit
or extend `tsa-resolver.ts` and `finalize-tsp-completion.ts` with the same try-in-order
fallback behavior.

### Admin Direct Organisation Add

Global admins can add an existing user directly to an organisation without sending an
invite email.

Expected behavior:

- Admin organisation page has an `Add member` action.
- User picker searches existing users and excludes existing members.
- Selected user is added with the chosen organisation role.
- Joined email is skipped.
- Matching pending invites for that email and organisation are deleted.
- Seat-count syncing still accounts for pending invites and members.

Important files:

- `apps/remix/app/components/dialogs/admin-organisation-member-create-dialog.tsx`
- `apps/remix/app/routes/_authenticated+/admin+/organisations.$id.tsx`
- `packages/lib/server-only/admin/add-user-to-organisation.ts`
- `packages/trpc/server/admin-router/add-user-to-organisation.ts`
- `packages/trpc/server/admin-router/find-users.ts`
- `packages/trpc/server/admin-router/router.ts`

### Admin Organisations List

The admin organisations list is split into normal organisations and personal
organisations.

Expected behavior:

- `/admin/organisations` defaults to `OrganisationType.ORGANISATION`.
- The page has `Organisations` and `Personal` tabs.
- Filtering is server-side via the admin organisation find route.

Important files:

- `apps/remix/app/routes/_authenticated+/admin+/organisations._index.tsx`
- `apps/remix/app/components/tables/admin-organisations-table.tsx`
- `packages/trpc/server/admin-router/find-admin-organisations.ts`
- `packages/trpc/server/admin-router/find-admin-organisations.types.ts`

### GHCR Publishing

This fork publishes Docker images to GHCR from pushes to `main` and notifies Teams when
the build finishes.

Important file:

- `.github/workflows/ghcr-main.yml`

Expected behavior:

- Publishes `latest`, `main`, and `commit-<sha>` tags.
- Teams notification uses `TEAMS_GHCR_WEBHOOK_URL`.
- Success message includes a copyable `Deploy image` value such as
  `ghcr.io/ebcgroup/documenso:commit-<sha>`.

## Upstream-Resolved Items

These were previously fork-only concerns, but latest upstream now covers them. Do not
reintroduce local patches unless upstream regresses.

- Admin user creation is upstream in v2.13.0 through `create-admin-user`, the admin user
  create dialog, and `send.admin.user.created.email`.
- Self-hosted free claim defaults are upstream-safe in v2.13.0 because internal claims
  are now only `{ id, name }`, with no free-plan quota values to override.
- Session cookie expiry is fixed upstream by calculating `expires` when issuing the
  session cookie instead of at process start. This is the fix for logins returning to
  `/signin` after long container uptime.
