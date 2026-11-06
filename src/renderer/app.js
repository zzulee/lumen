import { DocumentView } from './editor/document.js';
import { extractOutline } from './editor/outline.js';
import { setBaseDir, refreshEffect } from './editor/live-preview.js';
import { EditorView } from '@codemirror/view';
import { openSearchPanel } from '@codemirror/search';
import { LANGUAGES, DEFAULT_LANGUAGE, translate } from '../shared/i18n.js';

const api = window.lumen;

/* ============================================================
   i18n
   ============================================================

   The catalogue lives in `src/shared/i18n.js` and is the same table the main
   process uses for menus and native dialogs, so the two can never drift.
   Switching language re-applies it to every piece of chrome without a reload.
   ============================================================ */

let language = DEFAULT_LANGUAGE;
const localeListeners = [];

function t(key, vars) {
  return translate(language, key, vars);
}

/** Register a callback that re-renders translated chrome. */
function onLocale(fn) {
  localeListeners.push(fn);
}

function applyLocale(code) {
  if (!LANGUAGES.includes(code)) code = DEFAULT_LANGUAGE;
  language = code;
  for (const fn of localeListeners) fn();
}

/* ============================================================
   DOM handles
   ============================================================ */

const el = {
  sidebar: document.getElementById('sidebar'),
  outlinePanel: document.getElementById('outline'),
  outlineBody: document.getElementById('outline-body'),
  outlineTitle: document.getElementById('outline-title'),
  tree: document.getElementById('tree'),
  treeSection: document.getElementById('tree-section'),
  treeTitle: document.getElementById('tree-title'),
  recentList: document.getElementById('recent-list'),
  recentSection: document.getElementById('recent-section'),
  recentTitle: document.getElementById('recent-title'),
  workspaceName: document.getElementById('workspace-name'),
  btnOpenFolder: document.getElementById('btn-open-folder'),
  docTitle: document.getElementById('doc-title'),
  docMeta: document.getElementById('doc-meta'),
  editorHost: document.getElementById('editor-host'),
  statusWords: document.getElementById('status-words'),
  statusChars: document.getElementById('status-chars'),
  statusPath: document.getElementById('status-path'),
  statusSaved: document.getElementById('status-saved'),
};

/* ============================================================
   App state
   ============================================================ */

let recent = [];
let outline = [];
let currentHeadingIndex = -1;
let stats = { words: 0, chars: 0, lines: 0 };
let workspaceName = '';

const editor = new DocumentView(
  el.editorHost,
  {
    onDirty: () => {
      updateTitle();
      updateSavedIndicator();
    },
    onStats: ({ words, chars, lines }) => {
      stats = { words, chars, lines };
      renderStats();
      scheduleOutlineRefresh();
    },
    onOutline: () => {},
    onCursorMove: () => {
      updateCurrentHeading();
    },
  },
  ''
);

/* The main process reads this to render the buffer for PDF export. */
window.__lumenExportHtml = () => editor.exportHtml(editor.doc.name || t('untitledTitle'));

/* ============================================================
   Stats / title / save state
   ============================================================ */

function renderStats() {
  const words =
    language === 'en' && stats.words !== 1
      ? t('wordCountPlural', { n: stats.words })
      : t('wordCount', { n: stats.words });
  el.statusWords.textContent = words;
  el.statusChars.textContent = t('charCount', { n: stats.chars });
  el.docMeta.textContent = stats.lines > 0 ? t('lineCount', { n: stats.lines }) : '';
}

function updateTitle() {
  const name = editor.doc.name || t('untitled');
  const marker = editor.dirty ? ' •' : '';
  el.docTitle.textContent = `${name}${marker}`;
  el.statusPath.textContent = editor.doc.path || '';
  api.window.setTitle(`Lumen — ${name}`, editor.dirty);
}

function updateSavedIndicator() {
  el.statusSaved.textContent = editor.dirty ? t('unsaved') : t('saved');
  el.statusSaved.style.color = editor.dirty ? 'var(--accent)' : '';
  updateTitle();
}

/* ============================================================
   Outline
   ============================================================ */

