import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import { formatDuration, formatTime } from './log.js';

export function buildTodayKeyboard(offset) {
    const kb = new InlineKeyboard().text('◀ Prev', `today:${offset - 1}`);
    if (offset < 0) kb.text('Next ▶', `today:${offset + 1}`);
    return kb;
}

export default async function renderToday(userId, tz, offset = 0) {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const targetDay = new Date(todayStr + 'T00:00:00Z');
    if (offset !== 0) targetDay.setUTCDate(targetDay.getUTCDate() + offset);
    const targetDateStr = targetDay.toISOString().slice(0, 10);
    const isToday = offset === 0;

    let rows;
    if (isToday) {
        ({ rows } = await query(
            `SELECT l.id, l.type, l.ts, l.event_id, e.emoji, e.label, e.kind
             FROM logs l
             JOIN events e ON e.id = l.event_id
             WHERE l.user_id = $1
               AND (
                   (l.ts AT TIME ZONE $2)::date = (NOW() AT TIME ZONE $2)::date
                   OR (
                       l.type = 'start'
                       AND NOT EXISTS (
                           SELECT 1 FROM logs l2
                           WHERE l2.user_id = $1 AND l2.event_id = l.event_id
                               AND l2.type = 'stop' AND l2.ts > l.ts
                       )
                   )
               )
             ORDER BY l.ts ASC`,
            [userId, tz]
        ));
    } else {
        ({ rows } = await query(
            `SELECT l.id, l.type, l.ts, l.event_id, e.emoji, e.label, e.kind
             FROM logs l
             JOIN events e ON e.id = l.event_id
             WHERE l.user_id = $1
               AND (l.ts AT TIME ZONE $2)::date = $3::date
             ORDER BY l.ts ASC`,
            [userId, tz, targetDateStr]
        ));
    }

    const dateLabel = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(targetDateStr + 'T12:00:00Z'));

    if (rows.length === 0) return `📅 ${dateLabel}\n\nNothing logged.`;

    const skipped = new Set();
    const lines = [];

    for (const log of rows) {
        if (skipped.has(log.id)) continue;
        const time = formatTime(log.ts, tz);

        if (log.type === 'instant') {
            lines.push(`${time}  ${log.emoji}  ${log.label}`);
            continue;
        }

        if (log.type === 'start') {
            const stop = rows.find(
                (l) => l.event_id === log.event_id && l.type === 'stop'
                    && new Date(l.ts) > new Date(log.ts) && !skipped.has(l.id)
            );
            if (stop) {
                skipped.add(stop.id);
                lines.push(`${time}  ${log.emoji}  ${log.label} — ${formatDuration(new Date(stop.ts) - new Date(log.ts))}`);
            } else {
                lines.push(`${time}  ${log.emoji}  ${log.label} — ${isToday ? '⏳ running' : 'no end'}`);
            }
        }
    }

    return `📅 ${dateLabel}\n\n${lines.join('\n')}`;
}
