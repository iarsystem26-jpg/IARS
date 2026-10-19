import { fireEvent, screen } from '@testing-library/react';

export function changeField(label: string | RegExp, value: string) {
  const control = screen.getByLabelText(label);
  if (control instanceof HTMLButtonElement) {
    fireEvent.click(control);
    const option = screen.getAllByRole('option').find(item => (item as HTMLButtonElement).value === value);
    if (!option) throw new Error(`No option with value ${value} in ${label}`);
    fireEvent.click(option);
  } else {
    fireEvent.change(control, { target: { value } });
  }
}
