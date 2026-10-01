import { chromium } from '@playwright/test';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1050 } });
const errs = [];
page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 150)); });
await page.goto('https://jiangbin-ai.pages.dev/apps/reno/');
await page.waitForTimeout(2500);
const r = await page.evaluate(() => ({
  reno: !!window.RENO,
  walls: window.RENO ? window.RENO.state.walls.length : null,
}));
console.log('LIVE_2D', JSON.stringify({ ...r, errs: errs.slice(0, 3) }));
await page.click('#btn3d').catch(() => {});
await page.waitForTimeout(2000);
const c3d = await page.evaluate(() => !!document.querySelector('#c3dwrap canvas'));
console.log('LIVE_3D_CANVAS', c3d);
await browser.close();
