import 'dotenv/config';
import { Bot } from 'grammy';
import { upsertUser, seedDefaultEvents, getEvents } from './seed.js';
import { buildLogKeyboard, handleLogTap, buildDeleteButton, buildDeleteLogsView, deleteLog } from './logs.js';
import { buildKeyboard } from './keyboard.js';
import { durationBetween, findEventByButton, insertLog, formatTime, findActiveSession, findAllActiveSessions, formatDuration } from './log.js';
import { query } from './db.js';
import renderToday, { buildTodayKeyboard } from './today.js';
import { renderActive } from './active.js';
import { renderWeek, buildWeekKeyboard } from './week.js';
import { renderStats, buildStatsKeyboard, findEventByLabel } from './stats.js';
import { renderEvents, buildEventsKeyboard, moveEvent, addState, addEvent, editState, updateEvent, removeEvent, buildRemoveConfirmKeyboard, getEvent } from './events.js';

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

bot.command('deletelog', async (ctx) => {
    const tz = await getUserTz(ctx.from.id);
    const { text, keyboard } = await buildDeleteLogsView(ctx.from.id, tz, 0);
    return ctx.reply(text, keyboard ? { reply_markup: keyboard } : {});
});

bot.callbackQuery(/^deletelog_page:(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    const tz = await getUserTz(ctx.from.id);
    const { text, keyboard } = await buildDeleteLogsView(ctx.from.id, tz, page);
    await ctx.editMessageText(text, { reply_markup: keyboard ?? { inline_keyboard: [] } });
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^delete_log:(\d+)(?::(\d+))?$/, async (ctx) => {
    const logId = parseInt(ctx.match[1], 10);
    const page = ctx.match[2] ? parseInt(ctx.match[2], 10) : 0;
    const deleted = await deleteLog(ctx.from.id, logId);
    if (!deleted) return ctx.answerCallbackQuery({ text: 'Log already deleted.' });

    const tz = await getUserTz(ctx.from.id);
    const { text, keyboard } = await buildDeleteLogsView(ctx.from.id, tz, page);
    await ctx.editMessageText(text, { reply_markup: keyboard ?? { inline_keyboard: [] } });
    return ctx.answerCallbackQuery({ text: 'Log deleted.' });
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
    return ctx.reply(await renderToday(ctx.from.id, tz, 0), { reply_markup: buildTodayKeyboard(0) });
});

bot.callbackQuery(/^today:(-?\d+)$/, async (ctx) => {
    const offset = parseInt(ctx.match[1], 10);
    const tz = await getUserTz(ctx.from.id);
    await ctx.editMessageText(await renderToday(ctx.from.id, tz, offset), { reply_markup: buildTodayKeyboard(offset) });
    return ctx.answerCallbackQuery();
});

bot.command('stats', async (ctx) => {
    const userId = ctx.from.id;
    const arg = ctx.match?.trim();
    const tz = await getUserTz(userId);

    if (!arg) {
        const kb = await buildStatsKeyboard(userId);
        return ctx.reply('Stats for which event?', { reply_markup: kb });
    }

    const event = await findEventByLabel(userId, arg);
    if (!event) return ctx.reply(`Event "${arg}" not found.`);

    return ctx.reply(await renderStats(userId, event.id, tz));
});

bot.callbackQuery(/^stats:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    const tz = await getUserTz(ctx.from.id);
    await ctx.editMessageText(await renderStats(ctx.from.id, eventId, tz));
    return ctx.answerCallbackQuery();
});

bot.command('events', async (ctx) => {
    const { text, events } = await renderEvents(ctx.from.id);
    return ctx.reply(text, { reply_markup: buildEventsKeyboard(events) });
});

bot.callbackQuery('noop', (ctx) => ctx.answerCallbackQuery());

bot.callbackQuery('event_add', async (ctx) => {
    addState.set(ctx.from.id, { step: 'name' });
    await ctx.answerCallbackQuery();
    return ctx.reply('Enter event name:');
});

bot.callbackQuery(/^event_edit:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    editState.set(ctx.from.id, { step: 'name', eventId });
    await ctx.answerCallbackQuery();
    return ctx.reply('Enter new name:');
});

