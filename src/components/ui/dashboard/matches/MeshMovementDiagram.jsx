"use client";
import { useMemo, useState, useCallback } from "react";

// Visual ladder of the whole mesh event: one column per round, one row per
// table (table 1 at the bottom, table N at the top -- same mental model as
// "winners climb up, losers sink down"). Lines are drawn straight from each
// match's stored winTarget/lossTarget, so the diagram always mirrors exactly
// what's in the database, never a recomputed/assumed formula.

const COL_WIDTH = 210;
const ROW_HEIGHT = 78;
const BOX_WIDTH = 172;
const BOX_HEIGHT = 60;
const HEADER_HEIGHT = 56;
const PADDING = 28;

const ROUND_COLORS = {
  done: "var(--success-color)",
  live: "var(--accent-color)",
  upcoming: "#6b7280",
};

function shortLabel(team, max = 16) {
  if (!team) return "";
  const name = team.name || "";
  return name.length > max ? name.slice(0, max - 1) + "…" : name;
}

function idOf(ref) {
  if (!ref) return null;
  return typeof ref === "object" ? ref._id : ref;
}

// Follows a team's *actual* recorded path (not a formula) round by round --
// wherever the real teamA/teamB on each round's matches says it landed.
function traceTeamPath(byRoundTable, roundsList, teamId) {
  const path = [];
  for (const r of roundsList) {
    const found = (byRoundTable.get(r) || []).find(
      (m) => idOf(m.teamA) === teamId || idOf(m.teamB) === teamId
    );
    if (!found) break;
    path.push({ round: r, slot: found.slot });
  }
  return path;
}

