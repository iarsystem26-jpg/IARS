import { SchoolNode } from '../../types';
import { getAcademicNodeLabel } from '../../lib/academicDirectory';
import CustomSelect from '../ui/CustomSelect';

interface AcademicPathPickerProps {
  roots: SchoolNode[];
  value: string[];
  onChange: (path: SchoolNode[]) => void;
  purpose?: 'registration' | 'events' | 'any';
  includeArchived?: boolean;
  className?: string;
  allowParentSelection?: boolean;
  disabled?: boolean;
}

const visibleNodes = (nodes: SchoolNode[], purpose: AcademicPathPickerProps['purpose'], includeArchived: boolean) =>
  nodes.filter((node) => {
    if (!includeArchived && node.metadata?.archived) return false;
    if (purpose === 'registration' && node.metadata?.selectableForRegistration === false) return false;
    if (purpose === 'events' && node.metadata?.selectableForEvents === false) return false;
    return true;
  });

export function AcademicPathPicker({ roots, value, onChange, purpose = 'any', includeArchived = false, className = '', allowParentSelection = false, disabled = false }: AcademicPathPickerProps) {
  const levels: Array<{ options: SchoolNode[]; selected?: SchoolNode }> = [];
  let options = visibleNodes(roots, purpose, includeArchived);
  let depth = 0;
  while (options.length > 0) {
    const selected = options.find((node) => node.id === value[depth]);
    levels.push({ options, selected });
    if (!selected) break;
    options = visibleNodes(selected.children || [], purpose, includeArchived);
    depth += 1;
  }
  const selectedPath = levels.flatMap((level) => level.selected ? [level.selected] : []);

  const selectAt = (levelIndex: number, id: string) => {
    const prefix = selectedPath.slice(0, levelIndex);
    const selected = levels[levelIndex].options.find((node) => node.id === id);
    onChange(selected ? [...prefix, selected] : prefix);
  };

  return <div className={`space-y-3 ${className}`}>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {levels.map(({ options: levelOptions, selected }, index) => {
        const mixedTypes = new Set(levelOptions.map(node => node.type)).size > 1;
        const label = mixedTypes ? 'Academic unit / class' : getAcademicNodeLabel(levelOptions[0]?.type || 'custom');
        const parent = selectedPath[index - 1];
        const parentOption = allowParentSelection && parent ? [{ value: parent.id, label: `All of ${parent.name}` }] : [];
        return (
          <CustomSelect
            key={`${index}-${selectedPath[index - 1]?.id || 'root'}`}
            label={label}
            disabled={disabled}
            onChange={(id) => selectAt(index, id as string)}
            options={[...parentOption, ...levelOptions.map((node) => ({
              value: node.id,
              label: `${node.name}${node.metadata?.shortCode ? ` (${node.metadata.shortCode})` : ''}${mixedTypes ? ` — ${node.type === 'custom' ? node.metadata?.customFields?.grouping || 'Group' : getAcademicNodeLabel(node.type)}` : ''}`,
            }))]}
            placeholder={`Select ${label}`}
            searchable={levelOptions.length > 10}
            value={selected?.id || (parentOption.length ? parent.id : '')}
          />
        );
      })}
    </div>
    {selectedPath.length > 0 && <div aria-label="Selected academic path" className="min-w-0 break-words rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-xs font-semibold text-brand-800 dark:border-brand-800 dark:bg-brand-900/30 dark:text-brand-200">{selectedPath.map((node) => node.name).join(' / ')}</div>}
  </div>;
}
