import { query } from './db.js';

const DEFAULT_EVENTS = [
    { slug: 'woke_up', label: 'Woke up', emoji: '☀️', kind: 'instant', sort_order: 0 },
    { slug: 'breakfast', label: 'Breakfast', emoji: '🍳', kind: 'instant', sort_order: 1 },
    { slug: 'college', label: 'College', emoji: '🚌', kind: 'instant', sort_order: 2 },
    { slug: 'gaming', label: 'Gaming', emoji: '🎮', kind: 'duration', sort_order: 3 },
    { slug: 'youtube', label: 'YouTube', emoji: '📺', kind: 'duration', sort_order: 4 },
    { slug: 'study', label: 'Study', emoji: '📖', kind: 'duration', sort_order: 5 },
    { slug: 'sleep', label: 'Sleep', emoji: '🛏', kind: 'instant', sort_order: 6 },
];

export async function upsertUser(userId, username) {
    await query(
        `INSERT INTO users (user_id, username)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username ?? null]
    );
}

export async function seedDefaultEvents(userId) {
    const { rows } = await query(
        'SELECT 1 FROM events WHERE user_id = $1 LIMIT 1',
        [userId]
    );
    if (rows.length > 0) return;

    for (const e of DEFAULT_EVENTS) {
        await query(
            `INSERT INTO events (user_id, slug, label, emoji, kind, sort_order)
                         VALUES ($1, $2, $3, $4, $5, $6)`,
            [userId, e.slug, e.label, e.emoji, e.kind, e.sort_order]
        );
    }
}
