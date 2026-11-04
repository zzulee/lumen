import { DocumentView } from './editor/document.js';
import { extractOutline } from './editor/outline.js';
import { setBaseDir, refreshEffect } from './editor/live-preview.js';
import { EditorView } from '@codemirror/view';

const WELCOME = [
  '# Welcome to Lumen',
  '',
  'A local-first Markdown editor. The file on disk is always the raw',
  'Markdown source — what you see here is a *rendering of it*, not a',
  'separate document model.',
  '',
  '## Try the live preview',
  '',
  'Put the caret inside this **bold phrase** and the `**` markers appear.',
  'Move it away and they disappear again. Same for `inline code`,',
  '*italics*, ~~strikethrough~~, and [links](https://example.com).',
  '',
  '### Lists and tasks',
  '',
  '- First item',
  '- Second item with **emphasis**',
  '  - Nested item',
  '  - Another nested one',
  '',
  '1. Numbered',
  '2. Also numbered',
  '',
  '- [x] A finished task',
  '- [ ] Something still to do',
  '',
  '### Code',
  '',
  '```js',
  'function greet(name) {',
  '  const greeting = `hello, ${name}`;',
  '  return greeting;',
  '}',
  '```',
  '',
  '### Tables',
  '',
  'Move the caret out of this table and it renders as a grid:',
  '',
  '| Feature | Status | Notes |',
  '|---------|:------:|-------|',
  '| Live preview | done | markers hide on blur |',
  '| Code fences | done | focus to edit |',
  '| Tables | done | click to edit |',
  '',
  '> A block quote, for when someone else said it better.',
  '',
  '---',
  '',
  'Open a folder with the file button to browse your own notes.',
  '',
].join('\n');


const api = window.lumen;

/* ============================================================
   DOM handles
   ============================================================ */

const el = {
  sidebar: document.getElementById('sidebar'),
  outlinePanel: document.getElementById('outline'),
  outlineBody: document.getElementById('outline-body'),
  tree: document.getElementById('tree'),
  treeSection: document.getElementById('tree-section'),
  recentList: document.getElementById('recent-list'),
  recentSection: document.getElementById('recent-section'),
  workspaceName: document.getElementById('workspace-name'),
  docTitle: document.getElementById('doc-title'),
  docMeta: document.getElementById('doc-meta'),
  editorHost: document.getElementById('editor-host'),
  statusWords: document.getElementById('status-words'),
  statusChars: document.getElementById('status-chars'),
  statusPath: document.getElementById('status-path'),
  statusSaved: document.getElementById('status-saved'),
  btnOpenFolder: document.getElementById('btn-open-folder'),
};

/* ============================================================
   App state
   ============================================================ */

let recent = [];
let outline = [];
let currentHeadingIndex = -1;

const editor = new DocumentView(el.editorHost, {
  onDirty: () => {
    updateTitle();
    updateSavedIndicator();
  },
  onStats: ({ words, chars, lines }) => {
    el.statusWords.textContent = `${words} word${words === 1 ? '' : 's'}`;
    el.statusChars.textContent = `${chars} chars`;
    el.docMeta.textContent = lines > 0 ? `${lines} lines` : '';
    scheduleOutlineRefresh();
  },
  onOutline: () => {},
  onCursorMove: () => {
    updateCurrentHeading();
  },
}, WELCOME);

/* The main process reads this to render the buffer for PDF export. */
window.__lumenExportHtml = () => editor.exportHtml(editor.doc.name || 'Untitled');

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
    empty.textContent = 'No headings yet.';
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
   Title / save state
   ============================================================ */

function updateTitle() {
  const name = editor.doc.name || 'untitled';
  const marker = editor.dirty ? ' •' : '';
  el.docTitle.textContent = `${name}${marker}`;
  el.statusPath.textContent = editor.doc.path || '';
  api.window.setTitle(`Lumen — ${name}`, editor.dirty);
}