let outlineTimer = 0;
function scheduleOutlineRefresh() {
  clearTimeout(outlineTimer);
  outlineTimer = setTimeout(renderOutline, 220);
}

function renderOutline() {
  outline = extractOutline(editor.content);
  el.outlineBody.textContent = '';

  if (outline.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'outline-empty';
    empty.textContent = t('emptyOutline');
    el.outlineBody.appendChild(empty);
    return;
  }

  for (let i = 0; i < outline.length; i++) {
    const heading = outline[i];
    const button = document.createElement('button');
    button.className = `outline-item h${Math.min(heading.level, 4)}`;
    button.textContent = heading.text || '(untitled heading)';
    button.title = heading.text;
    button.dataset.index = String(i);
    button.addEventListener('click', () => {
      editor.scrollToPos(heading.pos);
      updateCurrentHeading();
    });
    el.outlineBody.appendChild(button);
  }

  updateCurrentHeading();
}

function updateCurrentHeading() {
  const line = editor.cursorLine();
  let index = -1;
  for (let i = 0; i < outline.length; i++) {
    if (outline[i].line <= line) index = i;
    else break;
  }

  if (index === currentHeadingIndex) return;
  currentHeadingIndex = index;

  const items = el.outlineBody.querySelectorAll('.outline-item');
  items.forEach((item, i) => {
    item.classList.toggle('current', i === index);
  });
}

/* ============================================================
   File operations
   ============================================================ */

async function openFile(filePath) {
  if (!(await confirmDiscardChanges())) return;

  try {
    const file = await api.file.read(filePath);
    editor.load(file);
    await api.recent.push({ path: file.path, name: file.name, dir: file.dir });
    recent = (recent || []).filter((r) => r.path !== file.path);
    recent.unshift({ path: file.path, name: file.name, dir: file.dir });
    renderRecent();
    updateTitle();
    updateSavedIndicator();
    renderOutline();
  } catch (err) {
    toast(t('toastOpenFailed', { msg: err.message }));
  }
}

async function saveFile() {
  if (!editor.doc.path) return saveFileAs();

  try {
    await api.file.write(editor.doc.path, editor.content);
    editor.setClean(null);
    updateSavedIndicator();
    toast(t('toastSaved'));
    return true;
  } catch (err) {
    toast(t('toastSaveFailed', { msg: err.message }));
    return false;
  }
}

async function saveFileAs() {
  const suggested = editor.doc.path || `${editor.doc.name || t('untitledTitle')}.md`;
  const target = await api.file.saveDialog(suggested, editor.content);
  if (!target) return false;

  const name = target.split(/[\\/]/).pop();
  editor.doc.path = target;
  editor.doc.name = name;
  editor.doc.dir = target.replace(/[\\/][^\\/]+$/, '');
  editor.setClean(null);

  await api.recent.push({ path: target, name, dir: editor.doc.dir });
  recent = recent.filter((r) => r.path !== target);
  recent.unshift({ path: target, name, dir: editor.doc.dir });
  renderRecent();
  updateSavedIndicator();

  // Relative image paths now resolve against the new location.
  setBaseDir(editor.doc.dir);
  editor.view.dispatch({ effects: refreshEffect.of(null) });

  await refreshWorkspace();
  toast(t('toastSavedAs', { name }));
  return true;
}

async function newFile() {
  if (!(await confirmDiscardChanges())) return;
  editor.load({ path: null, name: t('untitled'), dir: null, content: '', mtime: null });
  editor.dirty = false;
  updateSavedIndicator();
  renderOutline();
}

/** Returns true when it is safe to throw the current buffer away. */
async function confirmDiscardChanges() {
  if (!editor.dirty) return true;
  const action = await api.close.ask(editor.doc.name || t('untitledTitle'));
  if (action === 'cancel') return false;
  if (action === 'save') return saveFile();
  return true;
}

/* ============================================================
   Workspace / sidebar
   ============================================================ */

async function openWorkspace() {
  const ws = await api.file.openFolderDialog();
  if (!ws) return;
  workspaceName = ws.name;
  el.workspaceName.textContent = ws.name;
  el.treeSection.hidden = false;
  lastTree = ws.tree;
  renderTree(ws.tree);
}

