import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const base = process.env.AUDIT_BASE_URL || 'http://127.0.0.1:4180';
const fixture = 'artifacts/ui-token-fixture.html';
fs.mkdirSync('artifacts', { recursive: true });
fs.writeFileSync(fixture, `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/index.css"></head><body>
<div id="root"></div><script type="module">
import React from 'react';
import { createRoot } from 'react-dom/client';
import Button from '/components/ui/Button.tsx';
import CustomSelect from '/components/ui/CustomSelect.tsx';
import { Collapsible } from '/components/ui/Collapsible.tsx';
import { SearchSuggest } from '/components/ui/SearchSuggest.tsx';
const h = React.createElement;
function Demo() {
 const [open, setOpen] = React.useState(false), [value, setValue] = React.useState(''), [chosen, setChosen] = React.useState('');
 return h('main',{className:'app-page',style:{maxWidth:560}},
  h('h1',{className:'text-2xl font-bold mb-4'},'Unified UI controls'),
  h('div',{className:'grid grid-cols-2 gap-3 mb-4'},...['primary','secondary','gold','danger','warning'].map(variant=>h(Button,{variant,key:variant},variant))),
  h('label',{className:'app-field-label'},'Field',h('input',{className:'input-field mt-2 mb-4',placeholder:'Enter text'})),
  h('section',{className:'app-surface p-4 overflow-hidden'},
   h(Button,{variant:'secondary','aria-expanded':open,onClick:()=>setOpen(!open)},'Toggle section'),
   h(Collapsible,{open,id:'test-section',innerClassName:'pt-4'},
    h(CustomSelect,{label:'Campus',value,onChange:setValue,searchable:true,options:[{value:'north',label:'North Campus'},{value:'south',label:'South Campus'}]}),
    h('button',{type:'button',className:'mt-4'},'End of section'))),
  h('div',{className:'mt-5'},h(SearchSuggest,{label:'Find student',placeholder:'Search students',options:[{id:'a',label:'Alice',detail:'North Campus'},{id:'b',label:'Bob',detail:'South Campus'}],onSelect:setChosen})),
  h('output',null,chosen));
}
createRoot(document.getElementById('root')).render(h(Demo));
</script></body></html>`);

const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const clickText = async text => {
  const handle = await page.waitForFunction(label => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === label), {}, text);
  await handle.asElement().click();
};
try {
 await page.setViewport({width:1366,height:950});
 await page.goto(`${base}/${fixture}`,{waitUntil:'networkidle0'});
 await page.waitForSelector('.app-button');
 await clickText('Toggle section');
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('#test-section')).opacity === '1');
 await page.click('.app-select-trigger');
 await page.waitForFunction(()=>document.querySelector('.app-dropdown-menu')?.matches(':popover-open'));
 assert.equal(await page.$eval('.app-dropdown-menu', el => el.matches(':popover-open')), true);
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
 assert.match(await page.$eval('.app-select-trigger',el=>el.textContent), /South Campus/);
 assert.equal(await page.$eval('.app-select-trigger',el=>el===document.activeElement),true);
 await page.click('.app-select-trigger');
 await page.click('input[aria-label="Search Campus options"]');
 await page.type('input[aria-label="Search Campus options"]','north');
 assert.equal(await page.$eval('input[aria-label="Search Campus options"]',el=>el===document.activeElement),true);
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
 await page.waitForFunction(()=>!document.querySelector('.app-dropdown-menu'));
 await page.type('input[placeholder="Search students"]','Campus');
 await page.keyboard.press('ArrowDown'); await page.keyboard.press('Enter');
 assert.equal(await page.$eval('output',el=>el.textContent),'b');
 await page.waitForFunction(()=>!document.querySelector('.app-dropdown-menu'));
 // Keep the closing content present but immediately inaccessible, then unmount it.
 await page.click('.app-select-trigger');
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.app-dropdown-menu')).opacity === '1');
 const exit = await page.evaluate(async () => {
  const menu = document.querySelector('.app-dropdown-menu');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {key:'Escape',bubbles:true}));
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const transition = menu.getAnimations().find(animation=>animation.transitionProperty === 'opacity');
  if (transition) {
   transition.pause();
   transition.currentTime = Number(transition.effect.getTiming().duration) / 2;
  }
  return {opacity:Number(getComputedStyle(menu).opacity),inert:menu.inert};
 });
 assert.equal(exit.inert,true); assert.ok(exit.opacity > 0 && exit.opacity < 1, `Expected an animated exit, got opacity ${exit.opacity}`);
 assert.equal(await page.$eval('.app-select-trigger',el=>el.getAttribute('aria-expanded')),'false');
 await page.waitForFunction(()=>!document.querySelector('.app-dropdown-menu'));
 for (const dark of [false,true]) for(const width of [1366,390]) {
  await page.setViewport({width,height:950});
  await page.evaluate(dark=>document.documentElement.classList.toggle('dark',dark),dark);
  await page.click('.app-select-trigger');
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('.app-dropdown-menu')).opacity === '1');
  const metrics=await page.evaluate(()=>{
   const field=getComputedStyle(document.querySelector('.input-field')), select=getComputedStyle(document.querySelector('.app-select-trigger'));
   const menu=document.querySelector('.app-dropdown-menu'), rect=menu.getBoundingClientRect();
   return {fieldRadius:field.borderRadius,selectRadius:select.borderRadius,fieldPadding:field.paddingLeft,selectPadding:select.paddingLeft,fieldBg:field.backgroundColor, menuBg:getComputedStyle(menu).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,menuFits:rect.left>=0&&rect.right<=innerWidth&&rect.bottom<=innerHeight};
  });
  assert.equal(metrics.fieldRadius,metrics.selectRadius); assert.equal(metrics.overflow,false); assert.equal(metrics.menuFits,true);
  assert.equal(metrics.fieldPadding,metrics.selectPadding); assert.ok(parseFloat(metrics.fieldPadding)>0);
  await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(await page.$$eval('.app-button > span', spans=>spans.map(span=>({text:span.textContent,visible:getComputedStyle(span).visibility}))),
   ['primary','secondary','gold','danger','warning','Toggle section'].map(text=>({text,visible:'visible'})));
  await page.screenshot({path:`artifacts/ui-tokens-${dark?'dark':'light'}-${width}.png`});
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>!document.querySelector('.app-dropdown-menu'));
 }
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await clickText('Toggle section');
 await page.waitForFunction(()=>document.querySelector('#test-section').getBoundingClientRect().height<1);
 assert.equal(await page.$eval('#test-section',el=>el.getAttribute('aria-hidden')),'true');
 assert.equal(await page.$eval('#test-section button',el=>Boolean(el.closest('[inert]'))),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: tokens, dropdown clipping, keyboard selection/search/Escape, focus, mobile/light/dark layouts, reduced-motion and collapsed inert content.');
} catch (error) {
 console.error('Browser errors:', errors, error);
 throw error;
} finally {
 await browser.close();
 fs.unlinkSync(fixture);
}
