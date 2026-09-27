import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { GLOSSARY, type TermId } from './glossary';
import { useOnboardingStore } from './onboardingStore';
import './Term.css';

const EDGE_GAP = 8;

/**
 * Jargon with an inline definition: hover, focus, or tap to read it.
 * Renders a <button>, so never place it inside another button or a <label>.
 */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const entry = GLOSSARY[id];
  const openGlossary = useOnboardingStore((s) => s.openGlossary);
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const popoverId = useId();

  // Keep the popover on screen on narrow phones.
  useLayoutEffect(() => {
    if (!open || !popoverRef.current) {
      setShift(0);
      return;
    }
    const rect = popoverRef.current.getBoundingClientRect();
    const overflow = rect.right - (window.innerWidth - EDGE_GAP);
    setShift(overflow > 0 ? -Math.min(overflow, Math.max(0, rect.left - EDGE_GAP)) : 0);
  }, [open]);

  return (
    <span
      className="term"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <button
        type="button"
        className="term-trigger"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
      >
        {children ?? entry.label}
      </button>
      {open && (
        <span
          ref={popoverRef}
          id={popoverId}
          role="tooltip"
          className="term-popover"
          style={{ left: `${shift}px` }}
        >
          <strong className="term-popover-title">{entry.label}</strong>
          <span>{entry.short}</span>
          <button
            type="button"
            className="term-more"
            onClick={() => {
              setOpen(false);
              openGlossary(id);
            }}
          >
            More in glossary
          </button>
        </span>
      )}
    </span>
  );
}
