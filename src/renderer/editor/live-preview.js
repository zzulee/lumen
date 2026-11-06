/**
 * Lumen live preview.
 *
 * The document is always the raw Markdown source. Nothing is ever mutated.
 * We only add *decorations*:
 *
 *   1. Block structure  — headings, quotes, lists, fences, tables, rules.
 *   2. Inline structure — emphasis, code spans, links, images.
 *
 * The "live" part: the syntax markers of a construct (`**`, `` ` ``, `[](url)`,
 * ``` fences, the `#` of a heading) are hidden while the caret sits *outside*
 * that construct, and shown again as soon as it moves inside. That is the
 * entire trick Typora is built on, and it falls out of the source-of-truth
 * model for free — no document transformation, no round-trip loss.
 */

import { syntaxTree, ensureSyntaxTree } from '@codemirror/language';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { StateEffect, StateField } from '@codemirror/state';

/** Bump this after changing the base directory, to re-render image widgets. */
export const refreshEffect = StateEffect.define();

/** Directory of the open document, used to resolve relative image sources. */
let baseDir = null;
export function setBaseDir(dir) {
  baseDir = dir || null;
}

/* ============================================================
   Static decorations
   ============================================================ */

const hide = Decoration.replace({});

const marker = Decoration.mark({ class: 'lumen-marker' });

const HEADING_LINE = {
  1: Decoration.line({ class: 'lumen-h1' }),
  2: Decoration.line({ class: 'lumen-h2' }),
  3: Decoration.line({ class: 'lumen-h3' }),
  4: Decoration.line({ class: 'lumen-h4' }),
  5: Decoration.line({ class: 'lumen-h5' }),
  6: Decoration.line({ class: 'lumen-h6' }),
};

const lineQuote = Decoration.line({ class: 'lumen-quote' });
const lineList = Decoration.line({ class: 'lumen-list' });
const lineCode = Decoration.line({ class: 'lumen-code' });
const lineCodeOpen = Decoration.line({ class: 'lumen-code open' });
const lineCodeClose = Decoration.line({ class: 'lumen-code close' });
const lineTable = Decoration.line({ class: 'lumen-table' });

const inlineItalic = Decoration.mark({ class: 'lumen-italic' });
const inlineBold = Decoration.mark({ class: 'lumen-bold' });
const inlineStrike = Decoration.mark({ class: 'lumen-strike' });
const inlineCode = Decoration.mark({ class: 'lumen-inline-code' });
const inlineLink = Decoration.mark({ class: 'lumen-link' });

/* ============================================================
   Widgets
   ============================================================ */

class RuleWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('hr');
    el.className = 'lumen-hr-line';
    return el;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return false;
  }
}

class BulletWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('span');
    el.className = 'lumen-bullet';
    el.textContent = '•';
    return el;
  }
  eq() {
    return true;
  }
  ignoreEvent() {
    return true;
  }
}

class CheckboxWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }
  eq(other) {
    return other.checked === this.checked;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = 'lumen-checkbox' + (this.checked ? ' checked' : '');
    el.setAttribute('aria-hidden', 'true');
    return el;
  }
  ignoreEvent() {
    return true;
  }
}

class ImageWidget extends WidgetType {
  constructor(src, alt) {
    super();
    this.src = src;
    this.alt = alt;
  }
  eq(other) {
    return other.src === this.src && other.alt === this.alt;
  }
  toDOM() {
    const img = document.createElement('img');
    img.className = 'lumen-image';
    img.alt = this.alt;
    img.src = resolveSrc(this.src);
    img.onerror = () => {
      const broken = document.createElement('span');
      broken.className = 'lumen-image-broken';
      broken.textContent = this.alt || this.src;
      img.replaceWith(broken);
    };
    return img;
  }
  ignoreEvent() {
    return false;
  }
}

