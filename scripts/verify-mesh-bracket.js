// One-off verification: checks the actual generated Mesh matches for a
// specific tournament/game in the live database against the movement
// formula in buildMesh() (src/utils/server/tournamentBracket.js).
//
// Usage: node scripts/verify-mesh-bracket.js "<tournament name regex>" "<game name regex>" "<eventTitle regex>"

import { connectDB } from "../src/lib/mongoose.js";
import { Tournament } from "../src/models/Tournament.js";
import { Match } from "../src/models/Match.js";
import { Team } from "../src/models/Team.js";
import { Game } from "../src/models/Game.js";

// Copied from buildMesh() in tournamentBracket.js -- see verify-mesh-rotation.js for why.
const loserTarget = (table, tableCount) => Math.ceil(table / 2);
const winnerTarget = (table, tableCount) => Math.ceil((table + tableCount) / 2);

// Copied from teamNumbering.js's seatingRegionOf (avoids @/ alias imports in plain Node).
function seatingRegionOf(team) {
  if (!team) return "00";
  const geographic = team.regionCode && team.regionCode !== "40";
  const region = geographic ? team.regionCode : team.primaryRegion;
  return region || team.regionCode || "00";
}

const [, , tournamentRe, gameRe, eventRe] = process.argv;

async function main() {
  await connectDB();

  const tournament = await Tournament.findOne({
    name: new RegExp(tournamentRe, "i"),
  });
  if (!tournament) {
    console.error(`No tournament matching /${tournamentRe}/i`);
    process.exit(1);
  }
  console.log(`Tournament: "${tournament.name}" (${tournament._id})`);

  const matchingGameDocs = await Game.find({ name: new RegExp(gameRe, "i") });
  const matchingGameIds = new Set(matchingGameDocs.map((g) => g._id.toString()));

  const gameConfig = tournament.games.find(
    (g) =>
      matchingGameIds.has(g.game.toString()) &&
      new RegExp(eventRe, "i").test(g.eventTitle || "")
  );
  if (!gameConfig) {
    console.error(`No game in this tournament matching game=/${gameRe}/i eventTitle=/${eventRe}/i`);
    console.error(
      "Games in this tournament:",
      tournament.games.map((g) => ({
        gameId: g.game.toString(),
        eventTitle: g.eventTitle,
        format: g.format,
      }))
    );
    process.exit(1);
  }

  const gameDoc = matchingGameDocs.find((g) => g._id.toString() === gameConfig.game.toString());
  console.log(`Game: "${gameDoc.name}" -- "${gameConfig.eventTitle}"`);
  console.log(`Format: ${gameConfig.format}, meshRounds: ${gameConfig.meshRounds}, round1Status: ${gameConfig.round1Status}`);

  if (gameConfig.format !== "mesh") {
    console.error(`This game's format is "${gameConfig.format}", not "mesh". Nothing to verify.`);
    process.exit(1);
  }

  const matches = await Match.find({
    tournament: tournament._id,
    gameConfigId: gameConfig._id,
    stage: "round1",
  }).sort({ round: 1, slot: 1 });

  if (matches.length === 0) {
    console.error("No matches found for this game -- bracket hasn't been generated yet.");
    process.exit(1);
  }

  const teams = await Team.find({ tournament: tournament._id, gameConfigId: gameConfig._id });
  const teamById = new Map(teams.map((t) => [t._id.toString(), t]));

  const byRound = new Map();
  for (const m of matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round).push(m);
  }
  const maxRound = Math.max(...byRound.keys());
  const round1 = byRound.get(1);
  const tableCount = Math.max(...round1.map((m) => m.slot));

  console.log(`\nRounds found: 1..${maxRound} (expected meshRounds=${gameConfig.meshRounds})`);
  console.log(`Table count (N): ${tableCount}`);
  console.log(`Total matches: ${matches.length}`);

  let issues = [];

  // 1. meshRounds consistency
  if (maxRound !== gameConfig.meshRounds) {
    issues.push(`Round count mismatch: found ${maxRound} rounds of matches but meshRounds=${gameConfig.meshRounds}`);
  }

  // 2. Movement formula + last-round-null check, per round
  for (let r = 1; r <= maxRound; r++) {
    const roundMatches = byRound.get(r) || [];
    const isLast = r === maxRound;
    for (const m of roundMatches) {
      if (isLast) {
        if (m.winTarget?.round != null || m.lossTarget?.round != null) {
          issues.push(`Round ${r} table ${m.slot}: last round should have no winTarget/lossTarget, found winTarget=${JSON.stringify(m.winTarget)} lossTarget=${JSON.stringify(m.lossTarget)}`);
        }
        continue;
      }
      const expectedWon = winnerTarget(m.slot, tableCount);
      const expectedLost = loserTarget(m.slot, tableCount);
      if (!m.winTarget || m.winTarget.round !== r + 1 || m.winTarget.match !== expectedWon) {
        issues.push(`Round ${r} table ${m.slot}: winTarget expected {round:${r + 1},match:${expectedWon}}, got ${JSON.stringify(m.winTarget)}`);
      }
      if (!m.isBye) {
        if (!m.lossTarget || m.lossTarget.round !== r + 1 || m.lossTarget.match !== expectedLost) {
          issues.push(`Round ${r} table ${m.slot}: lossTarget expected {round:${r + 1},match:${expectedLost}}, got ${JSON.stringify(m.lossTarget)}`);
        }
      } else if (m.lossTarget) {
        issues.push(`Round ${r} table ${m.slot}: bye match should have lossTarget=null, got ${JSON.stringify(m.lossTarget)}`);
      }
    }
  }

  // 3. Round 1 region clash check
  for (const m of round1) {
    if (m.teamA && m.teamB) {
      const rA = seatingRegionOf(teamById.get(m.teamA.toString()));
      const rB = seatingRegionOf(teamById.get(m.teamB.toString()));
      if (rA === rB) {
        issues.push(`Round 1 table ${m.slot}: same-region clash (region ${rA}) between teams ${m.teamA} and ${m.teamB}`);
      }
    }
  }

  // 4. Actual routing check: for completed matches, verify winner/loser landed
  //    in the correct next-round slot's teamA/teamB.
  const matchByRoundSlot = new Map();
  for (const m of matches) matchByRoundSlot.set(`${m.round}:${m.slot}`, m);

  for (const m of matches) {
    if (m.status !== "completed" || !m.winTarget) continue;
    const winnerId = m.winner?.toString();
    const loserId = m.loser?.toString();
    if (winnerId && m.winTarget) {
      const target = matchByRoundSlot.get(`${m.winTarget.round}:${m.winTarget.match}`);
      if (target) {
        const landed = [target.teamA?.toString(), target.teamB?.toString()].includes(winnerId);
        if (!landed) {
          issues.push(`Round ${m.round} table ${m.slot}: winner ${winnerId} did NOT land in expected target round ${m.winTarget.round} table ${m.winTarget.match} (target has teamA=${target.teamA}, teamB=${target.teamB})`);
        }
      }
    }
    if (loserId && m.lossTarget) {
      const target = matchByRoundSlot.get(`${m.lossTarget.round}:${m.lossTarget.match}`);
      if (target) {
        const landed = [target.teamA?.toString(), target.teamB?.toString()].includes(loserId);
        if (!landed) {
          issues.push(`Round ${m.round} table ${m.slot}: loser ${loserId} did NOT land in expected target round ${m.lossTarget.round} table ${m.lossTarget.match} (target has teamA=${target.teamA}, teamB=${target.teamB})`);
        }
      }
    }
  }

  console.log(`\n=== ${issues.length === 0 ? "ALL CHECKS PASSED" : `${issues.length} ISSUE(S) FOUND`} ===`);
  for (const issue of issues) console.log(" - " + issue);

  process.exit(issues.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
