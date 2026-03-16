import { findAllActiveSessions, formatDuration, formatTime } from './log.js';

export async function renderActive(userId, tz) {
    const sessions = await findAllActiveSessions(userId);
    if (sessions.length === 0) return 'No active timers running.';
    const now = Date.now();
    const lines = sessions.map((s) => {
        const elapsed = formatDuration(now - new Date(s.started_at));
        const since = formatTime(s.started_at, tz);
        return `${s.emoji} ${s.label} — since ${since} (${elapsed})`;
    });
    return `⏱ Active now:\n\n${lines.join('\n')}`;
}