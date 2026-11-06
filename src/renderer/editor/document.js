/**
 * Document view: owns the CodeMirror instance and everything that talks to the
 * filesystem. All state that the window needs lives here.
 */

import { EditorState, Compartment } from '@codemirror/state';
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  lineNumbers,
} from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { GFM } from '@lezer/markdown';
import { languages } from '@codemirror/language-data';
import { syntaxHighlighting, defaultHighlightStyle, HighlightStyle } from '@codemirror/language';
import { searchKeymap, highlightSelectionMatches, search } from '@codemirror/search';
import { tags as t } from '@lezer/highlight';

import { livePreview, setBaseDir, refreshEffect } from './live-preview.js';
import { printStyles } from './print.js';
import { marked } from 'marked';

/* ============================================================
   Syntax highlighting for fenced code
   ============================================================ */

const fenceHighlight = HighlightStyle.define([
  { tag: t.keyword, class: 'tok-keyword' },
  { tag: t.operatorKeyword, class: 'tok-keyword' },
  { tag: t.controlKeyword, class: 'tok-keyword' },
  { tag: [t.string, t.special(t.string)], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null, t.atom], class: 'tok-number' },
  { tag: [t.comment, t.lineComment, t.blockComment], class: 'tok-comment' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], class: 'tok-function' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  { tag: [t.typeName, t.className, t.namespace], class: 'tok-type' },
  { tag: [t.variableName, t.definition(t.variableName)], class: 'tok-variable' },
  { tag: [t.punctuation, t.separator, t.bracket], class: 'tok-punct' },
  { tag: [t.tagName, t.angleBracket], class: 'tok-keyword' },
]);

/* ============================================================
   Live-preview theme (reconfigured when the theme flips)
   ============================================================ */

const themeCompartment = new Compartment();
const phrasesCompartment = new Compartment();

/**
 * Localised labels for CodeMirror's built-in search panel. The keys are the
 * literal English strings CodeMirror itself looks up through the `phrases`
 * facet, so they cannot be renamed.
 */
function searchPhrases(labels) {
  const phrases = {
    Find: labels.find,
    Replace: labels.replace,
    next: labels.next,
    previous: labels.previous,
    all: labels.all,
    'match case': labels.matchCase,
    regexp: labels.regexp,
    'by word': labels.byWord,
    'replace all': labels.replaceAll,
    close: labels.close,
  };
  return EditorState.phrases.of(phrases);
}

function defaultPhrases() {
  return {
    find: 'Find',
    replace: 'Replace',
    next: 'next',
    previous: 'previous',
    all: 'all',
    matchCase: 'match case',
    byWord: 'by word',
    regexp: 'regexp',
    replaceAll: 'replace all',
    close: 'close',
  };
}

function gutterColor(theme) {
  return EditorView.theme({
    '.cm-gutters': {
      display: 'none',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      color: theme === 'light' ? '#b9bcc0' : '#4a5162',
    },
  });
}

/* ============================================================
   State factory
   ============================================================ */

function createState({ content, onChange }) {
  return EditorState.create({
    doc: content,
    extensions: [
      history(),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      highlightSpecialChars(),
      highlightSelectionMatches(),
      search({ top: true }),
      EditorView.lineWrapping,

      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
        addKeymap: true,
        // Tables, strikethrough and task lists are GFM extensions; without
        // them the parser emits no Table / Strikethrough nodes at all.
        extensions: [GFM],
      }),

      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      syntaxHighlighting(fenceHighlight),

      livePreview,

      phrasesCompartment.of(searchPhrases(defaultPhrases())),

      keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),

      EditorView.updateListener.of((update) => {
        if (update.docChanged) onChange(update.state.doc.toString());
      }),

      themeCompartment.of(gutterColor('dark')),
    ],
  });
}

/* ============================================================
   DocumentView
   ============================================================ */

