const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

const root = __dirname;
const outfile = path.join(root, 'src/renderer/bundle.js');

const options = {
  entryPoints: [path.join(root, 'src/renderer/app.js')],
  bundle: true,
  outfile,
  sourcemap: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  logLevel: 'info',
};

/**
 * On Windows a straggling Electron process (or a file watcher) can still hold
 * the previous bundle open, which makes esbuild fail to write it. Retry with a
 * short backoff instead of reporting a phantom success.
 */
async function writeWithRetry(buildOptions, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    try {
      await esbuild.build(buildOptions);
      const size = fs.statSync(outfile).size;
      console.log(`[build] ok (${(size / 1024 / 1024).toFixed(2)} MB)`);
      return;
    } catch (err) {
      const locked = /Access is denied|EBUSY|EPERM/.test(String(err.message));
      if (!locked || i === attempts - 1) throw err;
      console.warn(`[build] output locked, retry ${i + 1}/${attempts}…`);
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
}

if (process.argv.includes('--watch')) {
  const ctxPromise = esbuild.context(options);
  ctxPromise
    .then((ctx) => ctx.watch())
    .then(() => console.log('[build] watching...'))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
} else {
  writeWithRetry(options).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