function updateSavedIndicator() {
  el.statusSaved.textContent = editor.dirty ? 'unsaved' : 'saved';
  el.statusSaved.style.color = editor.dirty ? 'var(--accent)' : '';
  updateTitle();
}

/* ============================================================
   File operations
   ============================================================ */

async function openFile(filePath) {
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
    toast(`Could not open file: ${err.message}`);
  }
}

async function saveFile() {
  if (!editor.doc.path) return saveFileAs();

  try {
    await api.file.write(editor.doc.path, editor.content);
    editor.setClean(null);
    updateSavedIndicator();
    toast('Saved');
  } catch (err) {
    toast(`Save failed: ${err.message}`);
  }
}

async function saveFileAs() {
  const suggested = editor.doc.path || `${editor.doc.name || 'untitled'}.md`;
  const target = await api.file.saveDialog(suggested, editor.content);
  if (!target) return;

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
  toast('Saved as ' + name);
}

function newFile() {
  editor.load({ path: null, name: 'untitled.md', dir: null, content: '', mtime: null });
  editor.dirty = false;
  updateSavedIndicator();
  renderOutline();
}

/* ============================================================
   Workspace / sidebar
   ============================================================ */

async function openWorkspace() {
  const ws = await api.file.openFolderDialog();
  if (!ws) return;
  el.workspaceName.textContent = ws.name;
  el.treeSection.hidden = false;
  renderTree(ws.tree);
}

async function refreshWorkspace() {
  const ws = await api.workspace.refresh();
  if (!ws) return;
  el.workspaceName.textContent = ws.name;
  el.treeSection.hidden = false;
  renderTree(ws.tree);
}

function renderTree(nodes, parentUl = el.tree) {
  parentUl.textContent = '';

  if (nodes.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'tree-empty';
    empty.textContent = 'No markdown files.';
    parentUl.appendChild(empty);
    return;
  }

  for (const node of nodes) {
    const li = document.createElement('li');

    if (node.kind === 'dir') {
      const row = document.createElement('div');
      row.className = 'tree-dir';
      row.innerHTML = `<span class="caret">▸</span><span>${escapeText(node.name)}</span>`;

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
    empty.textContent = 'No recent files.';
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
    remove.title = 'Remove from list';
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
   ============================================================

async function exportHtml() {
  const base = editor.doc.name ? editor.doc.name.replace(/\.md$/i, '') : 'untitled';
  const saved = await api.export.html(`${base}.html`, editor.exportHtml(base));
  if (saved) toast(`Exported ${saved.split(/[\\/]/).pop()}`);
}

async function exportPdf() {
  const base = editor.doc.name ? editor.doc.name.replace(/\.md$/i, '') : 'untitled';
  const saved = await api.export.pdf(`${base}.pdf`);
  if (saved) toast(`Exported ${saved.split(/[\\/]/).pop()}`);
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

function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

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
api.on('menu:find', () => {
  // CodeMirror's search keymap handles Cmd/Ctrl+F once the editor has focus.
  editor.view.focus();
});

api.on('menu:toggle-outline', () => {
  el.outlinePanel.classList.toggle('collapsed');
});
api.on('menu:toggle-sidebar', () => {
  el.sidebar.classList.toggle('collapsed');
});
api.on('menu:theme', (theme) => setTheme(theme));

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
   Boot
   ============================================================ */

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
    editor.load({ path: null, name: name || 'untitled.md', dir: null, content: text, mtime: null });
    editor.dirty = false;
    updateSavedIndicator();
    renderOutline();
  };
  window.__lumenSetTheme = (t) => (setTheme(t), document.documentElement.getAttribute('data-theme'));
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
    };
  };
}

async function boot() {
  const info = await api.bootstrap();
  recent = info.recent || [];
  renderRecent();

  let theme = 'dark';
  try {
    theme = localStorage.getItem('lumen.theme') || 'dark';
  } catch {
    /* keep default */
  }
  setTheme(theme);


  editor.dirty = false;
  updateSavedIndicator();
  renderOutline();
}

boot().then(() => {
  window.__lumenReady = true;
});
