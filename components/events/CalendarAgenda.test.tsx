import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CalendarAgenda from './CalendarAgenda';
import { calendarAgendaGroups, type CalendarItem } from '../../lib/personalCalendar';
afterEach(cleanup);
const parent:CalendarItem={id:'parent-session',event_id:'parent',title:'Intramurals',label:'Default session',general:true,kind:'attendance',starts_at:'2026-10-09T08:00:00+08:00',ends_at:'2026-10-10T17:00:00+08:00',cancelled:false,suspended:false,organization_id:null,venue:'',description:''};
const child:CalendarItem={...parent,id:'opening-session',event_id:'opening',title:'Opening program',label:'Morning',general:false,parent_event_id:'parent'};
it('groups children by parent ID even when the child precedes its general event',()=>{
 const open=vi.fn();render(<CalendarAgenda items={[child,parent]} conflicts={new Set()} onOpen={open}/>);
 const group=screen.getByRole('region',{name:'General event: Intramurals'});
 expect(within(group).getByText('Specific activity')).toBeVisible();expect(within(group).getByText('Opening program')).toBeVisible();expect(screen.getAllByText('Opening program')).toHaveLength(1);
 fireEvent.click(within(group).getByRole('button',{name:'View general event'}));expect(open).toHaveBeenLastCalledWith(parent);
 fireEvent.click(within(group).getByRole('button',{name:'View activity'}));expect(open).toHaveBeenLastCalledWith(child);
});
it('keeps standalone activities separate and retains child conflicts',()=>{
 render(<CalendarAgenda items={[parent,child,{...child,id:'standalone',event_id:'standalone',title:'Standalone assembly',parent_event_id:null}]} conflicts={new Set([child.id])} onOpen={()=>{}}/>);
 expect(within(screen.getByRole('region',{name:'General event: Intramurals'})).queryByText('Standalone assembly')).not.toBeInTheDocument();expect(screen.getByText('Schedule conflict')).toBeVisible();expect(screen.getByText('Standalone assembly')).toBeVisible();
});
it('preserves all sessions and does not merge general events with identical titles',()=>{
 const groups=calendarAgendaGroups([parent,child,{...child,id:'afternoon'},{...parent,id:'other-session',event_id:'other'},{...child,id:'other-child',parent_event_id:'other'}]);
 expect(groups).toHaveLength(2);expect(groups[0].items).toHaveLength(2);expect(groups[1].items).toHaveLength(1);
});
it('shows the relationship when the parent is absent from the filtered calendar without granting a parent action',()=>{
 const item={...child,details:{parent_title:'Intramurals'} as CalendarItem['details']};render(<CalendarAgenda items={[item]} conflicts={new Set()} onOpen={()=>{}}/>);
 expect(screen.getByRole('region',{name:'General event: Intramurals'})).toBeVisible();expect(screen.queryByRole('button',{name:'View general event'})).not.toBeInTheDocument();expect(screen.getByRole('button',{name:'View activity'})).toBeVisible();
});
it('explains general events with no activities on the selected day',()=>{
 render(<CalendarAgenda items={[parent]} conflicts={new Set()} onOpen={()=>{}}/>);expect(screen.getByText('No specific activities for this day and filter.')).toBeVisible();
});
