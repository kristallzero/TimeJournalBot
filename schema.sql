CREATE TYPE log_type AS ENUM ('start', 'stop');
CREATE TYPE reminder_type AS ENUM ('start', 'stop');

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

CREATE TABLE remiders (
    id               SERIAL PRIMARY KEY,
    user_id          BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    event_id         INT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    type             reminder_type NOT NULL,
    time_minutes     INT NOT NULL,
    paused           BOOLEAN NOT NULL DEFAULT false,
    last_notified_at TIMESTAMPTZ,
    created          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (type = 'start' AND time_minutes BETWEEN 0 AND 1439)
        OR (type = 'stop' AND time_minutes > 0)
    )
);

CREATE INDEX idx_remiders_active ON remiders(type, paused);
CREATE INDEX idx_remiders_user ON remiders(user_id);
