import { beforeEach,afterEach,expect,it,vi } from 'vitest';
import { cleanup,render,screen } from '@testing-library/react';
import EmailDeliveryTracker from './EmailDeliveryTracker';
const api=vi.hoisted(()=>({load:vi.fn(),remove:vi.fn()}));
vi.mock('../../lib/emailDelivery',()=>({loadEmailDeliveryStats:api.load}));
vi.mock('../../lib/supabase',()=>({supabase:{channel:()=>({on(){return this;},subscribe(){return this;}}),removeChannel:api.remove}}));
beforeEach(()=>{
 api.load.mockResolvedValue({safety_limit:90,provider_limit:100,sent_count:12,queued:3,sending:1,needs_review:0,failed:0,reset_at:new Date(Date.now()+86400000).toISOString(),blocked_until:null,last_heartbeat:new Date().toISOString(),last_error:null,oldest_queued_at:null,duplicates_suppressed:5,abuse_suppressed:2,server_now:new Date().toISOString()});
});
afterEach(cleanup);
it('shows quota, reservations, queue counts and honestly labels Google quota visibility',async()=>{
 render(<EmailDeliveryTracker/>);await screen.findByText('77');expect(screen.getByText('Queued')).toBeInTheDocument();expect(screen.getByText(/does not expose Google’s exact remaining quota/)).toBeInTheDocument();
 expect(screen.getByLabelText('Daily email allowance used')).toHaveAttribute('value','12');
});
it('explains automatic waiting for the next allowance when the provider pauses delivery',async()=>{
 const stats=await api.load();api.load.mockResolvedValue({...stats,blocked_until:new Date(Date.now()+3600000).toISOString()});
 render(<EmailDeliveryTracker/>);await screen.findByText(/Waiting for quota. Queued requests resume automatically/);
});
it('shows stale heartbeats without promising immediate delivery',async()=>{
 const stats=await api.load();api.load.mockResolvedValue({...stats,last_heartbeat:new Date(Date.now()-3600000).toISOString()});
 render(<EmailDeliveryTracker/>);await screen.findByText(/Worker heartbeat is delayed/);
});