class TableWidget extends WidgetType {
  constructor(raw, docPos) {
    super();
    this.raw = raw;
    this.docPos = docPos;
  }
  eq(other) {
    // docPos is deliberately excluded: edits elsewhere in the document
    // shift the anchor but must not force a re-render of the table.
    return other.raw === this.raw;
  }
  get estimatedHeight() {
    return Math.max(40, this.raw.split('\n').length * 34);
  }
  toDOM(view) {
    const wrap = document.createElement('div');
    wrap.className = 'lumen-table-widget';
    wrap.appendChild(buildTable(this.raw));

    // The block is atomic (the source is replaced), so a click has to be
    // translated back into a document position for the caret to land.
    wrap.addEventListener('mousedown', (event) => {
      event.preventDefault();
      const coords = view.posAtCoords({ x: event.clientX, y: event.clientY });
      const target = coords === null ? this.docPos : coords;
      view.dispatch({ selection: { anchor: target }, scrollIntoView: true });
      view.focus();
    });
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

/* ============================================================
   Helpers
   ============================================================ */

function resolveSrc(src) {
  if (!src) return '';
  if (/^(https?:|data:|file:|blob:)/i.test(src)) return src;
  if (!baseDir) return src;

  const joined = normalizePath(baseDir, src);
  const withSlash = joined.replace(/\\/g, '/');
  const encoded = withSlash
    .split('/')
    .map((seg) => encodeURIComponent(seg).replace(/%3A/gi, ':'))
    .join('/');
  return 'file:///' + encoded.replace(/^\/+/, '');
}

function normalizePath(base, rel) {
  const sep = base.includes('\\') ? '\\' : '/';
  if (rel.startsWith('/') || /^[A-Za-z]:/.test(rel)) return rel;

  const parts = base.split(/[\\/]/);
  for (const seg of rel.split(/[\\/]/)) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join(sep);
}

function childList(node) {
  const out = [];
  let child = node.firstChild;
  while (child) {
    out.push(child);
    child = child.nextSibling;
  }
  return out;
}

/** Split a table row into cells, honouring `\|` escapes and code spans. */
function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  let inCode = false;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch === '\\' && trimmed[i + 1] === '|') {
      current += '\\|';
      i++;
      continue;
    }
    if (ch === '`') {
      inCode = !inCode;
      current += ch;
      continue;
    }
    if (ch === '|' && !inCode) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

const ALIGN_RE = /^[\s|:-]+$/;

/** Render inline markdown inside a table cell, escaping everything else. */
function renderCell(text) {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

function buildTable(raw) {
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const table = document.createElement('table');

  const headerCells = splitRow(lines[0] || '');
  const alignRow = lines[1] || '';
  const aligns = ALIGN_RE.test(alignRow)
    ? splitRow(alignRow).map((cell) => {
        const left = cell.startsWith(':');
        const right = cell.endsWith(':');
        if (left && right) return 'center';
        if (right) return 'right';
        if (left) return 'left';
        return '';
      })
    : [];

  const thead = document.createElement('thead');
  const headTr = document.createElement('tr');
  headerCells.forEach((cell, i) => {
    const th = document.createElement('th');
    th.innerHTML = renderCell(cell);
    if (aligns[i]) th.style.textAlign = aligns[i];
    headTr.appendChild(th);
  });
  thead.appendChild(headTr);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (let i = 2; i < lines.length; i++) {
    const tr = document.createElement('tr');
    const cells = splitRow(lines[i]);
    const width = Math.max(cells.length, headerCells.length);
    for (let c = 0; c < width; c++) {
      const td = document.createElement('td');
      td.innerHTML = renderCell(cells[c] ?? '');
      if (aligns[c]) td.style.textAlign = aligns[c];
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  return table;
}

function parseImageLink(raw) {
  // ![alt](src "title") or ![alt](<src with spaces>)
  const match = /^!\[([^\]]*)\]\(\s*(?:<([^>]*)>|([^)\s]*))(?:\s+["'(]([^)]*)["')])?\s*\)/.exec(raw);
  if (!match) return null;
  return { alt: match[1] || '', src: match[2] || match[3] || '' };
}

/* ============================================================
   The plugin
   ============================================================ */

/**
 * The plugin can be constructed before the background parser has produced a
 * tree; `syntaxTree` then returns an empty root and nothing matches.
 */
function parsedTree(state) {
  return ensureSyntaxTree(state, state.doc.length, 400) || syntaxTree(state);
}

/**
 * Builds *only* the decorations whose construct starts inside `range`, plus
 * every currently revealed (caret-touching) construct — the latter can be
 * anywhere in the document but is what the user is editing right now.
 *
 * Decorations outside this set are preserved by `StateField.map`, so nothing
 * that is still valid ever disappears. The one thing that must not be skipped
 * is a construct that *starts* before the range but is revealed by a caret
 * inside it (e.g. a fenced code block); the tree walk below therefore begins
 * at the enclosing top-level node rather than at the raw offset.
 */
function buildDecorations(view, range = { from: 0, to: view.state.doc.length }, carry = null) {
  const { state } = view;
  const doc = state.doc;

  const sel = state.selection.main;
  const head = sel.head;

  const out = [];

  /** Is a construct revealed? i.e. does the caret/selection touch it? */
  const revealed = (from, to) => {
    if (sel.empty) return head >= from && head <= to;
    return sel.to >= from && sel.from <= to;
  };

  const add = (deco, from, to) => {
    if (to <= from) return;
    out.push(deco.range(from, to));
  };

  const lineDeco = (deco, pos) => {
    out.push(deco.range(pos));
  };

  const addLineRange = (from, to, deco) => {
    const first = doc.lineAt(from);
    const last = doc.lineAt(to);
    for (let n = first.number; n <= last.number; n++) {
      lineDeco(deco, doc.line(n).from);
    }
  };

  // Skip trailing whitespace after a hidden marker so the next text does not
  // sit on a phantom space.
  const skipSpace = (pos, limit) => {
    let p = pos;
    while (p < limit && /[ \t]/.test(doc.sliceString(p, p + 1))) p++;
    return p;
  };

  const tableHeadLine = Decoration.line({ class: 'lumen-table head' });
  const tree = parsedTree(state);

  // Start at the outermost node that contains the range, so a construct
  // beginning before the window (the `#` of a heading, the fence of a code
  // block) is still visited as a whole.
  let walkFrom = range.from;
  let walkTo = range.to;
  const startNode = tree.resolveInner(walkFrom, 1);
  let ancestor = startNode;
  while (ancestor.parent && ancestor.parent.name !== 'Document') ancestor = ancestor.parent;
  if (ancestor.type.name !== 'Document') walkFrom = Math.min(walkFrom, ancestor.from);
  const endNode = tree.resolveInner(Math.max(walkFrom, walkTo - 1), -1);
  ancestor = endNode;
  while (ancestor.parent && ancestor.parent.name !== 'Document') ancestor = ancestor.parent;
  if (ancestor.type.name !== 'Document') walkTo = Math.max(walkTo, ancestor.to);
  walkTo = Math.min(walkTo, doc.length);

  let entered = 0;
  let threw = null;
  tree.iterate({
    from: walkFrom,
    to: walkTo,
    enter: (ref) => {
      entered++;
      try {
        return visit(ref);
      } catch (err) {
        threw = `${ref.name}: ${err && err.message}`;
        return false;
      }
    },
  });

  function visit(ref) {
    const name = ref.name;
    const nodeFrom = ref.from;
    const nodeTo = ref.to;

      /* ---------- headings ---------- */

      const headingMatch = /^ATXHeading(\d)$/.exec(name);
      if (headingMatch) {
        const level = Number(headingMatch[1]);
        lineDeco(HEADING_LINE[level], doc.lineAt(nodeFrom).from);

        const mark = ref.node.firstChild;
        const show = revealed(nodeFrom, nodeTo);
        if (mark && mark.type.name === 'HeaderMark') {
          if (show) {
            add(marker, nodeFrom, mark.to);
          } else {
            add(hide, nodeFrom, skipSpace(mark.to, nodeTo));
          }
        }
        return true;
      }

      if (name === 'SetextHeading1' || name === 'SetextHeading2') {
        const level = name === 'SetextHeading1' ? 1 : 2;
        const contentLine = doc.lineAt(nodeFrom);
        const underline = doc.lineAt(Math.max(nodeFrom, nodeTo - 1));
        lineDeco(HEADING_LINE[level], contentLine.from);

        if (underline.number !== contentLine.number) {
          if (!revealed(nodeFrom, nodeTo)) {
            add(hide, underline.from, underline.to);
          }
        }
        return true;
      }

      /* ---------- fenced code ---------- */

      if (name === 'FencedCode') {
        const openLine = doc.lineAt(nodeFrom);
        const closeLine = doc.lineAt(Math.max(nodeFrom, nodeTo - 1));
        const show = revealed(nodeFrom, nodeTo);

        for (let n = openLine.number; n <= closeLine.number; n++) {
          lineDeco(lineCode, doc.line(n).from);
        }
        lineDeco(lineCodeOpen, openLine.from);
        if (closeLine.number !== openLine.number) {
          lineDeco(lineCodeClose, closeLine.from);
        }

        if (!show) {
          const firstChild = ref.node.firstChild;
          const lastChild = ref.node.lastChild;
          const hasOpenMark = firstChild && firstChild.type.name === 'CodeMark';
          const hasCloseMark = lastChild && lastChild.type.name === 'CodeMark';

          // Hiding the fence line's text leaves an empty line rather than
          // removing the row; that suits editing (the caret can still reach it).
          if (hasOpenMark) add(hide, openLine.from, openLine.to);
          if (hasCloseMark) add(hide, closeLine.from, closeLine.to);
        }

        // Never format the inside of code as prose.
        return false;
      }

      if (name === 'CodeBlock') {
        addLineRange(nodeFrom, nodeTo, lineCode);
        return true;
      }

      /* ---------- horizontal rule ---------- */

      if (name === 'HorizontalRule') {
        const line = doc.lineAt(nodeFrom);
        out.push(
          Decoration.replace({ widget: new RuleWidget(), block: true }).range(line.from, line.to)
        );
        return true;
      }

      /* ---------- block quote ---------- */

      if (name === 'Blockquote') {
        addLineRange(nodeFrom, nodeTo, lineQuote);
        return true;
      }

      if (name === 'QuoteMark') {
        const parent = ref.node.parent;
        if (parent) {
          const show = revealed(parent.from, parent.to);
          if (show) {
            add(marker, nodeFrom, nodeTo);
          } else {
            add(hide, nodeFrom, skipSpace(nodeTo, parent.to));
          }
        }
        return true;
      }

      /* ---------- lists ---------- */

      if (name === 'ListItem') {
        addLineRange(nodeFrom, nodeTo, lineList);
        return true;
      }

      if (name === 'ListMark') {
        const item = ref.node.parent;
        const list = item && item.parent;
        const isBullet = list && list.type.name === 'BulletList';

        if (isBullet) {
          const show = revealed(nodeFrom, nodeTo);
          if (show) {
            add(marker, nodeFrom, nodeTo);
          } else {
            out.push(
              Decoration.replace({ widget: new BulletWidget() }).range(nodeFrom, nodeTo)
            );
          }
        } else if (revealed(nodeFrom, nodeTo)) {
          add(marker, nodeFrom, nodeTo);
        }
        return false;
      }

      if (name === 'TaskMarker') {
        const show = revealed(nodeFrom, nodeTo);
        if (show) {
          add(marker, nodeFrom, nodeTo);
        } else {
          const text = doc.sliceString(nodeFrom, nodeTo);
          out.push(
            Decoration.replace({
              widget: new CheckboxWidget(/[xX]/.test(text)),
            }).range(nodeFrom, nodeTo)
          );
        }
        return false;
      }

      /* ---------- tables ---------- */

      if (name === 'Table' || name === 'TableHeader' || name === 'TableRow' || name === 'TableCell') {
        // Rows and cells are children of Table; handling them as well would
        // emit overlapping block replacements, which is invalid.
        if (name !== 'Table') return false;

        const firstLine = doc.lineAt(nodeFrom);
        const lastLine = doc.lineAt(Math.max(nodeFrom, nodeTo - 1));

        if (revealed(nodeFrom, nodeTo)) {
          for (let n = firstLine.number; n <= lastLine.number; n++) {
            const line = doc.line(n);
            if (n === firstLine.number - 1) continue;
            lineDeco(lineTable, line.from);
            if (n === firstLine.number) lineDeco(tableHeadLine, line.from);
          }
        } else {
          const raw = doc.sliceString(firstLine.from, lastLine.to);
          out.push(
            Decoration.replace({
              widget: new TableWidget(raw, firstLine.from),
              block: true,
            }).range(firstLine.from, lastLine.to)
          );
        }
        return false;
      }

      /* ---------- images ---------- */

      if (name === 'Image') {
        const show = revealed(nodeFrom, nodeTo);
        if (show) return false;
        const raw = doc.sliceString(nodeFrom, nodeTo);
        const parsed = parseImageLink(raw);
        if (!parsed || !parsed.src) return false;
        out.push(
          Decoration.replace({
            widget: new ImageWidget(parsed.src, parsed.alt),
          }).range(nodeFrom, nodeTo)
        );
        return false;
      }

      /* ---------- inline: emphasis ---------- */

      if (name === 'Emphasis' || name === 'StrongEmphasis' || name === 'Strikethrough') {
        const kids = childList(ref.node);
        if (kids.length < 2) return true;

        const first = kids[0];
        const last = kids[kids.length - 1];
        const innerFrom = first.to;
        const innerTo = last.from;
        if (innerTo <= innerFrom) return true;

        const style =
          name === 'Emphasis' ? inlineItalic : name === 'StrongEmphasis' ? inlineBold : inlineStrike;

        out.push(style.range(innerFrom, innerTo));

        if (revealed(nodeFrom, nodeTo)) {
          add(marker, nodeFrom, innerFrom);
          add(marker, innerTo, nodeTo);
        } else {
          add(hide, nodeFrom, innerFrom);
          add(hide, innerTo, nodeTo);
        }
        return true;
      }

      /* ---------- inline: code span ---------- */

      if (name === 'InlineCode') {
        const kids = childList(ref.node);
        if (kids.length < 2) return false;

        const innerFrom = kids[0].to;
        const innerTo = kids[kids.length - 1].from;

        if (revealed(nodeFrom, nodeTo)) {
          add(marker, nodeFrom, innerFrom);
          add(marker, innerTo, nodeTo);
        } else {
          add(hide, nodeFrom, innerFrom);
          add(hide, innerTo, nodeTo);
        }
        if (innerTo > innerFrom) out.push(inlineCode.range(innerFrom, innerTo));
        return false;
      }

      /* ---------- inline: links ---------- */

      if (name === 'Link') {
        const kids = childList(ref.node);
        if (kids.length < 3) return true;

        let closeIndex = -1;
        for (let i = 0; i < kids.length; i++) {
          const kid = kids[i];
          if (kid.type.name === 'LinkMark' && doc.sliceString(kid.from, kid.to) === ']') {
            closeIndex = i;
            break;
          }
        }
        if (closeIndex < 1) return true;

        const textFrom = kids[0].to;
        const textTo = kids[closeIndex].from;

        if (textTo > textFrom) out.push(inlineLink.range(textFrom, textTo));

        if (revealed(nodeFrom, nodeTo)) {
          add(marker, nodeFrom, textFrom);
          add(marker, textTo, nodeTo);
        } else {
          add(hide, nodeFrom, textFrom);
          add(hide, textTo, nodeTo);
        }
        return true;
      }

    return true; // unknown node: keep descending
  }

  // Everything outside the rebuilt window keeps its previous decoration.
  // Skipped decorations start *before* walkFrom (so they do not end past
  // walkFrom+1) and at/after walkTo; everything between is rebuilt from the
  // tree, so anything genuinely at those boundaries is already in `out`.
  if (carry) collectOutside(carry, out, walkFrom, walkTo);

  // Ranges are emitted in tree order, which is not position order (a nested
  // construct yields its inner span before its outer markers). Let the library
  // sort them: it knows where block decorations belong, which a manual sort by
  // `from` does not.
  try {
    return Decoration.set(out, true);
  } catch {
    // Overlapping ranges. The caller (see `livePreviewField.update`) retries
    // with a full-document build.
    return null;
  }
}


function safeBuild(view, range, carry) {
  try {
    return buildDecorations(view, range, carry);
  } catch (err) {
    if (typeof window !== 'undefined') {
      (window.__lumenDecoErrors = window.__lumenDecoErrors || []).push(
        String((err && err.stack) || err)
      );
    }
    // Keep whatever was already on screen instead of blanking the document.
    return carry || Decoration.none;
  }
}

/**
 * The window of the document whose decorations are rebuilt. Rebuilding the
 * whole document on every keystroke is O(document), which turns typing in a
 * long file into a stutter; only the region the user can actually see (plus a
 * screenful either side) needs to be current. Decorations outside it are
 * carried over unchanged by `map`, which is why they survive edits.
 */
const REBUILD_MARGIN = 2000;

function rebuildRange(state) {
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from);
  const toLine = state.doc.lineAt(sel.to);

  // Snap to line boundaries so the window never starts mid-construct.
  return {
    from: state.doc.lineAt(Math.max(0, fromLine.from - REBUILD_MARGIN)).from,
    to: state.doc.lineAt(Math.min(state.doc.length, toLine.to + REBUILD_MARGIN)).to,
  };
}

/** Collect decorations that survive outside the freshly rebuilt window. */
function collectOutside(set, out, walkFrom, walkTo) {
  // Line decorations sit *at* the line start, so a decoration exactly at a
  // boundary belongs to the rebuilt window, not to the carried-over side.
  if (walkFrom > 0) {
    set.between(0, walkFrom, (from, to, value) => {
      if (from >= walkFrom) return;
      out.push(value.range(from, to));
    });
  }
  if (walkTo < set.length) {
    set.between(walkTo, set.length, (from, to, value) => {
      if (from < walkTo) return;
      out.push(value.range(from, to));
    });
  }
}

/**
 * Block decorations (line decorations, block-replacing widgets) may not come
 * from a plugin, and which markers are visible depends on the selection —
 * something a plugin is not re-run for. A state field serves both: it
 * recomputes on every transaction and maps decorations through changes.
 *
 * Decorations outside the rebuilt window are carried over by remapping the
 * previous set. The one case that breaks that: a windowed rebuild produces a
 * decoration in the same place as a mapped one (e.g. a large jump or paste),
 * and `Decoration.set` rejects overlaps outright. So a build that came out
 * with overlaps falls back to a whole-document build, which is slow but never
 * loses a decoration.
 */
const livePreviewField = StateField.define({
  create(state) {
    return safeBuild({ state }, { from: 0, to: state.doc.length });
  },

  update(value, tr) {
    const forced = tr.effects.some((effect) => effect.is(refreshEffect));
    if (!tr.docChanged && !tr.selection && !forced) return value.map(tr.changes);

    const mapped = value.map(tr.changes);
    const range = rebuildRange(tr.state);
    const built = safeBuild({ state: tr.state }, range, mapped);
    if (built) return built;

    // Overlap: rebuild everything from scratch instead.
    return safeBuild({ state: tr.state }, { from: 0, to: tr.state.doc.length });
  },

  provide: (field) => EditorView.decorations.from(field),
});

export const livePreview = livePreviewField;
