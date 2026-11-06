const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const os = require('node:os');
const { translate, LANGUAGES, DEFAULT_LANGUAGE, MESSAGES } = require('../shared/i18n.js');

/** @type {BrowserWindow | null} */
let win = null;
/** @type {{ path: string, name: string } | null} */
let currentWorkspace = null;

const RECENT_LIMIT = 12;

/* ------------------------------ settings ------------------------------ */

let settings = { language: DEFAULT_LANGUAGE };

function settingsFile() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  try {
    const raw = fsSync.readFileSync(settingsFile(), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && LANGUAGES.includes(parsed.language)) {
      settings.language = parsed.language;
    }
  } catch {
    /* first run, or unreadable — keep defaults */
  }
}

async function saveSettings() {
  try {
    await fs.mkdir(path.dirname(settingsFile()), { recursive: true });
    await fs.writeFile(settingsFile(), JSON.stringify(settings, null, 2), 'utf8');
  } catch {
    /* settings are best-effort */
  }
}

function t(key, vars) {
  return translate(settings.language, key, vars);
}

function recentFile() {
  return path.join(app.getPath('userData'), 'recent.json');
}

async function loadRecent() {
  try {
    const raw = await fs.readFile(recentFile(), 'utf8');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function pushRecent(entry) {
  const list = await loadRecent();
  const next = [entry, ...list.filter((item) => item.path !== entry.path)].slice(0, RECENT_LIMIT);
  await fs.mkdir(path.dirname(recentFile()), { recursive: true });
  await fs.writeFile(recentFile(), JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/* ------------------------------ window ------------------------------ */

let documentDirty = false;
let closePromptOpen = false;
let allowClose = false;

function createWindow({ show = true } = {}) {
  // A previous window may have closed via the guard; the new one starts fresh.
  allowClose = false;
  closePromptOpen = false;

  win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 760,
    minHeight: 520,
    show: false,
    backgroundColor: '#16181d',
    // `hiddenInset` is macOS-only; on Windows the native frame is kept so
    // there is exactly one title bar.
    ...(process.platform === 'darwin' ? { titleBarStyle: 'hiddenInset' } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  win.loadFile(path.join(__dirname, '../renderer/index.html'));
  win.once('ready-to-show', () => {
    if (show) win.show();
  });
  win.on('closed', () => {
    win = null;
  });

  // Ask the renderer whether it has unsaved work before tearing the window
  // down; it answers through `app:close-response`.
  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (closePromptOpen) return;
    closePromptOpen = true;
    send('app:close-request');
  });

  // Open external links in the system browser instead of in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) {
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    }
  });
}

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

/* ------------------------------ menu ------------------------------ */

