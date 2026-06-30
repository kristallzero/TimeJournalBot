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
import { backlogState, buildBacklogEventKeyboard, buildBacklogTimeReplyMarkup, findBacklogEvent, formatBacklogConfirmation, insertBacklogLog, parseBacklogCommand, parseBacklogDateTime } from './backlog.js';
import { buildExportKeyboard, createExportFile } from './export.js';
import { buildReminderEventKeyboard, buildReminderTimeReplyMarkup, buildReminderTypeKeyboard, getReminder, parseReminderTime, reminderState, removeReminder, renderReminders, saveReminder, startReminderScheduler, toggleAllReminders } from './reminders.js';

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

bot.command('backlog', async (ctx) => {
    const userId = ctx.from.id;
    const arg = ctx.match?.trim();
    const tz = await getUserTz(userId);

    addState.delete(userId);
    editState.delete(userId);
    backlogState.delete(userId);
    reminderState.delete(userId);

    if (!arg) {
        const events = await getEvents(userId);
        if (events.length === 0) return ctx.reply('No events configured. Use /events to add one.');

        backlogState.set(userId, { step: 'event' });
        return ctx.reply('What event do you want to backfill?', {
            reply_markup: buildBacklogEventKeyboard(events),
        });
    }

    const parsed = parseBacklogCommand(arg, tz);
    if (!parsed) {
        return ctx.reply('Usage: /backlog <event> <HH:MM> [YYYY-MM-DD]');
    }

    const event = await findBacklogEvent(userId, parsed.eventLabel);
    if (!event) return ctx.reply(`Event "${parsed.eventLabel}" not found.`);

    const log = await insertBacklogLog(userId, event.id, parsed.time, parsed.date, tz);
    if (!log) return ctx.reply('Backlog time must not be in the future.');
    return ctx.reply(formatBacklogConfirmation(event, log, tz));
});

bot.callbackQuery(/^backlog_event:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    const event = await getEvent(ctx.from.id, eventId);
    if (!event) return ctx.answerCallbackQuery({ text: 'Event not found.' });

    backlogState.set(ctx.from.id, { step: 'datetime', event });
    await ctx.editMessageText(
        `${event.emoji} ${event.label} selected.`,
        { reply_markup: { inline_keyboard: [] } }
    );
    await ctx.answerCallbackQuery();
    return ctx.reply('What time and date? Send HH:MM, or HH:MM YYYY-MM-DD.', {
        reply_markup: buildBacklogTimeReplyMarkup(),
    });
});

bot.command('export', (ctx) => ctx.reply('Choose an export format:', {
    reply_markup: buildExportKeyboard(),
}));

bot.callbackQuery(/^export:(txt|csv|json)$/, async (ctx) => {
    const format = ctx.match[1];
    await ctx.answerCallbackQuery();
    const tz = await getUserTz(ctx.from.id);
    const file = await createExportFile(ctx.from.id, format, tz);
    return ctx.replyWithDocument(file);
});

bot.command('reminders', async (ctx) => {
    const userId = ctx.from.id;
    addState.delete(userId);
    editState.delete(userId);
    backlogState.delete(userId);
    reminderState.delete(userId);

    const { text, keyboard } = await renderReminders(userId);
    return ctx.reply(text, { reply_markup: keyboard });
});

