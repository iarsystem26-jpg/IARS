/** Format stored decimal hours as hours and minutes, preserving partial minutes. */
export function formatHourDuration(hours: number): string {
  const totalMinutes = Math.round(Math.abs(hours) * 60 * 1_000_000) / 1_000_000;
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = Math.round((totalMinutes % 60) * 1_000_000) / 1_000_000;
  const parts: string[] = [];
  if (wholeHours) parts.push(`${wholeHours} ${wholeHours === 1 ? 'hour' : 'hours'}`);
  if (minutes || !wholeHours) parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  return `${hours < 0 && totalMinutes > 0 ? '-' : ''}${parts.join(' ')}`;
}
