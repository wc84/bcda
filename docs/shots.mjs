import puppeteer from 'puppeteer-core';
import { readFileSync, mkdirSync } from 'node:fs';

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8899';
const OUT = 'C:/nlt/shots';
const DL = 'C:/Users/wchoe/Downloads';
mkdirSync(OUT, { recursive: true });

const cricketCsv = readFileSync(`${DL}/BCDAS_Winter_Spring_2026_all_cricket_leaderboard.csv`, 'utf8');
const x01Csv = readFileSync(`${DL}/BCDAS_Winter_Spring_2026_all_01_leaderboard.csv`, 'utf8');

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--force-device-scale-factor=2', '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1060, height: 940, deviceScaleFactor: 2 });

// Every request the page makes is answered here — this run cannot touch league data.
await page.evaluateOnNewDocument(() => {
  const json = (d) => Promise.resolve(new Response(JSON.stringify(d), {
    status: 200, headers: { 'content-type': 'application/json' } }));
  window.fetch = (url) => {
    const u = String(url);
    if (u.includes('api/login')) return json({ token: 'demo', expiresInHours: 8 });
    if (u.includes('api/admin/roster')) return json({ roster: {} });
    if (u.includes('api/admin/versions')) return json({ versions: [
      { versionId:'v3', updatedAt:'2026-08-26T19:14:00Z', players:17, divisions:['A','B'], warnings:0, live:true },
      { versionId:'v2', updatedAt:'2026-08-19T19:02:00Z', players:17, divisions:['A','B'], warnings:1, live:false },
      { versionId:'v1', updatedAt:'2026-08-12T18:58:00Z', players:16, divisions:['A','B'], warnings:0, live:false },
    ]});
    if (u.includes('api/stats')) return json({ index: [], board: null });
    return json({});
  };
});

const shot = async (name, selector) => {
  const el = await page.$(selector);
  if (!el) { console.log('!! MISSING', name, selector); return; }
  const b = await el.boundingBox();
  if (!b || b.height < 5) { console.log('!! EMPTY', name); return; }
  // ElementHandle.screenshot resolves its own scroll position. A manual
  // page.screenshot clip does not, so it silently captures the wrong region
  // once anything on the page has scrolled.
  await el.screenshot({ path: `${OUT}/${name}.png` });
  const says = await el.evaluate(n => n.innerText.replace(/\s+/g,' ').trim().slice(0,60));
  console.log(`captured ${name.padEnd(22)} ${Math.round(b.width)}x${Math.round(b.height)}  "${says}"`);
};

const text = (sel) => page.$eval(sel, n => n.innerText.replace(/\s+/g, ' ').trim().slice(0, 150))
  .catch(() => '(missing)');

await page.evaluateOnNewDocument(() => {
  const css = document.createElement('style');
  css.textContent = '*{scroll-behavior:auto !important}';
  document.addEventListener('DOMContentLoaded', () => document.head.append(css));
});
await page.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 900));

const tagCards = () => page.evaluate(() => {
  document.getElementById('season')?.closest('.card')?.setAttribute('data-shot', 'step1');
  document.getElementById('drop')?.closest('.card')?.setAttribute('data-shot', 'step2');
});

await shot('01-signin', '#gate');
await page.type('#passcode', 'demo-passcode');
await page.click('#gateBtn');
await new Promise(r => setTimeout(r, 700));

// Season must fire a change event, otherwise loadHistory() never runs and the
// Published history panel stays on its "name a season" placeholder.
await page.type('#season', 'Winter/Spring 2026');
await page.evaluate(() => {
  document.getElementById('season').dispatchEvent(new Event('change', { bubbles: true }));
  [...document.querySelectorAll('#leagues button')].find(b => b.textContent === 'Singles').click();
});
await new Promise(r => setTimeout(r, 800));
await tagCards();
await shot('03-season-league', '[data-shot="step1"]');
await shot('04-dropzone-empty', '[data-shot="step2"]');

await page.evaluate((c, x) => {
  const dt = new DataTransfer();
  dt.items.add(new File([c], 'BCDAS_Winter_Spring_2026_all_cricket_leaderboard.csv', { type: 'text/csv' }));
  dt.items.add(new File([x], 'BCDAS_Winter_Spring_2026_all_01_leaderboard.csv', { type: 'text/csv' }));
  const i = document.getElementById('file');
  i.files = dt.files;
  i.dispatchEvent(new Event('change', { bubbles: true }));
}, cricketCsv, x01Csv);
await new Promise(r => setTimeout(r, 700));
await shot('05-dropzone-filled', '[data-shot="step2"]');

await page.click('#processBtn');
await new Promise(r => setTimeout(r, 1100));
await shot('06-preview', '#previewCard');
await shot('07-preview-numbers', '#stats');
await shot('08-warnings', '#warnings');
await shot('09-publish-row', '#publishBtn');
await shot('10-roster', '#rosterCard');
await page.evaluate(() => document.getElementById('historyCard').scrollIntoView());
await new Promise(r => setTimeout(r, 500));
await shot('11-history', '#historyCard');

// report what each panel actually SAYS, so captions can be checked against reality
console.log('\n--- content check ---');
console.log('stats      :', await text('#stats'));
console.log('warnings   :', await text('#warnings'));
console.log('roster     :', await text('#rosterCard'));
console.log('history    :', await text('#historyCard'));
console.log('publishBtn :', await text('#publishBtn'));

await browser.close();
