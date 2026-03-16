import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import { findActiveSession, insertLog, formatTime, formatDuration } from './log.js';

export function buildLogKeyboard(events, activeEventIds = new Set()) {
    const kb = new InlineKeyboard();
    events.forEach((e, i) => {
        let label = `${e.emoji} ${e.label}`;
        if (e.kind === 'duration') label += activeEventIds.has(e.id) ? ' ⏸' : ' ▶';
        kb.text(label, `log:${e.id}`);
        if ((i + 1) % 3 === 0) kb.row();
    });
    return kb;
}

export function buildDeleteButton(logId) {
    return new InlineKeyboard().text('🗑 Delete', `del_log:${logId}`);
}

export async function handleLogTap(userId, eventId, tz) {
    const { rows } = await query(
        'SELECT * FROM events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
    );
    const event = rows[0];
    if (!event) return { text: 'Event not found.', logId: null };

    if (event.kind === 'instant') {
        const log = await insertLog(userId, event.id, 'instant');
        return {
            text: `${event.emoji} ${event.label} — logged at ${formatTime(log.ts, tz)}`,
            logId: log.id,
        };
    }

    const active = await findActiveSession(userId, event.id);
    if (!active) {
        const log = await insertLog(userId, event.id, 'start');
        return {
            text: `${event.emoji} ${event.label} started — ${formatTime(log.ts, tz)}`,
            logId: log.id,
        };
    }

    const log = await insertLog(userId, event.id, 'stop');
    const elapsed = formatDuration(new Date(log.ts) - new Date(active.ts));
    return {
        text: `${event.emoji} ${event.label} stopped — ${formatTime(log.ts, tz)} (${elapsed})`,
        logId: log.id,
    };
}

export async function deleteLog(userId, logId) {
    await query(
        'DELETE FROM logs WHERE id = $1 AND user_id = $2',
        [logId, userId]
    );
}
