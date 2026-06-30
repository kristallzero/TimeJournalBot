import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import { durationBetween, findActiveSession, insertLog, formatTime, formatDuration } from './log.js';

export function buildLogKeyboard(events, activeEventIds = new Set()) {
    const kb = new InlineKeyboard();
    events.forEach((e, i) => {
        const marker = activeEventIds.has(e.id) ? '⏸' : '▶';
        kb.text(`${e.emoji} ${e.label} ${marker}`, `log:${e.id}`);
        if ((i + 1) % 3 === 0) kb.row();
    });
    return kb;
}

export function buildDeleteButton(logId) {
    return new InlineKeyboard().text('🗑 Delete', `del_log:${logId}`);
}

export async function buildDeleteLogsView(userId, tz) {
    const { rows } = await query(
        `SELECT l.id, l.type, l.ts, e.emoji, e.label
         FROM logs l
         JOIN events e ON e.id = l.event_id
         WHERE l.user_id = $1
         ORDER BY l.ts DESC
         LIMIT 10`,
        [userId]
    );

    if (rows.length === 0) {
        return { text: 'No logs to delete.', keyboard: null };
    }

    const formatter = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
    });
    const keyboard = new InlineKeyboard();

    for (const log of rows) {
        const marker = log.type === 'start' ? '▶' : '⏹';
        const timestamp = formatter.format(new Date(log.ts));
        keyboard.text(`🗑 ${timestamp} · ${log.emoji} ${log.label} ${marker}`, `delete_log:${log.id}`).row();
    }

    return { text: 'Choose a log to delete (newest first):', keyboard };
}

export async function handleLogTap(userId, eventId, tz) {
    const { rows } = await query(
        'SELECT * FROM events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
    );
    const event = rows[0];
    if (!event) return { text: 'Event not found.', logId: null };

    const active = await findActiveSession(userId, event.id);
    if (!active) {
        const log = await insertLog(userId, event.id, 'start');
        return {
            text: `${event.emoji} ${event.label} started — ${formatTime(log.ts, tz)}`,
            logId: log.id,
        };
    }

    const log = await insertLog(userId, event.id, 'stop');
    const elapsed = formatDuration(durationBetween(active.ts, log.ts));
    return {
        text: `${event.emoji} ${event.label} stopped — ${formatTime(log.ts, tz)} (${elapsed})`,
        logId: log.id,
    };
}

export async function deleteLog(userId, logId) {
    const { rows } = await query(
        'DELETE FROM logs WHERE id = $1 AND user_id = $2 RETURNING id',
        [logId, userId]
    );
    return rows.length > 0;
}
