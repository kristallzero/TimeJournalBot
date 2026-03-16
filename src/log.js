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

export async function findAllActiveSessions(userId) {
  const { rows } = await query(
    `SELECT e.emoji, e.label, l.ts AS started_at
     FROM logs l
     JOIN events e ON e.id = l.event_id
     WHERE l.user_id = $1 AND l.type = 'start'
       AND NOT EXISTS (
         SELECT 1 FROM logs l2
         WHERE l2.user_id = $1 AND l2.event_id = l.event_id
           AND l2.type = 'stop' AND l2.ts > l.ts
       )
     ORDER BY l.ts ASC`,
    [userId]
  );
  return rows;
}

export async function findActiveSession(userId, eventId) {
  const { rows } = await query(
    `SELECT * FROM logs l
     WHERE l.user_id = $1 AND l.event_id = $2 AND l.type = 'start'
       AND NOT EXISTS (
         SELECT 1 FROM logs l2
         WHERE l2.user_id = $1 AND l2.event_id = $2
           AND l2.type = 'stop' AND l2.ts > l.ts
       )
     ORDER BY l.ts DESC
     LIMIT 1`,
    [userId, eventId]
  );
  return rows[0] ?? null;
}

export function formatDuration(ms) {
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function formatTime(ts, tz) {
  return new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: tz,
  }).format(new Date(ts));
}
