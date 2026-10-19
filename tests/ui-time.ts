import { fireEvent, screen } from '@testing-library/react';

export function timeControls(label: string) {
  return {
    hour: screen.getByLabelText(`${label} hour`) as HTMLSelectElement,
    minute: screen.getByLabelText(`${label} minute`) as HTMLSelectElement,
    period: screen.getByLabelText(`${label} AM/PM`) as HTMLSelectElement,
  };
}

export function changeTime(label: string, value: string) {
  const [hour, minute] = value.split(':');
  const controls = timeControls(label);
  fireEvent.change(controls.hour, { target: { value: String(Number(hour) % 12 || 12) } });
  fireEvent.change(controls.minute, { target: { value: minute } });
  fireEvent.change(controls.period, { target: { value: Number(hour) >= 12 ? 'PM' : 'AM' } });
}

export function timeValue(label: string) {
  const { hour, minute, period } = timeControls(label);
  if (!hour.value || !minute.value) return '';
  return `${String(Number(hour.value) % 12 + (period.value === 'PM' ? 12 : 0)).padStart(2, '0')}:${minute.value}`;
}
