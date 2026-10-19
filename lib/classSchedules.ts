import { SchoolNode, UserProfile } from '../types';
import { findNodePath, flattenDirectory, profileMatchesDirectorySection } from './academicDirectory';
import { dateStamp, validDate } from './ceremonySchedule';

export const weekDays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export type ExemptionFilter = { mode: 'class' | 'timeIn' | 'timeOut' | 'no_class'; classIds: string[]; comparison: 'equal' | 'at_or_after' | 'at_or_before'; time: string };
export function previewExemptions(roots: SchoolNode[], students: UserProfile[], dates: string[], filter: ExemptionFilter) {
  const classes = flattenDirectory(roots).filter(n => ['section', 'block'].includes(n.type) && !(findNodePath(roots, n.id) || []).some(p => p.metadata?.archived));
  return dates.filter(validDate).map(date => {
    const weekday = String(new Date(dateStamp(date)).getUTCDay());
    const matches = classes.filter(node => {
      if (filter.classIds.length && !filter.classIds.includes(node.id)) return false;
      if (filter.mode === 'class') return filter.classIds.includes(node.id);
      const schedule = node.metadata?.classSchedule?.[weekday];
      if (!schedule) return false; // Unknown never means no classes.
      if (filter.mode === 'no_class') return schedule.status === 'no_class';
      if (schedule.status !== 'classes' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(filter.time)) return false;
      const time = schedule[filter.mode];
      return filter.comparison === 'equal' ? time === filter.time : filter.comparison === 'at_or_after' ? time >= filter.time : time <= filter.time;
    });
    return { date, classes: matches, students: students.filter(person => matches.some(node => profileMatchesDirectorySection(person, node.id, roots))) };
  });
}
