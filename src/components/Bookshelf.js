/* Bookshelf.js */

// The shelf above the desk: every journal that isn't one of the most recent few, shown as a spine.
// Clicking a spine takes that journal down onto the desk (the desk shows the most recently used).
// With many journals, a search field filters the spines by name.

import React, { useState } from 'react';
import { coverColor, spineSize } from '../utils/journals';

// Above this many shelved journals, offer search
export const SHELF_SEARCH_THRESHOLD = 10;

function Bookshelf({ journals, onTakeDown }) {
  const [search, setSearch] = useState('');
  const showSearch = journals.length > SHELF_SEARCH_THRESHOLD;
  const query = showSearch ? search.trim().toLowerCase() : '';
  const visibleJournals = query
    ? journals.filter((list) => (list.name || '').toLowerCase().includes(query))
    : journals;

  return (
    <section className="bookshelf" aria-label="Bookshelf">
      {showSearch && (
        <input
          type="search"
          className="shelf-search"
          aria-label="Search the shelf"
          placeholder="Search the shelf"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      )}

      {journals.length === 0 ? (
        <div className="shelf-empty">
          <p className="shelf-note">Older journals will rest here.</p>
        </div>
      ) : (
        <ul className="shelf-books" aria-label="Shelved journals">
          {visibleJournals.map((list) => {
            const { height, width } = spineSize(list.id);
            return (
              <li key={list.id} className="shelf-slot">
                <button
                  type="button"
                  className="spine"
                  aria-label={`Take ${list.name} down to the desk`}
                  title={list.name}
                  style={{ '--cover': coverColor(list.id), '--spine-height': `${height}px`, '--spine-width': `${width}px` }}
                  onClick={() => onTakeDown(list.id)}
                >
                  <span className="spine-title">{list.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {journals.length > 0 && visibleJournals.length === 0 && (
        <p className="shelf-note">No shelved journals match that name.</p>
      )}
    </section>
  );
}

export default Bookshelf;
