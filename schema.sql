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