function setLanguage(language) {
  if (!LANGUAGES.includes(language) || language === settings.language) return;
  settings.language = language;
  saveSettings();
  buildMenu();
  send('menu:language', language);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: t('menuFile'),
      submenu: [
        {
          label: t('newFile'),
          accelerator: 'CmdOrCtrl+N',
          click: () => send('menu:new-file'),
        },
        {
          label: t('openFile'),
          accelerator: 'CmdOrCtrl+O',
          click: () => send('menu:open-file'),
        },
        {
          label: t('openFolder'),
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => send('menu:open-folder'),
        },
        { type: 'separator' },
        {
          label: t('save'),
          accelerator: 'CmdOrCtrl+S',
          click: () => send('menu:save'),
        },
        {
          label: t('saveAs'),
          accelerator: 'CmdOrCtrl+Shift+S',
          click: () => send('menu:save-as'),
        },
        { type: 'separator' },
        {
          label: t('exportHtml'),
          click: () => send('menu:export', 'html'),
        },
        {
          label: t('exportPdf'),
          click: () => send('menu:export', 'pdf'),
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: t('close') } : { role: 'quit', label: t('quit') },
      ],
    },
    {
      label: t('menuEdit'),
      submenu: [
        { role: 'undo', label: t('undo') },
        { role: 'redo', label: t('redo') },
        { type: 'separator' },
        { role: 'cut', label: t('cut') },
        { role: 'copy', label: t('copy') },
        { role: 'paste', label: t('paste') },
        { role: 'pasteAndMatchStyle', label: t('pasteAndMatchStyle') },
        { role: 'selectAll', label: t('selectAll') },
        { type: 'separator' },
        {
          label: t('find'),
          accelerator: 'CmdOrCtrl+F',
          click: () => send('menu:find'),
        },
      ],
    },
    {
      label: t('menuView'),
      submenu: [
        {
          label: t('toggleOutline'),
          accelerator: 'CmdOrCtrl+Shift+B',
          click: () => send('menu:toggle-outline'),
        },
        {
          label: t('toggleSidebar'),
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => send('menu:toggle-sidebar'),
        },
        { type: 'separator' },
        {
          label: t('language'),
          submenu: LANGUAGES.map((code) => ({
            label: code === 'zh' ? t('chinese') : t('english'),
            type: 'radio',
            checked: settings.language === code,
            click: () => setLanguage(code),
          })),
        },
        { type: 'separator' },
        {
          label: t('lightTheme'),
          accelerator: 'CmdOrCtrl+Shift+L',
          click: () => send('menu:theme', 'light'),
        },
        {
          label: t('darkTheme'),
          click: () => send('menu:theme', 'dark'),
        },
        { type: 'separator' },
        { role: 'reload', label: t('reload') },
        { role: 'toggleDevTools', label: t('devTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('zoomReset') },
        { role: 'zoomIn', label: t('zoomIn') },
        { role: 'zoomOut', label: t('zoomOut') },
        { role: 'togglefullscreen', label: t('fullscreen') },
      ],
    },
    { role: 'windowMenu', label: t('menuWindow') },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------ ipc ------------------------------ */

const MD_VISIBLE = new Set(['.md', '.markdown', '.mdown', '.mdx', '.txt']);

async function readTree(dir, depth = 0) {
  /** @type {any[]} */
  const entries = [];
  if (depth > 6) return entries;

  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return entries;
  }

  dirents.sort((a, b) => {
    const aDir = a.isDirectory();
    const bDir = b.isDirectory();
    if (aDir !== bDir) return aDir ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true });
  });

  for (const dirent of dirents) {
    if (dirent.name.startsWith('.') || dirent.name === 'node_modules') continue;
    const full = path.join(dir, dirent.name);
    if (dirent.isDirectory()) {
      entries.push({
        kind: 'dir',
        name: dirent.name,
        path: full,
        children: await readTree(full, depth + 1),
      });
    } else if (MD_VISIBLE.has(path.extname(dirent.name).toLowerCase())) {
      entries.push({ kind: 'file', name: dirent.name, path: full });
    }
  }
  return entries;
}

ipcMain.handle('app:bootstrap', async () => ({
  recent: await loadRecent(),
  version: app.getVersion(),
  platform: process.platform,
  language: settings.language,
  messages: MESSAGES[settings.language] || MESSAGES[DEFAULT_LANGUAGE],
}));

ipcMain.handle('file:read', async (_event, filePath) => {
  const content = await fs.readFile(filePath, 'utf8');
  const stat = await fs.stat(filePath);
  return {
    path: filePath,
    name: path.basename(filePath),
    dir: path.dirname(filePath),
    content,
    mtime: stat.mtimeMs,
  };
});

ipcMain.handle('file:write', async (_event, filePath, content) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
  return { path: filePath, mtime: (await fs.stat(filePath)).mtimeMs };
});

ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [
      { name: t('filterMarkdown'), extensions: ['md', 'markdown', 'mdown', 'mdx', 'txt'] },
      { name: t('filterAll'), extensions: ['*'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:save-file', async (_event, suggested, content) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggested || path.join(app.getPath('documents'), t('untitled')),
    filters: [
      { name: t('filterMarkdown'), extensions: ['md'] },
      { name: t('filterHtml'), extensions: ['html'] },
      { name: t('filterPdf'), extensions: ['pdf'] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  if (content !== undefined) await fs.writeFile(result.filePath, content, 'utf8');
  return result.filePath;
});

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  const dir = result.filePaths[0];
  currentWorkspace = { path: dir, name: path.basename(dir) };
  return {
    path: dir,
    name: currentWorkspace.name,
    tree: await readTree(dir),
  };
});

ipcMain.handle('workspace:refresh', async () => {
  if (!currentWorkspace) return null;
  return {
    path: currentWorkspace.path,
    name: currentWorkspace.name,
    tree: await readTree(currentWorkspace.path),
  };
});

ipcMain.handle('recent:push', async (_event, entry) => pushRecent(entry));

ipcMain.handle('export:html', async (_event, suggested, html) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggested || path.join(app.getPath('documents'), 'export.html'),
    filters: [{ name: t('filterHtml'), extensions: ['html'] }],
  });
  if (result.canceled || !result.filePath) return null;
  await fs.writeFile(result.filePath, html, 'utf8');
  return result.filePath;
});

