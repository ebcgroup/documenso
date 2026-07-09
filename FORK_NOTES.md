# Fork Notes

This file tracks intentional EBC fork behavior that still differs from upstream Documenso.
After every upstream merge, update this file so future merges can prefer upstream while
preserving only the fork fixes or additions that upstream still does not cover.

Last reconciled with upstream release tag: `v2.14.0`.

## Merge Workflow

Use this workflow whenever pulling a new upstream Documenso release into the fork.

1. Start clean, choose the target release tag, and fetch upstream tags.

```powershell
git status --short
$releaseTag = "v2.14.0" # Replace with the release being imported.
git fetch upstream --tags
```

2. Merge the release tag into the fork branch. Do not merge `upstream/main`; the fork
   tracks published releases so unreleased changes are not deployed accidentally.

```powershell
git switch main
git merge $releaseTag
```

3. For every conflict, prefer upstream structure first, then reapply the smallest EBC
   delta needed to preserve the behavior listed in `Active Fork Changes`.

Conflict rules:

- If upstream added the same fix or feature, keep upstream and remove the local fork code.
  Move the item to `Upstream-Resolved Items` with the upstream version noted.
- If upstream refactored a touched file but did not fix the EBC issue, keep the upstream
  refactor and reapply our behavior in the smallest central place.
- If a conflict is only formatting, imports, generated code, or unrelated upstream UI,
  keep upstream.
- Do not edit many email templates to solve preview output. Keep templates close to
  upstream and preserve the central `Preview` no-op export instead.
- Do not keep old helper files just because they make the merge easier. If upstream has a
  first-party version, use upstream and delete the fork copy.

4. Run the checks in each active section below.

5. Review the fork delta against upstream before committing.

```powershell
git diff --stat $releaseTag main
git diff --name-status $releaseTag main
```

Expected result: the diff should mostly match the files listed under `Active Fork Changes`.
Anything else needs a reason in this file or should be removed.

6. Update this file before committing.

- Update `Last reconciled with upstream release tag`.
- Move fixed items from `Active Fork Changes` to `Upstream-Resolved Items`.
- Add any new local fixes with checks that can be run after the next merge.

## Active Fork Changes

### Email Rendering

Outlook/SendGrid SMTP had issues with React Email preview padding causing HTML email
parts to be truncated. This fork disables React Email preview output centrally instead
of editing every template, and removes the unused email preview app.

Important files:

- `packages/email/components.ts`
- `packages/email/package.json`
- `packages/email/preview/`

Expected behavior:

- Templates may keep upstream `Preview` imports and `previewText` variables.
- The shared `Preview` export in `packages/email/components.ts` must be a no-op component
  that returns `null`.
- Templates should continue importing `Preview` from `../components`, not directly from
  `@react-email/preview`.
- `packages/email/preview/` should stay absent unless we intentionally reintroduce local
  email preview tooling.
- Upstream v2.14.0 introduced a first-party `packages/email/preview/` app. This fork
  intentionally omits it while the shared `Preview` export remains disabled.

Checks after upstream merges:

```powershell
rg -n "export const Preview" packages/email/components.ts
rg -n "@react-email/preview" packages/email --glob "!package.json"
Test-Path packages/email/preview
```

Expected result: the first command finds the no-op export; the second command finds no
matches; the third returns `False`. If upstream adds a direct `@react-email/preview`
import, switch it back to the shared `../components` export.

### Admin Email Job Visibility And Local Job Recovery

Adds an admin-only email jobs view backed by existing `BackgroundJob` rows. The list page
stays compact; the detail page shows payload, resolved user/recipient/document context,
job tasks, retry, and a manual stop action. This does not add infinite retries, backup
transports, or a new email delivery table.

Upstream files intentionally modified:

- `apps/remix/app/routes/_authenticated+/admin+/_layout.tsx`
- `packages/lib/jobs/client/_internal/job.ts`
- `packages/lib/jobs/client/bullmq.ts`
- `packages/lib/jobs/client/local.ts`
- `packages/lib/jobs/definitions/emails/send-signing-email.handler.ts`
- `packages/trpc/server/admin-router/router.ts`

Fork-owned dashboard files:

- `apps/remix/app/routes/_authenticated+/admin+/email-jobs._index.tsx`
- `apps/remix/app/routes/_authenticated+/admin+/email-jobs.$id.tsx`
- `packages/trpc/server/admin-router/*email-job*`
- `packages/app-tests/e2e/admin/email-jobs.spec.ts`

Expected behavior:

- Admin sidebar includes `Email Jobs`.
- `/admin/email-jobs` filters email jobs by status and search query, sorted by newest
  `submittedAt`.
- The dashboard includes upstream v2.14 email jobs for deleted documents, pending
  documents, and removed recipients.
- Completed status is green, pending is blue, processing is orange, and failed is red.
- Failed jobs can be retried by creating a new background job.
- Stale pending local jobs can be retried by resubmitting the original background job row.
- Pending email jobs can be stopped manually; this marks the job `FAILED` and records an
  `Admin cancellation` task so the detail page explains why it is failed.
