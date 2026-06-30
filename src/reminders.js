import cron from 'node-cron';
import { InlineKeyboard } from 'grammy';
import { query } from './db.js';
import renderToday from './today.js';

export const reminderState = new Map();

export function buildReminderTypeKeyboard() {
    return new InlineKeyboard()
        .text('▶ Start notification', 'reminder_type:start').row()
        .text('⏹ Stop notification', 'reminder_type:stop').row()
        .text('📋 Daily summary', 'reminder_type:summary');
}

export function buildReminderEventKeyboard(events) {
    const keyboard = new InlineKeyboard();
    for (const event of events) {
        keyboard.text(`${event.emoji} ${event.label}`, `reminder_event:${event.id}`).row();
    }
    return keyboard;
}

export function buildReminderTimeReplyMarkup(type) {
    return {
        force_reply: true,
        selective: true,
        input_field_placeholder: type === 'stop' ? '01:05' : '09:15',
    };
}

export function parseReminderTime(input, type) {
    const value = input.trim();
    const match = type === 'stop'
        ? value.match(/^(\d+):([0-5]\d)$/)
        : value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (!match) return null;

    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    const total = hours * 60 + minutes;
    if (!Number.isSafeInteger(total) || total > 2147483647) return null;
    return type === 'stop' && total === 0 ? null : total;
}

