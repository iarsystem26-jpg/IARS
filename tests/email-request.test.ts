import { beforeEach,expect,it,vi } from 'vitest';
import { emailRequestHandler } from '../supabase/functions/_shared/emailRequest';
let admin:any,lookup:any,rpc:any;
beforeEach(()=>{
 lookup=vi.fn().mockResolvedValue({data:{id:'user',status:'active'}});
 rpc=vi.fn(async(name:string)=>({data:name==='rmc_email_request_budget'?0:{accepted:true,duplicate:true}}));
 admin={rpc,from:()=>({select:()=>({eq:()=>({maybeSingle:lookup})})}),auth:{admin:{getUserById:vi.fn().mockResolvedValue({data:{user:{email:'student@example.test'}}}),generateLink:vi.fn()}}};
});
const call=async(body:any)=>{const result=await emailRequestHandler(admin,Buffer.alloc(32,4).toString('base64'))(new Request('https://test.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));return{status:result.status,body:await result.json()};};
it('queues password recovery without generating a link at request time',async()=>{
 expect((await call({action:'recovery',email:'student@example.test'})).body).toEqual({accepted:true,cooldownSeconds:120});
 expect(admin.auth.admin.generateLink).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledWith('rmc_enqueue_auth_email',expect.objectContaining({action_kind:'recovery'}));
});
it('returns the identical response for an unknown account',async()=>{
 const known=await call({action:'recovery',email:'student@example.test'});lookup.mockResolvedValue({data:null});
 expect(await call({action:'recovery',email:'unknown@example.test'})).toEqual(known);
});
it('enforces the IP budget before looking up an account',async()=>{
 rpc.mockResolvedValue({data:60});expect((await call({action:'recovery',email:'student@example.test'})).status).toBe(429);expect(lookup).not.toHaveBeenCalled();
});
it('fails closed if the rate-limit store is unavailable',async()=>{
 rpc.mockResolvedValue({error:new Error('offline')});expect((await call({action:'recovery',email:'student@example.test'})).status).toBe(503);expect(lookup).not.toHaveBeenCalled();
});
