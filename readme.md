# TimeJournalBot

A personal Telegram bot that logs timestamps for daily routine events with one tap. Build a picture of your habits over time: when you wake up, how long you study, how much time goes to YouTube.

## Features

- **One-tap logging** — persistent reply keyboard always visible, single tap to record
- **Duration tracking** — start/stop toggle with elapsed time shown on stop
- **Active timer display** — see what's currently running at a glance
- **Daily timeline** — `/today` shows a clean chronological view
- **Weekly/monthly stats** — averages, totals, trends, ASCII bar charts
- **Custom events** — add, remove, and reorder your own categories
- **Timestamp editing** — fix mistakes and adjust times retroactively
- **Backlog entries** — log past events you forgot
- **Conditional reminders** — "nudge me if X not logged by Y"
- **Session warnings** — "you've been gaming for 3h"
- **Data export** — CSV / JSON / plain text
- **Timezone support** — all timestamps stored in your local tz

## Tech Stack

| Layer | Choice | Package |
|---|---|---|
| Runtime | Node.js 20 LTS | — |
| Bot framework | grammY | `grammy` |
| Database | PostgreSQL 15+ | — |
| DB driver | node-postgres | `pg` |
| Scheduler | node-cron | `node-cron` |
| Config | dotenv | `dotenv` |

## Getting Started

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- A Telegram bot token from [@BotFather](https://t.me/BotFather)

### Installation

```bash
git clone <repo-url>
cd timejournalbot
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

```env
BOT_TOKEN=your_telegram_bot_token
DATABASE_URL=postgresql://user:password@localhost:5432/timejournal
TZ=Europe/Istanbul
```

### Database Setup

```bash
psql -d timejournal -f schema.sql
```

### Run

```bash
node src/index.js
```

## Bot Commands

| Command | Description |
|---|---|
| `/start` | First launch, shows welcome + reply keyboard |
| `/log` | Inline keyboard to pick an event manually |
| `/deletelog` | Delete one of the 10 most recent logs |
| `/today` | Chronological timeline for today |
| `/week` | Weekly summary with totals and averages |
| `/stats [event]` | Per-event statistics for the last 30 days |
| `/events` | Manage your event categories (add/edit/remove) |
| `/edit` | Correct a recent timestamp |
| `/backlog <event> <HH:MM> [date]` | Log a past event you forgot |
| `/reminders` | Configure nudges and conditional alerts |
| `/export` | Export data as CSV or JSON |

## Interaction Design

### Quick-Log Panel (Reply Keyboard)

Always visible at the bottom of the chat:

```
┌──────────┬──────────┬──────────┐
│ ☀️ Woke up │ 🍳 Breakfast│ 🚌 College │
├──────────┼──────────┼──────────┤
│ 🎮 Gaming │ 📺 YouTube │ 📖 Study   │
├──────────┼──────────┼──────────┤
│ 🛏 Sleep   │ ⏱ Active  │ 📋 Today   │
└──────────┴──────────┴──────────┘
```

Tapping a button logs the timestamp immediately. Duration events toggle:

```
🎮 Gaming started — 15:30
🎮 Gaming stopped — 17:45 (2h 15m)
```

### Daily Timeline (`/today`)

```
📅 Today — March 7, 2026 (Saturday)

 09:12  ☀️  Woke up
 09:30  🍳  Breakfast
 15:30  🎮  Gaming .............. 2h 15m
 17:45  📖  Study ............... 1h 30m
 19:15  📺  YouTube ............. ⏳ running

Total tracked: 3h 45m+ active
```

### Weekly Summary (`/week`)

```
📊 Week of Mar 1–7

           Mon  Tue  Wed  Thu  Fri  Sat  Sun
Wake up    8:50 9:12 7:30 8:00 9:40 9:12  —
Sleep     00:30 1:15 23:50 0:10 1:45  —    —

⏱ Totals (hours):
Gaming     2.5  1.0  3.0  2.0  4.5  2.2   —   = 15.2h
YouTube    1.0  2.0  0.5  1.5  2.0  0.0   —   =  7.0h
Study      3.0  2.5  4.0  3.0  1.0  1.5   —   = 15.0h

📈 Avg wake: 8:43  |  Avg sleep: 0:42
```

## Database Schema

```sql
CREATE TYPE event_kind AS ENUM ('instant', 'duration');
CREATE TYPE log_type AS ENUM ('instant', 'start', 'stop');

CREATE TABLE users (
    user_id   BIGINT PRIMARY KEY,
    username  TEXT,
    tz        TEXT DEFAULT 'Europe/Istanbul',
    created   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE events (
    id         SERIAL PRIMARY KEY,
    user_id    BIGINT REFERENCES users(user_id),
    slug       TEXT NOT NULL,
    label      TEXT NOT NULL,
    emoji      TEXT DEFAULT '⏱',
    kind       event_kind NOT NULL,
    sort_order INT DEFAULT 0,
    UNIQUE (user_id, slug)
);

CREATE TABLE logs (
    id        SERIAL PRIMARY KEY,
    user_id   BIGINT REFERENCES users(user_id),
    event_id  INT REFERENCES events(id),
    type      log_type NOT NULL,
    ts        TIMESTAMPTZ NOT NULL DEFAULT now(),
    note      TEXT,
    created   TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_logs_user_ts ON logs(user_id, ts DESC);
CREATE INDEX idx_logs_event ON logs(event_id, ts DESC);
```

## Roadmap (V2)

- **Goals** — "Study ≥ 3h/day" with progress bar in `/today`
- **Streaks** — "You've logged wake-up before 9:00 for 12 days straight"
- **Tags/notes** — attach context to any log entry
- **Graphs as images** — PNG charts via `chart.js` + `canvas`
- **Shared tracking** — mutual accountability with a friend
- **Web dashboard** — mini web app via Telegram WebApp API
- **Natural language input** — "woke up at 8:30" parsed automatically