ipcMain.handle('export:pdf', async (_event, suggested, html) => {
  const result = await dialog.showSaveDialog(win, {
    defaultPath: suggested || path.join(os.homedir(), 'export.pdf'),
    filters: [{ name: t('filterPdf'), extensions: ['pdf'] }],
  });
  if (result.canceled || !result.filePath) return null;

  // Render a print-oriented copy in a hidden window so the PDF is clean
  // (no sidebar, no outline, no scrollbars). The renderer hands over the
  // already-rendered HTML so this never races the editor's buffer.
  const printWin = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  await printWin.loadURL(
    'data:text/html;charset=utf-8,' + encodeURIComponent(html || '<p>Empty document</p>')
  );
  const pdf = await printWin.webContents.printToPDF({
    printBackground: true,
    margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
    pageSize: 'A4',
  });
  await fs.writeFile(result.filePath, pdf);
  printWin.destroy();
  return result.filePath;
});

ipcMain.handle('window:set-title', (_event, title, edited) => {
  documentDirty = Boolean(edited);
  if (win && !win.isDestroyed()) {
    win.setTitle(title);
    if (process.platform === 'darwin') win.setDocumentEdited(documentDirty);
  }
  return true;
});

/* ------------------------------ close flow ------------------------------ */

ipcMain.handle('app:close-response', (_event, action) => {
  closePromptOpen = false;
  if (action === 'cancel') return false;
  allowClose = true;
  if (win && !win.isDestroyed()) win.close();
  return true;
});

ipcMain.handle('app:ask-close', async (_event, name) => {
  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: [t('closeSave'), t('closeDontSave'), t('closeCancel')],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    title: t('closeTitle'),
    message: t('closeMessage', { name }),
  });
  if (result.response === 2) return 'cancel';
  return result.response === 0 ? 'save' : 'discard';
});

ipcMain.handle('shell:open-external', (_event, url) => {
  if (/^https?:/i.test(url)) shell.openExternal(url);
});

/* ------------------------------ lifecycle ------------------------------ */

/**
 * Dev-only screenshot harness. Launch with:
 *   electron . --capture <outDir> <fixture.md> [--theme light]
 * It renders the fixture, writes PNGs, and quits. Never active in normal runs.
 */
