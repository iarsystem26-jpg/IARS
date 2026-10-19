import { Children, isValidElement, type ReactNode, type SelectHTMLAttributes } from 'react';
import CustomSelect, { type Option } from './CustomSelect';

type Props = Pick<SelectHTMLAttributes<HTMLSelectElement>, 'aria-label' | 'aria-describedby' | 'aria-invalid' | 'disabled'> & {
  value: string | number;
  onChange: (value: string) => void;
  children: ReactNode;
  className?: string;
};

/** Lets option-based forms reuse the app's searchable, keyboard-accessible select. */
export function SelectField({ children, value, onChange, className = '', ...props }: Props) {
  const options = Children.toArray(children).flatMap((child): Option[] => {
    if (!isValidElement<{ value?: string | number; children?: ReactNode }>(child) || child.type !== 'option') return [];
    const label = Children.toArray(child.props.children).join('');
    return [{ value: String(child.props.value ?? label), label }];
  });
  return <CustomSelect combobox ariaLabel={props['aria-label']} describedBy={props['aria-describedby']}
    invalid={props['aria-invalid'] === true || props['aria-invalid'] === 'true'} disabled={props.disabled}
    className={className} value={String(value)} options={options} onChange={next => onChange(next as string)} />;
}
