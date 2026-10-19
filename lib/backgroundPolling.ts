/** Spread background traffic; explicit actions and Realtime refresh immediately. */
export function backgroundPollDelay(role: string | undefined, scanner: boolean, failures: number, random = Math.random()) {
  const base = scanner ? 15_000 : role && role !== 'student' ? 45_000 : 120_000;
  const backedOff = Math.min(300_000, base * 2 ** Math.min(Math.max(failures, 0), 5));
  return Math.round(backedOff * (1 + Math.min(1, Math.max(0, random)) * 0.2));
}
