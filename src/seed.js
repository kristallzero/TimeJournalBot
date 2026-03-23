import { query } from './db.js';

const DEFAULT_EVENTS = [ 
    { slug: 'breakfast', label: 'Breakfast', emoji: '🍳', sort_order: 0 },
    { slug: 'college', label: 'College', emoji: '🚌', sort_order: 1 },
    { slug: 'gaming', label: 'Gaming', emoji: '🎮', sort_order: 2 },
    { slug: 'youtube', label: 'YouTube', emoji: '📺', sort_order: 3 },
    { slug: 'study', label: 'Study', emoji: '📖', sort_order: 4 },
    { slug: 'sleep', label: 'Sleep', emoji: '🛏', sort_order: 5 },
];

export async function getEvents(userId) {
    const { rows } = await query(
        'SELECT * FROM events WHERE user_id = $1 ORDER BY sort_order ASC',
        [userId]
    );
    return rows;
}

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
            `INSERT INTO events (user_id, slug, label, emoji, sort_order)
                         VALUES ($1, $2, $3, $4, $5)`,
            [userId, e.slug, e.label, e.emoji, e.sort_order]
        );
    }
}