bot.callbackQuery('reminder_add', async (ctx) => {
    const userId = ctx.from.id;
    addState.delete(userId);
    editState.delete(userId);
    backlogState.delete(userId);
    reminderState.set(userId, { step: 'type', reminderId: null });
    await ctx.editMessageText('What kind of notification?', {
        reply_markup: buildReminderTypeKeyboard(),
    });
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^reminder_edit:(\d+)$/, async (ctx) => {
    const reminderId = parseInt(ctx.match[1], 10);
    const reminder = await getReminder(ctx.from.id, reminderId);
    if (!reminder) return ctx.answerCallbackQuery({ text: 'Reminder not found.' });

    addState.delete(ctx.from.id);
    editState.delete(ctx.from.id);
    backlogState.delete(ctx.from.id);
    reminderState.set(ctx.from.id, { step: 'type', reminderId });
    await ctx.editMessageText('What kind of notification?', {
        reply_markup: buildReminderTypeKeyboard(),
    });
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^reminder_type:(start|stop)$/, async (ctx) => {
    const state = reminderState.get(ctx.from.id);
    if (!state || state.step !== 'type') {
        return ctx.answerCallbackQuery({ text: 'Run /reminders again.' });
    }

    const events = await getEvents(ctx.from.id);
    if (events.length === 0) return ctx.answerCallbackQuery({ text: 'No events configured.' });

    reminderState.set(ctx.from.id, { ...state, step: 'event', type: ctx.match[1] });
    await ctx.editMessageText('Which event?', {
        reply_markup: buildReminderEventKeyboard(events),
    });
    return ctx.answerCallbackQuery();
});

bot.callbackQuery(/^reminder_event:(\d+)$/, async (ctx) => {
    const state = reminderState.get(ctx.from.id);
    if (!state || state.step !== 'event') {
        return ctx.answerCallbackQuery({ text: 'Run /reminders again.' });
    }

    const eventId = parseInt(ctx.match[1], 10);
    const event = await getEvent(ctx.from.id, eventId);
    if (!event) return ctx.answerCallbackQuery({ text: 'Event not found.' });

    reminderState.set(ctx.from.id, { ...state, step: 'time', event });
    await ctx.editMessageText(`${event.emoji} ${event.label} selected.`, {
        reply_markup: { inline_keyboard: [] },
    });
    await ctx.answerCallbackQuery();

    const prompt = state.type === 'start'
        ? 'What time should the daily notification appear? Send HH:MM.'
        : 'How long after the event starts should I notify you? Send HH:MM, for example 00:10 or 01:05.';
    return ctx.reply(prompt, { reply_markup: buildReminderTimeReplyMarkup(state.type) });
});

bot.callbackQuery(/^reminder_remove:(\d+)$/, async (ctx) => {
    const reminderId = parseInt(ctx.match[1], 10);
    await removeReminder(ctx.from.id, reminderId);
    const { text, keyboard } = await renderReminders(ctx.from.id);
    await ctx.editMessageText(text, { reply_markup: keyboard });
    return ctx.answerCallbackQuery({ text: 'Reminder removed.' });
});

bot.callbackQuery('reminder_toggle_all', async (ctx) => {
    await toggleAllReminders(ctx.from.id);
    const { text, keyboard } = await renderReminders(ctx.from.id);
    await ctx.editMessageText(text, { reply_markup: keyboard });
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
    backlogState.delete(ctx.from.id);
    reminderState.delete(ctx.from.id);
    addState.set(ctx.from.id, { step: 'name' });
    await ctx.answerCallbackQuery();
    return ctx.reply('Enter event name:');
});

bot.callbackQuery(/^event_edit:(\d+)$/, async (ctx) => {
    const eventId = parseInt(ctx.match[1], 10);
    backlogState.delete(ctx.from.id);
    reminderState.delete(ctx.from.id);
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

    const backlogSt = backlogState.get(userId);
    if (backlogSt) {
        if (backlogSt.step === 'event') {
            const event = await findBacklogEvent(userId, text.trim());
            if (!event) return ctx.reply(`Event "${text.trim()}" not found. Try another event name.`);

            backlogState.set(userId, { step: 'datetime', event });
            return ctx.reply('What time and date? Send HH:MM, or HH:MM YYYY-MM-DD.', {
                reply_markup: buildBacklogTimeReplyMarkup(),
            });
        }

        if (backlogSt.step === 'datetime') {
            const tz = await getUserTz(userId);
            const parsed = parseBacklogDateTime(text, tz);
            if (!parsed) return ctx.reply('Use HH:MM, or HH:MM YYYY-MM-DD.');

            const log = await insertBacklogLog(
                userId,
                backlogSt.event.id,
                parsed.time,
                parsed.date,
                tz
            );
            if (!log) return ctx.reply('Backlog time must not be in the future. Try another time.');

            backlogState.delete(userId);
            return ctx.reply(formatBacklogConfirmation(backlogSt.event, log, tz));
        }
    }

    const reminderSt = reminderState.get(userId);
    if (reminderSt?.step === 'time') {
        const timeMinutes = parseReminderTime(text, reminderSt.type);
        if (timeMinutes === null) {
            const format = reminderSt.type === 'start' ? 'HH:MM, such as 09:15' : 'HH:MM, such as 00:10 or 01:05';
            return ctx.reply(`Use ${format}.`, {
                reply_markup: buildReminderTimeReplyMarkup(reminderSt.type),
            });
        }

        await saveReminder(
            userId,
            reminderSt.event.id,
            reminderSt.type,
            timeMinutes,
            reminderSt.reminderId
        );
        reminderState.delete(userId);
        const { text: remindersText, keyboard } = await renderReminders(userId);
        await ctx.reply(reminderSt.reminderId === null ? '✅ Reminder added.' : '✅ Reminder updated.');
        return ctx.reply(remindersText, { reply_markup: keyboard });
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

startReminderScheduler(bot);
bot.start();
console.log('Bot is running...');