export class DocumentView {
  /**
   * @param {HTMLElement} host
   * @param {{ onDirty: () => void, onStats: (s: any) => void, onOutline: (h: any[]) => void, onCursorMove: () => void }} hooks
   */
  constructor(host, hooks, initialContent = '') {
    this.host = host;
    this.hooks = hooks;

    /** @type {EditorView | null} */
    this.view = null;

    /** Current open document. Path is null for unsaved buffers. */
    this.doc = { path: null, name: 'untitled', dir: null, mtime: null };

    this.dirty = false;
    this.theme = 'dark';
    this.phrases = defaultPhrases();

    // The view is created against real content. Building it empty and then
    // swapping the state in `load()` would leave the live-preview plugin
    // constructed against an empty tree.
    this.create(initialContent);
  }

  create(content, extensions = []) {
    if (this.view) this.view.destroy();

    const state = createState({
      content,
      onChange: () => {
        if (!this.dirty) {
          this.dirty = true;
          this.hooks.onDirty();
        }
        this.refreshStats();
      },
    });

    this.view = new EditorView({ state, parent: this.host });
    this.view.focus();

    this.refreshStats();
  }

  /* ---------------------------- document ---------------------------- */

  get content() {
    return this.view ? this.view.state.doc.toString() : '';
  }

  load({ path, name, dir, content, mtime }) {
    this.doc = { path, name, dir, mtime };
    this.dirty = false;
    this.create(content);
    this.setTheme(this.theme);
    this.setSearchPhrases(this.phrases);

    if (dir) setBaseDir(dir);
    if (this.view) {
      this.view.dispatch({ effects: refreshEffect.of(null) });
    }

    this.hooks.onDirty();
    this.hooks.onCursorMove();
  }

  setClean(mtime) {
    this.dirty = false;
    if (mtime) this.doc.mtime = mtime;
    this.hooks.onDirty();
  }

  get isMarkdown() {
    const name = this.doc.name || '';
    return !name || /\.(md|markdown|mdown|mdx|txt)$/i.test(name);
  }

  /* ---------------------------- theme ---------------------------- */

  setTheme(theme) {
    this.theme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    if (this.view) {
      this.view.dispatch({
        effects: themeCompartment.reconfigure(gutterColor(theme)),
      });
    }
  }

  /** Re-label the built-in search panel after a language switch. */
  setSearchPhrases(labels) {
    this.phrases = labels || this.phrases;
    if (this.view) {
      this.view.dispatch({
        effects: phrasesCompartment.reconfigure(searchPhrases(this.phrases)),
      });
    }
  }

  /* ---------------------------- stats / outline ---------------------------- */

  refreshStats() {
    if (!this.view) return;
    const text = this.view.state.doc.toString();
    const chars = text.length;
    const words = (text.match(/[\p{L}\p{N}]+(?:['’][\p{L}]+)*/gu) || []).length;
    const lines = this.view.state.doc.lines;
    this.hooks.onStats({ words, chars, lines });
  }

  scrollToPos(pos) {
    if (!this.view) return;
    this.view.dispatch({
      selection: { anchor: pos },
      effects: EditorView.scrollIntoView(pos, { y: 'start', yMargin: 60 }),
    });
    this.view.focus();
  }

  cursorLine() {
    if (!this.view) return 0;
    return this.view.state.doc.lineAt(this.view.state.selection.main.head).number;
  }

  /* ---------------------------- export ---------------------------- */

  /** Render the current buffer to a standalone, self-contained HTML page. */
  exportHtml(title) {
    const text = this.content;
    const body = marked.parse(text, { gfm: true, breaks: false });
    const safeTitle = escapeHtml(title || this.doc.name || 'Untitled');

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${safeTitle}</title>
<style>${printStyles}</style>
</head>
<body>
<main class="doc">${body}</main>
</body>
</html>`;
  }

  destroy() {
    if (this.view) this.view.destroy();
    this.view = null;
  }
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
