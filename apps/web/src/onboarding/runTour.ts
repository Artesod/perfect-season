import { driver, type Driver, type DriveStep } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useOnboardingStore, type TourId } from './onboardingStore';
import { TOURS, type TourStep } from './tours';
import './tour.css';

interface ActiveTour {
  tour: Driver;
  /** Tear down without marking seen (screen unmounted, StrictMode remount). */
  stopSilently: () => void;
}

let active: ActiveTour | null = null;

const selectorFor = (target: string) => `[data-tour="${target}"]`;

/** Steps whose target element is currently rendered. */
export function presentSteps(steps: readonly TourStep[], root: ParentNode = document): TourStep[] {
  return steps.filter((step) => root.querySelector(selectorFor(step.target)) !== null);
}

function skipButton(className: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Start a screen's tour. Finishing, closing, or skipping it marks it seen.
 * Returns false (and marks it seen) when none of its targets are on screen.
 */
export function runTour(id: TourId): boolean {
  stopTour();
  const { markSeen, skipAllTours } = useOnboardingStore.getState();
  const steps = presentSteps(TOURS[id]);
  if (steps.length === 0) {
    markSeen(id);
    return false;
  }

  let silent = false;
  const tour = driver({
    showProgress: true,
    popoverClass: 'ps-tour',
    nextBtnText: 'Next',
    prevBtnText: 'Back',
    doneBtnText: 'Done',
    steps: steps.map(
      (step): DriveStep => ({
        element: selectorFor(step.target),
        popover: { title: step.title, description: step.body, side: step.side },
      }),
    ),
    onPopoverRender: (popover) => {
      const row = document.createElement('div');
      row.className = 'ps-tour-skips';
      row.append(
        skipButton('ps-tour-skip', 'Skip tour', () => tour.destroy()),
        skipButton('ps-tour-skip-all', 'Skip all tours', () => {
          skipAllTours();
          tour.destroy();
        }),
      );
      popover.footer.before(row);
    },
    onDestroyed: () => {
      if (active?.tour === tour) active = null;
      if (!silent) markSeen(id);
    },
  });
  active = {
    tour,
    stopSilently: () => {
      silent = true;
      tour.destroy();
    },
  };
  tour.drive();
  return true;
}

/** Tear down the running tour without marking it seen (screen unmounted). */
export function stopTour(): void {
  const current = active;
  active = null;
  current?.stopSilently();
}
