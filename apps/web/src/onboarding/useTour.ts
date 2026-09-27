import { useEffect } from 'react';
import { shouldAutoStart, type TourId } from './onboardingStore';
import { runTour, stopTour } from './runTour';

/** True while any hand-rolled modal (event card, player info, glossary…) is open. */
export function isModalOpen(root: ParentNode = document): boolean {
  return root.querySelector('.modal-backdrop') !== null;
}

/**
 * Auto-start a screen's tour the first time the screen appears. `ready` lets
 * the screen hold the tour back (e.g. while the draft reel spins); an open
 * modal also holds it until the modal closes.
 */
export function useTour(id: TourId, ready = true): void {
  useEffect(() => {
    if (!ready || !shouldAutoStart(id)) return;

    let observer: MutationObserver | null = null;
    const tryStart = () => {
      if (isModalOpen()) {
        if (!observer) {
          observer = new MutationObserver(tryStart);
          observer.observe(document.body, { childList: true, subtree: true });
        }
        return;
      }
      observer?.disconnect();
      observer = null;
      if (shouldAutoStart(id)) runTour(id);
    };
    const frame = requestAnimationFrame(tryStart);

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      // Silent teardown: StrictMode's dev double-mount must not mark it seen.
      stopTour();
    };
  }, [id, ready]);
}
