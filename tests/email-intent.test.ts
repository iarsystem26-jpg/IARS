import { expect,it,vi } from 'vitest';
import { emailIntents,prepareEmailIntent,enqueueIntent } from '../supabase/functions/_shared/emailIntent';
const event={user:{id:'user',email:'student@example.test'},email_data:{email_action_type:'signup',token_hash:'secret-original-token',token:'123456'}};
it('queues enrollment and recovery intent without original Auth tokens',()=>{
 for(const action of ['signup','recovery']){
  const [intent]=emailIntents({...event,email_data:{...event.email_data,email_action_type:action}});
  expect(JSON.stringify(intent)).not.toContain('secret-original-token'); expect(JSON.stringify(intent)).not.toContain('123456');
 }
});
it('creates a fresh recovery link at send time even after a long queue delay',async()=>{
 const intent=emailIntents({...event,email_data:{email_action_type:'recovery'}})[0];
 const generate=vi.fn().mockResolvedValue({data:{user:{id:'user'},properties:{action_link:'https://project.test/auth/v1/verify?token=fresh&type=recovery'}}});
 const admin={auth:{admin:{getUserById:vi.fn().mockResolvedValue({data:{user:{id:'user',email:'student@example.test'}}}),generateLink:generate}}};
 expect(generate).not.toHaveBeenCalled(); const message=await prepareEmailIntent(admin,intent);
 expect(generate).toHaveBeenCalledWith(expect.objectContaining({type:'recovery'})); expect(message.text).toContain('token=fresh');
});
it.each(['deleted','changed-email','confirmed'])('cancels a %s enrollment rather than creating a replacement account',async reason=>{
 const user=reason==='deleted'?null:{id:'user',email:reason==='changed-email'?'different@test.com':'student@example.test',email_confirmed_at:reason==='confirmed'?'2026-10-13':null};
 const generate=vi.fn();const admin={auth:{admin:{getUserById:vi.fn().mockResolvedValue({data:{user}}),generateLink:generate}}};
 expect(await prepareEmailIntent(admin,emailIntents(event)[0])).toBeNull();expect(generate).not.toHaveBeenCalled();
});
it('rejects a link generated for a different user ID',async()=>{
 const admin={auth:{admin:{getUserById:vi.fn().mockResolvedValue({data:{user:{email:'student@example.test'}}}),generateLink:vi.fn().mockResolvedValue({data:{user:{id:'replacement'},properties:{action_link:'https://test.com'}}})}}};
 await expect(prepareEmailIntent(admin,emailIntents(event)[0])).rejects.toThrow();
});
it('uses the same atomic deduplication key across repeated requests',async()=>{
 const rpc=vi.fn().mockResolvedValue({data:{accepted:true,duplicate:true}});
 const intent=emailIntents(event)[0],key=Buffer.alloc(32,8).toString('base64');
 await enqueueIntent({rpc},intent,'first',key);await enqueueIntent({rpc},intent,'second',key);
 expect(rpc.mock.calls[0][1].dedupe).toBe(rpc.mock.calls[1][1].dedupe);expect(rpc.mock.calls[0][1].message_payload).not.toContain(intent.email);
});
