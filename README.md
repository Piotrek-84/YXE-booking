# YXE / YYC Detailing (PWA MVP)

Modern, mobile-first PWA with a customer booking flow and admin dashboard.

## Stack
- Next.js (App Router) + React + TypeScript
- Tailwind CSS
- Prisma + PostgreSQL
- next-pwa for offline/installable PWA support

## Getting Started
1. Install dependencies
   - `npm install`
2. Create `.env`
3. Run the dev server
   - `npm run dev`

## Environment Variables
Create a `.env` file in the project root:
```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
ADMIN_PASSWORD=change-me
NEXT_PUBLIC_APP_NAME=YXE/YYC Detailing
RESEND_API_KEY=your_resend_key
EMAIL_FROM="YXE/YYC Detailing <bookings@yourdomain.com>"
APP_BASE_URL=https://yxe-yyc-detailing.vercel.app
EMAIL_ENABLED=true
REMINDERS_ENABLED=false
GOOGLE_SYNC_ENABLED=false
MANAGE_CANCEL_CUTOFF_HOURS=2
MANAGE_RESCHEDULE_CUTOFF_HOURS=2
```

Supabase note:
- Set `DATABASE_URL` to your Supabase Postgres connection string (pooler or direct).
- Host usually looks like `db.<project-ref>.supabase.co` or the Supabase pooler host from your project.

`RESEND_API_KEY` and `EMAIL_FROM` are optional. If not set, email notifications are skipped.
`EMAIL_ENABLED`, `REMINDERS_ENABLED`, and `GOOGLE_SYNC_ENABLED` are feature flags.

Set `ADMIN_PASSWORD` locally and restart dev server after changes:
- macOS/Linux: `echo 'ADMIN_PASSWORD=your-strong-password' >> .env`

Set `ADMIN_PASSWORD` in Vercel:
- `vercel env add ADMIN_PASSWORD production`
- `vercel env add ADMIN_PASSWORD preview`

## Admin Auth (Password)
- Admin routes under `/admin` are protected by middleware.
- Login at `/admin/login`.
- Session cookie: `admin_session` (httpOnly).
- Hidden entry on the homepage:
  - Click the tiny dot in the top-right of the header 5 times within 3 seconds.
  - Or press `Cmd+Shift+A` to jump to login (Mac).

## Customer Self-Serve Manage Link
- Booking confirmation emails include `/manage/[token]` links when email is enabled.
- Customers can cancel/reschedule using the secure token until cutoff window.
- Cutoff windows are controlled by:
  - `MANAGE_CANCEL_CUTOFF_HOURS`
  - `MANAGE_RESCHEDULE_CUTOFF_HOURS`

## Production Build
- `npm run build`
- `npm run start`

## Code Quality (Biome)
This repo is configured for Biome formatting + linting.

Install Biome:
- `npm install -D @biomejs/biome`

Run checks:
- `npm run lint:biome`
- `npm run format`
- `npm run check`

## Health Check
- `GET /api/health`
  - Returns `{ ok: true, db: "up" | "down", timestamp }`

## Deploy on Vercel
1. Push this repo to GitHub.
2. Create a new Vercel project and import the repo.
3. Set environment variables in Vercel:
   - `DATABASE_URL`
   - `ADMIN_PASSWORD`
   - `NEXT_PUBLIC_APP_NAME`
4. Deploy.

## PWA Notes
- Add icons to `public/icons`:
  - `icon-192.png`
  - `icon-512.png`
- Run `npm run build` and `npm run start` to test installability.

## Project Structure
- `src/app` - Next.js routes
- `src/components` - UI components
- `src/lib` - utilities and API clients
- `src/styles` - global styles
- `public` - static assets + PWA manifest
- `docs` - product + technical docs
