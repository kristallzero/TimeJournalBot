import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import { findActiveSession, insertLog, formatTime, formatDuration } from './log.js';

export function buildLogKeyboard(events) {
    const kb = new InlineKeyboard();
    events.forEach((e, i) => {
        kb.text(`${e.emoji} ${e.label}`, `log:${e.id}`);
        if ((i + 1) % 3 === 0) kb.row();
    });
    return kb;
}

export async function handleLogTap(userId, eventId, tz) {
    const { rows } = await query(
        'SELECT * FROM events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
    );
    const event = rows[0];
    if (!event) return 'Event not found.';

    if (event.kind === 'instant') {
        const log = await insertLog(userId, event.id, 'instant');
        return `${event.emoji} ${event.label} — logged at ${formatTime(log.ts, tz)}`;
    }

    const active = await findActiveSession(userId, event.id);
    if (!active) {
        const log = await insertLog(userId, event.id, 'start');
        return `${event.emoji} ${event.label} started — ${formatTime(log.ts, tz)}`;
    }

    const log = await insertLog(userId, event.id, 'stop');
    const elapsed = formatDuration(new Date(log.ts) - new Date(active.ts));
    return `${event.emoji} ${event.label} stopped — ${formatTime(log.ts, tz)} (${elapsed})`;
}
