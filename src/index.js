import 'dotenv/config';
import { Bot } from 'grammy';
import { upsertUser, seedDefaultEvents } from './seed.js';
import { buildKeyboard } from './keyboard.js';

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

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
console.log('Bot is running...');
