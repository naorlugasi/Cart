// Minimal BM25 over a Hebrew+English corpus. Hebrew needs exact-word hits
// (chunk.id style identifiers like "icecream-tub", words like "קפוא", dates
// like "28.9"), so this does no stemming - just Unicode-aware tokenizing
// that keeps dotted numbers ("28.9") and hyphenated ids ("icecream-tub")
// whole, while also indexing their parts so a query for just "icecream"
// still hits "icecream-tub".

const TOKEN_RE = /[\p{L}\p{N}]+(?:[-'.][\p{L}\p{N}]+)*/gu;
const DATE_RE = /^\d+\.\d+$/;

export function tokenize(text) {
  const tokens = [];
  for (const raw of text.toLowerCase().matchAll(TOKEN_RE)) {
    const tok = raw[0];
    tokens.push(tok);
    if (tok.includes('-') && !DATE_RE.test(tok)) {
      for (const part of tok.split('-')) if (part.length > 1) tokens.push(part);
    }
  }
  return tokens;
}

function termFreq(tokens) {
  const tf = {};
  for (const t of tokens) tf[t] = (tf[t] ?? 0) + 1;
  return tf;
}

/** Build the BM25 statistics for a list of chunk texts. */
export function buildBM25(texts) {
  const docs = texts.map((t) => {
    const tokens = tokenize(t);
    return { tf: termFreq(tokens), len: tokens.length };
  });
  const df = {};
  for (const doc of docs) {
    for (const term of Object.keys(doc.tf)) df[term] = (df[term] ?? 0) + 1;
  }
  const N = docs.length;
  const avgdl = N ? docs.reduce((s, d) => s + d.len, 0) / N : 0;
  return { tf: docs.map((d) => d.tf), len: docs.map((d) => d.len), df, N, avgdl };
}

const K1 = 1.5;
const B = 0.75;

/** Score every document in a prebuilt BM25 index against a query string. Returns scores[] aligned to docs. */
export function scoreBM25(index, query) {
  const qTokens = [...new Set(tokenize(query))];
  const { tf, len, df, N, avgdl } = index;
  const scores = new Array(tf.length).fill(0);
  for (const term of qTokens) {
    const docFreq = df[term];
    if (!docFreq) continue;
    const idf = Math.log(1 + (N - docFreq + 0.5) / (docFreq + 0.5));
    for (let i = 0; i < tf.length; i++) {
      const f = tf[i][term];
      if (!f) continue;
      const denom = f + K1 * (1 - B + (B * len[i]) / (avgdl || 1));
      scores[i] += idf * ((f * (K1 + 1)) / denom);
    }
  }
  return scores;
}