async function refreshWorkspace() {
  const ws = await api.workspace.refresh();
  if (!ws) return;
  workspaceName = ws.name;
  el.workspaceName.textContent = ws.name;
  el.treeSection.hidden = false;
  lastTree = ws.tree;
  renderTree(ws.tree);
}

function renderTree(nodes, parentUl = el.tree) {
  parentUl.textContent = '';

  if (nodes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tree-empty';
    empty.textContent = t('emptyTree');
    parentUl.appendChild(empty);
    return;
  }

  for (const node of nodes) {
    const li = document.createElement('li');

    if (node.kind === 'dir') {
      const row = document.createElement('div');
      row.className = 'tree-dir';
      row.innerHTML = `<span class="caret">▸</span><span></span>`;
      row.lastChild.textContent = node.name;

      const children = document.createElement('ul');
      children.className = 'tree-children';
      renderTree(node.children || [], children);

      row.addEventListener('click', () => {
        const open = children.classList.toggle('open');
        row.classList.toggle('open', open);
      });

      li.appendChild(row);
      li.appendChild(children);
    } else {
      const row = document.createElement('div');
      row.className = 'tree-file';
      row.dataset.path = node.path;
      row.textContent = node.name;
      row.addEventListener('click', () => {
        openFile(node.path);
        markActiveFile(node.path);
      });
      li.appendChild(row);
    }

    parentUl.appendChild(li);
  }
}

function markActiveFile(filePath) {
  el.tree.querySelectorAll('.tree-file').forEach((row) => {
    row.classList.toggle('active', row.dataset.path === filePath);
  });
}

function renderRecent() {
  el.recentList.textContent = '';

  if (!recent || recent.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'recent-empty';
    empty.textContent = t('emptyRecent');
    el.recentList.appendChild(empty);
    return;
  }

  for (const entry of recent) {
    const li = document.createElement('li');
    li.className = 'recent-item';
    if (editor.doc.path === entry.path) li.classList.add('active');

    const name = document.createElement('span');
    name.className = 'rname';
    name.textContent = entry.name;

    const dir = document.createElement('span');
    dir.className = 'rpath';
    dir.textContent = entry.dir || '';

    li.appendChild(name);
    li.appendChild(dir);

    const remove = document.createElement('button');
    remove.className = 'recent-remove';
    remove.textContent = '×';
    remove.title = t('removeRecent');
    remove.addEventListener('click', (event) => {
      event.stopPropagation();
      recent = recent.filter((r) => r.path !== entry.path);
      renderRecent();
    });
    li.appendChild(remove);

    li.addEventListener('click', () => {
      openFile(entry.path);
      markActiveFile(entry.path);
    });

    el.recentList.appendChild(li);
  }
}

/* ============================================================
   Export
   ============================================================ */

async function exportHtml() {
  const base = editor.doc.name ? editor.doc.name.replace(/\.md$/i, '') : t('untitledTitle');
  const saved = await api.export.html(`${base}.html`, editor.exportHtml(base));
  if (saved) toast(t('toastExported', { name: saved.split(/[\\/]/).pop() }));
}

async function exportPdf() {
  const base = editor.doc.name ? editor.doc.name.replace(/\.md$/i, '') : t('untitledTitle');
  const saved = await api.export.pdf(`${base}.pdf`, editor.exportHtml(base));
  if (saved) toast(t('toastExported', { name: saved.split(/[\\/]/).pop() }));
}

/* ============================================================
   Theme
   ============================================================ */

function setTheme(theme) {
  editor.setTheme(theme);
  try {
    localStorage.setItem('lumen.theme', theme);
  } catch {
    /* storage disabled — non-fatal */
  }
}

/* ============================================================
   Toast
   ============================================================ */

let toastTimer = 0;
function toast(message) {
  const node = document.createElement('div');
  node.className = 'toast';
  node.textContent = message;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 220);
  }, 1800);
}

/* ============================================================
   Chrome labels (re-applied on every language switch)
   ============================================================ */

