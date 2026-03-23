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

// userId -> { step: 'name' | 'emoji', name?: string }
export const addState = new Map();

// userId -> { step: 'name' | 'emoji', eventId, name?: string }
export const editState = new Map();

export async function updateEvent(userId, eventId, label, emoji) {
    const slug = label.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
    await query(
        'UPDATE events SET label = $1, emoji = $2, slug = $3 WHERE id = $4 AND user_id = $5',
        [label, emoji, slug, eventId, userId]
    );
}

export async function addEvent(userId, label, emoji) {
    const slug = label.toLowerCase().replace(/\s+/g, '_').replace(/[^\w]/g, '');
    const { rows } = await query(
        'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM events WHERE user_id = $1',
        [userId]
    );
    const sortOrder = rows[0].next;
    await query(
        'INSERT INTO events (user_id, slug, label, emoji, sort_order) VALUES ($1, $2, $3, $4, $5)',
        [userId, slug, label, emoji, sortOrder]
    );
}

export async function getEvent(userId, eventId) {
    const { rows } = await query(
        'SELECT id, emoji, label FROM events WHERE id = $1 AND user_id = $2',
        [eventId, userId]
    );
    return rows[0] ?? null;
}

export function buildRemoveConfirmKeyboard(eventId) {
    return new InlineKeyboard()
        .text('✅ Yes, delete', `event_remove_confirm:${eventId}`)
        .text('❌ No', 'event_remove_cancel');
}

export async function removeEvent(userId, eventId) {
    await query('DELETE FROM logs WHERE event_id = $1 AND user_id = $2', [eventId, userId]);
    await query('DELETE FROM events WHERE id = $1 AND user_id = $2', [eventId, userId]);
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
