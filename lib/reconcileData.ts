/** Keep unchanged JSON data references so background updates do not reset UI effects. */
export function reconcileData<T>(previous: T, incoming: T): T {
  if (Object.is(previous, incoming)) return previous;
  if (!previous || !incoming || typeof previous !== 'object' || typeof incoming !== 'object'
    || Array.isArray(previous) !== Array.isArray(incoming)) return incoming;
  const before = previous as Record<string, unknown>;
  const after = incoming as Record<string, unknown>;
  const keys = Object.keys(after);
  let unchanged = Object.keys(before).length === keys.length;
  const result: Record<string, unknown> = Array.isArray(incoming) ? [] as unknown as Record<string, unknown> : { ...after };
  for (const key of keys) {
    const exists = Object.prototype.hasOwnProperty.call(before, key);
    result[key] = exists ? reconcileData(before[key], after[key]) : after[key];
    if (!exists || !Object.is(result[key], before[key])) unchanged = false;
  }
  return unchanged ? previous : result as T;
}