function renderChrome() {
  el.btnOpenFolder.title = t('openFolderTip');
  el.btnOpenFolder.setAttribute('aria-label', t('openFolderTip'));
  el.recentTitle.textContent = t('recent');
  el.treeTitle.textContent = t('files');
  el.outlineTitle.textContent = t('outlineTitle');
  el.workspaceName.textContent = workspaceName || t('noFolder');

  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.title = t('appName');
  editor.setSearchPhrases({
    find: t('phraseFind'),
    replace: t('phraseReplace'),
    next: t('phraseNext'),
    previous: t('phrasePrevious'),
    all: t('phraseAll'),
    matchCase: t('phraseMatchCase'),
    byWord: t('phraseByWord'),
    regexp: t('phraseRegexp'),
    replaceAll: t('phraseReplaceAll'),
    close: t('phraseClose'),
  });
  renderStats();
  updateSavedIndicator();
  renderRecent();
  if (!el.treeSection.hidden) renderTreeNodesAgain();
  renderOutline();
}

/** Keep the tree contents but re-render its empty-state label. */
let lastTree = null;
function renderTreeNodesAgain() {
  if (lastTree) renderTree(lastTree);
}

onLocale(renderChrome);

/* ============================================================
   Wiring
   ============================================================ */

el.btnOpenFolder.addEventListener('click', openWorkspace);

api.on('menu:new-file', newFile);
api.on('menu:open-file', async () => {
  const path = await api.file.openDialog();
  if (path) {
    await openFile(path);
    markActiveFile(path);
  }
});
api.on('menu:open-folder', openWorkspace);
api.on('menu:save', saveFile);
api.on('menu:save-as', saveFileAs);
api.on('menu:export', (kind) => (kind === 'html' ? exportHtml() : exportPdf()));

/* The menu accelerator consumed Ctrl+F before the editor could see it, so the
   search keymap never fired. Open the panel explicitly instead. */
api.on('menu:find', () => {
  editor.view.focus();
  openSearchPanel(editor.view);
});

api.on('menu:toggle-outline', () => {
  el.outlinePanel.classList.toggle('collapsed');
});
api.on('menu:toggle-sidebar', () => {
  el.sidebar.classList.toggle('collapsed');
});
api.on('menu:theme', (theme) => setTheme(theme));

/* ------------------------------ language ------------------------------ */

function setLanguage(code) {
  applyLocale(code);
  try {
    localStorage.setItem('lumen.language', code);
  } catch {
    /* non-fatal */
  }
}

api.on('menu:language', (code) => setLanguage(code));

/* ------------------------------ close ------------------------------ */

let closing = false;
/** Harness-only override so the guard can be exercised without a native dialog. */
let closeStub = null;

async function handleCloseRequest() {
  if (closing) return 'busy';
  closing = true;
  try {
    const ask = closeStub ? () => Promise.resolve(closeStub) : api.close.ask;
    const respond = closeStub ? () => Promise.resolve(true) : api.close.respond;

    if (!editor.dirty) {
      respond('discard');
      return 'discard';
    }
    const action = await ask(editor.doc.name || t('untitledTitle'));
    if (action === 'cancel') {
      respond('cancel');
      return 'cancel';
    }
    if (action === 'save') {
      const saved = await saveFile();
      if (!saved) {
        respond('cancel');
        return 'cancel-save-failed';
      }
    }
    respond('discard');
    return action;
  } finally {
    closing = false;
  }
}

api.close.onRequest(handleCloseRequest);

document.addEventListener('keydown', (event) => {
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;

  const key = event.key.toLowerCase();
  if (key === 's' && event.shiftKey) {
    event.preventDefault();
    saveFileAs();
  } else if (key === 's') {
    event.preventDefault();
    saveFile();
  }
});

/* Cursor moves are frequent; keep the outline in sync cheaply. */
editor.view.dom.addEventListener('keyup', () => updateCurrentHeading());
editor.view.dom.addEventListener('mouseup', () => updateCurrentHeading());

/* ============================================================
   Dev harness hooks
   ============================================================

   These are only reachable from the main process, which is why they live
   behind an env flag: the screenshot harness in main.js drives them, ordinary
   runs never do.
   ============================================================ */

