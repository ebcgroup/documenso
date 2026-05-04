# Fork Notes

This fork has a few intentional changes on top of upstream Documenso. After merging
`upstream/main`, use this file as a quick checklist to verify the fork behavior still
exists.

## Email Rendering

Outlook/SendGrid SMTP had issues with React Email preview padding causing HTML email
parts to be truncated. This fork removes React Email `<Preview>` usage from email
templates.

Check after upstream merges:

```powershell
Get-ChildItem -Path .\packages\email -Recurse -Include *.tsx -File |
  Select-String -Pattern '<Preview|Preview,|previewText'
```

Expected result: no matches.

## PDF Timestamp Authorities

Signing should try all configured timestamp authorities in order. It should log each
attempt, stop on the first successful TSA, and fail signing if every configured TSA
fails.

Important files:

- `packages/signing/index.ts`
- `packages/signing/helpers/tsa.ts`

Expected behavior:

- `NEXT_PRIVATE_SIGNING_TIMESTAMP_AUTHORITY` is split by comma.
- Each TSA URL is trimmed.
- TSAs are tried in the configured order.
- Logs include the TSA being used and failures.

## Admin User Management

Global admins can create users directly from the admin users page.

Expected behavior:

- Admin enters `name` and `email`.
- No password field is shown.
- Server generates a temporary strong password.
- New user is auto-verified.
- New user gets global role `USER`.
- Existing forgot-password flow is triggered so the user receives the normal reset
  password email.

Important files:

- `apps/remix/app/components/dialogs/admin-user-create-dialog.tsx`
- `packages/lib/server-only/admin/create-user.ts`
- `packages/trpc/server/admin-router/create-user.ts`
- `packages/trpc/server/admin-router/create-user.types.ts`

## Admin Direct Organisation Add

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

## Admin Organisations List

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

## Self-Hosted Free Claim Defaults

For cleaner self-hosted usage display, newly created free organisations use unlimited
member/team counts.

Important file:

- `packages/lib/types/subscription.ts`

Expected values for `INTERNAL_CLAIM_ID.FREE`:

- `teamCount: 0`
- `memberCount: 0`

## GHCR Publishing

This fork publishes Docker images to GHCR from pushes to `main` and notifies Teams
when the build finishes.

Important file:

- `.github/workflows/ghcr-main.yml`

Expected behavior:

- Publishes `latest`, `main`, and `commit-<sha>` tags.
- Teams notification uses `TEAMS_GHCR_WEBHOOK_URL`.
- Success message includes a copyable `Deploy image` value such as:
  `ghcr.io/ebcgroup/documenso:commit-<sha>`.

