// Fisher's exact test for a 2x2 table, used to say whether a contrast between
// two small samples is worth reading at all. Exact rather than approximate
// because the counts here are in the tens, where a chi-square approximation is
// not trustworthy.

function logFactorial(n) {
  let total = 0;
  for (let i = 2; i <= n; i += 1) total += Math.log(i);
  return total;
}

// Probability of exactly this table under the hypergeometric null, with fixed
// margins.
function tableProbability(a, b, c, d) {
  const n = a + b + c + d;
  return Math.exp(
    logFactorial(a + b) +
      logFactorial(c + d) +
      logFactorial(a + c) +
      logFactorial(b + d) -
      logFactorial(n) -
      logFactorial(a) -
      logFactorial(b) -
      logFactorial(c) -
      logFactorial(d),
  );
}

/**
 * Two-tailed Fisher exact p for the table [[a, b], [c, d]], summing every table
 * with the same margins that is no more likely than the observed one.
 */
export function fisherExactTwoTailed(a, b, c, d) {
  const observed = tableProbability(a, b, c, d);
  const rowOne = a + b;
  const columnOne = a + c;
  const n = a + b + c + d;
  const low = Math.max(0, columnOne - (n - rowOne));
  const high = Math.min(rowOne, columnOne);
  let total = 0;
  // A tolerance, because two arithmetically equal tables can differ in the last
  // bits and would otherwise be dropped from the tail.
  const tolerance = 1e-12;
  for (let x = low; x <= high; x += 1) {
    const probability = tableProbability(x, rowOne - x, columnOne - x, n - rowOne - columnOne + x);
    if (probability <= observed * (1 + tolerance)) total += probability;
  }
  return Math.min(1, total);
}
