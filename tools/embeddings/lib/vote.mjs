// Majority-vote label prediction from a list of neighbours, shared by the concept holdout, the
// department holdout, and both proposal generators.
//
// Confidence = similarity-weighted vote share of the winning label among the k neighbours:
//   confidence = (sum of similarities of neighbours that voted for the winning label)
//              / (sum of similarities of all k neighbours)
// This rewards both *agreement* (more neighbours voting the same way) and *closeness* (higher
// similarity neighbours count more), which is what we want a 95%-precision gate to key off of -
// either k=10/10 neighbours agreeing at middling similarity, or a handful of very close neighbours
// all agreeing, should count as "confident"; one lone close neighbour against a divided remainder
// should not.

/** neighbors: [{ row, similarity }], labelOf(row): string|null. Neighbours with a null label are
 * dropped before voting (they carry no information). Returns null if no labelled neighbours remain. */
export function predictLabel(neighbors, labelOf) {
  const labeled = neighbors.map((n) => ({ ...n, label: labelOf(n.row) })).filter((n) => n.label != null);
  if (labeled.length === 0) return null;
  const totals = new Map(); // label -> { simSum, count }
  let grandSimSum = 0;
  for (const n of labeled) {
    const t = totals.get(n.label) || { simSum: 0, count: 0 };
    t.simSum += n.similarity;
    t.count += 1;
    totals.set(n.label, t);
    grandSimSum += n.similarity;
  }
  let bestLabel = null;
  let best = { simSum: -Infinity, count: 0 };
  for (const [label, t] of totals) {
    if (t.simSum > best.simSum) {
      best = t;
      bestLabel = label;
    }
  }
  return {
    label: bestLabel,
    confidence: grandSimSum > 0 ? best.simSum / grandSimSum : 0,
    agreeCount: best.count,
    k: labeled.length,
    neighbors: labeled,
  };
}

/** Scans thresholds and returns { threshold, precision, coverage } for the lowest threshold (finest
 * step) whose precision is >= targetPrecision, i.e. the most permissive gate that still clears the
 * bar - maximizing coverage subject to the precision floor. `predictions` is
 * [{ confidence, correct: bool }]. Returns null if no threshold clears targetPrecision. */
export function precisionCoverageCurve(predictions, { targetPrecision = 0.95, steps = 41 } = {}) {
  const curve = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const subset = predictions.filter((p) => p.confidence >= t);
    const precision = subset.length ? subset.filter((p) => p.correct).length / subset.length : null;
    const coverage = predictions.length ? subset.length / predictions.length : 0;
    curve.push({ threshold: t, precision, coverage, n: subset.length });
  }
  let chosen = null;
  for (const point of curve) {
    if (point.precision != null && point.precision >= targetPrecision) {
      chosen = point;
      break; // curve is in ascending threshold order; first hit is the lowest (most permissive) threshold
    }
  }
  return { curve, chosen };
}
