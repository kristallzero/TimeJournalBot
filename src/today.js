import { query } from './db.js';
import { formatDuration, formatTime } from './log.js';

export default async function renderToday(userId, tz) {
    const { rows: logs } = await query(
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
    );

    if (logs.length === 0) return 'Nothing logged today yet.';

    const dateLabel = new Intl.DateTimeFormat('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
        timeZone: tz,
    }).format(new Date());

    const skipped = new Set();
    const lines = [];

    for (const log of logs) {
        if (skipped.has(log.id)) continue;

        const time = formatTime(log.ts, tz);

        if (log.type === 'instant') {
            lines.push(`${time}  ${log.emoji}  ${log.label}`);
            continue;
        }

        if (log.type === 'start') {
            const stop = logs.find(
                (l) => l.event_id === log.event_id && l.type === 'stop'
                    && new Date(l.ts) > new Date(log.ts) && !skipped.has(l.id)
            );
            if (stop) {
                skipped.add(stop.id);
                const elapsed = formatDuration(new Date(stop.ts) - new Date(log.ts));
                lines.push(`${time}  ${log.emoji}  ${log.label} — ${elapsed}`);
            } else {
                lines.push(`${time}  ${log.emoji}  ${log.label} — ⏳ running`);
            }
        }
    }

    return `📅 ${dateLabel}\n\n${lines.join('\n')}`;
}
