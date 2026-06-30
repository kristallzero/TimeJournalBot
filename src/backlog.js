import { InlineKeyboard } from 'grammy';
import { query } from './db.js';

export const backlogState = new Map();

export function buildBacklogEventKeyboard(events) {
    const keyboard = new InlineKeyboard();
    for (const event of events) {
        keyboard.text(`${event.emoji} ${event.label}`, `backlog_event:${event.id}`).row();
    }
    return keyboard;
}

export function buildBacklogTimeReplyMarkup() {
    return {
        force_reply: true,
        selective: true,
        input_field_placeholder: 'HH:MM or HH:MM YYYY-MM-DD',
    };
}

function getLocalDate(tz, dayOffset = 0) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + dayOffset);
    return date.toISOString().slice(0, 10);
}

function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day;
}

function resolveDate(value, tz) {
    if (!value || value.toLowerCase() === 'today') return getLocalDate(tz);
    if (value.toLowerCase() === 'yesterday') return getLocalDate(tz, -1);
    return isValidDate(value) ? value : null;
}

export function parseBacklogDateTime(input, tz) {
    const match = input.trim().match(/^((?:[01]\d|2[0-3]):[0-5]\d)(?:\s+(\S+))?$/);
    if (!match) return null;

    const date = resolveDate(match[2], tz);
    return date ? { time: match[1], date } : null;
}

export function parseBacklogCommand(input, tz) {
    let value = input.trim();
    let dateValue;
    const dateMatch = value.match(/\s+(\d{4}-\d{2}-\d{2}|today|yesterday)$/i);
    if (dateMatch) {
        dateValue = dateMatch[1];
        value = value.slice(0, -dateMatch[0].length);
    }

    const match = value.match(/^(.+)\s+((?:[01]\d|2[0-3]):[0-5]\d)$/);
    if (!match) return null;

    const date = resolveDate(dateValue, tz);
    if (!date) return null;

    const eventLabel = match[1].replace(/^(["'])(.*)\1$/, '$2').trim();
    return eventLabel ? { eventLabel, time: match[2], date } : null;
}

export async function findBacklogEvent(userId, label) {
    const { rows } = await query(
        `SELECT id, emoji, label FROM events
         WHERE user_id = $1
           AND (LOWER(label) = LOWER($2) OR emoji || ' ' || label = $2)`,
        [userId, label]
    );
    return rows[0] ?? null;
}

export async function insertBacklogLog(userId, eventId, time, date, tz) {
    const { rows } = await query(
        `WITH target AS (
             SELECT ($3::date + $4::time) AT TIME ZONE $5 AS ts
         )
         INSERT INTO logs (user_id, event_id, type, ts)
         SELECT $1, $2,
                COALESCE(
                    (
                        SELECT CASE
                            WHEN l.type = 'start' THEN 'stop'::log_type
                            ELSE 'start'::log_type
                        END
                        FROM logs l
                        WHERE l.user_id = $1 AND l.event_id = $2
                          AND l.ts < target.ts
                        ORDER BY l.ts DESC
                        LIMIT 1
                    ),
                    'start'::log_type
                ),
                target.ts
         FROM target
         WHERE target.ts <= NOW()
         RETURNING *`,
        [userId, eventId, date, time, tz]
    );
    return rows[0] ?? null;
}

export function formatBacklogConfirmation(event, log, tz) {
    const timestamp = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
    }).format(new Date(log.ts));
    const action = log.type === 'start' ? 'started' : 'stopped';
    return `✅ ${event.emoji} ${event.label} ${action} — ${timestamp}`;
}
