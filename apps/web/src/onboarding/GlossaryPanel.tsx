import { useEffect, useState } from 'react';
import '../components/EventCardModal.css';
import { GLOSSARY, searchGlossary } from './glossary';
import { useOnboardingStore } from './onboardingStore';
import './GlossaryPanel.css';

/** Searchable list of every term. Opened from the help menu or a Term popover. */
export function GlossaryPanel() {
  const open = useOnboardingStore((s) => s.glossaryOpen);
  return open ? <GlossaryDialog /> : null;
}

function GlossaryDialog() {
  const focus = useOnboardingStore((s) => s.glossaryFocus);
  const close = useOnboardingStore((s) => s.closeGlossary);
  const [query, setQuery] = useState('');
  const results = searchGlossary(query);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  useEffect(() => {
    if (focus) document.getElementById(`glossary-${focus}`)?.scrollIntoView?.({ block: 'center' });
  }, [focus]);

  return (
    <div className="modal-backdrop glossary-backdrop" onClick={close}>
      <div
        className="modal glossary-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Glossary"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glossary-head">
          <h3>Glossary</h3>
          <button type="button" className="btn btn-ghost btn-small" onClick={close}>
            Close
          </button>
        </div>
        <input
          type="search"
          className="glossary-search"
          placeholder="Search terms"
          aria-label="Search glossary"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {results.length === 0 ? (
          <p className="muted">No terms match “{query}”.</p>
        ) : (
          <dl className="glossary-list">
            {results.map((id) => {
              const entry = GLOSSARY[id];
              return (
                <div
                  key={id}
                  id={`glossary-${id}`}
                  className={`glossary-item ${id === focus ? 'focused' : ''}`}
                >
                  <dt>
                    {entry.label}
                    <span className="glossary-group">{entry.group}</span>
                  </dt>
                  <dd>
                    {entry.short}
                    {entry.long && <span className="glossary-long"> {entry.long}</span>}
                  </dd>
                </div>
              );
            })}
          </dl>
        )}
      </div>
    </div>
  );
}
