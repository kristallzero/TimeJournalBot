import 'dotenv/config';
import { Bot } from 'grammy';
import { upsertUser, seedDefaultEvents, getEvents } from './seed.js';
import { buildLogKeyboard, handleLogTap, buildDeleteButton, deleteLog } from './logs.js';
import { buildKeyboard } from './keyboard.js';
import { findEventByButton, insertLog, formatTime, findActiveSession, findAllActiveSessions, formatDuration } from './log.js';
import { query } from './db.js';
import renderToday from './today.js';
import { renderActive } from './active.js';
import { renderWeek } from './week.js';

async function getUserTz(userId) {
    const { rows } = await query('SELECT tz FROM users WHERE user_id = $1', [userId]);
    return rows[0]?.tz ?? 'UTC';
}

const token = process.env.BOT_TOKEN;
if (!token) {
    console.error('BOT_TOKEN is not set in .env');
    process.exit(1);
}

const bot = new Bot(token);

bot.command('log', async (ctx) => {
    const userId = ctx.from.id;
    const [events, sessions] = await Promise.all([getEvents(userId), findAllActiveSessions(userId)]);
    if (events.length === 0) return ctx.reply('No events configured. Use /events to add some.');
    const activeEventIds = new Set(sessions.map((s) => s.event_id));
    return ctx.reply('Log an event:', { reply_markup: buildLogKeyboard(events, activeEventIds) });
});

bot.callbackQuery(/^log:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    const tz = await getUserTz(ctx.from.id);
    const { text, logId } = await handleLogTap(ctx.from.id, eventId, tz);
    const reply_markup = logId ? buildDeleteButton(logId) : undefined;
    await ctx.editMessageText(text, { reply_markup });
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^del_log:(\d+)$/, async (ctx) => {
    const logId = parseInt(ctx.match[1], 10);
    await deleteLog(ctx.from.id, logId);
    await ctx.deleteMessage();
    return ctx.answerCallbackQuery();
});

bot.command('start', async (ctx) => {
    const { id, username } = ctx.from;
    await upsertUser(id, username);
    await seedDefaultEvents(id);
    const keyboard = await buildKeyboard(id);
    return ctx.reply(
        '🕐 TimeJournalBot\n\nI\'ll help you log timestamps for your daily activities.\n\nTap a button to log an event.',
        { reply_markup: keyboard }
    );
});

bot.command('active', async (ctx) => {
    const tz = await getUserTz(ctx.from.id);
    return ctx.reply(await renderActive(ctx.from.id, tz));
});

bot.command('today', async (ctx) => {
    const tz = await getUserTz(ctx.from.id);
    return ctx.reply(await renderToday(ctx.from.id, tz));
});

bot.command('week', async (ctx) => {
    const tz = await getUserTz(ctx.from.id);
    const { text, parse_mode } = await renderWeek(ctx.from.id, tz);
    return ctx.reply(text, { parse_mode });
});

bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id;

    if (text === '⏱ Active') {
        const tz = await getUserTz(userId);
        return ctx.reply(await renderActive(userId, tz));
    }

    if (text === '📋 Today') {
        const tz = await getUserTz(userId);
        return ctx.reply(await renderToday(userId, tz));
    }

    const event = await findEventByButton(userId, text);
    if (!event) return;

    const tz = await getUserTz(userId);

    if (event.kind === 'instant') {
        const log = await insertLog(userId, event.id, 'instant');
        return ctx.reply(`${event.emoji} ${event.label} — logged at ${formatTime(log.ts, tz)}`);
    }

    if (event.kind === 'duration') {
        const active = await findActiveSession(userId, event.id);
        if (!active) {
            const log = await insertLog(userId, event.id, 'start');
            return ctx.reply(`${event.emoji} ${event.label} started — ${formatTime(log.ts, tz)}`);
        } else {
            const log = await insertLog(userId, event.id, 'stop');
            const elapsed = formatDuration(new Date(log.ts) - new Date(active.ts));
            return ctx.reply(`${event.emoji} ${event.label} stopped — ${formatTime(log.ts, tz)} (${elapsed})`);
        }
    }
});

bot.catch((err) => {
    console.error('Bot error:', err);
});

bot.start();
console.log('Bot is running...');
