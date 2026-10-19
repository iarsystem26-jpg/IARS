import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DirectoryNodeModal } from './DirectoryNodeModal';
import { PresetPickerModal } from './PresetPickerModal';

afterEach(cleanup);

describe('DirectoryNodeModal', () => {
  it('saves a custom name, semantic type, and selection behavior', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<DirectoryNodeModal open parent={{ id: 'parent', name: 'Higher Education', type: 'education_unit' }} onClose={() => {}} onSave={onSave} />);

    await user.type(screen.getByLabelText(/unit designation/i), 'College of Computing');
    await user.click(screen.getByRole('button', { name: /semantic type/i }));
    await user.click(screen.getByRole('option', { name: /college.*suggested/i }));
    await user.type(screen.getByLabelText(/short code/i), 'CCE');
    await user.click(screen.getByRole('button', { name: /establish unit/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'College of Computing', type: 'college', metadata: expect.objectContaining({ shortCode: 'CCE' }),
    }));
  });

  it('allows an institution to override which child unit types are permitted', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<DirectoryNodeModal open parent={{ id: 'parent', name: 'Campus', type: 'campus' }} onClose={() => {}} onSave={onSave} />);
    const dialog = screen.getByRole('dialog', { name: /establish unit/i });

    await user.type(within(dialog).getByLabelText(/unit designation/i), 'Flexible Division');
    await user.click(within(dialog).getByRole('checkbox', { name: /customize allowed child types/i }));
    await user.click(within(dialog).getByRole('checkbox', { name: /^degree program$/i }));
    await user.click(within(dialog).getByRole('checkbox', { name: /^custom unit$/i }));
    await user.click(within(dialog).getByRole('button', { name: /establish unit/i }));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ allowedChildTypes: ['program', 'custom'] }),
    }));
  });
});

describe('PresetPickerModal', () => {
  it('creates the selected standards-aligned editable preset', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(<PresetPickerModal open campusName="RMC" onClose={() => {}} onApply={onApply} />);
    await user.click(screen.getByRole('button', { name: /use strengthened shs/i }));
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Strengthened Senior High School', metadata: expect.objectContaining({ curriculumCode: 'strengthened_shs' }),
    }));
  });
});
