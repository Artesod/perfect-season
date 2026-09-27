import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { GLOSSARY, type TermId } from './glossary';
import { useOnboardingStore } from './onboardingStore';
import './Term.css';

const EDGE_GAP = 8;
const TRIGGER_GAP = 6;
/** Grace period so the pointer can cross the gap from the term to its popover. */
const CLOSE_DELAY_MS = 120;

/**
 * Jargon with an inline definition: hover, focus, or tap to read it.
 * Renders a <button>, so never place it inside another button or a <label>.
 *
 * The popover is portaled to <body> with fixed positioning: animated cards
 * and table cells form their own stacking contexts and would otherwise
 * cover or clip it.
 */
export function Term({ id, children }: { id: TermId; children?: ReactNode }) {
  const entry = GLOSSARY[id];
  const openGlossary = useOnboardingStore((s) => s.openGlossary);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const popoverId = useId();

  const show = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    window.clearTimeout(closeTimer.current);
    setOpen(false);
  };
  const hideSoon = () => {
    window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  // Place below the term (above if there is no room), kept inside the viewport.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !popoverRef.current) {
      setPosition(null);
      return;
    }
    const trigger = triggerRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    const maxLeft = window.innerWidth - popover.width - EDGE_GAP;
    const left = Math.max(EDGE_GAP, Math.min(trigger.left, maxLeft));
    const below = trigger.bottom + TRIGGER_GAP;
    const fitsBelow = below + popover.height <= window.innerHeight - EDGE_GAP;
    const top = fitsBelow ? below : Math.max(EDGE_GAP, trigger.top - TRIGGER_GAP - popover.height);
    setPosition({ top, left });
  }, [open]);

  // Fixed positioning would drift from the term on scroll or resize; close instead.
  useEffect(() => {
    if (!open) return;
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    return () => {
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
    };
  }, [open]);

  return (
    <span
      className="term"
      onMouseEnter={show}
      onMouseLeave={hideSoon}
      onBlur={(e) => {
        const next = e.relatedTarget as Node | null;
        if (!e.currentTarget.contains(next) && !popoverRef.current?.contains(next)) hide();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') hide();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="term-trigger"
        aria-expanded={open}
        aria-describedby={open ? popoverId : undefined}
        onFocus={show}
        onClick={show}
      >
        {children ?? entry.label}
      </button>
      {open &&
        createPortal(
          // React events bubble through the portal to the wrapper span above,
          // so hovering the popover keeps it open and Esc still closes it.
          <span
            ref={popoverRef}
            id={popoverId}
            role="tooltip"
            className="term-popover"
            style={
              position
                ? { top: `${position.top}px`, left: `${position.left}px` }
                : { top: '0px', left: '0px', visibility: 'hidden' }
            }
          >
            <strong className="term-popover-title">{entry.label}</strong>
            <span>{entry.short}</span>
            <button
              type="button"
              className="term-more"
              onClick={() => {
                hide();
                openGlossary(id);
              }}
            >
              More in glossary
            </button>
          </span>,
          document.body,
        )}
    </span>
  );
}
