/* taskListSort.js */

// Shared ordering helpers for task lists (dropdown and desk).

// Firestore returns Timestamps; local state holds Dates. Missing values sort last.
export const toMillis = (value) => {
    if (typeof value?.toMillis === 'function') return value.toMillis();
    if (value instanceof Date) return value.getTime();
    return 0;
};

// Most recent planning activity first. Lists with no activity yet (new or older lists) use their creation time.
export const byMostRecentActivity = (a, b) =>
    toMillis(b.lastActivityAt ?? b.createdAt) - toMillis(a.lastActivityAt ?? a.createdAt) ||
    (a.name || '').localeCompare(b.name || '');

const lastUsedMillis = (list) =>
    Math.max(toMillis(list.lastActivityAt ?? list.createdAt), toMillis(list.lastPickedUpAt));

// Most recently used first (the desk's order): picked up from the shelf, opened, or planned in.
export const byMostRecentUse = (a, b) =>
    lastUsedMillis(b) - lastUsedMillis(a) || (a.name || '').localeCompare(b.name || '');
