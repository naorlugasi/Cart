// Splits a file's text into retrieval chunks: markdown by heading, code by
// comment block (/** ... */ or a run of >=3 consecutive // lines). Every
// chunk keeps the file path, the 1-based line it starts at, and a short
// "heading path" for display and for the embedding model to read.

const MAX_CHUNK_LINES = 120;

/** Split an array of lines into pieces of at most `max` lines, preserving line numbers. */
function splitLong(lines, startLine, heading, max = MAX_CHUNK_LINES) {
  const out = [];
  for (let i = 0; i < lines.length; i += max) {
    const piece = lines.slice(i, i + max);
    out.push({ startLine: startLine + i, endLine: startLine + i + piece.length - 1, heading, lines: piece });
  }
  return out;
}

/**
 * Chunk a markdown file by heading (#, ##, ### ...). Each chunk's `heading`
 * is the full path from the top-level heading down to the one it sits
 * under ("§2 מושגים > §2.10 תחליפים"), which is what makes the printed
 * result ("path:line [heading]") useful on its own, out of context.
 */
export function chunkMarkdown(text) {
  const lines = text.split('\n');
  const HEADING_RE = /^(#{1,6})\s+(.*)$/;

  const sections = []; // { level, title, startLine, lines: [] }
  const stack = []; // current heading titles by level

  let current = { level: 0, title: null, startLine: 1, lines: [] };
  sections.push(current);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = HEADING_RE.exec(line);
    if (m) {
      const level = m[1].length;
      const title = m[2].trim();
      stack.length = level - 1;
      stack[level - 1] = title;
      current = { level, title, startLine: i + 1, lines: [line] };
      sections.push(current);
    } else {
      current.lines.push(line);
    }
  }

  const chunks = [];
  const headingStack = [];
  for (const section of sections) {
    if (section.title !== null) {
      headingStack.length = section.level - 1;
      headingStack[section.level - 1] = section.title;
    }
    const headingPath = headingStack.filter(Boolean).join(' > ') || null;
    // Drop empty leading/trailing blank lines but keep internal structure.
    const body = section.lines;
    const nonEmpty = body.some((l) => l.trim().length);
    if (!nonEmpty) continue;
    for (const piece of splitLong(body, section.startLine, headingPath)) {
      chunks.push(piece);
    }
  }
  return chunks.map(({ startLine, endLine, heading, lines }) => ({
    startLine,
    endLine,
    heading,
    text: lines.join('\n').trim(),
  }));
}

const DECL_RES = [
  /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
  /^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/,
  /^export\s+default\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)?/,
  /^export\s+const\s+([A-Za-z0-9_$]+)/,
  /^const\s+([A-Za-z0-9_$]+)/,
  /^export\s+class\s+([A-Za-z0-9_$]+)/,
  /^class\s+([A-Za-z0-9_$]+)/,
  /^export\s+(?:async\s+)?function\*\s*([A-Za-z0-9_$]+)/,
];

/** Guess a short label for a comment block from the declaration right after it. */
function labelFor(lines, fromIndex, fileBase) {
  for (let i = fromIndex; i < Math.min(lines.length, fromIndex + 6); i++) {
    const t = lines[i].trim();
    if (!t) continue;
    for (const re of DECL_RES) {
      const m = re.exec(t);
      if (m && m[1]) return m[1];
    }
    // Stop looking once we hit real code that isn't a declaration opener.
    if (!/^\/\//.test(t)) break;
  }
  return fileBase;
}

/**
 * Chunk a JS/MJS file's comment blocks: /** ... *\/ blocks, and runs of 3+
 * consecutive // lines. Code itself is not indexed - only the prose that
 * explains it, which is where the project's decisions are written down.
 */
export function chunkCodeComments(text, fileBase) {
  const lines = text.split('\n');
  const chunks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('/**') || (trimmed.startsWith('/*') && !trimmed.includes('*/'))) {
      const start = i;
      let end = i;
      while (end < lines.length && !lines[end].includes('*/')) end++;
      end = Math.min(end, lines.length - 1);
      const blockLines = lines.slice(start, end + 1);
      const heading = labelFor(lines, end + 1, fileBase);
      for (const piece of splitLong(blockLines, start + 1, heading)) {
        chunks.push(piece);
      }
      i = end + 1;
      continue;
    }

    if (trimmed.startsWith('//')) {
      const start = i;
      let end = i;
      while (end < lines.length && lines[end].trim().startsWith('//')) end++;
      const runLength = end - start;
      if (runLength >= 3) {
        const blockLines = lines.slice(start, end);
        const heading = labelFor(lines, end, fileBase);
        for (const piece of splitLong(blockLines, start + 1, heading)) {
          chunks.push(piece);
        }
      }
      i = end;
      continue;
    }

    i++;
  }
  return chunks.map(({ startLine, endLine, heading, lines: ls }) => ({
    startLine,
    endLine,
    heading,
    text: ls.join('\n').trim(),
  }));
}