async function runCapture(outDir, fixturePath, theme) {
  fs.mkdir(outDir, { recursive: true });

  const text = fixturePath ? await fs.readFile(fixturePath, 'utf8') : '';
  const name = fixturePath ? path.basename(fixturePath) : 'untitled.md';

  // The window must actually be shown: a hidden window does not lay out
  // properly, which collapses the editor viewport and breaks capture.
  createWindow({ show: true });
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  // Wait for boot() to finish loading its start document, otherwise it
  // overwrites the fixture we are about to install.
  await win.webContents.executeJavaScript('window.__lumenReady');

  await win.webContents.executeJavaScript(
    `document.documentElement.setAttribute('data-theme', ${JSON.stringify(theme || 'dark')})`
  );

  await win.webContents.executeJavaScript(
    `window.__lumenSetDocument(${JSON.stringify(text)}, ${JSON.stringify(name)}); true`
  );

  // Let layout, fonts and widgets settle before the first frame.
  await new Promise((resolve) => setTimeout(resolve, 700));

  const shot = async (fileName) => {
    const image = await win.webContents.capturePage();
    if (image.isEmpty()) throw new Error(`capturePage returned an empty image for ${fileName}`);
    await fs.writeFile(path.join(outDir, fileName), image.toPNG());
  };

  await shot('default.png');

  // Drive the editor from inside the page and read the result back, so the
  // measurement can never race the decoration rebuild.
  const markerTest = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {};

      // --- caret outside the bold phrase ---
      window.__lumenPlaceCaretEnd();
      await new Promise((r) => setTimeout(r, 120));
      const markersOutside = Array.from(document.querySelectorAll('.lumen-marker'))
        .filter((m) => m.textContent.trim() === '**').length;

      // --- caret inside the bold phrase ---
      window.__lumenPlaceCaret();
      await new Promise((r) => setTimeout(r, 200));
      const markersInside = Array.from(document.querySelectorAll('.lumen-marker'))
        .filter((m) => m.textContent.trim() === '**').length;

      out.selection = window.__lumenProbe().selection;
      out.markersOutside = markersOutside;
      out.markersInside = markersInside;
      out.decoCounts = window.__lumenCountDecorations();
      out.decoErrors = (window.__lumenDecoErrors || []).slice(0, 3);
      out.decoSample = Array.from(document.querySelectorAll('.cm-line'))
        .filter((l) => l.textContent.includes('bold text'))
        .map((l) => l.innerHTML.slice(0, 400));

      // Walk the document and capture counts with each construct in view.
      out.perRegion = [];
      for (const item of [
        ['top', '# '],
        ['code', 'function greet'],
        ['table', '| Feature | Status'],
        ['quote', '> A block quote'],
        ['lists', '- Bullet one'],
      ]) {
        window.__lumenScrollOnly(item[1]);
        await new Promise((r) => setTimeout(r, 350));
        out.perRegion.push({
          at: item[0],
          counts: window.__lumenCountDecorations(),
          head: window.__lumenDebug.editor.view.state.selection.main.head,
        });
      }

      // Put the caret back at the top for the closing screenshot.
      window.__lumenPlaceCaretEnd();
      await new Promise((r) => setTimeout(r, 150));

      // Re-count after the selection moved away again, so a construct that
      // rendered only while focused would show up as a drop here.
      out.decoCountsAfterMove = window.__lumenCountDecorations();
      return out;
    })()
  `);

  const errors = await win.webContents.executeJavaScript('window.__lumenErrors || []');

  // Language switch + search panel + default font.
  const uiCheck = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {};

      out.fontFamily = getComputedStyle(document.querySelector('.cm-content')).fontFamily;
      out.langBefore = document.documentElement.lang;
      out.chromeBefore = {
        recent: document.getElementById('recent-title').textContent,
        outline: document.getElementById('outline-title').textContent,
        words: document.getElementById('status-words').textContent,
      };

      window.__lumenSetLanguage('en');
      await new Promise((r) => setTimeout(r, 60));
      out.langAfter = document.documentElement.lang;
      out.chromeAfter = {
        recent: document.getElementById('recent-title').textContent,
        outline: document.getElementById('outline-title').textContent,
        words: document.getElementById('status-words').textContent,
        saved: document.getElementById('status-saved').textContent,
      };
      out.findOpen = window.__lumenOpenFind();
      out.findButtons = Array.from(document.querySelectorAll('.cm-search button'))
        .map((b) => b.textContent.trim())
        .slice(0, 6);

      window.__lumenSetLanguage('zh');
      await new Promise((r) => setTimeout(r, 60));
      out.chromeBack = {
        recent: document.getElementById('recent-title').textContent,
        words: document.getElementById('status-words').textContent,
      };
      return out;
    })()
  `);
  console.log('[capture] ui check:', JSON.stringify(uiCheck, null, 2));

  // Per-region screenshots, taken from the main process.
  for (const item of [
    ['code', 'function greet'],
    ['table', '| Feature | Status'],
    ['quote', '> A block quote'],
    ['lists', '- Bullet one'],
  ]) {
    await win.webContents.executeJavaScript(
      `window.__lumenScrollOnly(${JSON.stringify(item[1])})`
    );
    await new Promise((resolve) => setTimeout(resolve, 450));
    await shot('region-' + item[0] + '.png');
  }

  await win.webContents.executeJavaScript('window.__lumenPlaceCaretEnd()');
  await new Promise((resolve) => setTimeout(resolve, 250));
  await shot('top.png');

  // Light theme pass.
  const themeResult = await win.webContents.executeJavaScript(`window.__lumenSetTheme('light')`);
  console.log('[capture] theme after switch:', themeResult, 'bodyBg=', await win.webContents.executeJavaScript('getComputedStyle(document.body).backgroundColor'));
  {
    const image = await win.webContents.capturePage();
    const bmp = image.toBitmap();
    const { width } = image.getSize();
    const px = (x, y) => {
      const i = (y * width + x) * 4;
      return [bmp[i + 2], bmp[i + 1], bmp[i]];
    };
    console.log('[capture] pixel(editor)=', px(600, 400), 'pixel(sidebar)=', px(60, 300));
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
  await shot('theme-light.png');

  // Export path: write the HTML and PDF that the menu actions would produce.
  const exported = await win.webContents.executeJavaScript(
    `window.__lumenExportHtml()`
  );
  const htmlPath = path.join(outDir, 'export.html');
  await fs.writeFile(htmlPath, exported, 'utf8');

  const printWin = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
  await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(exported));
  const pdf = await printWin.webContents.printToPDF({
    printBackground: true,
    pageSize: 'A4',
    margins: { marginType: 'custom', top: 0.6, bottom: 0.6, left: 0.7, right: 0.7 },
  });
  await fs.writeFile(path.join(outDir, 'export.pdf'), pdf);
  printWin.destroy();

  const probe = await win.webContents.executeJavaScript('window.__lumenProbe ? window.__lumenProbe() : null');
  console.log('[capture] console errors:', JSON.stringify(errors));
  console.log('[capture] marker test:', JSON.stringify(markerTest, null, 2));
  console.log('[capture] probe:', JSON.stringify(probe, null, 2));
  console.log('[capture] wrote', outDir);
}

