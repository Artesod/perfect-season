import { useEffect, useRef, useState } from 'react';
import { useOnboardingStore, type TourId } from './onboardingStore';
import { runTour } from './runTour';
import './HelpMenu.css';

/** Header "?" menu: replay this screen's tour, open the glossary, reset tours. */
export function HelpMenu({ tourId }: { tourId: TourId | null }) {
  const openGlossary = useOnboardingStore((s) => s.openGlossary);
  const resetTours = useOnboardingStore((s) => s.resetTours);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <div className="help-menu" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost help-btn"
        aria-label="Help"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {open && (
        <div className="help-menu-list" role="menu">
          {tourId && (
            <button type="button" role="menuitem" onClick={choose(() => runTour(tourId))}>
              Tour this screen
            </button>
          )}
          <button type="button" role="menuitem" onClick={choose(() => openGlossary())}>
            Glossary
          </button>
          <button type="button" role="menuitem" onClick={choose(resetTours)}>
            Reset all tours
          </button>
        </div>
      )}
    </div>
  );
}
