import type { SchoolNode, UserProfile } from '../types';
import { findNodePath, flattenDirectory } from './academicDirectory';

export const studentBelongsToReportUnit = (student: UserProfile, unitId: string, nodes: SchoolNode[]): boolean => {
  const assignment = student.school_data?.academic_assignment;
  const ids = assignment?.nodePathIds || [];
  if (assignment?.terminalGroupId || ids.length) {
    const path = findNodePath(nodes, assignment?.terminalGroupId || ids[ids.length - 1]);
    return Boolean(path?.some(node => node.id === unitId));
  }
  const normalize = (value?: string) => value?.trim().toLowerCase();
  const data = student.school_data;
  const directory = flattenDirectory(nodes);
  const sections = directory.filter(node => ['section', 'block'].includes(node.type)
    && normalize(node.name) === normalize(data?.section)
    && (!data?.department || findNodePath(nodes, node.id)?.some(parent => normalize(parent.name) === normalize(data.department))));
  const departments = directory.filter(node => Boolean(data?.department) && normalize(node.name) === normalize(data.department));
  const matches = sections.length ? sections : departments;
  return matches.length === 1 && Boolean(findNodePath(nodes, matches[0].id)?.some(node => node.id === unitId));
};
