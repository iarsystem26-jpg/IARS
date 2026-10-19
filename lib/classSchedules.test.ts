import { expect, it } from 'vitest';
import { previewExemptions, ExemptionFilter } from './classSchedules';
import { SchoolNode, UserProfile } from '../types';
const roots: SchoolNode[] = [{id:'school',name:'School',type:'school',children:[
 {id:'a',name:'A',type:'section',metadata:{classSchedule:{'1':{status:'classes',timeIn:'10:00',timeOut:'17:00'},'5':{status:'classes',timeIn:'08:00',timeOut:'12:00'},'2':{status:'no_class'}}}},
 {id:'b',name:'B',type:'section'},
 {id:'archived',name:'Old class',type:'section',metadata:{archived:true,classSchedule:{'1':{status:'no_class'}}}},
]}];
const students = ['a','b','archived','outside'].map(id => ({uid:id,school_data:{academic_assignment:{terminalGroupId:id}}} as UserProfile));
const base:ExemptionFilter = {mode:'timeIn',classIds:[],time:'10:00',comparison:'at_or_after'};
it('uses the ceremony weekday and distinguishes first class from last class', () => {
 expect(previewExemptions(roots,students,['2026-10-05','2026-10-09'],base).map(r=>r.students.map(p=>p.uid))).toEqual([['a'],[]]);
 expect(previewExemptions(roots,students,['2026-10-09'],{...base,mode:'timeOut',time:'12:00',comparison:'at_or_before'})[0].students.map(p=>p.uid)).toEqual(['a']);
 expect(previewExemptions(roots,students,['2026-10-09'],{...base,mode:'timeIn',time:'12:00',comparison:'equal'})[0].students).toEqual([]);
});
it('requires explicit no-class status, excluding unknown schedules and archived/outside classes', () => {
 expect(previewExemptions(roots,students,['2026-10-06'],{...base,mode:'no_class'})[0].students.map(p=>p.uid)).toEqual(['a']);
 expect(previewExemptions(roots,students,['2026-10-05'],{...base,mode:'no_class'})[0].students).toEqual([]);
});
it('supports exact times, class-only selection and narrowing time filters to selected classes', () => {
 expect(previewExemptions(roots,students,['2026-10-05'],{...base,comparison:'equal'})[0].students.map(p=>p.uid)).toEqual(['a']);
 expect(previewExemptions(roots,students,['2026-10-05'],{...base,classIds:['b']})[0].students).toEqual([]);
 expect(previewExemptions(roots,students,['2026-10-05'],{...base,mode:'class',classIds:['b']})[0].students.map(p=>p.uid)).toEqual(['b']);
 expect(previewExemptions(roots,students,['2026-10-05'],{...base,mode:'class'})[0].students).toEqual([]);
});
