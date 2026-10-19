import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import CalendarActivityDetail from './CalendarActivityDetail';
import type { CalendarItem } from '../../lib/personalCalendar';
afterEach(cleanup);
const item: CalendarItem = { id:'session',event_id:'activity',title:'Opening Program',label:'Morning session',starts_at:'2026-10-20T08:00:00+08:00',ends_at:'2026-10-20T10:00:00+08:00',kind:'attendance',organization_id:null,general:false,cancelled:false,suspended:false,venue:'Main Gym',description:'Bring your school ID.\nFollow the officer instructions.',details:{activity_kind:'attendance',banner_url:null,starts_at:'2026-10-20T08:00:00+08:00',ends_at:'2026-10-21T16:00:00+08:00',parent_title:'School Week',organization_name:null,unit_name:'College',audience:'Selected academic groups',approval:'approved',windows:[{id:'morning',label:'Morning session',timeIn:'08:00',timeOut:'10:00',lateAfterMinutes:15}],geofence_enabled:true,location:{lat:7.1,lng:125.6,radius_meters:100},late_rule:{value:30,unit:'minutes'},absent_rule:{value:2,unit:'hours'},excuse_days:3,merit_hours:null,service_overflow:null,flag_kind:null,volunteer_merit_hours:null} };
it('shows full event dates, session, context, instructions, attendance windows and rules',()=>{
 const close=vi.fn();render(<CalendarActivityDetail item={item} conflict={false} onClose={close}/>);
 expect(screen.getByRole('dialog',{name:'Opening Program'})).toBeVisible();expect(screen.getByText('School Week')).toBeVisible();expect(screen.getByText('Main Gym')).toBeVisible();
 expect(screen.getByText('30 minutes')).toBeVisible();expect(screen.getByText('2 hours')).toBeVisible();expect(screen.getByText(/3 days after/)).toBeVisible();expect(screen.getByText(/100 meter radius/)).toBeVisible();expect(screen.getByText('8:00 AM – 10:00 AM')).toBeVisible();expect(screen.getByText(/Late threshold: 15/)).toBeVisible();
 fireEvent.click(screen.getByRole('button',{name:'Close details'}));expect(close).toHaveBeenCalledOnce();
});
it('shows fixed merit requirements and service overflow without absence sanctions',()=>{
 render(<CalendarActivityDetail item={{...item,details:{...item.details!,activity_kind:'merit',merit_hours:1.5}}} conflict={false} onClose={()=>{}}/>);expect(screen.getByText('1.5 hours')).toBeVisible();expect(screen.getByText(/every required session/)).toBeVisible();expect(screen.queryByText('Unexcused absence')).not.toBeInTheDocument();
 cleanup();render(<CalendarActivityDetail item={{...item,details:{...item.details!,activity_kind:'service',service_overflow:'merit'}}} conflict={false} onClose={()=>{}}/>);expect(screen.getByText(/Excess completed time is saved/)).toBeVisible();expect(screen.queryByText(/Excuse submission window/)).not.toBeInTheDocument();
});
it('does not imply attendance requirements for a general event',()=>{
 render(<CalendarActivityDetail item={{...item,general:true}} conflict={false} onClose={()=>{}}/>);expect(screen.getByText(/groups specific activities/)).toBeVisible();expect(screen.queryByRole('heading',{name:'Attendance windows'})).not.toBeInTheDocument();expect(screen.queryByText('Selected session')).not.toBeInTheDocument();expect(screen.queryByText('Unexcused absence')).not.toBeInTheDocument();
});
it('shows all supplied specific activities and their windows inside the general event',()=>{
 const activities=[{id:'opening',title:'Opening ceremony',kind:'attendance',starts_at:'2026-10-20T08:00:00+08:00',ends_at:'2026-10-20T10:00:00+08:00',venue:'Gym',description:'Bring school ID',cancelled:false,windows:item.details!.windows},{id:'closing',title:'Closing program',kind:'merit',starts_at:'2026-11-01T13:00:00+08:00',ends_at:'2026-11-01T15:00:00+08:00',venue:'',description:'',cancelled:true,windows:[]}];
 render(<CalendarActivityDetail item={{...item,general:true,details:{...item.details!,specific_activities:activities}}} conflict={false} onClose={()=>{}}/>);
 expect(screen.getByRole('heading',{name:'Specific activities'})).toBeVisible();expect(screen.getByRole('heading',{name:'Opening ceremony'})).toBeVisible();expect(screen.getByRole('heading',{name:'Closing program'})).toBeVisible();expect(screen.getByText('Gym')).toBeVisible();expect(screen.getByText('Bring school ID')).toBeVisible();expect(screen.getByText('8:00 AM – 10:00 AM')).toBeVisible();expect(screen.getByText('Late threshold: 15 minutes')).toBeVisible();expect(screen.getByText('No separate attendance windows configured.')).toBeVisible();expect(screen.getByText('Cancelled')).toBeVisible();
});
it('prioritizes suspension and cancellation notices over conflicts',()=>{
 render(<CalendarActivityDetail item={{...item,suspended:true}} conflict onClose={()=>{}}/>);expect(screen.getByText(/No absence sanctions apply/)).toBeVisible();expect(screen.queryByText(/overlaps another/)).not.toBeInTheDocument();
 cleanup();render(<CalendarActivityDetail item={{...item,cancelled:true}} conflict onClose={()=>{}}/>);expect(screen.getByText(/This activity is cancelled/)).toBeVisible();expect(screen.queryByText(/Excuse submission window/)).not.toBeInTheDocument();
});
it('handles older calendar payloads without inventing missing rules',()=>{
 render(<CalendarActivityDetail item={{...item,details:undefined,venue:'',description:''}} conflict onClose={()=>{}}/>);expect(screen.getByText(/overlaps another/)).toBeVisible();expect(screen.getByText('No venue specified')).toBeVisible();expect(screen.getByText('No additional instructions have been provided.')).toBeVisible();expect(screen.queryByText('Unexcused absence')).not.toBeInTheDocument();
});
