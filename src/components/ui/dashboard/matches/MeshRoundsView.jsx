"use client";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Circle,
  Clock,
  LayoutGrid,
  GitBranch,
  Trophy,
} from "lucide-react";
import api from "@/utils/axios";
import EditMatchModal from "./EditMatchesModel";
import MeshMovementDiagram from "./MeshMovementDiagram";

function idOf(ref) {
  if (!ref) return null;
  return typeof ref === "object" ? ref._id : ref;
}

function isUserInMembers(members, userId) {
  return (members || []).some((m) => (typeof m === "string" ? m === userId : m._id === userId));
}

const ROUND_STATUS_META = {
  done: { icon: CheckCircle2, color: "var(--success-color)", label: "Complete" },
  live: { icon: Clock, color: "var(--accent-color)", label: "In progress" },
  upcoming: { icon: Circle, color: "#6b7280", label: "Not started" },
};

function TeamRow({ team, score, isWinner, isDecided }) {
  if (!team) return null;
  return (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-1.5">
        {isWinner && <Trophy size={14} style={{ color: "var(--accent-color)" }} />}
        <span className={`font-medium ${isWinner ? "" : ""}`}>
          {team.displayId || team.serialNo ? `${team.displayId || team.serialNo} ` : ""}
          {team.name}
        </span>
      </div>
      <span
        className="font-mono text-sm"
        style={{ color: isDecided ? (isWinner ? "var(--success-color)" : "var(--muted-foreground, #9ca3af)") : undefined }}
      >
        {score ?? 0}
      </span>
    </div>
  );
}

function TableCard({ match, isLastRound, canEdit, onEdit }) {
  const hasTeams = match.teamA && match.teamB;
  const completed = match.status === "completed";
  const winnerId = idOf(match.winner);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={hasTeams ? { scale: 1.02 } : undefined}
      className="rounded-2xl p-4 shadow-md"
      style={{
        background: "var(--card-background)",
        border: `1px solid ${completed ? "var(--success-color)" : "var(--border-color)"}`,
        cursor: hasTeams && canEdit ? "pointer" : "default",
        opacity: hasTeams ? 1 : 0.65,
      }}
      onClick={() => hasTeams && canEdit && onEdit(match)}
    >
      <div className="flex justify-between items-center mb-3">
        <span className="rounded-md bg-[var(--secondary-color)] px-2 py-0.5 text-xs font-medium text-[var(--foreground)]">
          Table {match.slot}
        </span>
        {match.isBye && (
          <span className="text-xs" style={{ color: "var(--info-color)" }}>
            Bye — auto-advances
          </span>
        )}
        {completed && <CheckCircle2 size={16} style={{ color: "var(--success-color)" }} />}
      </div>

      {hasTeams ? (
        <div className="space-y-2 mb-2">
          <TeamRow team={match.teamA} score={match.teamAScore} isWinner={winnerId === idOf(match.teamA)} isDecided={completed} />
          <div className="text-center text-[10px] uppercase tracking-wide text-gray-500">vs</div>
          <TeamRow team={match.teamB} score={match.teamBScore} isWinner={winnerId === idOf(match.teamB)} isDecided={completed} />
        </div>
      ) : (
        <p className="text-sm italic text-gray-500 mb-2">
          Waiting for a result from Round {match.round - 1}…
        </p>
      )}

      {!isLastRound ? (
        <div className="mt-3 pt-3 flex justify-between text-xs" style={{ borderTop: "1px solid var(--border-color)" }}>
          <span className="flex items-center gap-1" style={{ color: "var(--success-color)" }}>
            <ArrowUp size={14} /> Winner → Table {match.winTarget?.match ?? "—"}
          </span>
          {!match.isBye && (
            <span className="flex items-center gap-1" style={{ color: "var(--error-color)" }}>
              <ArrowDown size={14} /> Loser → Table {match.lossTarget?.match ?? "—"}
            </span>
          )}
        </div>
      ) : (
        <p className="mt-3 pt-3 text-xs text-center text-gray-500" style={{ borderTop: "1px solid var(--border-color)" }}>
          Final round — no further movement
        </p>
      )}

      {hasTeams && !completed && (
        <p className="mt-2 text-xs text-center" style={{ color: canEdit ? "var(--accent-color)" : "#6b7280" }}>
          {canEdit ? "Tap to enter score" : "Waiting on the teams to enter a score"}
        </p>
      )}
    </motion.div>
  );
}

