// Regression check for the Mesh table-rotation formula.
//
// The two lines below are copy-pasted verbatim from buildMesh() in
// src/utils/server/tournamentBracket.js (loserTarget/winnerTarget) --
// duplicated rather than imported because that module pulls in "@/..."
// path aliases that only resolve inside Next's bundler, not plain Node
// (same reason backfill-nationally-ranked.js duplicates
// STANDINGS_ELIGIBLE_FORMATS). If you change the formula there, update it
// here too, or this check silently stops meaning anything.
const loserTarget = (table, tableCount) => Math.ceil(table / 2);
const winnerTarget = (table, tableCount) => Math.ceil((table + tableCount) / 2);

// Ground truth: table -> [lostTarget, wonTarget], for N = 3..14.
const groundTruth = {
  3: [[1, 1, 2], [2, 1, 3], [3, 2, 3]],
  4: [[1, 1, 3], [2, 1, 3], [3, 2, 4], [4, 2, 4]],
  5: [[1, 1, 3], [2, 1, 4], [3, 2, 4], [4, 2, 5], [5, 3, 5]],
  6: [[1, 1, 4], [2, 1, 4], [3, 2, 5], [4, 2, 5], [5, 3, 6], [6, 3, 6]],
  7: [[1, 1, 4], [2, 1, 5], [3, 2, 5], [4, 2, 6], [5, 3, 6], [6, 3, 7], [7, 4, 7]],
  8: [[1, 1, 5], [2, 1, 5], [3, 2, 6], [4, 2, 6], [5, 3, 7], [6, 3, 7], [7, 4, 8], [8, 4, 8]],
  9: [[1, 1, 5], [2, 1, 6], [3, 2, 6], [4, 2, 7], [5, 3, 7], [6, 3, 8], [7, 4, 8], [8, 4, 9], [9, 5, 9]],
  10: [[1, 1, 6], [2, 1, 6], [3, 2, 7], [4, 2, 7], [5, 3, 8], [6, 3, 8], [7, 4, 9], [8, 4, 9], [9, 5, 10], [10, 5, 10]],
  11: [[1, 1, 6], [2, 1, 7], [3, 2, 7], [4, 2, 8], [5, 3, 8], [6, 3, 9], [7, 4, 9], [8, 4, 10], [9, 5, 10], [10, 5, 11], [11, 6, 11]],
  12: [[1, 1, 7], [2, 1, 7], [3, 2, 8], [4, 2, 8], [5, 3, 9], [6, 3, 9], [7, 4, 10], [8, 4, 10], [9, 5, 11], [10, 5, 11], [11, 6, 12], [12, 6, 12]],
  13: [[1, 1, 7], [2, 1, 8], [3, 2, 8], [4, 2, 9], [5, 3, 9], [6, 3, 10], [7, 4, 10], [8, 4, 11], [9, 5, 11], [10, 5, 12], [11, 6, 12], [12, 6, 13], [13, 7, 13]],
  14: [[1, 1, 8], [2, 1, 8], [3, 2, 9], [4, 2, 9], [5, 3, 10], [6, 3, 10], [7, 4, 11], [8, 4, 11], [9, 5, 12], [10, 5, 12], [11, 6, 13], [12, 6, 13], [13, 7, 14], [14, 7, 14]],
};

let failures = 0;

for (const [N, rows] of Object.entries(groundTruth)) {
  const n = Number(N);
  let pass = true;
  for (const [t, lost, won] of rows) {
    const gotLost = loserTarget(t, n);
    const gotWon = winnerTarget(t, n);
    if (gotLost !== lost || gotWon !== won) {
      pass = false;
      failures++;
      console.error(`N=${n} table=${t}: expected LOST=${lost} WON=${won}, got LOST=${gotLost} WON=${gotWon}`);
    }
  }
  console.log(`N=${n}: ${pass ? "PASS" : "FAIL"}`);
}

// Boundary rule: table 1 loser stays at 1, table N winner stays at N -- for every N.
for (let n = 2; n <= 40; n++) {
  if (loserTarget(1, n) !== 1) {
    failures++;
    console.error(`N=${n}: table 1 loser should stay at table 1, got ${loserTarget(1, n)}`);
  }
  if (winnerTarget(n, n) !== n) {
    failures++;
    console.error(`N=${n}: table N winner should stay at table N, got ${winnerTarget(n, n)}`);
  }
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
