import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SchoolNode } from '../../types';
import { createAcademicPreset } from '../../lib/academicDirectory';
import { AcademicPathPicker } from './AcademicPathPicker';

afterEach(cleanup);

function Harness({ roots, onPath }: { roots: SchoolNode[]; onPath: (path: SchoolNode[]) => void }) {
  const [value, setValue] = useState<string[]>([]);
  return <AcademicPathPicker roots={roots} value={value} onChange={(path) => { setValue(path.map((node) => node.id)); onPath(path); }} />;
}

describe('AcademicPathPicker', () => {
  it('distinguishes session groups from classes in a mixed dropdown', async () => {
    const user = userEvent.setup();
    const roots: SchoolNode[] = [
      { id: 'class-b', name: '2SP - B', type: 'block' },
      { id: 'morning', name: 'Morning', type: 'custom', metadata: { customFields: { grouping: 'Session' } } },
    ];
    const onPath = vi.fn();
    render(<Harness roots={roots} onPath={onPath} />);
    await user.click(screen.getByRole('button', { name: /academic unit \/ class.*select academic unit \/ class/i }));
    expect(screen.getByRole('option', { name: '2SP - B — Block / Section' })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Morning — Session' }));
    expect(onPath).toHaveBeenLastCalledWith([roots[1]]);
  });
  it('selects JHS directly through grade and section without track or strand fields', async () => {
    const user = userEvent.setup();
    const jhs = createAcademicPreset('jhs', 'RMC');
    jhs.children![0].children = [{ id: 'narra', name: 'Narra', type: 'section' }];
    const onPath = vi.fn();
    render(<Harness roots={[jhs]} onPath={onPath} />);

    await user.click(screen.getByRole('button', { name: /education unit.*select education unit/i }));
    await user.click(screen.getByRole('option', { name: /junior high school/i }));
    await user.click(screen.getByRole('button', { name: /grade level.*select grade level/i }));
    await user.click(screen.getByRole('option', { name: jhs.children![0].name }));
    await user.click(screen.getByRole('button', { name: /section.*select section/i }));
    await user.click(screen.getByRole('option', { name: /narra/i }));

    expect(screen.queryByLabelText('Track')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Legacy Strand')).not.toBeInTheDocument();
    expect(onPath).toHaveBeenLastCalledWith(expect.arrayContaining([expect.objectContaining({ id: 'narra' })]));
  });

  it('supports college program, optional major, configurable year, and block paths', async () => {
    const user = userEvent.setup();
    const higherEd = createAcademicPreset('higher_ed', 'RMC');
    const college = higherEd.children![0];
    college.name = 'College of Computing';
    college.children = [{ id: 'bsit', name: 'BS Information Technology', type: 'program', children: [
      { id: 'webdev', name: 'Web Development', type: 'major', children: [
        { id: 'year5', name: '5th Year', type: 'year_level', children: [{ id: 'block-a', name: 'Block A', type: 'block' }] },
      ] },
    ] }];
    render(<Harness roots={[higherEd]} onPath={() => {}} />);

    const selectOption = async (label: RegExp, option: RegExp) => {
      await user.click(screen.getByRole('button', { name: label }));
      await user.click(screen.getByRole('option', { name: option }));
    };
    await selectOption(/education unit.*select education unit/i, /higher education/i);
    await selectOption(/college.*select college/i, /college of computing/i);
    await selectOption(/degree program.*select degree program/i, /bs information technology/i);
    await selectOption(/major.*select major/i, /web development/i);
    await selectOption(/year level.*select year level/i, /5th year/i);
    await selectOption(/block.*select block/i, /block a/i);

    expect(screen.getByText(/higher education \/ college of computing \/ bs information technology/i)).toBeInTheDocument();
  });
});
