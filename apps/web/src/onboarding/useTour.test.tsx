import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOnboardingStore } from './onboardingStore';
import { runTour, stopTour } from './runTour';
import { useTour } from './useTour';

vi.mock('./runTour', () => ({ runTour: vi.fn(() => true), stopTour: vi.fn() }));

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

beforeEach(() => {
  vi.mocked(runTour).mockClear();
  vi.mocked(stopTour).mockClear();
  useOnboardingStore.setState({ seen: {}, skipAll: false });
});

describe('useTour', () => {
  it('starts an unseen tour after the first paint', async () => {
    renderHook(() => useTour('home'));
    await waitFor(() => expect(runTour).toHaveBeenCalledWith('home'));
  });

  it('does not start a tour that was already seen', async () => {
    useOnboardingStore.setState({ seen: { home: true } });
    renderHook(() => useTour('home'));
    await nextFrame();
    await nextFrame();
    expect(runTour).not.toHaveBeenCalled();
  });

  it('does not start any tour after Skip all tours', async () => {
    useOnboardingStore.setState({ skipAll: true });
    renderHook(() => useTour('draft'));
    await nextFrame();
    await nextFrame();
    expect(runTour).not.toHaveBeenCalled();
  });

  it('waits until the screen says it is ready', async () => {
    const { rerender } = renderHook(({ ready }) => useTour('draft', ready), {
      initialProps: { ready: false },
    });
    await nextFrame();
    await nextFrame();
    expect(runTour).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(runTour).toHaveBeenCalledWith('draft'));
  });

  it('waits for an open modal to close before starting', async () => {
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    document.body.appendChild(backdrop);

    renderHook(() => useTour('season'));
    await nextFrame();
    await nextFrame();
    expect(runTour).not.toHaveBeenCalled();

    backdrop.remove();
    await waitFor(() => expect(runTour).toHaveBeenCalledWith('season'));
  });

  it('stops the tour when the screen unmounts', () => {
    const { unmount } = renderHook(() => useTour('home'));
    unmount();
    expect(stopTour).toHaveBeenCalled();
  });
});
