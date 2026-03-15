import { query } from './db.js';

export async function findEventByButton(userId, buttonText) {
  const { rows } = await query(
    `SELECT * FROM events
     WHERE user_id = $1 AND emoji || ' ' || label = $2`,
    [userId, buttonText]
  );
  return rows[0] ?? null;
}

export async function insertLog(userId, eventId, type) {
  const { rows } = await query(
    `INSERT INTO logs (user_id, event_id, type)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [userId, eventId, type]
  );
  return rows[0];
}

export function formatTime(ts, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(ts));
}
