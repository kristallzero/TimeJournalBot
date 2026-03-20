import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import { formatTime, formatDuration } from './log.js';

export function buildWeekKeyboard(offset) {
    const kb = new InlineKeyboard().text('◀ Prev', `week:${offset - 1}`);
    if (offset < 0) kb.text('Next ▶', `week:${offset + 1}`);
    return kb;
}

function getWeekDays(tz, offset = 0) {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const today = new Date(todayStr + 'T00:00:00Z');
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    today.setUTCDate(today.getUTCDate() - mondayOffset + offset * 7);
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() + i);
        return d.toISOString().slice(0, 10);
    });
}

export async function renderWeek(userId, tz, offset = 0) {
    const days = getWeekDays(tz, offset);
    const { rows: logs } = await query(
        `SELECT l.id, l.type, l.ts, l.event_id, e.emoji, e.label, e.kind,
                (l.ts AT TIME ZONE $2)::date::text AS local_date
         FROM logs l
         JOIN events e ON e.id = l.event_id
         WHERE l.user_id = $1
           AND (l.ts AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
         ORDER BY l.ts ASC`,
        [userId, tz, days[0], days[6]]
    );

    if (logs.length === 0) return 'Nothing logged this week yet.';

    const byDay = new Map();
    for (const log of logs) {
        if (!byDay.has(log.local_date)) byDay.set(log.local_date, []);
        byDay.get(log.local_date).push(log);
    }

    const fmtDate = (d) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(d + 'T12:00:00Z'));

    const output = [`📊 Week of ${fmtDate(days[0])} – ${fmtDate(days[6])}`];

    for (const dayStr of days) {
        const dayLogs = byDay.get(dayStr) ?? [];
        const dateLabel = new Intl.DateTimeFormat('en-GB', {
            weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC',
        }).format(new Date(dayStr + 'T12:00:00Z'));

        output.push('', `📅 ${dateLabel}`);

        if (dayLogs.length === 0) {
            output.push('—');
            continue;
        }

        const skipped = new Set();
        for (const log of dayLogs) {
            if (skipped.has(log.id)) continue;
            const time = formatTime(log.ts, tz);
            if (log.type === 'instant') {
                output.push(`${time}  ${log.emoji}  ${log.label}`);
            } else if (log.type === 'start') {
                const stop = dayLogs.find(
                    (l) => l.event_id === log.event_id && l.type === 'stop'
                        && new Date(l.ts) > new Date(log.ts) && !skipped.has(l.id)
                );
                if (stop) {
                    skipped.add(stop.id);
                    output.push(`${time}  ${log.emoji}  ${log.label} — ${formatDuration(new Date(stop.ts) - new Date(log.ts))}`);
                } else {
                    output.push(`${time}  ${log.emoji}  ${log.label} — ${offset === 0 ? '⏳ running' : 'no end'}`);
                }
            }
        }
    }

    return output.join('\n');
}
