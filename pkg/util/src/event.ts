import assert from "minimalistic-assert";

/** @deprecated Use global `CustomEvent`. */
export const CustomEvent = globalThis.CustomEvent;

/**
 * Keep records on whether an event listener has been added.
 * @param target - EventTarget to override.
 * @returns Map from event type to whether listeners may exist.
 *
 * @remarks
 * This may allow `EventTarget` subclass to skip certain event generation code paths.
 * Tracking is imprecise: it does not consider `once()` and `removeEventListener()`.
 */
export function trackEventListener(target: EventTarget): Record<string, boolean> {
  const maybeHaveEventListener: Record<string, boolean> = {};
  const superAddEventListener = target.addEventListener;
  assert(superAddEventListener);
  Object.defineProperty(target, "addEventListener", {
    configurable: true,
    value(this: EventTarget, ...args: Parameters<EventTarget["addEventListener"]>): void {
      maybeHaveEventListener[args[0]] = true;
      superAddEventListener.call(this, ...args);
    },
  });
  return maybeHaveEventListener;
}
