import { expect, it } from 'vitest';
import { previewEmailIntent } from '../supabase/functions/_shared/emailPreview';
it.each(['signup','recovery','magiclink','invite','email_change','reauthentication'] as const)('archives %s copy without a token or code',action=>{
 const preview=previewEmailIntent({kind:'intent',userId:'id',email:'user@example.test',recipient:'user@example.test',action,redirect:'https://rmcssg.vercel.app/?token=secret',code:'123456',codeValidUntil:Date.now()+60000});
 expect(JSON.stringify(preview)).not.toContain('secret');expect(JSON.stringify(preview)).not.toContain('123456');
 expect(preview.html).toContain('iars-icon.png');
 if(action==='reauthentication')expect(preview.text).toContain('[code hidden]');else expect(preview.html).toContain('href="#"');
});
it('escapes custom copy to prevent scripts inside previews',()=>{
 const preview=previewEmailIntent({kind:'intent',userId:'id',email:'user@example.test',recipient:'user@example.test',action:'signup',redirect:'',subject:'<script>bad()</script>',body:'<img src=x onerror=bad()>'});
 expect(preview.html).not.toContain('<script>');expect(preview.html).toContain('&lt;img');
});
