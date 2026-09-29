import { useSyncExternalStore } from "react";

const subscribe = () => () => undefined;

/** False while the server renders and during hydration, true afterwards. Lets a component read browser-only state without a mismatch. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
