/**
 * Outline extraction. Works on the raw source (not the syntax tree) so it stays
 * correct even for regions the parser has not reached yet.
 */

const FENCE = /^(```|~~~)/;

export function extractOutline(text) {
  const lines = text.split('\n');
  const headings = [];

  let inFence = false;
  let offset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineFrom = offset;
    offset += line.length + 1;

    if (FENCE.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const atx = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (atx && !atx[2].startsWith('#')) {
      headings.push({
        level: atx[1].length,
        text: stripInline(atx[2]),
        pos: lineFrom + line.indexOf(atx[2]),
        line: i + 1,
      });
      continue;
    }

    // Setext: text line followed by === or --- underline
    if (i + 1 < lines.length && line.trim() && !line.startsWith(' ')) {
      const next = lines[i + 1].trim();
      if (/^=+\s*$/.test(next) || (/^-+\s*$/.test(next) && !/^[-*+]\s/.test(line))) {
        headings.push({
          level: next.startsWith('=') ? 1 : 2,
          text: stripInline(line.trim()),
          pos: lineFrom + line.indexOf(line.trim()),
          line: i + 1,
        });
      }
    }
  }

  return headings;
}

function stripInline(text) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .trim();
}
