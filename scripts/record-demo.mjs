import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'videos');
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  recordVideo: { dir: outDir, size: { width: 1280, height: 800 } },
});
const page = await context.newPage();
await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForFunction(() => !!window.RENO);
await page.waitForTimeout(1500);

const toScreen = async (wx, wy) => {
  const box = await page.locator('#c2d').boundingBox();
  const [sx, sy] = await page.evaluate(([x, y]) => window.RENO.W2S(x, y), [wx, wy]);
  return { x: box.x + sx, y: box.y + sy };
};
const drag = async (from, to, steps = 14) => {
  const a = await toScreen(...from), b = await toScreen(...to);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++)
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  await page.mouse.up();
};
const wait = (ms) => page.waitForTimeout(ms);

// 1) 拖动沙发贴墙吸附
await drag([6700, 9870], [9000, 9870]);
await wait(900);

// 2) 测量：北侧卧室带净深
await page.click('[data-tool=measure]');
await page.waitForTimeout(300);
await drag([240, 240], [240, 3250], 2);
await wait(1200);

// 3) 拆非承重墙 + 撤销
await page.click('[data-tool=demolish]');
await page.waitForTimeout(300);
await page.mouse.click((await toScreen(1880, 4100)).x, (await toScreen(1880, 4100)).y);
await wait(1300);
await page.keyboard.press('Control+z');
await wait(1000);

// 4) 换客厅地面材料
await page.click('[data-tool=floor]');
await page.waitForTimeout(300);
await page.mouse.click((await toScreen(7000, 8800)).x, (await toScreen(7000, 8800)).y);
await wait(1200);

// 5) 切 3D（过渡动画）
await page.screenshot({ path: path.join(outDir, 'shot-2d.png') });
await page.click('#btn3d');
await wait(1900);

// 6) 鸟瞰拖转
const c3d = await page.locator('#c3dwrap canvas').boundingBox();
await page.mouse.move(c3d.x + c3d.width / 2, c3d.y + c3d.height / 2);
await page.mouse.down();
for (let i = 1; i <= 16; i++) {
  await page.mouse.move(c3d.x + c3d.width / 2 + i * 7, c3d.y + c3d.height / 2 - i * 2.5);
  await wait(50);
}
await page.mouse.up();
await wait(900);
await page.screenshot({ path: path.join(outDir, 'shot-3d.png') });

// 7) 第一人称漫游：W 前进 + 拖动转头 + A 平移
await page.click('#btnWalk');
await wait(700);
await page.keyboard.down('w');
await wait(1500);
await page.keyboard.up('w');
const look = c3d;
await page.mouse.move(look.x + look.width / 2, look.y + look.height / 2);
await page.mouse.down();
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(look.x + look.width / 2 - i * 6, look.y + look.height / 2);
  await wait(50);
}
await page.mouse.up();
await page.keyboard.down('a');
await wait(900);
await page.keyboard.up('a');
await wait(500);

// 8) 回 2D
await page.keyboard.press('Escape');
await wait(500);
await page.click('#btn2d');
await wait(1600);

await page.close();
await context.close();
await browser.close();
console.log('recorded to', outDir);
