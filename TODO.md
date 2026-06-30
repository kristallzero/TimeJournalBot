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
- [x] `/log` - `▶`/`⏸` markers to change status for duration event
- [x] `/week` — weekly grid of wake/sleep times + duration totals per event
- [x] `/today` - buttons "previous day" and "next day" for selecting the day
- [x] `/week` - buttons "previous" and "next week" for selecting the week
- [x] `/stats [event]` — 30-day stats: avg, total, longest session, busiest day, ASCII bar chart
- [x] `/stats` - Stats button in the keyboard
- [x] `/events` — list categories with [Add] [Edit] [Remove] [Reorder] buttons
- [x] `/events` - add events (flow — conversational: name, then emoji)
- [x] `/events` - edit events
- [x] `/events` - remove events
- [x] `/events` - reorder events
- [x] `/deletelog` - show last 10 logs in inline buttons, clicking on them deletes the log
- [x] `/deletelog` - inline buttons for navigating logs' pages
- [x] `/backlog <event> <HH:MM> [date]` — insert a log row with a past timestamp
- [x] `/export` — export full history as TXT, CSV, or JSON

## Reminders

- [x] `/reminders` — list active reminders with [Add] [Edit] [Remove] [Pause all]
- [x] Daily reminder at fixed time (e.g. "Log wake up at 10:00 if not yet logged")
- [x] Session warning — fire after N hours of continuous active duration event
- [x] Daily summary reminder — send `/today` output at configured time

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

- [ ] Database migration
- [ ] Highlight active duration events in reply keyboard (visual state sync)
- [ ] Show "no information" time in /today, /week and /stats
- [ ] Add try catch construction
- [ ] Inline event creation — user types a new event name directly; bot creates + starts it
- [ ] i18n — externalize all strings, add locale field to `users` table
- [ ] Checking DB connection on bot starting
- [ ] Improve performance for SQL select queries
