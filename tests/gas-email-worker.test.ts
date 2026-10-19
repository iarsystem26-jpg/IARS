import fs from 'node:fs';
import vm from 'node:vm';
import { beforeEach, expect, it, vi } from 'vitest';
let context:any,send:any,fetch:any,properties:Map<string,string>,triggers:any[],drafts:Map<string,any>,sent:Map<string,any>,create:any;
const message={to:'student@example.test',subject:'Confirm email',text:'Plain text',html:'<img src="https://rmcssg.vercel.app/academic-seal-transparent.png">'};
beforeEach(()=>{
 properties=new Map();triggers=[];drafts=new Map();sent=new Map();send=vi.fn();
 create=vi.fn((to:string,subject:string,text:string,options:any)=>{
  const id='draft-'+drafts.size;
  const draft={getId:()=>id,getMessage:()=>({getPlainBody:()=>text}),deleteDraft:()=>drafts.delete(id),update:vi.fn(),send:()=>{
   send(to,subject,text,options);drafts.delete(id);const result={getId:()=> 'sent-id',getPlainBody:()=>text};sent.set(id,result);return result;
  }};drafts.set(id,draft);return draft;
 });
 fetch=vi.fn((url:string,options:any)=>{
  if(url.includes('academic-seal'))return{getResponseCode:()=>200,getBlob:()=>({setName:()=>({logo:true})})};
  const body=JSON.parse(options.payload);
  const value=body.action==='claim'?{messages:[{id:'job',lease:'lease',draftId:null}],review:[]}:body.action==='prepare'?{message}:{acknowledged:true,recorded:true};
  return{getResponseCode:()=>200,getContentText:()=>JSON.stringify(value)};
 });
 context=vm.createContext({console:{log:vi.fn()},Date,JSON,
  authEmailConfig_:()=>({secret:'private-worker-secret',workerUrl:'https://worker.test'}),
  GmailApp:{getAliases:vi.fn(()=>[]),createDraft:create,getDraft:(id:string)=>{if(!drafts.has(id))throw new Error('Draft missing');return drafts.get(id);},getDrafts:()=>[...drafts.values()],search:vi.fn(()=>sent.size?[{getMessages:()=>[...sent.values()]}]:[])},
  UrlFetchApp:{fetch},PropertiesService:{getScriptProperties:()=>({getProperty:(key:string)=>properties.get(key),setProperty:(key:string,value:string)=>properties.set(key,value),deleteProperty:(key:string)=>properties.delete(key),getProperties:()=>Object.fromEntries(properties)})},
  LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:vi.fn()})},
  ScriptApp:{getProjectTriggers:()=>triggers,deleteTrigger:vi.fn(),newTrigger:(name:string)=>({timeBased:()=>({everyMinutes:()=>({create:()=>triggers.push({getHandlerFunction:()=>name})})})})},
  ContentService:{MimeType:{JSON:'json'},createTextOutput:(text:string)=>({setMimeType:()=>JSON.parse(text)})},
 });vm.runInContext(fs.readFileSync('google-apps-script/Code.gs','utf8'),context);
});
const actions=()=>fetch.mock.calls.filter(([,options]:any[])=>options?.payload).map(([,options]:any[])=>JSON.parse(options.payload));
it('prepares a fresh link, persists the Gmail draft, then sends with inline logo and acknowledgement',()=>{
 context.deliverAuthEmails();
 expect(send).toHaveBeenCalledWith(message.to,message.subject,expect.stringContaining('IARS-DELIVERY-job'),expect.objectContaining({name:'Institution Attendance and Records System',htmlBody:expect.stringContaining('cid:iarsSeal'),inlineImages:{iarsSeal:{logo:true}}}));
 const names=actions().map(value=>value.action);expect(names.indexOf('prepare')).toBeLessThan(names.indexOf('draft'));expect(names.indexOf('draft')).toBeLessThan(names.indexOf('ack'));
 expect(JSON.parse(properties.get('AUTH_EMAIL_JOB_job')).state).toBe('sent');
});
it('does not regenerate a link or duplicate delivery after a lost acknowledgement',()=>{
 context.deliverAuthEmails();context.deliverAuthEmails();expect(send).toHaveBeenCalledOnce();expect(actions().filter(value=>value.action==='prepare')).toHaveLength(1);
});
it('holds an ambiguous send and never creates another draft for it',()=>{
 create.mockImplementationOnce(()=>{const draft={getId:()=> 'gone-draft',send:()=>{throw new Error('Network failed after unknown send');}};return draft;});
 context.deliverAuthEmails();expect(actions().some(value=>value.action==='uncertain')).toBe(true);
 context.deliverAuthEmails();expect(create).toHaveBeenCalledOnce();expect(actions().filter(value=>value.action==='prepare')).toHaveLength(1);
});
it('keeps a quota-failed draft for retry and reports the provider quota pause',()=>{
 send.mockImplementation(()=>{throw new Error('Service invoked too many times for one day: gmail.');});
 context.deliverAuthEmails();expect(drafts.size).toBe(1);expect(properties.get('AUTH_EMAIL_ERROR_CODE')).toBe('quota');
 expect(actions().some(value=>value.heartbeat?.errorCode==='quota')).toBe(true);
});
it('refuses anonymous setup and sends no user-provided email',()=>{
 const value=context.doPost({postData:{contents:JSON.stringify({action:'email_setup',secret:'wrong',to:'victim@test.com'})}});expect(value.success).toBe(false);expect(create).not.toHaveBeenCalled();
});
it('installs one trigger and does not send past the local daily allowance',()=>{
 context.installAuthEmailDelivery();context.installAuthEmailDelivery();expect(triggers).toHaveLength(1);
 properties.set('AUTH_EMAIL_BUDGET',JSON.stringify({started:Date.now(),sent:90}));context.deliverAuthEmails();expect(send).not.toHaveBeenCalled();expect(create).not.toHaveBeenCalled();
});