- The local jobs provider no longer depends on fire-and-forget internal HTTP for normal
  local execution. It creates the `BackgroundJob` row, queues it in-process, atomically
  claims `PENDING -> PROCESSING`, and marks terminal failures.
- On startup and each poll, the local jobs provider recovers registered pending jobs
  submitted within the last day only. Older pending jobs remain visible for manual action.
- Deleted signing targets throw `NonRetryableJobError`, so obsolete signing email jobs
  fail terminally instead of retrying forever.

Checks after upstream merges:

```powershell
rg -n "emailJob|Email Jobs|Stop Job" packages/trpc/server/admin-router apps/remix/app/routes/_authenticated+/admin+
rg -n "send.document.deleted.emails|send.document.pending.email|send.recipient.removed.email" packages/trpc/server/admin-router/email-jobs.ts
rg -n "processPendingJobs|PENDING_JOB_RECOVERY_AGE_MS|queueJobProcessing" packages/lib/jobs/client/local.ts
rg -n "NonRetryableJobError" packages/lib/jobs/client packages/lib/jobs/definitions/emails/send-signing-email.handler.ts
rg -n "\[ADMIN\]\[EMAIL_JOBS\]" packages/app-tests/e2e/admin/email-jobs.spec.ts
```

If upstream adds an equivalent general jobs dashboard, email delivery overview, or local
job recovery fix, prefer upstream and remove this fork implementation unless upstream
lacks the self-hosted visibility and manual recovery needed here.

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
- `packages/lib/server-only/admin/find-users.ts`
- `packages/lib/server-only/organisation/accept-organisation-invitation.ts`
- `packages/trpc/server/admin-router/add-user-to-organisation.ts`
- `packages/trpc/server/admin-router/find-users.ts`
- `packages/trpc/server/admin-router/router.ts`

Checks after upstream merges:

```powershell
rg -n "add: addUserToOrganisationRoute|find: findUsersRoute" packages/trpc/server/admin-router/router.ts
rg -n "bypassEmail|pendingInvitesToDelete|syncMemberCountWithStripeSeatPlan" packages/lib/server-only/admin/add-user-to-organisation.ts
```

If upstream adds an equivalent direct-add-member feature, prefer upstream and remove this
fork implementation.

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

Checks after upstream merges:

```powershell
rg -n "OrganisationType.PERSONAL|organisationType" apps/remix/app/routes/_authenticated+/admin+/organisations._index.tsx apps/remix/app/components/tables/admin-organisations-table.tsx
rg -n "type: z.nativeEnum\(OrganisationType\)|type," packages/trpc/server/admin-router/find-admin-organisations*
```

### GHCR Publishing And Workflow Noise

This fork publishes Docker images to GHCR from pushes to `main` and notifies Teams when
the build finishes. Most upstream GitHub workflows are disabled because they are for the
public upstream project and are noisy or irrelevant for the self-hosted fork.

Important files:

- `.github/workflows/ghcr-main.yml`
- `.github/workflows/*.yml`
- `docker/buildx-and-push.sh`

Expected behavior:

- `Publish GHCR Image on Main` runs on pushes to `main` and manual dispatch.
- `Continuous Integration` remains available as the main code-quality workflow.
- Upstream-only issue, PR, translation, stale, deploy, and release workflows should be
  manual-only unless there is a specific EBC reason to enable them.
- GHCR publishes `latest`, `main`, and `commit-<sha>` tags.
- Teams notification uses `TEAMS_GHCR_WEBHOOK_URL`.
- Success message includes a copyable `Deploy image` value such as
  `ghcr.io/ebcgroup/documenso:commit-<sha>`.

Checks after upstream merges:

```powershell
rg -n "push:|schedule:|pull_request:" .github/workflows
rg -n "Publish GHCR Image on Main|TEAMS_GHCR_WEBHOOK_URL|commit-" .github/workflows/ghcr-main.yml
```

Expected result: only intentionally active workflows should have automatic triggers.
Dependabot schedules in `.github/dependabot.yml` are separate from workflow triggers.

## Upstream-Resolved Items

These were previously fork-only concerns, but latest upstream now covers them. Do not
reintroduce local patches unless upstream regresses.

- Admin user creation is upstream in v2.13.0 through `packages/lib/server-only/user/create-admin-user.ts`, the admin user create dialog, and `send.admin.user.created.email`.
- Do not re-add `packages/lib/server-only/admin/create-user.ts`.
- Do not move the auth password schema to `packages/lib/utils/password-schema.ts`; keep upstream's schema layout unless upstream changes it.
- Self-hosted free claim defaults are upstream-safe in v2.13.0 because internal claims are now only `{ id, name }`, with no free-plan quota values to override.
- Session cookie expiry is fixed upstream by calculating `expires` when issuing the session cookie instead of at process start. This is the fix for logins returning to `/signin` after long container uptime.

Check for accidental reintroduction:

```powershell
Test-Path packages/lib/server-only/admin/create-user.ts
Test-Path packages/lib/utils/password-schema.ts
rg -n "create: createUserRoute" packages/trpc/server/admin-router/router.ts
```

Expected result: both `Test-Path` commands return `False`, and the router contains one
`create: createUserRoute` entry.
