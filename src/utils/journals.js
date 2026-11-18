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

// Lists without the onDesk field (all lists created before the library existed) stay on the desk
export const isOnDesk = (list) => list.onDesk !== false;
