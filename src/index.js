import 'dotenv/config';
import { Bot } from 'grammy';
import { upsertUser, seedDefaultEvents } from './seed.js';
import { buildKeyboard } from './keyboard.js';
import { findEventByButton, insertLog, formatTime, findActiveSession, findAllActiveSessions, formatDuration } from './log.js';
import { query } from './db.js';

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

bot.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text === '⏱ Active') {
    const { rows } = await query('SELECT tz FROM users WHERE user_id = $1', [userId]);
    const tz = rows[0]?.tz ?? 'UTC';
    const sessions = await findAllActiveSessions(userId);
    if (sessions.length === 0) return ctx.reply('No active timers running.');
    const now = Date.now();
    const lines = sessions.map((s) => {
      const elapsed = formatDuration(now - new Date(s.started_at));
      const since = formatTime(s.started_at, tz);
      return `${s.emoji} ${s.label} — since ${since} (${elapsed})`;
    });
    return ctx.reply(`⏱ Active now:\n\n${lines.join('\n')}`);
  }

  if (text === '📋 Today') return; // handled by /today (next task)
  const event = await findEventByButton(userId, text);
  if (!event) return;

  const { rows } = await query('SELECT tz FROM users WHERE user_id = $1', [userId]);
  const tz = rows[0]?.tz ?? 'UTC';

  if (event.kind === 'instant') {
    const log = await insertLog(userId, event.id, 'instant');
    const time = formatTime(log.ts, tz);
    return ctx.reply(`${event.emoji} ${event.label} — logged at ${time}`);
  }

  if (event.kind === 'duration') {
    const active = await findActiveSession(userId, event.id);
    if (!active) {
      const log = await insertLog(userId, event.id, 'start');
      const time = formatTime(log.ts, tz);
      return ctx.reply(`${event.emoji} ${event.label} started — ${time}`);
    } else {
      const log = await insertLog(userId, event.id, 'stop');
      const elapsed = formatDuration(new Date(log.ts) - new Date(active.ts));
      const time = formatTime(log.ts, tz);
      return ctx.reply(`${event.emoji} ${event.label} stopped — ${time} (${elapsed})`);
    }
  }
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
console.log('Bot is running...');
