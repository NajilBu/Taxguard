const { app, BrowserWindow, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 600,
    height: 600,
    show: false,
    webPreferences: { nodeIntegration: false, contextIsolation: true }
  });

  const svg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bgGrad" x1="64" y1="40" x2="448" y2="472" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#142c4b"/>
        <stop offset="50%" stop-color="#0a1829"/>
        <stop offset="100%" stop-color="#050d18"/>
      </linearGradient>
      <linearGradient id="rimGrad" x1="128" y1="40" x2="384" y2="472" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#70c2df" stop-opacity="0.85"/>
        <stop offset="35%" stop-color="#2766db" stop-opacity="0.5"/>
        <stop offset="100%" stop-color="#112b46" stop-opacity="0.2"/>
      </linearGradient>
      <linearGradient id="shieldGrad" x1="256" y1="100" x2="256" y2="410" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#56b4d3"/>
        <stop offset="30%" stop-color="#3b91b3"/>
        <stop offset="70%" stop-color="#2766db"/>
        <stop offset="100%" stop-color="#194ba6"/>
      </linearGradient>
      <linearGradient id="shieldGleam" x1="160" y1="110" x2="352" y2="400" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/>
        <stop offset="40%" stop-color="#70c2df" stop-opacity="0.15"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0.25"/>
      </linearGradient>
      <linearGradient id="shieldBorder" x1="256" y1="96" x2="256" y2="416" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="#d4f1fc"/>
        <stop offset="45%" stop-color="#70c2df"/>
        <stop offset="100%" stop-color="#1d4d8c"/>
      </linearGradient>
      <filter id="shadow" x="0" y="0" width="512" height="512" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#020811" flood-opacity="0.6"/>
        <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#2766db" flood-opacity="0.35"/>
      </filter>
      <filter id="letterShadow" x="120" y="100" width="272" height="300" filterUnits="userSpaceOnUse">
        <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#0a1c38" flood-opacity="0.65"/>
      </filter>
    </defs>
    <rect x="36" y="36" width="440" height="440" rx="96" fill="url(#bgGrad)" filter="url(#shadow)" stroke="url(#rimGrad)" stroke-width="4"/>
    <rect x="42" y="42" width="428" height="428" rx="90" fill="none" stroke="#70c2df" stroke-width="1.5" stroke-opacity="0.2"/>
    <path d="M 130 115 L 382 115 Q 384 115 384 117 L 358 310 Q 357 314 354 317 L 258 402 Q 256 404 254 402 L 158 317 Q 155 314 154 310 L 128 117 Q 128 115 130 115 Z" fill="url(#shieldGrad)" stroke="url(#shieldBorder)" stroke-width="7" stroke-linejoin="round" filter="url(#shadow)"/>
    <path d="M 136 122 L 376 122 L 352 308 L 256 394 L 160 308 Z" fill="url(#shieldGleam)" opacity="0.6"/>
    <path d="M 256 122 L 256 394" stroke="#ffffff" stroke-width="2" stroke-opacity="0.35"/>
    <path d="M 256 122 L 376 122 L 352 308 L 256 394 Z" fill="#000000" opacity="0.12"/>
    <g filter="url(#letterShadow)">
      <path d="M 174 172 H 338 Q 342 172 342 176 V 212 Q 342 216 338 216 H 282 V 338 Q 282 342 278 342 H 234 Q 230 342 230 338 V 216 H 174 Q 170 216 170 212 V 176 Q 170 172 174 172 Z" fill="#ffffff"/>
      <path d="M 176 174 H 336 V 179 H 176 Z" fill="#ffffff" opacity="0.8"/>
      <path d="M 232 216 H 236 V 338 H 232 Z" fill="#ffffff" opacity="0.5"/>
    </g>
  </svg>`;

  const html = `<!DOCTYPE html>
<html>
<body>
<canvas id="c" width="512" height="512"></canvas>
<script>
  window.renderPng = function(svgStr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        const c = document.getElementById('c');
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 512, 512);
        ctx.drawImage(img, 0, 0, 512, 512);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/png'));
      };
      img.onerror = reject;
      img.src = url;
    });
  };
</script>
</body>
</html>`;

  await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));

  const dataUrl = await win.webContents.executeJavaScript(`window.renderPng(${JSON.stringify(svg)})`);
  const base64Data = dataUrl.replace(/^data:image\/png;base64,/, '');
  const png512 = Buffer.from(base64Data, 'base64');

  const outDir = path.join(__dirname);
  const rootDir = path.join(__dirname, '..');

  fs.writeFileSync(path.join(outDir, 'icon.png'), png512);
  fs.writeFileSync(path.join(rootDir, 'favicon.png'), png512);
  console.log('Saved 512x512 icon.png (' + png512.length + ' bytes)');

  const img512 = nativeImage.createFromBuffer(png512);
  const sizes = [256, 128, 64, 48, 32, 16];
  const pngBuffers = [];

  for (const s of sizes) {
    const resized = img512.resize({ width: s, height: s, quality: 'best' });
    pngBuffers.push({
      width: s === 256 ? 0 : s,
      height: s === 256 ? 0 : s,
      buffer: resized.toPNG()
    });
  }

  // Build ICO binary structure
  const count = pngBuffers.length;
  const headerLen = 6;
  const dirEntryLen = 16;
  let offset = headerLen + count * dirEntryLen;

  const header = Buffer.alloc(headerLen);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // Type 1 = Icon
  header.writeUInt16LE(count, 4); // Number of images

  const dirEntries = [];
  for (const item of pngBuffers) {
    const entry = Buffer.alloc(dirEntryLen);
    entry.writeUInt8(item.width, 0); // Width
    entry.writeUInt8(item.height, 1); // Height
    entry.writeUInt8(0, 2); // Palette
    entry.writeUInt8(0, 3); // Reserved
    entry.writeUInt16LE(1, 4); // Color planes
    entry.writeUInt16LE(32, 6); // Bits per pixel
    entry.writeUInt32LE(item.buffer.length, 8); // Size
    entry.writeUInt32LE(offset, 12); // Offset
    offset += item.buffer.length;
    dirEntries.push(entry);
  }

  const icoBuffer = Buffer.concat([header, ...dirEntries, ...pngBuffers.map(p => p.buffer)]);

  fs.writeFileSync(path.join(outDir, 'icon.ico'), icoBuffer);
  fs.writeFileSync(path.join(rootDir, 'favicon.ico'), icoBuffer);
  console.log('Saved multi-resolution icon.ico and favicon.ico (' + icoBuffer.length + ' bytes)');

  app.quit();
});
