import { InlineKeyboard } from 'grammy';
import { query } from './db.js';

export async function getEventsForManage(userId) {
    const { rows } = await query(
        'SELECT id, emoji, label, sort_order FROM events WHERE user_id = $1 ORDER BY sort_order ASC',
        [userId]
    );
    return rows;
}

export function buildEventsKeyboard(events) {
    const kb = new InlineKeyboard();
    events.forEach((e, i) => {
        kb.text(`${e.emoji} ${e.label}`, `noop`)
            .text('✏️', `event_edit:${e.id}`)
            .text('🗑', `event_remove:${e.id}`)
            .text('⬆️', i > 0 ? `event_up:${e.id}` : `noop`)
            .text('⬇️', i < events.length - 1 ? `event_down:${e.id}` : `noop`)
        kb.row();
    });
    kb.text('➕ Add event', 'event_add');
    return kb;
}

export async function renderEvents(userId) {
    const events = await getEventsForManage(userId);
    if (events.length === 0) return { text: 'You have no events yet.', events };
    const lines = events.map((e, i) => `${i + 1}. ${e.emoji} ${e.label}`);
    return { text: `📋 Your events:\n\n${lines.join('\n')}`, events };
}

export async function moveEvent(userId, eventId, direction) {
    const events = await getEventsForManage(userId);
    const idx = events.findIndex((e) => e.id === eventId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= events.length) return;

    const a = events[idx];
    const b = events[swapIdx];
    await query('UPDATE events SET sort_order = $1 WHERE id = $2', [b.sort_order, a.id]);
    await query('UPDATE events SET sort_order = $1 WHERE id = $2', [a.sort_order, b.id]);
}
