# Prisma 7 Upgrade Plan

This project currently uses:
- `prisma`: `5.22.0`
- `@prisma/client`: `5.22.0`

Because this is a major-version jump, upgrade in two controlled phases:
1. `5.x -> 6.x`
2. `6.x -> 7.x`

## 1. Preconditions

- Use a dedicated branch for the upgrade.
- Confirm production is healthy before starting:
  - `npx prisma migrate status --schema prisma/schema.prisma`
  - `npm run build`
  - `npm run lint`
- Keep current env setup:
  - `DATABASE_URL` = Supabase pooler (`:6543`)
  - `DIRECT_URL` = Supabase connection for migrations

## 2. Baseline Snapshot

Run and save outputs before any dependency changes:

```bash
node -v
npm -v
npx prisma -v
npx prisma migrate status --schema prisma/schema.prisma
```

Commit current state:

```bash
git checkout -b chore/prisma-upgrade
git add -A
git commit -m "chore: baseline before Prisma major upgrade"
```

## 3. Phase A: Upgrade to Prisma 6

```bash
npm i --save-dev prisma@^6
npm i @prisma/client@^6
npx prisma generate
```

Then validate:

```bash
npx prisma validate --schema prisma/schema.prisma
npx prisma migrate status --schema prisma/schema.prisma
npm run lint
npm run build
```

Run a read/write smoke test (create and cleanup booking records), then deploy to preview and test booking flow end-to-end.

If stable, commit:

```bash
git add package.json package-lock.json prisma/schema.prisma
git commit -m "chore: upgrade Prisma to v6"
```

## 4. Phase B: Upgrade to Prisma 7

```bash
npm i --save-dev prisma@^7
npm i @prisma/client@^7
npx prisma generate
```

Repeat the same validation:

```bash
npx prisma validate --schema prisma/schema.prisma
npx prisma migrate status --schema prisma/schema.prisma
npm run lint
npm run build
```

Deploy to preview, run booking/admin smoke tests, then promote to production.

## 5. Production Cutover

- Merge upgrade branch.
- Deploy production.
- Verify:
  - `GET /api/health` returns `db: "up"`
  - booking create/update/cancel flows work
  - admin bookings page loads and updates status correctly

## 6. Rollback Plan

If any regression appears:
1. Revert Prisma dependency commit.
2. `npm install`
3. `npx prisma generate`
4. Redeploy previous stable commit.

Note: this upgrade should not require new migrations by itself. Do not run `prisma migrate dev` against production.
