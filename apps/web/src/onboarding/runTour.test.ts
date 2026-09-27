import type { Config } from 'driver.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from './onboardingStore';
import { presentSteps, runTour, stopTour } from './runTour';
import { TOURS } from './tours';

const mock = vi.hoisted(() => ({
  configs: [] as Config[],
  drive: vi.fn(),
  /** driver.js skips onDestroyed if destroyed before the first step finishes animating. */
  firesOnDestroyed: true,
}));

// jsdom has no layout (and no scrollIntoView), so the real driver.js cannot
// run here. The fake keeps its config and fires onDestroyed like the real one.
vi.mock('driver.js', () => ({
  driver: (config: Config) => {
    mock.configs.push(config);
    return {
      drive: mock.drive,
      destroy: () => {
        if (mock.firesOnDestroyed) (config.onDestroyed as (() => void) | undefined)?.();
      },
    };
  },
}));

function addTargets(...targets: string[]) {
  for (const target of targets) {
    const el = document.createElement('div');
    el.dataset.tour = target;
    document.body.appendChild(el);
  }
}

function lastConfig(): Config {
  return mock.configs[mock.configs.length - 1];
}

beforeEach(() => {
  stopTour();
  mock.configs.length = 0;
  mock.drive.mockClear();
  mock.firesOnDestroyed = true;
  useOnboardingStore.setState({ seen: {}, skipAll: false });
});

describe('presentSteps', () => {
  it('drops steps whose target is not on screen', () => {
    addTargets('home-hero', 'home-start');
    expect(presentSteps(TOURS.home).map((s) => s.target)).toEqual(['home-hero', 'home-start']);
  });
});

describe('runTour', () => {
  it('marks the tour seen without an overlay when no target exists', () => {
    expect(runTour('home')).toBe(false);
    expect(mock.drive).not.toHaveBeenCalled();
    expect(useOnboardingStore.getState().seen.home).toBe(true);
  });

  it('drives only the steps present on screen', () => {
    addTargets('home-hero', 'home-start');
    expect(runTour('home')).toBe(true);
    expect(mock.drive).toHaveBeenCalledOnce();
    expect(lastConfig().steps!.map((s) => s.element)).toEqual([
      '[data-tour="home-hero"]',
      '[data-tour="home-start"]',
    ]);
  });

  it('marks the tour seen when the user finishes or closes it', () => {
    addTargets('home-hero');
    runTour('home');
    (lastConfig().onDestroyed as () => void)();
    expect(useOnboardingStore.getState().seen.home).toBe(true);
  });

  it('stopTour ends the tour without marking it seen', () => {
    addTargets('home-hero');
    runTour('home');
    stopTour();
    expect(useOnboardingStore.getState().seen.home).toBeUndefined();
  });

  it('adds Skip tour and Skip all tours buttons to each popover', () => {
    addTargets('home-hero');
    runTour('home');
    const wrapper = document.createElement('div');
    const footer = document.createElement('div');
    wrapper.appendChild(footer);
    const render = lastConfig().onPopoverRender as unknown as (popover: {
      footer: HTMLElement;
    }) => void;
    render({ footer });

    const skipAll = wrapper.querySelector<HTMLButtonElement>('.ps-tour-skip-all')!;
    expect(wrapper.querySelector('.ps-tour-skip')).toHaveTextContent('Skip tour');
    skipAll.click();
    expect(useOnboardingStore.getState().skipAll).toBe(true);
    expect(useOnboardingStore.getState().seen.home).toBe(true);
  });
  it('keeps highlighted elements unclickable so a click cannot tear the tour down', () => {
    addTargets('home-hero');
    runTour('home');
    expect(lastConfig().disableActiveInteraction).toBe(true);
  });

  it('marks the tour seen when Skip tour is pressed before the first step settles', () => {
    mock.firesOnDestroyed = false;
    addTargets('home-hero');
    runTour('home');
    const wrapper = document.createElement('div');
    const footer = document.createElement('div');
    wrapper.appendChild(footer);
    const render = lastConfig().onPopoverRender as unknown as (popover: {
      footer: HTMLElement;
    }) => void;
    render({ footer });
    wrapper.querySelector<HTMLButtonElement>('.ps-tour-skip')!.click();
    expect(useOnboardingStore.getState().seen.home).toBe(true);
  });

  it('marks the tour seen when closed with Esc, the close button, or the overlay', () => {
    mock.firesOnDestroyed = false;
    addTargets('home-hero');
    runTour('home');
    (lastConfig().onDestroyStarted as unknown as () => void)();
    expect(useOnboardingStore.getState().seen.home).toBe(true);
  });
});
