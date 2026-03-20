import { query } from './db.js';
import { formatTime } from './log.js';

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const LABEL_W = 13;
const COL_W = 6;

function getWeekDays(tz) {
    const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    console.log(todayStr);
    const today = new Date(todayStr + 'T00:00:00Z');
    const mondayOffset = (today.getUTCDay() + 6) % 7;
    return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setUTCDate(today.getUTCDate() - mondayOffset + i);
        return d.toISOString().slice(0, 10);
    });
}

function sumDurations(logs) {
    let total = 0;
    const openStarts = [];
    for (const log of logs.slice().sort((a, b) => new Date(a.ts) - new Date(b.ts))) {
        if (log.type === 'start') openStarts.push(log);
        else if (log.type === 'stop' && openStarts.length > 0) {
            total += new Date(log.ts) - new Date(openStarts.pop().ts);
        }
    }
    return total;
}

function fmtHours(ms) {
    return (ms / 3600000).toFixed(1);
}

function cell(val, width) {
    return (val ?? '—').toString().padStart(width);
}

export async function renderWeek(userId, tz) {
    const days = getWeekDays(tz);
    const { rows: logs } = await query(
        `SELECT l.id, l.type, l.ts, l.event_id, e.emoji, e.label, e.kind,
                (l.ts AT TIME ZONE $2)::date::text AS local_date
         FROM logs l
         JOIN events e ON e.id = l.event_id
         WHERE l.user_id = $1
           AND (l.ts AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
         ORDER BY l.event_id, l.ts ASC`,
        [userId, tz, days[0], days[6]]
    );

    if (logs.length === 0) return 'Nothing logged this week yet.';

    const byEvent = new Map();
    for (const log of logs) {
        if (!byEvent.has(log.event_id)) {
            byEvent.set(log.event_id, { emoji: log.emoji, label: log.label, kind: log.kind, byDay: new Map() });
        }
        const ev = byEvent.get(log.event_id);
        if (!ev.byDay.has(log.local_date)) ev.byDay.set(log.local_date, []);
        ev.byDay.get(log.local_date).push(log);
    }

    const fmtDate = (d) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
        .format(new Date(d + 'T12:00:00Z'));
    const weekLabel = `${fmtDate(days[0])} – ${fmtDate(days[6])}`;

    const header = ' '.repeat(LABEL_W) + DAY_LABELS.map((d) => cell(d, COL_W)).join('');
    const sep = '─'.repeat(LABEL_W + COL_W * 7);

    const instantLines = [];
    const durationLines = [];

    for (const [, ev] of byEvent) {
        const label = `${ev.emoji} ${ev.label}`.slice(0, LABEL_W - 1).padEnd(LABEL_W);

        if (ev.kind === 'instant') {
            const cols = days.map((d) => {
                const first = ev.byDay.get(d)?.[0];
                return first ? formatTime(first.ts, tz) : null;
            });
            instantLines.push(label + cols.map((c) => cell(c, COL_W)).join(''));
        } else {
            const dayTotals = days.map((d) => {
                const ms = sumDurations(ev.byDay.get(d) ?? []);
                return ms > 0 ? fmtHours(ms) : null;
            });
            const weekTotal = days.reduce((acc, d) => acc + sumDurations(ev.byDay.get(d) ?? []), 0);
            const totalStr = weekTotal > 0 ? ` = ${fmtHours(weekTotal)}h` : '';
            durationLines.push(label + dayTotals.map((c) => cell(c, COL_W)).join('') + totalStr);
        }
    }

    const lines = [`📊 Week of ${weekLabel}`, ''];

    if (instantLines.length > 0) {
        lines.push(header, sep, ...instantLines, '');
    }
    if (durationLines.length > 0) {
        lines.push('⏱ Totals (h):', header, sep, ...durationLines);
    }

    return { text: '<pre>' + lines.join('\n') + '</pre>', parse_mode: 'HTML' };
}
