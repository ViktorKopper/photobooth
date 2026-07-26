import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineRoutes, go } from './navigation.js';
import { requestRender, setRenderer } from './store.js';

describe('navigation', () => {
  beforeEach(() => {
    // Both registries are module-level singletons, matching how the real app
    // uses them: filled once, at startup, by app.js.
    defineRoutes({
      landing: vi.fn(),
      roleGate: vi.fn(),
      joinByCode: vi.fn(),
      locationGate: vi.fn(),
      roomShell: vi.fn()
    });
  });

  it('calls whatever app.js registered under that name', () => {
    const landing = vi.fn();
    defineRoutes({ landing });
    go.landing();
    expect(landing).toHaveBeenCalled();
  });

  it('passes arguments through', () => {
    const roleGate = vi.fn();
    defineRoutes({ roleGate });
    go.roleGate('join');
    expect(roleGate).toHaveBeenCalledWith('join');
  });

  it('returns what the screen returned', () => {
    defineRoutes({ landing: () => 'rendered' });
    expect(go.landing()).toBe('rendered');
  });

  it('replaces a route rather than stacking them', () => {
    const first = vi.fn();
    const second = vi.fn();
    defineRoutes({ landing: first });
    defineRoutes({ landing: second });

    go.landing();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('leaves other routes alone when one is redefined', () => {
    const roomShell = vi.fn();
    defineRoutes({ roomShell });
    defineRoutes({ landing: vi.fn() });

    go.roomShell();
    expect(roomShell).toHaveBeenCalled();
  });

  it('names the missing route when nothing is registered', async () => {
    // A fresh module instance, so the registry is genuinely empty. A silent
    // no-op here would strand someone on a loading screen with no clue why,
    // so this is deliberately loud.
    vi.resetModules();
    const { go: freshGo } = await import('./navigation.js');

    expect(() => freshGo.landing()).toThrow(/landing/);
  });
});

describe('the render seam', () => {
  it('does nothing before a renderer is registered', () => {
    setRenderer(null);
    // A late timer or a resolved fetch firing after the person left the booth
    // should quietly do nothing rather than throw into a dead screen.
    expect(() => requestRender()).not.toThrow();
  });

  it('calls the registered renderer', () => {
    const render = vi.fn();
    setRenderer(render);
    requestRender();
    requestRender();
    expect(render).toHaveBeenCalledTimes(2);
  });

  it('swaps the renderer rather than adding another', () => {
    const first = vi.fn();
    const second = vi.fn();
    setRenderer(first);
    setRenderer(second);
    requestRender();

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
    setRenderer(null);
  });
});
