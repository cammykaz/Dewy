/* journals.js */

// Shared helpers for how task lists appear as journals (desk and library).

// Muted, solid cover colors
const COVER_COLORS = ['#5f7a6b', '#4f6378', '#a0634a', '#b08d4a', '#6e5a73', '#3f4a52', '#7d8f5a', '#8a5560'];

// Small stable hash, so each journal keeps the same color, tilt, and default spot on every device
export const hashString = (text) => {
  let hash = 0;
  for (let i = 0; i < text.length; i++) hash = (hash * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(hash);
};

export const coverColor = (id) => COVER_COLORS[hashString(id) % COVER_COLORS.length];
export const coverRotation = (id) => ((hashString(id) % 7) - 3) * 0.6; // -1.8° to 1.8°

// Spines on the shelf vary a little in height and thickness, like real books
export const spineSize = (id) => {
  const hash = hashString(id);
  return { height: 134 + (hash % 29), width: 30 + (Math.floor(hash / 29) % 11) }; // 134–162px × 30–40px
};

// The system list that guest tasks sync into at login. It's found by this name, so the name is
// reserved (case-insensitive, ignoring surrounding whitespace) and the list can't be deleted.
export const DEFAULT_TASK_LIST_NAME = "Default Task List";
export const isReservedJournalName = (name) =>
  (name || '').trim().toLowerCase() === DEFAULT_TASK_LIST_NAME.toLowerCase();
