import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup,fireEvent,render,screen,waitFor } from '@testing-library/react';
import AdminEmailDashboard from './AdminEmailDashboard';
const api=vi.hoisted(()=>({list:vi.fn(),analytics:vi.fn(),preview:vi.fn()}));
vi.mock('../../lib/emailDelivery',()=>({loadEmailHistory:api.list,loadEmailAnalytics:api.analytics,loadEmailPreview:api.preview}));
vi.mock('recharts',()=>({ResponsiveContainer:({children}:any)=><div>{children}</div>,BarChart:()=>null,Bar:()=>null,XAxis:()=>null,YAxis:()=>null,Tooltip:()=>null}));
beforeEach(()=>{
 api.list.mockImplementation(async({bucket,page_number}:any)=>({total:bucket==='sent'?12:0,rows:bucket==='sent'?[{id:`id-${page_number}`,recipient:'student@example.test',subject:`Confirmation ${page_number}`,kind:'signup',status:'sent',created_at:'2026-10-12T00:00:00Z',sent_at:'2026-10-12T01:00:00Z',attempts:1,has_preview:true}]:[]}));
 api.analytics.mockResolvedValue({totals:{requested:12,sent:12,waiting:0,review:0,failed:0,cancelled:0,retried:0,average_wait_seconds:60},daily:[],kinds:[],server_now:'2026-10-12T01:00:00Z'});
 api.preview.mockResolvedValue({html:'<p>Safe archived preview</p>',text:'Safe preview',subject:'Confirmation',recipient:'student@example.test',status:'sent'});
});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('loads separate server-paginated tables and requests the next sent page',async()=>{
 render(<AdminEmailDashboard/>);await screen.findByText('Confirmation 1');
 expect(api.list).toHaveBeenCalledWith(expect.objectContaining({bucket:'queue',page_size:10}));
 fireEvent.click(screen.getAllByRole('button',{name:'Next'})[1]);await screen.findByText('Confirmation 2');
 expect(api.list).toHaveBeenCalledWith(expect.objectContaining({bucket:'sent',page_number:2}));
});
it('debounces recipient search and requests a sandboxed preview without links',async()=>{
 render(<AdminEmailDashboard/>);await screen.findByText('Confirmation 1');
 fireEvent.change(screen.getAllByLabelText('Search recipient or subject')[1],{target:{value:'student@example.test'}});
 await waitFor(()=>expect(api.list).toHaveBeenCalledWith(expect.objectContaining({bucket:'sent',query:'student@example.test',page_number:1})));
 fireEvent.click(screen.getByRole('button',{name:'Preview Confirmation 1 to student@example.test'}));
 const frame=await screen.findByTitle('Safe email layout preview');expect(frame).toHaveAttribute('sandbox','');expect(frame).toHaveAttribute('referrerpolicy','no-referrer');
 expect(api.preview).toHaveBeenCalledWith('id-1');
});
