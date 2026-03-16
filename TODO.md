# TODO

One commit per task. Work top to bottom.

## Foundation

- [x] Init project: `package.json`, `src/index.js`, `.env.example`, connect to Telegram with grammY
- [x] Database: write `schema.sql`, add `src/db.js` (pg pool + query helper)
- [x] Seed default events for new users on `/start`

## Core Logging

- [x] `/start` — welcome message + persistent reply keyboard built from user's events
- [x] Instant event logging — tap reply button → insert log row → confirm message
- [x] Duration event toggle — tap button → start if idle, stop (with elapsed) if running
- [x] `⏱ Active` button — show all currently running duration events
- [x] `⏱ Active` button - alias for `/active`
- [x] `📋 Today` button — alias for `/today`

## Commands

- [x] `/today` — render daily timeline with completed durations and running timers
- [x] `/log` — inline keyboard with all events
- [x] `/log` - delete log button
- [ ] `/log` - `▶`/`⏸` markers to change status for duration event
- [ ] `/week` — weekly grid of wake/sleep times + duration totals per event
- [ ] `/stats [event]` — 30-day stats: avg, total, longest session, busiest day, ASCII bar chart
- [ ] `/events` — list categories with [Add] [Edit] [Remove] [Reorder] buttons
- [ ] `/events` add flow — conversational: name → emoji → kind (instant/duration)
- [ ] `/edit` — show last 5 entries as inline buttons; accept new HH:MM or "delete"
- [ ] `/backlog <event> <HH:MM> [date]` — insert a log row with a past timestamp
- [ ] `/export` — send today as text, or full data as CSV/JSON file

## Reminders

- [ ] `/reminders` — list active reminders with [Add] [Edit] [Remove] [Pause all]
- [ ] Daily reminder at fixed time (e.g. "Log wake up at 10:00 if not yet logged")
- [ ] Session warning — fire after N hours of continuous active duration event
- [ ] Daily summary reminder — send `/today` output at configured time

## Polish

- [ ] Add note to any log entry — [✏️ Add note] button after logging
- [ ] Undo last log — [🗑 Undo] button within 60 seconds of logging
- [ ] Timezone support — store user tz in `users` table, apply to all display

## Tooling (later)

- [ ] Migrate to TypeScript: add `typescript`, `tsx`, `@types/*`
- [ ] Add ESLint + Prettier config
- [ ] Add Prisma: replace raw SQL with `prisma/schema.prisma` + migrations
- [ ] Add Zod: validate all incoming callback data and command arguments
- [ ] Dockerize: write `Dockerfile` + `docker-compose.yml` for bot + postgres

## Backlog (discuss before implementing)

- [ ] Highlight active duration events in reply keyboard (visual state sync)
- [ ] Inline event creation — user types a new event name directly; bot creates + starts it
- [ ] i18n — externalize all strings, add locale field to `users` table
- [ ] Checking DB connection on bot starting
- [ ] Improve performance for SQL select queries