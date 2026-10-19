import { timeValue } from './ui-time';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SearchSuggest, rankSuggestions } from '../components/ui/SearchSuggest';
import { CeremonyAttendanceSettings } from '../components/events/CeremonyAttendanceSettings';
import { AppEvent, SchoolNode, UserProfile } from '../types';
afterEach(cleanup);
it('ranks exact names first and matches reordered tokens, accents and compact IDs', () => {
 const options=[{id:'1',label:'Jose Rivera',detail:'2025-00047A / Psychology / 2SP - B'},{id:'2',label:'José',detail:'2024-009 / Nursing'},{id:'3',label:'Someone else',detail:'Jose section'}];
 expect(rankSuggestions(options,'JOSE').map(p=>p.id)).toEqual(['2','1','3']);
 expect(rankSuggestions(options,'rivera jose').map(p=>p.id)).toEqual(['1']);
 expect(rankSuggestions(options,'202500047').map(p=>p.id)).toEqual(['1']);
 expect(rankSuggestions(options,'2spb').map(p=>p.id)).toEqual(['1']);
 expect(rankSuggestions(options,'  ')).toEqual([]);
});
it('supports keyboard selection, Escape and no-match Enter without submitting the form', () => {
 const choose=vi.fn(),submit=vi.fn();
 render(<form onSubmit={submit}><SearchSuggest label="Find student" placeholder="Search" options={[{id:'a',label:'Alice',detail:'Class A'},{id:'b',label:'Bob',detail:'Class B'}]} onSelect={choose}/></form>);
 const input=screen.getByRole('combobox');
 expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
 fireEvent.change(input,{target:{value:'class'}});
 fireEvent.keyDown(input,{key:'ArrowDown'});
 fireEvent.keyDown(input,{key:'Enter'});
 expect(choose).toHaveBeenCalledWith('b');expect(input).toHaveValue('');expect(submit).not.toHaveBeenCalled();
 fireEvent.change(input,{target:{value:'Alice'}});fireEvent.keyDown(input,{key:'Escape'});
 expect(input).toHaveAttribute('aria-expanded','false');
 fireEvent.change(input,{target:{value:'missing'}});fireEvent.keyDown(input,{key:'Enter'});
 expect(choose).toHaveBeenCalledTimes(1);expect(submit).not.toHaveBeenCalled();
 expect(screen.getByRole('status')).toHaveTextContent('No unselected matches');
});
it('adds/removes exemptions and class overrides without listing everyone or offering duplicates', () => {
 const roots:SchoolNode[]=[{id:'campus',name:'Campus',type:'school',children:[{id:'a',name:'2SP - B',type:'section'},{id:'archived',name:'Old',type:'section',metadata:{archived:true}}]}];
 const students=[{uid:'alice',name:'Alice',student_id:'2025-00047A',school_data:{section:'2SP - B',academic_assignment:{terminalGroupId:'a'}}}] as UserProfile[];
 function Harness(){const [settings,setSettings]=useState<NonNullable<AppEvent['ceremony']>>({exemptStudentIds:[],classWindows:{},allowVolunteerMerit:false,volunteerMeritHours:1});return <CeremonyAttendanceSettings value={settings} onChange={setSettings} roots={roots} students={students} defaultWindows={[{id:'default',timeIn:'16:30',timeOut:'17:00',lateAfterMinutes:5}]}/>;}
 render(<Harness/>);
 expect(screen.queryByText('Alice')).not.toBeInTheDocument();
 const student=screen.getByRole('combobox',{name:'Search students for exemption'});
 fireEvent.change(student,{target:{value:'202500047'}});fireEvent.click(screen.getByRole('option',{name:/Alice/}));
 expect(screen.getByText('1 exempted')).toBeInTheDocument();
 fireEvent.change(student,{target:{value:'Alice'}});expect(screen.queryByRole('option',{name:/Alice/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Remove exemption for Alice'}));
 expect(screen.getByText('0 exempted')).toBeInTheDocument();
 const classes=screen.getByRole('combobox',{name:'Search classes for ceremony time overrides'});
 fireEvent.blur(student,{relatedTarget:classes});
 fireEvent.change(classes,{target:{value:'2spb'}});fireEvent.click(screen.getByRole('option',{name:/2SP - B/}));
 expect(timeValue('a timeIn 1')).toBe('16:30');expect(timeValue('a timeOut 1')).toBe('17:00');
 fireEvent.change(classes,{target:{value:'2spb'}});expect(screen.queryByRole('option',{name:/2SP - B/})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Use default windows'}));expect(screen.queryByLabelText('a timeIn 1')).not.toBeInTheDocument();
 fireEvent.change(classes,{target:{value:'Old'}});expect(screen.queryByRole('option',{name:/Old/})).not.toBeInTheDocument();
});

it('converts volunteer hours and minutes to the saved amount and blocks invalid totals', () => {
 function Harness(){const [value,setValue]=useState<NonNullable<AppEvent['ceremony']>>({exemptStudentIds:[],classWindows:{},allowVolunteerMerit:true,volunteerMeritHours:1.5});return <><CeremonyAttendanceSettings value={value} onChange={setValue} roots={[]} students={[]}/><output aria-label="Saved volunteer hours">{value.volunteerMeritHours}</output></>;}
 render(<Harness/>);
 const hours=screen.getByLabelText('Volunteer merit hours'),minutes=screen.getByLabelText('Volunteer merit minutes');
 expect(hours).toHaveValue(1);expect(minutes).toHaveValue(30);
 fireEvent.change(hours,{target:{value:'0'}});
 expect(screen.getByLabelText('Saved volunteer hours')).toHaveTextContent('0.5');
 fireEvent.change(minutes,{target:{value:'45'}});
 expect(screen.getByLabelText('Saved volunteer hours')).toHaveTextContent('0.75');
 fireEvent.change(hours,{target:{value:'24'}});
 expect(screen.getByRole('alert')).toBeInTheDocument();expect(screen.getByLabelText('Saved volunteer hours')).toHaveTextContent('0');
 fireEvent.change(minutes,{target:{value:'0'}});
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByLabelText('Saved volunteer hours')).toHaveTextContent('24');
 fireEvent.change(minutes,{target:{value:'60'}});
 expect(screen.getByRole('alert')).toBeInTheDocument();
});
