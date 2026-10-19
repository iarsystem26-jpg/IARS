// Shared by the calendar and its loading layout; these helpers need no backend.
export const calendarDay = (stamp: string | number = Date.now()) =>
  new Date((typeof stamp === 'string' ? Date.parse(stamp) : stamp) + 8 * 3600000).toISOString().slice(0, 10);

export function monthBounds(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error('Choose a valid month.');
  const [year, number] = month.split('-').map(Number);
  return { first_day: `${month}-01`, last_day: `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}` };
}

export function monthDays(month: string): (string | null)[] {
  const { first_day, last_day } = monthBounds(month);
  return [
    ...Array(new Date(`${first_day}T00:00:00Z`).getUTCDay()).fill(null),
    ...Array.from({ length: Number(last_day.slice(-2)) }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`),
  ];
}

export function shiftMonth(month: string, amount: number) {
  const date = new Date(`${monthBounds(month).first_day}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + amount);
  return date.toISOString().slice(0, 7);
}
