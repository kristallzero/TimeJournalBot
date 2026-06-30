import { InlineKeyboard, InputFile } from 'grammy';
import { query } from './db.js';

export function buildExportKeyboard() {
    return new InlineKeyboard()
        .text('Text (.txt)', 'export:txt')
        .text('CSV', 'export:csv')
        .text('JSON', 'export:json');
}

function getLocalDate(tz) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

async function getAllLogs(userId) {
    const { rows } = await query(
        `SELECT l.id, e.label AS event, e.emoji, l.type, l.ts, l.note
         FROM logs l
         JOIN events e ON e.id = l.event_id
         WHERE l.user_id = $1
         ORDER BY l.ts ASC`,
        [userId]
    );
    return rows.map((row) => ({
        id: row.id,
        event: row.event,
        emoji: row.emoji,
        type: row.type,
        timestamp: new Date(row.ts).toISOString(),
        note: row.note,
    }));
}

function escapeCsv(value) {
    if (value === null || value === undefined) return '';
    return `"${String(value).replaceAll('"', '""')}"`;
}

function renderCsv(logs) {
    const columns = ['id', 'event', 'emoji', 'type', 'timestamp', 'note'];
    const lines = [columns.join(',')];
    for (const log of logs) {
        lines.push(columns.map((column) => escapeCsv(log[column])).join(','));
    }
    return lines.join('\n');
}

function renderText(logs, tz) {
    if (logs.length === 0) return 'TimeJournal history\n\nNo logs.';

    const formatter = new Intl.DateTimeFormat('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: tz,
    });
    const lines = logs.map((log) => {
        const timestamp = formatter.format(new Date(log.timestamp));
        const action = log.type === 'start' ? 'started' : 'stopped';
        const note = log.note ? ` — ${log.note}` : '';
        return `${timestamp}  ${log.emoji} ${log.event} ${action}${note}`;
    });
    return `TimeJournal history\n\n${lines.join('\n')}`;
}

export async function createExportFile(userId, format, tz) {
    const date = getLocalDate(tz);
    const logs = await getAllLogs(userId);
    const content = format === 'txt'
        ? renderText(logs, tz)
        : format === 'csv'
            ? renderCsv(logs)
            : JSON.stringify(logs, null, 2);

    return new InputFile(Buffer.from(content, 'utf8'), `timejournal-${date}.${format}`);
}