export default function MeshMovementDiagram({ matches, roundsList, tableCount, activeRound, roundStatus = {}, onSelectRound }) {
  const [highlightTeamId, setHighlightTeamId] = useState(null);
  const [tooltip, setTooltip] = useState(null); // { x, y, name, displayId }

  const byRoundTable = useMemo(() => {
    const map = new Map();
    for (const r of roundsList) {
      map.set(r, matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot));
    }
    return map;
  }, [matches, roundsList]);

  const highlightPath = useMemo(() => {
    if (!highlightTeamId) return new Set();
    const path = traceTeamPath(byRoundTable, roundsList, highlightTeamId);
    return new Set(path.map((p) => `${p.round}:${p.slot}`));
  }, [highlightTeamId, byRoundTable, roundsList]);

  const width = PADDING * 2 + roundsList.length * COL_WIDTH;
  const height = PADDING * 2 + HEADER_HEIGHT + tableCount * ROW_HEIGHT;

  const boxX = (roundIdx) => PADDING + roundIdx * COL_WIDTH + (COL_WIDTH - BOX_WIDTH) / 2;
  const boxY = (table) => PADDING + HEADER_HEIGHT + (tableCount - table) * ROW_HEIGHT + (ROW_HEIGHT - BOX_HEIGHT) / 2;

  const showTooltip = useCallback((evt, team) => {
    if (!team) return;
    setTooltip({
      x: evt.clientX,
      y: evt.clientY,
      name: team.name || "Unnamed team",
      displayId: team.displayId || team.serialNo || "",
    });
  }, []);
  const moveTooltip = useCallback((evt) => {
    setTooltip((t) => (t ? { ...t, x: evt.clientX, y: evt.clientY } : t));
  }, []);
  const hideTooltip = useCallback(() => setTooltip(null), []);

  const lines = [];
  roundsList.forEach((r, roundIdx) => {
    if (roundIdx === roundsList.length - 1) return; // last round: nothing moves on
    const roundMatches = byRoundTable.get(r) || [];
    for (const m of roundMatches) {
      const fromX = boxX(roundIdx) + BOX_WIDTH;
      const fromY = boxY(m.slot) + BOX_HEIGHT / 2;
      const nextRoundIdx = roundIdx + 1;

      if (m.winTarget?.match) {
        const toX = boxX(nextRoundIdx);
        const toY = boxY(m.winTarget.match) + BOX_HEIGHT / 2;
        const isHighlighted = highlightPath.has(`${r}:${m.slot}`) && highlightPath.has(`${r + 1}:${m.winTarget.match}`);
        lines.push({
          key: `${r}:${m.slot}:win`,
          d: `M ${fromX} ${fromY} C ${fromX + 46} ${fromY}, ${toX - 46} ${toY}, ${toX - 6} ${toY}`,
          color: "var(--success-color)",
          bold: isHighlighted,
        });
      }
      if (m.lossTarget?.match && !m.isBye) {
        const toX = boxX(nextRoundIdx);
        const toY = boxY(m.lossTarget.match) + BOX_HEIGHT / 2;
        const isHighlighted = highlightPath.has(`${r}:${m.slot}`) && highlightPath.has(`${r + 1}:${m.lossTarget.match}`);
        lines.push({
          key: `${r}:${m.slot}:loss`,
          d: `M ${fromX} ${fromY} C ${fromX + 46} ${fromY}, ${toX - 46} ${toY}, ${toX - 6} ${toY}`,
          color: "var(--error-color)",
          bold: isHighlighted,
        });
      }
    }
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: "rgba(16,185,129,0.12)", color: "var(--success-color)" }}
        >
          <svg width="14" height="8"><path d="M0 4 H14 M9 1 L14 4 L9 7" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
          Winner moves up
        </span>
        <span
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
          style={{ background: "rgba(239,68,68,0.12)", color: "var(--error-color)" }}
        >
          <svg width="14" height="8"><path d="M0 4 H14 M9 1 L14 4 L9 7" stroke="currentColor" strokeWidth="1.5" fill="none" /></svg>
          Loser moves down
        </span>
        <span className="text-gray-500">Hover a team for its full name · click to trace its path</span>
        {highlightTeamId && (
          <button
            onClick={() => setHighlightTeamId(null)}
            className="ml-auto px-2.5 py-1 rounded-full text-xs font-medium"
            style={{ background: "var(--accent-color)", color: "var(--background)" }}
          >
            Clear highlighted path ✕
          </button>
        )}
      </div>

      <div
        className="overflow-x-auto rounded-2xl"
        style={{ border: "1px solid var(--border-color)", background: "var(--card-background)", padding: "4px" }}
      >
        <svg width={width} height={height} role="img" aria-label="Mesh table movement diagram">
          <defs>
            <filter id="mesh-box-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#000000" floodOpacity="0.35" />
            </filter>
          </defs>

          {/* Column bands */}
          {roundsList.map((r, roundIdx) => (
            <rect
              key={`band-${r}`}
              x={PADDING + roundIdx * COL_WIDTH}
              y={PADDING}
              width={COL_WIDTH}
              height={HEADER_HEIGHT + tableCount * ROW_HEIGHT}
              rx={16}
              fill={r === activeRound ? "rgba(251,191,36,0.06)" : roundIdx % 2 === 0 ? "rgba(255,255,255,0.015)" : "transparent"}
            />
          ))}

          {/* Round headers */}
          {roundsList.map((r, roundIdx) => {
            const statusColor = ROUND_COLORS[roundStatus[r]] || "var(--foreground)";
            const cx = boxX(roundIdx) + BOX_WIDTH / 2;
            return (
              <g key={`col-${r}`} style={{ cursor: "pointer" }} onClick={() => onSelectRound?.(r)}>
                <rect
                  x={cx - 46}
                  y={PADDING + 12}
                  width={92}
                  height={26}
                  rx={13}
                  fill={r === activeRound ? "var(--accent-color)" : "var(--secondary-color)"}
                  stroke={r === activeRound ? "var(--accent-color)" : "var(--border-color)"}
                />
                <circle cx={cx - 46 + 16} cy={PADDING + 25} r={4} fill={r === activeRound ? "var(--background)" : statusColor} />
                <text
                  x={cx + 6}
                  y={PADDING + 29}
                  textAnchor="middle"
                  fontSize="12.5"
                  fontWeight={700}
                  fill={r === activeRound ? "var(--background)" : "var(--foreground)"}
                >
                  Round {r}
                </text>
              </g>
            );
          })}

          {/* Connector lines */}
          {lines.map((l) => (
            <path
              key={l.key}
              d={l.d}
              fill="none"
              stroke={l.color}
              strokeWidth={l.bold ? 3.5 : 2}
              strokeLinecap="round"
              opacity={highlightTeamId ? (l.bold ? 1 : 0.12) : 0.5}
            />
          ))}

          {/* Table boxes */}
          {roundsList.map((r, roundIdx) =>
            (byRoundTable.get(r) || []).map((m) => {
              const x = boxX(roundIdx);
              const y = boxY(m.slot);
              const hasTeams = m.teamA && m.teamB;
              const inPath = highlightPath.has(`${r}:${m.slot}`);
              const winnerId = idOf(m.winner);
              const faded = highlightTeamId && !inPath;

              return (
                <g key={`${r}:${m.slot}`} opacity={faded ? 0.35 : 1}>
                  <rect
                    x={x}
                    y={y}
                    width={BOX_WIDTH}
                    height={BOX_HEIGHT}
                    rx={12}
                    fill="var(--secondary-color)"
                    stroke={inPath ? "var(--accent-color)" : hasTeams ? "var(--border-color)" : "var(--border-color)"}
                    strokeWidth={inPath ? 2.5 : 1}
                    strokeDasharray={hasTeams ? "0" : "4 3"}
                    filter={inPath ? "url(#mesh-box-shadow)" : undefined}
                  />

                  {/* Table number pill */}
                  <circle cx={x + 18} cy={y + 16} r={11} fill="rgba(255,255,255,0.06)" stroke="var(--border-color)" />
                  <text x={x + 18} y={y + 20} textAnchor="middle" fontSize="10.5" fontWeight={700} fill="var(--foreground)">
                    {m.slot}
                  </text>
                  {m.isBye && (
                    <text x={x + BOX_WIDTH - 10} y={y + 18} textAnchor="end" fontSize="9" fontWeight={600} fill="var(--info-color)">
                      BYE
                    </text>
                  )}

                  {hasTeams ? (
                    <>
                      <g
                        style={{ cursor: "pointer" }}
                        onClick={() => setHighlightTeamId(idOf(m.teamA))}
                        onMouseEnter={(e) => showTooltip(e, m.teamA)}
                        onMouseMove={moveTooltip}
                        onMouseLeave={hideTooltip}
                      >
                        <rect x={x + 36} y={y + 6} width={BOX_WIDTH - 42} height={20} fill="transparent" />
                        {winnerId === idOf(m.teamA) && (
                          <circle cx={x + 40} cy={y + 16} r={6} fill="var(--success-color)" />
                        )}
                        <text
                          x={winnerId === idOf(m.teamA) ? x + 50 : x + 38}
                          y={y + 20}
                          fontSize="11.5"
                          fontWeight={winnerId === idOf(m.teamA) ? 700 : 500}
                          fill={winnerId === idOf(m.teamA) ? "var(--success-color)" : "var(--foreground)"}
                        >
                          {shortLabel(m.teamA)}
                        </text>
                      </g>
                      <line x1={x + 12} y1={y + BOX_HEIGHT / 2} x2={x + BOX_WIDTH - 12} y2={y + BOX_HEIGHT / 2} stroke="var(--border-color)" strokeWidth="1" />
                      <g
                        style={{ cursor: "pointer" }}
                        onClick={() => setHighlightTeamId(idOf(m.teamB))}
                        onMouseEnter={(e) => showTooltip(e, m.teamB)}
                        onMouseMove={moveTooltip}
                        onMouseLeave={hideTooltip}
                      >
                        <rect x={x + 6} y={y + BOX_HEIGHT - 26} width={BOX_WIDTH - 12} height={20} fill="transparent" />
                        {winnerId === idOf(m.teamB) && (
                          <circle cx={x + 12} cy={y + BOX_HEIGHT - 16} r={6} fill="var(--success-color)" />
                        )}
                        <text
                          x={winnerId === idOf(m.teamB) ? x + 22 : x + 10}
                          y={y + BOX_HEIGHT - 12}
                          fontSize="11.5"
                          fontWeight={winnerId === idOf(m.teamB) ? 700 : 500}
                          fill={winnerId === idOf(m.teamB) ? "var(--success-color)" : "var(--foreground)"}
                        >
                          {shortLabel(m.teamB)}
                        </text>
                      </g>
                    </>
                  ) : (
                    <text x={x + BOX_WIDTH / 2} y={y + BOX_HEIGHT / 2 + 4} textAnchor="middle" fontSize="10.5" fontStyle="italic" fill="#6b7280">
                      TBD
                    </text>
                  )}
                </g>
              );
            })
          )}
        </svg>
      </div>

      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none px-3 py-2 rounded-lg text-xs shadow-xl"
          style={{
            left: tooltip.x + 14,
            top: tooltip.y + 14,
            background: "var(--card-background)",
            border: "1px solid var(--accent-color)",
            color: "var(--foreground)",
            maxWidth: 220,
          }}
        >
          <div className="font-semibold">{tooltip.name}</div>
          {tooltip.displayId && <div className="text-gray-400 mt-0.5">{tooltip.displayId}</div>}
        </div>
      )}
    </div>
  );
}