/** Headless check of the dirty-guard close flow (no dialogs are opened). */
async function runCloseCheck() {
  console.log('[close-check] start');
  createWindow({ show: true });
  win.webContents.on('console-message', (_event, level, message) => {
    console.log(`[renderer:${level}] ${message}`);
  });
  await new Promise((resolve) => win.webContents.once('did-finish-load', resolve));
  console.log('[close-check] loaded');
  await win.webContents.executeJavaScript('window.__lumenReady');
  console.log('[close-check] ready');

  const result = await win.webContents.executeJavaScript(`
    (async () => {
      const out = {};
      out.cleanClose = await window.__lumenSimulateClose('cancel');
      out.dirtyBefore = window.__lumenProbe().dirty;

      window.__lumenTypeText('dirty');
      await new Promise((r) => setTimeout(r, 80));
      out.dirtyAfter = window.__lumenProbe().dirty;

      // Stubbed answer: "cancel" must leave the buffer dirty and the window open.
      out.answerCancel = await window.__lumenSimulateClose('cancel');
      out.dirtyAfterCancel = window.__lumenProbe().dirty;

      // Stubbed answer: "discard" must proceed.
      out.answerDiscard = await window.__lumenSimulateClose('discard');

      window.__lumenSimulateClose(null);
      return out;
    })()
  `);
  console.log('[close-check]', JSON.stringify(result, null, 2));

  // `app.quit()` would be blocked by the same close guard this check just
  // exercised; this is a throwaway process, so end it outright.
  process.exit(0);
}

const captureIndex = process.argv.indexOf('--capture');

// Single-instance: re-focus the existing window instead of spawning a second one.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    loadSettings();

    if (captureIndex !== -1) {
      process.env.LUMEN_HARNESS = '1';
      const outDir = process.argv[captureIndex + 1];
      const fixture = process.argv[captureIndex + 2];
      const themeFlag = process.argv.indexOf('--theme');
      const theme = themeFlag !== -1 ? process.argv[themeFlag + 1] : null;

      runCapture(outDir, fixture, theme)
        .catch((err) => {
          console.error('[capture] failed:', err);
          process.exitCode = 1;
        })
        .finally(() => app.quit());
      return;
    }

    if (process.argv.includes('--close-check')) {
      process.env.LUMEN_HARNESS = '1';
      runCloseCheck()
        .catch((err) => {
          console.error('[close-check] failed:', err);
          process.exitCode = 1;
        })
        .finally(() => app.quit());
      return;
    }

    buildMenu();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