if (api && api.harness) {
  window.__lumenErrors = [];
  window.addEventListener('error', (e) => window.__lumenErrors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) =>
    window.__lumenErrors.push(String(e.reason))
  );

  window.__lumenDebug = { editor, setBaseDir, refreshEffect, setTheme };
  window.__lumenSetDocument = (text, name) => {
    editor.load({ path: null, name: name || t('untitled'), dir: null, content: text, mtime: null });
    editor.dirty = false;
    updateSavedIndicator();
    renderOutline();
  };
  window.__lumenSetTheme = (t2) => (setTheme(t2), document.documentElement.getAttribute('data-theme'));
  window.__lumenSetLanguage = (code) => (setLanguage(code), language);
  window.__lumenSimulateClose = (stub) => ((closeStub = stub || null), handleCloseRequest());
  window.__lumenTypeText = (text) => {
    const { from, to } = editor.view.state.selection.main;
    editor.view.dispatch({ changes: { from, to, insert: text } });
  };
  window.__lumenOpenFind = () => {
    editor.view.focus();
    openSearchPanel(editor.view);
    return Boolean(document.querySelector('.cm-search'));
  };
  window.__lumenPlaceCaret = () => {
    const doc = editor.view.state.doc.toString();
    const match = /\*\*([^*]+)\*\*/.exec(doc);
    if (!match) return null;
    editor.scrollToPos(match.index + 3);
    return true;
  };
  window.__lumenPlaceCaretEnd = () => (editor.scrollToPos(0), true);
  window.__lumenScrollOnly = (needle) => {
    const at = editor.view.state.doc.toString().indexOf(needle);
    if (at < 0) return false;
    editor.view.dispatch({ effects: EditorView.scrollIntoView(at, { y: 'center' }) });
    return true;
  };
  window.__lumenCountDecorations = () => {
    const n = (sel) => document.querySelectorAll(sel).length;
    return {
      bold: n('.lumen-bold'),
      italic: n('.lumen-italic'),
      strike: n('.lumen-strike'),
      inlineCode: n('.lumen-inline-code'),
      link: n('.lumen-link'),
      marker: n('.lumen-marker'),
      bullet: n('.lumen-bullet'),
      checkbox: n('.lumen-checkbox'),
      h1: n('.cm-line.lumen-h1'),
      quote: n('.cm-line.lumen-quote'),
      codeLine: n('.cm-line.lumen-code'),
      tableWidget: n('.lumen-table-widget'),
      ruleLine: n('.lumen-hr-line'),
      tokens: Array.from(
        new Set(
          Array.from(document.querySelectorAll('.cm-line.lumen-code span'))
            .map((s) => s.className)
            .filter((c) => c.startsWith('tok-'))
        )
      ),
    };
  };
  window.__lumenProbe = () => {
    const sel = editor.view.state.selection.main;
    const text = editor.view.state.doc.toString();
    return {
      docLength: text.length,
      docLines: editor.view.state.doc.lines,
      dirty: editor.dirty,
      selection: { head: sel.head, empty: sel.empty },
      statusWords: el.statusWords.textContent,
      statusChars: el.statusChars.textContent,
      docMeta: el.docMeta.textContent,
      language,
    };
  };
}

/* ============================================================
   Boot
   ============================================================ */

async function boot() {
  const info = await api.bootstrap();
  recent = info.recent || [];

  // macOS is the only platform with `titleBarStyle: hiddenInset`, so the
  // custom drag strip only renders there.
  if (info.platform === 'darwin') document.body.classList.add('mac');

  // Language: the main process persists it (it also drives the menu and
  // native dialogs), so it is the source of truth.
  applyLocale(info.language || DEFAULT_LANGUAGE);

  let theme = 'dark';
  try {
    theme = localStorage.getItem('lumen.theme') || 'dark';
  } catch {
    /* keep default */
  }
  setTheme(theme);

  editor.load({
    path: null,
    name: t('untitled'),
    dir: null,
    content: t('welcome'),
    mtime: null,
  });
  editor.dirty = false;
  updateSavedIndicator();
  renderOutline();
}

boot().then(() => {
  window.__lumenReady = true;
});