export default function MeshRoundsView({ matches, onUpdate }) {
  const [editingMatch, setEditingMatch] = useState(null);
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "diagram"
  const [selectedRound, setSelectedRound] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    api
      .get("/api/me")
      .then((res) => setCurrentUser(res.data?.data?.user || null))
      .catch(() => setCurrentUser(null));
  }, []);

  const { roundsList, tableCount, byRoundTable, roundStatus } = useMemo(() => {
    const rounds = [...new Set(matches.map((m) => m.round))].sort((a, b) => a - b);
    const firstRoundMatches = matches.filter((m) => m.round === rounds[0]);
    const tCount = firstRoundMatches.length ? Math.max(...firstRoundMatches.map((m) => m.slot)) : 0;

    const byRT = new Map();
    for (const r of rounds) {
      byRT.set(r, matches.filter((m) => m.round === r).sort((a, b) => a.slot - b.slot));
    }

    const status = {};
    for (const r of rounds) {
      const roundMatches = byRT.get(r);
      const seated = roundMatches.filter((m) => m.teamA && m.teamB);
      if (seated.length === 0) status[r] = "upcoming";
      else if (seated.every((m) => m.status === "completed" || m.isBye)) status[r] = "done";
      else status[r] = "live";
    }
    return { roundsList: rounds, tableCount: tCount, byRoundTable: byRT, roundStatus: status };
  }, [matches]);

  const activeRound = selectedRound ?? roundsList.find((r) => roundStatus[r] !== "done") ?? roundsList[roundsList.length - 1];
  const maxRound = roundsList[roundsList.length - 1];
  const currentRoundMatches = byRoundTable.get(activeRound) || [];

  const canEditMatch = (match) => {
    if (!currentUser) return false;
    if (currentUser.role === "admin") return true;
    const userId = currentUser._id;
    return (
      isUserInMembers(match.teamA?.members, userId) || isUserInMembers(match.teamB?.members, userId)
    );
  };

  const handleSave = (id, updatedMatch) => {
    if (onUpdate) onUpdate(id, updatedMatch);
    setEditingMatch(null);
  };

  if (!roundsList.length) return null;

  return (
    <div className="space-y-4">
      {/* Round tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {roundsList.map((r) => {
          const meta = ROUND_STATUS_META[roundStatus[r]];
          const Icon = meta.icon;
          const isActive = r === activeRound;
          return (
            <button
              key={r}
              onClick={() => setSelectedRound(r)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition"
              style={{
                background: isActive ? "var(--accent-color)" : "var(--card-background)",
                color: isActive ? "var(--background)" : "var(--foreground)",
                border: `1px solid ${isActive ? "var(--accent-color)" : "var(--border-color)"}`,
              }}
            >
              <Icon size={14} color={isActive ? "var(--background)" : meta.color} />
              Round {r}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-1 rounded-xl p-1" style={{ background: "var(--card-background)", border: "1px solid var(--border-color)" }}>
          <button
            onClick={() => setViewMode("grid")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: viewMode === "grid" ? "var(--secondary-color)" : "transparent",
              color: "var(--foreground)",
            }}
          >
            <LayoutGrid size={14} /> Tables
          </button>
          <button
            onClick={() => setViewMode("diagram")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: viewMode === "diagram" ? "var(--secondary-color)" : "transparent",
              color: "var(--foreground)",
            }}
          >
            <GitBranch size={14} /> Movement Map
          </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {viewMode === "grid" ? (
          <motion.div
            key={`grid-${activeRound}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {currentRoundMatches.map((m) => (
              <TableCard
                key={m._id}
                match={m}
                isLastRound={activeRound === maxRound}
                canEdit={canEditMatch(m)}
                onEdit={setEditingMatch}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div key="diagram" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            <MeshMovementDiagram
              matches={matches}
              roundsList={roundsList}
              tableCount={tableCount}
              activeRound={activeRound}
              roundStatus={roundStatus}
              onSelectRound={(r) => {
                setSelectedRound(r);
                setViewMode("grid");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <EditMatchModal isOpen={!!editingMatch} match={editingMatch} onClose={() => setEditingMatch(null)} onSave={handleSave} />
    </div>
  );
}