function formatReminderTime(type, timeMinutes) {
    const hours = Math.floor(timeMinutes / 60);
    const minutes = timeMinutes % 60;
    if (type !== 'stop') {
        return `at ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
    if (hours === 0) return `after ${minutes}m`;
    if (minutes === 0) return `after ${hours}h`;
    return `after ${hours}h ${minutes}m`;
}

export async function renderReminders(userId) {
    const { rows } = await query(
        `SELECT r.id, r.type, r.time_minutes, r.paused, e.emoji, e.label
         FROM remiders r
         LEFT JOIN events e ON e.id = r.event_id
         WHERE r.user_id = $1
         ORDER BY r.id ASC`,
        [userId]
    );

    const keyboard = new InlineKeyboard();
    const lines = ['🔔 Reminders'];
    for (const [index, reminder] of rows.entries()) {
        const status = reminder.paused
            ? '⏸'
            : reminder.type === 'start'
                ? '▶'
                : reminder.type === 'stop'
                    ? '⏹'
                    : '📋';
        const subject = reminder.type === 'summary'
            ? 'Daily summary'
            : `${reminder.emoji} ${reminder.label}`;
        lines.push(
            `${index + 1}. ${status} ${subject} — ${formatReminderTime(reminder.type, reminder.time_minutes)}`
        );
        keyboard
            .text(`✏️ ${index + 1}`, `reminder_edit:${reminder.id}`)
            .text(`🗑 ${index + 1}`, `reminder_remove:${reminder.id}`)
            .row();
    }

    if (rows.length === 0) lines.push('', 'No reminders configured.');
    keyboard.text('➕ Add', 'reminder_add');
    if (rows.length > 0) {
        const hasActive = rows.some((reminder) => !reminder.paused);
        keyboard.text(hasActive ? '⏸ Pause all' : '▶ Resume all', 'reminder_toggle_all');
    }

    return { text: lines.join('\n'), keyboard };
}

export async function getReminder(userId, reminderId) {
    const { rows } = await query(
        `SELECT r.id, r.type, r.event_id, r.time_minutes, e.emoji, e.label
         FROM remiders r
         LEFT JOIN events e ON e.id = r.event_id
         WHERE r.id = $1 AND r.user_id = $2`,
        [reminderId, userId]
    );
    return rows[0] ?? null;
}

export async function saveReminder(userId, eventId, type, timeMinutes, reminderId = null) {
    if (reminderId === null) {
        await query(
            `INSERT INTO remiders (user_id, event_id, type, time_minutes)
             VALUES ($1, $2, $3, $4)`,
            [userId, eventId, type, timeMinutes]
        );
        return;
    }

    await query(
        `UPDATE remiders
         SET event_id = $1, type = $2, time_minutes = $3, last_notified_at = NULL
         WHERE id = $4 AND user_id = $5`,
        [eventId, type, timeMinutes, reminderId, userId]
    );
}

export async function removeReminder(userId, reminderId) {
    await query('DELETE FROM remiders WHERE id = $1 AND user_id = $2', [reminderId, userId]);
}

export async function toggleAllReminders(userId) {
    const { rows } = await query(
        'SELECT EXISTS (SELECT 1 FROM remiders WHERE user_id = $1 AND paused = false) AS has_active',
        [userId]
    );
    await query('UPDATE remiders SET paused = $1 WHERE user_id = $2', [rows[0].has_active, userId]);
}

function getLocalMinute(now, tz) {
    const parts = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: tz,
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return {
        date: `${values.year}-${values.month}-${values.day}`,
        minute: Number(values.hour) * 60 + Number(values.minute),
    };
}

async function sendStartReminders(bot, now) {
    const { rows } = await query(
        `SELECT r.id, r.user_id, r.event_id, r.time_minutes, r.last_notified_at,
                u.tz, e.emoji, e.label
         FROM remiders r
         JOIN users u ON u.user_id = r.user_id
         JOIN events e ON e.id = r.event_id
         WHERE r.type = 'start' AND r.paused = false`
    );

    for (const reminder of rows) {
        const local = getLocalMinute(now, reminder.tz);
        if (local.minute < reminder.time_minutes) continue;

        const { rows: claimed } = await query(
            `UPDATE remiders SET last_notified_at = NOW()
             WHERE id = $1
               AND (
                   last_notified_at IS NULL
                   OR (last_notified_at AT TIME ZONE $2)::date < $3::date
               )
             RETURNING id`,
            [reminder.id, reminder.tz, local.date]
        );
        if (claimed.length === 0) continue;

        const { rows: active } = await query(
            `SELECT 1 FROM logs started
             WHERE started.user_id = $1 AND started.event_id = $2
               AND started.type = 'start'
               AND NOT EXISTS (
                   SELECT 1 FROM logs stopped
                   WHERE stopped.user_id = started.user_id
                     AND stopped.event_id = started.event_id
                     AND stopped.type = 'stop'
                     AND stopped.ts > started.ts
               )
             LIMIT 1`,
            [reminder.user_id, reminder.event_id]
        );
        if (active.length > 0) continue;

        const keyboard = new InlineKeyboard()
            .text(`▶ Start ${reminder.emoji} ${reminder.label}`, `log:${reminder.event_id}`);
        await bot.api.sendMessage(
            reminder.user_id,
            `🔔 Time to start ${reminder.emoji} ${reminder.label}.`,
            { reply_markup: keyboard }
        );
    }
}

async function sendStopReminders(bot, now) {
    const { rows } = await query(
        `SELECT r.id, r.user_id, r.event_id, r.time_minutes, r.last_notified_at,
                e.emoji, e.label, active.started_at
         FROM remiders r
         JOIN events e ON e.id = r.event_id
         JOIN LATERAL (
             SELECT l.ts AS started_at
             FROM logs l
             WHERE l.user_id = r.user_id AND l.event_id = r.event_id
               AND l.type = 'start'
               AND NOT EXISTS (
                   SELECT 1 FROM logs stopped
                   WHERE stopped.user_id = l.user_id
                     AND stopped.event_id = l.event_id
                     AND stopped.type = 'stop'
                     AND stopped.ts > l.ts
               )
             ORDER BY l.ts DESC
             LIMIT 1
         ) active ON true
         WHERE r.type = 'stop' AND r.paused = false`
    );

    for (const reminder of rows) {
        const startedAt = new Date(reminder.started_at);
        const elapsedMinutes = Math.floor(now.getTime() / 60000)
            - Math.floor(startedAt.getTime() / 60000);
        if (elapsedMinutes < reminder.time_minutes) continue;

        const { rows: claimed } = await query(
            `UPDATE remiders SET last_notified_at = NOW()
             WHERE id = $1
               AND (last_notified_at IS NULL OR last_notified_at < $2)
             RETURNING id`,
            [reminder.id, startedAt]
        );
        if (claimed.length === 0) continue;

        const duration = formatReminderTime('stop', reminder.time_minutes).replace('after ', '');
        const keyboard = new InlineKeyboard()
            .text(`⏹ Stop ${reminder.emoji} ${reminder.label}`, `log:${reminder.event_id}`);
        await bot.api.sendMessage(
            reminder.user_id,
            `🔔 ${reminder.emoji} ${reminder.label} has been active for ${duration}. Time to stop it.`,
            { reply_markup: keyboard }
        );
    }
}

async function sendSummaryReminders(bot, now) {
    const { rows } = await query(
        `SELECT r.id, r.user_id, r.time_minutes, u.tz
         FROM remiders r
         JOIN users u ON u.user_id = r.user_id
         WHERE r.type = 'summary' AND r.paused = false`
    );

    for (const reminder of rows) {
        const local = getLocalMinute(now, reminder.tz);
        if (local.minute < reminder.time_minutes) continue;

        const { rows: claimed } = await query(
            `UPDATE remiders SET last_notified_at = NOW()
             WHERE id = $1
               AND (
                   last_notified_at IS NULL
                   OR (last_notified_at AT TIME ZONE $2)::date < $3::date
               )
             RETURNING id`,
            [reminder.id, reminder.tz, local.date]
        );
        if (claimed.length === 0) continue;

        await bot.api.sendMessage(
            reminder.user_id,
            await renderToday(reminder.user_id, reminder.tz, 0)
        );
    }
}

let schedulerRunning = false;

export async function runReminderScheduler(bot) {
    if (schedulerRunning) return;
    schedulerRunning = true;
    const now = new Date();
    try {
        await sendStartReminders(bot, now);
        await sendStopReminders(bot, now);
        await sendSummaryReminders(bot, now);
    } finally {
        schedulerRunning = false;
    }
}

export function startReminderScheduler(bot) {
    runReminderScheduler(bot).catch((error) => console.error('Reminder scheduler error:', error));
    cron.schedule('* * * * *', () => {
        runReminderScheduler(bot).catch((error) => console.error('Reminder scheduler error:', error));
    });
}
