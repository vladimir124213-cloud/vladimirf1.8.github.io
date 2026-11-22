// Скриншоты через Chrome DevTools Protocol: точная эмуляция вьюпорта,
// полная страница, состояния меню и лайтбокса. Запуск: node tools/shoot.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const OUT = path.join(ROOT, 'shots');
const PAGE_URL = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');

fs.mkdirSync(OUT, { recursive: true });

const browser = spawn(
  EDGE,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--user-data-dir=${path.join(ROOT, '.edge-cdp')}`,
    `--remote-debugging-port=${PORT}`,
    'about:blank',
  ],
  { stdio: 'ignore', detached: true }
);
browser.unref();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeout = 30000, step = 300) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {}
    await sleep(step);
  }
  throw new Error('timeout');
}

const version = await waitFor(async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
  return r.ok ? await r.json() : null;
});
console.log('browser:', version.Browser);

const target = await waitFor(async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, {
    method: 'PUT',
  });
  return r.ok ? await r.json() : null;
});

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

let msgId = 0;
const pending = new Map();
const events = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
  } else if (msg.method) {
    events.push(msg.method);
  }
};

function send(method, params = {}) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const { result } = await send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return result.value;
}

async function settle() {
  await waitFor(() => evaluate('document.readyState === "complete"'), 20000);
  await evaluate('document.fonts.ready.then(() => true)');
  // для статичных скриншотов отключаем анимации появления и ленивую загрузку
  await evaluate(`(() => {
    document.documentElement.classList.remove('js');
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-visible'));
    document.querySelectorAll('img[loading="lazy"]').forEach((img) => { img.loading = 'eager'; });
    return true;
  })()`);
  await sleep(1400);
}

async function shot(name, { width, height, full = false, mobile = false }) {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: mobile ? 2 : 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Page.navigate', { url: 'about:blank' });
  await sleep(150);
  await send('Page.navigate', { url: PAGE_URL });
  await settle();

  const metrics = await evaluate(
    'JSON.stringify({sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: window.innerWidth, ih: window.innerHeight})'
  );
  const m = JSON.parse(metrics);
  console.log(name, m);

  const clipHeight = full ? m.sh : Math.min(height, m.sh);
  const { data } = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: full,
    ...(full
      ? { clip: { x: 0, y: 0, width: width, height: clipHeight, scale: 1 } }
      : {}),
  });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data, 'base64'));
}

// --- десктоп ---
await shot('d-full', { width: 1440, height: 900, full: true });

// --- планшет ---
await shot('t-full', { width: 820, height: 900, full: true, mobile: true });

// --- телефон ---
await shot('m-full', { width: 390, height: 844, full: true, mobile: true });

// --- состояния на телефоне: меню и лайтбокс ---
await send('Emulation.setDeviceMetricsOverride', {
  width: 390,
  height: 844,
  deviceScaleFactor: 2,
  mobile: true,
});
await send('Page.navigate', { url: PAGE_URL });
await settle();

await evaluate('document.getElementById("burger").click(), true');
await sleep(700);
let res = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'm-menu.png'), Buffer.from(res.data, 'base64'));

await evaluate('document.getElementById("burger").click(), true');
await sleep(500);
await evaluate('document.querySelector(".work-btn").click(), true');
await sleep(900);
res = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'm-lightbox.png'), Buffer.from(res.data, 'base64'));

// --- лайтбокс на десктопе ---
await send('Emulation.setDeviceMetricsOverride', {
  width: 1440,
  height: 900,
  deviceScaleFactor: 1,
  mobile: false,
});
await send('Page.navigate', { url: PAGE_URL });
await settle();
await evaluate('document.querySelectorAll(".work-btn")[2].click(), true');
await sleep(900);
res = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(path.join(OUT, 'd-lightbox.png'), Buffer.from(res.data, 'base64'));

console.log('done');
ws.close();
try {
  process.kill(browser.pid);
} catch {}
process.exit(0);