bot.callbackQuery(/^event_remove:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    const event = await getEvent(ctx.from.id, eventId);
    if (!event) return ctx.answerCallbackQuery();
    await ctx.editMessageText(
        `Are you sure you want to delete ${event.emoji} ${event.label}?`,
        { reply_markup: buildRemoveConfirmKeyboard(eventId) }
    );
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^event_remove_confirm:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    await removeEvent(ctx.from.id, eventId);
    const { text, events } = await renderEvents(ctx.from.id);
    await ctx.editMessageText(text, { reply_markup: buildEventsKeyboard(events) });
    await ctx.answerCallbackQuery();
    await ctx.reply('✅ Event deleted.', { reply_markup: await buildKeyboard(ctx.from.id) });
});

bot.callbackQuery('event_remove_cancel', async (ctx) => {
    const { text, events } = await renderEvents(ctx.from.id);
    await ctx.editMessageText(text, { reply_markup: buildEventsKeyboard(events) });
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^event_(up|down):(\d+)$/, async (ctx) => {
    const direction = ctx.match[1];
    const eventId = parseInt(ctx.match[2], 10);
    await moveEvent(ctx.from.id, eventId, direction);
    const { text, events } = await renderEvents(ctx.from.id);
    await ctx.editMessageText(text, { reply_markup: buildEventsKeyboard(events) });
    await ctx.answerCallbackQuery();
    await ctx.reply('✅ Reordered.', { reply_markup: await buildKeyboard(ctx.from.id) });
});

bot.command('week', async (ctx) => {
    const tz = await getUserTz(ctx.from.id);
    return ctx.reply(await renderWeek(ctx.from.id, tz, 0), { reply_markup: buildWeekKeyboard(0) });
});

bot.callbackQuery(/^week:(-?\d+)$/, async (ctx) => {
    const offset = parseInt(ctx.match[1], 10);
    const tz = await getUserTz(ctx.from.id);
    await ctx.editMessageText(await renderWeek(ctx.from.id, tz, offset), { reply_markup: buildWeekKeyboard(offset) });
    return ctx.answerCallbackQuery();
});

bot.on('message:text', async (ctx) => {
    const text = ctx.message.text;
    const userId = ctx.from.id;

    const addSt = addState.get(userId);
    if (addSt) {
        if (addSt.step === 'name') {
            addState.set(userId, { step: 'emoji', name: text });
            return ctx.reply('Enter an emoji:');
        }
        if (addSt.step === 'emoji') {
            addState.delete(userId);
            await addEvent(userId, addSt.name, text);
            const { text: evText, events } = await renderEvents(userId);
            await ctx.reply('✅ Event added.', { reply_markup: await buildKeyboard(userId) });
            return ctx.reply(evText, { reply_markup: buildEventsKeyboard(events) });
        }
    }

    const editSt = editState.get(userId);
    if (editSt) {
        if (editSt.step === 'name') {
            editState.set(userId, { ...editSt, step: 'emoji', name: text });
            return ctx.reply('Enter new emoji:');
        }
        if (editSt.step === 'emoji') {
            editState.delete(userId);
            await updateEvent(userId, editSt.eventId, editSt.name, text);
            const { text: evText, events } = await renderEvents(userId);
            await ctx.reply('✅ Event updated.', { reply_markup: await buildKeyboard(userId) });
            return ctx.reply(evText, { reply_markup: buildEventsKeyboard(events) });
        }
    }

    if (text === '⏱ Active') {
        const tz = await getUserTz(userId);
        return ctx.reply(await renderActive(userId, tz));
    }

    if (text === '📋 Today') {
        const tz = await getUserTz(userId);
        return ctx.reply(await renderToday(userId, tz, 0), { reply_markup: buildTodayKeyboard(0) });
    }

    if (text === '📊 Stats') {
        const kb = await buildStatsKeyboard(userId);
        return ctx.reply('Stats for which event?', { reply_markup: kb });
    }

    const event = await findEventByButton(userId, text);
    if (!event) return;

    const tz = await getUserTz(userId);

    const active = await findActiveSession(userId, event.id);
    if (!active) {
        const log = await insertLog(userId, event.id, 'start');
        return ctx.reply(`${event.emoji} ${event.label} started — ${formatTime(log.ts, tz)}`);
    } else {
        const log = await insertLog(userId, event.id, 'stop');
        const elapsed = formatDuration(durationBetween(active.ts, log.ts));
        return ctx.reply(`${event.emoji} ${event.label} stopped — ${formatTime(log.ts, tz)} (${elapsed})`);
    }
});

bot.catch((err) => {
    console.error('Bot error:', err);
});

bot.start();
console.log('Bot is running...');
