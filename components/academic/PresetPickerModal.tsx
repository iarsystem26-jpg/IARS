import { AcademicPresetId, SchoolNode } from '../../types';
import { createAcademicPreset } from '../../lib/academicDirectory';
import { Modal } from '../ui/Modal';
import { BookOpen, GraduationCap, Layers3, School, WandSparkles } from 'lucide-react';

const presets: Array<{ id: AcademicPresetId; title: string; description: string; icon: typeof School }> = [
  { id: 'jhs', title: 'Junior High School', description: 'Grades 7–10 with sections; TLE remains optional.', icon: School },
  { id: 'strengthened_shs', title: 'Strengthened SHS', description: 'Academic and TechPro tracks without legacy strands.', icon: WandSparkles },
  { id: 'legacy_shs', title: 'Legacy SHS', description: 'Transition structure with STEM, ABM, HUMSS, and GAS.', icon: BookOpen },
  { id: 'higher_ed', title: 'CHED Higher Education', description: 'College, program, optional major, year, and block.', icon: GraduationCap },
  { id: 'blank', title: 'Blank custom unit', description: 'Start empty and define every layer yourself.', icon: Layers3 },
];

export function PresetPickerModal({ open, campusName, onClose, onApply }: { open: boolean; campusName: string; onClose: () => void; onApply: (node: SchoolNode) => void }) {
  return <Modal open={open} onClose={onClose} title="Add from academic template" description="Templates follow current DepEd and CHED structures and remain fully editable." size="lg">
    <div className="grid gap-3 sm:grid-cols-2">{presets.map(({ id, title, description, icon: Icon }) => <button key={id} aria-label={`Use ${title}`} onClick={() => onApply(createAcademicPreset(id, campusName))} className="flex min-h-32 items-start gap-4 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-gold-400 hover:bg-gold-50/50 dark:border-slate-700 dark:hover:bg-slate-700"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-800 dark:bg-brand-900/50 dark:text-brand-200"><Icon size={21} /></span><span><span className="block font-bold text-brand-900 dark:text-white">{title}</span><span className="mt-1 block text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</span></span></button>)}</div>
  </Modal>;
}
