import 'dotenv/config';
import { Bot } from 'grammy';

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not set in .env');
  process.exit(1);
}

const bot = new Bot(token);

bot.command('start', (ctx) => {
  return ctx.reply(
    '🕐 TimeJournalBot\n\nI\'ll help you log timestamps for your daily activities.\n\nTap /log to record an event.\nConfigure your events with /events.'
  );
});

bot.catch((err) => {
  console.error('Bot error:', err);
});

bot.start();
console.log('Bot is running...');
