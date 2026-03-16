import 'dotenv/config';
import { Bot } from 'grammy';
import { upsertUser, seedDefaultEvents } from './seed.js';
import { buildKeyboard } from './keyboard.js';
import { findEventByButton, insertLog, formatTime, findActiveSession, formatDuration } from './log.js';
import { query } from './db.js';
import renderToday from './today.js';
import { renderActive } from './active.js';

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
