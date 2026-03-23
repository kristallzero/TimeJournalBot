import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import { formatDuration } from './log.js';

const STATS_DAYS = 30;
const CHART_DAYS = 7;
const BAR_WIDTH = 10;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getLocalDateKey(ts, tz) {
    return new Date(ts).toLocaleDateString('en-CA', { timeZone: tz });
}

function getLastNDayKeys(n, tz) {
    const todayKey = new Date().toLocaleDateString('en-CA', { timeZone: tz });
    const [ty, tm, td] = todayKey.split('-').map(Number);
    const result = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(ty, tm - 1, td - i));
        const year = d.getUTCFullYear();
        const month = d.getUTCMonth() + 1;
        const day = d.getUTCDate();
        const key = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const label = `${WEEKDAYS[d.getUTCDay()]} ${day}`;
        result.push({ key, label });
    }
    return result;
}

function buildBarChart(byDay, tz) {
    const days = getLastNDayKeys(CHART_DAYS, tz);
    const maxVal = Math.max(...days.map((d) => byDay[d.key] || 0));
    return days.map(({ key, label }) => {
        const val = byDay[key] || 0;
        const filled = Math.round((val / maxVal) * BAR_WIDTH);
        const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
        return `${bar} ${label} (${formatDuration(val)})`;
    });
}

function computeDurationStats(logs, emoji, label, tz) {
    const sessions = [];
    let pendingStart = null;

    for (const log of logs) {
        if (log.type === 'start') {
            pendingStart = log;
        } else if (log.type === 'stop' && pendingStart) {
            sessions.push({
                duration: new Date(log.ts) - new Date(pendingStart.ts),
                day: getLocalDateKey(pendingStart.ts, tz),
            });
            pendingStart = null;
        }
    }

    if (!sessions.length) return `${emoji} ${label} — no completed sessions in the last ${STATS_DAYS} days.`;

    const byDay = {};
    for (const s of sessions) byDay[s.day] = (byDay[s.day] || 0) + s.duration;

    const total = sessions.reduce((sum, s) => sum + s.duration, 0);
    const avgPerDay = total / STATS_DAYS;

    let busiestDay = null, busiestDur = 0;
    for (const [day, dur] of Object.entries(byDay)) {
        if (dur > busiestDur) { busiestDur = dur; busiestDay = day; }
    }

    const lines = [
        `📊 ${emoji} ${label} — last ${STATS_DAYS} days\n`,
        `Total:      ${formatDuration(total)}`,
        `Daily avg:  ${formatDuration(Math.round(avgPerDay))}`,
        `Busiest:    ${busiestDay} (${formatDuration(busiestDur)})`,
        `\n📈 Last ${CHART_DAYS} days`,
        ...buildBarChart(byDay, tz),
    ];
    return lines.join('\n');
}

export async function renderStats(userId, eventId, tz) {
    const { rows: eventRows } = await query(
        'SELECT emoji, label FROM events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
    );
    if (!eventRows.length) return 'Event not found.';
    const { emoji, label } = eventRows[0];

    const { rows: logs } = await query(
        `SELECT type, ts FROM logs
         WHERE user_id = $1 AND event_id = $2
           AND ts >= NOW() - INTERVAL '${STATS_DAYS} days'
         ORDER BY ts ASC`,
        [userId, eventId]
    );

    if (!logs.length) return `${emoji} ${label} — no data in the last ${STATS_DAYS} days.`;

    return computeDurationStats(logs, emoji, label, tz);
}

export async function buildStatsKeyboard(userId) {
    const { rows } = await query(
        'SELECT id, emoji, label FROM events WHERE user_id = $1 ORDER BY sort_order',
        [userId]
    );
    const kb = new InlineKeyboard();
    for (const e of rows) kb.text(`${e.emoji} ${e.label}`, `stats:${e.id}`).row();
    return kb;
}

export async function findEventByLabel(userId, label) {
    const { rows } = await query(
        `SELECT id, emoji, label FROM events WHERE user_id = $1 AND LOWER(label) = LOWER($2)`,
        [userId, label]
    );
    return rows[0] ?? null;
}