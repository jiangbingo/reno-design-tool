import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const APP_URL = 'file://' + path.join(process.cwd(), 'index.html');

interface Reno {
  state: { walls: unknown[]; furniture: Array<Record<string, unknown>>; rooms: Array<Record<string, unknown>> };
  W2S: (x: number, y: number) => [number, number];
  measures: Array<{ x1: number; y1: number; x2: number; y2: number }>;
  selectedId: string | null;
  LS_KEY: string;
}

const reno = (page: Page) => page.evaluate(() => (window as unknown as { RENO: Reno }).RENO);
const walls = (page: Page) => reno(page).then((r) => r.state.walls.length);
const furn = (page: Page, id: string) =>
  reno(page).then((r) => r.state.furniture.find((f) => f.id === id)) as Promise<{ cx: number; cy: number }>;

async function toScreen(page: Page, wx: number, wy: number) {
  const box = await page.locator('#c2d').boundingBox();
  const [sx, sy] = await page.evaluate(([x, y]) => (window as unknown as { RENO: Reno }).RENO.W2S(x, y), [wx, wy]);
  return { x: box!.x + sx, y: box!.y + sy };
}

async function clickWorld(page: Page, wx: number, wy: number) {
  const p = await toScreen(page, wx, wy);
  await page.mouse.click(p.x, p.y);
}

async function dragWorld(page: Page, from: [number, number], to: [number, number], steps = 8) {
  const a = await toScreen(page, from[0], from[1]);
  const b = await toScreen(page, to[0], to[1]);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / steps, a.y + ((b.y - a.y) * i) / steps);
  }
  await page.mouse.up();
}

async function pickTool(page: Page, tool: string) {
  await page.click(`[data-tool=${tool}]`);
}

test.beforeEach(async ({ page }) => {
  await page.goto(APP_URL);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForFunction(() => !!(window as unknown as { RENO?: unknown }).RENO);
});

test('loads default plan: 21 walls / 40 furniture / 13 rooms', async ({ page }) => {
  const r = await reno(page);
  expect(r.state.walls).toHaveLength(21);
  expect(r.state.furniture).toHaveLength(40);
  expect(r.state.rooms).toHaveLength(13);
});

test('dragging furniture follows cursor and snaps flush to wall face', async ({ page }) => {
  const before = await furn(page, 'f28');
  await dragWorld(page, [6700, 9870], [9000, 9870]);
  const after = await furn(page, 'f28');
  expect(after.cx).toBeGreaterThan(before.cx + 1000);
  expect(after.cy).toBe(before.cy);
  expect(after.cx).toBe(8930);
});

test('measure tool records exact distance in mm', async ({ page }) => {
  await pickTool(page, 'measure');
  await clickWorld(page, 240, 240);
  await clickWorld(page, 240, 3250);
  const r = await reno(page);
  expect(r.measures).toHaveLength(1);
  const d = Math.hypot(r.measures[0].x2 - r.measures[0].x1, r.measures[0].y2 - r.measures[0].y1);
  expect(Math.round(d)).toBe(3010);
});

test('demolishes partition wall, protects load-bearing, undo restores', async ({ page }) => {
  await pickTool(page, 'demolish');
  await clickWorld(page, 1880, 4100);
  expect(await walls(page)).toBe(20);
  await clickWorld(page, 5000, 120);
  expect(await walls(page)).toBe(20);
  await page.keyboard.press('Control+z');
  expect(await walls(page)).toBe(21);
});

test('floor material cycles through palette on room click', async ({ page }) => {
  const floorOf = () => page.evaluate(() => {
    const r = (window as unknown as { RENO: Reno }).RENO.state.rooms;
    return r.find((x) => x.id === 'kt')!.floor;
  });
  expect(await floorOf()).toBe('wood');
  await pickTool(page, 'floor');
  await clickWorld(page, 7000, 8800);
  expect(await floorOf()).toBe('tile');
  await clickWorld(page, 7000, 8800);
  expect(await floorOf()).toBe('tileDark');
});

test('snapToWalls aligns furniture edge exactly to wall face', async ({ page }) => {
  await page.evaluate(() => {
    const R = (window as unknown as { RENO: Reno & { state: { furniture: Array<Record<string, unknown>> } } }).RENO;
    R.state.furniture.push({ id: 't1', type: 'bed', name: 'test', cx: 6000, cy: 7600, w: 1800, d: 2000, rot: 0 });
  });
  await page.evaluate(() => {
    const w = window as unknown as { RENO: Reno; snapToWalls: (f: unknown) => void };
    w.snapToWalls(w.RENO.state.furniture.find((f) => f.id === 't1'));
  });
  const bed = await furn(page, 't1');
  expect(bed.cy).toBe(7610);
});

test('reset button restores defaults and clears storage', async ({ page }) => {
  await page.evaluate(() => {
    const R = (window as unknown as { RENO: Reno & { state: { furniture: Array<Record<string, unknown>> } } }).RENO;
    R.state.furniture.push({ id: 'junk', type: 'bed', name: 'junk', cx: 5000, cy: 5000, w: 1000, d: 2000, rot: 0 });
    R.state.walls.pop();
  });
  await page.click('#btnSave');
  expect(await page.evaluate(() => !!localStorage.getItem('reno_design_tool_v1'))).toBe(true);
  await page.click('#btnReset');
  expect(await walls(page)).toBe(21);
  expect(await page.evaluate(() => (window as unknown as { RENO: Reno }).RENO.state.furniture)).toHaveLength(40);
  expect(await page.evaluate(() => localStorage.getItem('reno_design_tool_v1'))).toBeNull();
});

test('3D view initializes from local three.js', async ({ page }) => {
  await page.click('#btn3d');
  await expect(page.locator('#c3dwrap canvas')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#c3dwrap')).not.toHaveClass(/hidden/);
});
