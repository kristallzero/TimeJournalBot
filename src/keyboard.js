import { Keyboard } from 'grammy';
import { query } from './db.js';

export async function getEvents(userId) {
  const { rows } = await query(
    'SELECT emoji, label FROM events WHERE user_id = $1 ORDER BY sort_order',
    [userId]
  );
  return rows;
}

export async function buildKeyboard(userId) {
  const events = await getEvents(userId);
  const kb = new Keyboard();

  // lay events out in rows of 3
  events.forEach((e, i) => {
    kb.text(`${e.emoji} ${e.label}`);
    if ((i + 1) % 3 === 0) kb.row();
  });

  // utility row
  if (events.length % 3 !== 0) kb.row();
  kb.text('⏱ Active').text('📋 Today');

  return kb.resized().persistent();
}
