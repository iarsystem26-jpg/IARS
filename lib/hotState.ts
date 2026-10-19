type HotContext = {
  data: Record<string, unknown>;
  dispose: (callback: (data: Record<string, unknown>) => void) => void;
};

// Share the same object with callbacks that were created before a hot update.
// This is memory only; logout still clears it through resetData.
export function hotState<T>(hot: HotContext | undefined, create: () => T): T {
  if (!hot?.data) return create();
  const state = (hot.data.state as T | undefined) ?? create();
  hot.dispose(data => { data.state = state; });
  return state;
}
