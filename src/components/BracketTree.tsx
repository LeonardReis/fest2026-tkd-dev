import React from 'react';
import { motion } from 'motion/react';
import { Match, MatchCompetitor } from '../types';
import { cn } from './ui';
import { Trophy, ArrowRight, GripVertical } from 'lucide-react';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';

interface BracketTreeProps {
  matches: Match[];
  onSetWinner?: (matchId: string, winnerId: string) => void;
  onUpdateScore?: (matchId: string, competitor: 'A' | 'B', score: number) => void;
  isAdmin?: boolean;
}

export function BracketTree({ matches, onSetWinner, onUpdateScore, isAdmin }: BracketTreeProps) {
  // 1. Agrupar matches por round
  const rounds = matches.reduce((acc, match) => {
    if (!acc[match.round]) acc[match.round] = [];
    acc[match.round].push(match);
    return acc;
  }, {} as Record<number, Match[]>);

  const sortedRoundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const maxRound = sortedRoundKeys.length;

  const getRoundName = (num: number) => {
    if (num === maxRound) return 'Grande Final';
    if (num === maxRound - 1) return 'Semi-final';
    if (num === maxRound - 2) return 'Quartas de Final';
    if (num === maxRound - 3) return 'Oitavas de Final';
    return `Round ${num}`;
  };

  return (
    <div className="flex gap-12 overflow-x-auto pb-8 min-h-[400px] scrollbar-hide">
      {sortedRoundKeys.map((roundNum, idx) => (
        <div key={roundNum} className="flex flex-col justify-around gap-8 min-w-[240px]">
          <h4 className="text-[10px] font-black text-stone-600 uppercase tracking-[0.2em] mb-4 text-center">
            {getRoundName(roundNum)}
          </h4>
          
          <div className="flex-1 flex flex-col justify-around gap-12">
            {rounds[roundNum].sort((a, b) => a.matchNumber - b.matchNumber).map((match) => (
              <MatchNode 
                key={match.id} 
                match={match} 
                onSetWinner={onSetWinner} 
                onUpdateScore={onUpdateScore}
                isAdmin={isAdmin}
                isLastRound={roundNum === maxRound}
                isSemiFinal={roundNum === maxRound - 1 && maxRound > 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MatchNode({ 
  match, 
  onSetWinner, 
  onUpdateScore, 
  isAdmin, 
  isLastRound,
  isSemiFinal 
}: { 
  match: Match; 
  onSetWinner?: (matchId: string, winnerId: string) => void; 
  onUpdateScore?: (matchId: string, competitor: 'A' | 'B', score: number) => void; 
  isAdmin?: boolean; 
  isLastRound: boolean;
  isSemiFinal: boolean;
}) {
  const isFinished = match.status === 'finished';

  return (
    <motion.div 
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className="relative group/match"
    >
      {/* Container da Luta */}
      <div className="bg-white/[0.03] border border-white/10 rounded-2xl overflow-hidden shadow-2xl backdrop-blur-sm w-[240px]">
        {/* Competitor A */}
        <MatchCompetitorRow 
          match={match}
          competitor={match.competitorA} 
          position="competitorA"
          isWinner={match.winnerId === match.competitorA?.athleteId}
          isLoser={isFinished && match.winnerId !== match.competitorA?.athleteId}
          isSuggested={!isFinished && (match.competitorA?.score || 0) > (match.competitorB?.score || 0)}
          onClick={() => isAdmin && !isFinished && match.competitorA && onSetWinner?.(match.id, match.competitorA.athleteId)}
          onScoreChange={(val) => onUpdateScore?.(match.id, 'A', val)}
          rank={
            isLastRound && isFinished ? (match.winnerId === match.competitorA?.athleteId ? '1º' : '2º') :
            isSemiFinal && isFinished && match.winnerId !== match.competitorA?.athleteId ? '3º' : null
          }
          color="blue"
          canClick={isAdmin && !!match.competitorA && !match.competitorA.isBye && !isFinished}
          isAdmin={isAdmin}
        />
        
        {/* Separador Central */}
        <div className="h-px bg-white/5 flex items-center justify-center relative">
          <div className="absolute bg-[#0a0a0a] px-2 text-[8px] font-black text-stone-600 uppercase tracking-tighter border border-white/5 rounded-full">
            LUTA #{match.matchNumber}
          </div>
        </div>

        {/* Competidor B */}
        <MatchCompetitorRow 
          match={match}
          competitor={match.competitorB} 
          position="competitorB"
          isWinner={match.winnerId === match.competitorB?.athleteId}
          isLoser={isFinished && match.winnerId !== match.competitorB?.athleteId}
          isSuggested={!isFinished && (match.competitorB?.score || 0) > (match.competitorA?.score || 0)}
          onClick={() => isAdmin && !isFinished && match.competitorB && onSetWinner?.(match.id, match.competitorB.athleteId)}
          onScoreChange={(val) => onUpdateScore?.(match.id, 'B', val)}
          rank={
            isLastRound && isFinished ? (match.winnerId === match.competitorB?.athleteId ? '1º' : '2º') :
            isSemiFinal && isFinished && match.winnerId !== match.competitorB?.athleteId ? '3º' : null
          }
          color="red"
          canClick={isAdmin && !!match.competitorB && !match.competitorB.isBye && !isFinished}
          isAdmin={isAdmin}
        />
      </div>

      {/* Conectores (Branches) - Somente se não for a final */}
      {!isLastRound && (
        <div 
          onClick={(e) => {
            e.stopPropagation();
            if (!isAdmin || isFinished) return;
            const scoreA = match.competitorA?.score || 0;
            const scoreB = match.competitorB?.score || 0;
            if (scoreA > scoreB) onSetWinner?.(match.id, match.competitorA!.athleteId);
            else if (scoreB > scoreA) onSetWinner?.(match.id, match.competitorB!.athleteId);
            else alert("Luta empatada! Defina o vencedor manualmente clicando no atleta.");
          }}
          className={cn(
            "absolute -right-16 top-1/2 -translate-y-1/2 w-16 h-12 transition-all flex items-center justify-center z-20",
            isAdmin && !isFinished ? "cursor-pointer group/arrow" : "pointer-events-none"
          )}
        >
          {/* Linha visual */}
          <div className={cn(
            "w-full h-px bg-white/10 group-hover/arrow:bg-amber-500/50 transition-all",
            (match.competitorA?.score !== match.competitorB?.score) && !isFinished && "bg-amber-500/20"
          )} />
          
          {/* Seta visual com área de clique expandida */}
          <div className={cn(
            "absolute right-2 w-8 h-8 rounded-full flex items-center justify-center transition-all bg-black/40 border border-white/10",
            isAdmin && !isFinished ? "hover:scale-110 hover:border-amber-500/50 hover:bg-amber-500/10 shadow-lg" : "opacity-0",
            (match.competitorA?.score !== match.competitorB?.score) && !isFinished && "border-amber-500/30 ring-1 ring-amber-500/20 animate-pulse"
          )}>
            <ArrowRight className={cn(
              "w-4 h-4 transition-all",
              (match.competitorA?.score !== match.competitorB?.score) ? "text-amber-500" : "text-stone-500"
            )} />
          </div>
        </div>
      )}

      {/* Troféu do Vencedor na Final */}
      {isLastRound && isFinished && (
        <motion.div 
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          className="absolute -right-4 -top-4 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(245,158,11,0.5)] border-2 border-white/20"
        >
          <Trophy className="w-5 h-5 text-white" />
        </motion.div>
      )}
    </motion.div>
  );
}

function MatchCompetitorRow({ match, competitor, position, ...props }: any) {
  const { isOver, setNodeRef: setDroppableRef } = useDroppable({
    id: `bracket_target:${match.id}:${position}`,
    disabled: !!competitor || !props.isAdmin
  });

  const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
    id: `bracket_source:${match.id}:${competitor?.athleteId}`,
    data: {
      type: 'BRACKET_ATHLETE',
      matchId: match.id,
      competitor
    },
    disabled: !competitor || competitor.isBye || !props.isAdmin || match.status === 'finished'
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div ref={setDroppableRef} className={cn("relative", isOver && "ring-2 ring-amber-500 ring-inset bg-amber-500/10")}>
      <div ref={setDraggableRef} style={style} {...attributes} {...listeners}>
        <CompetitorRow 
          competitor={competitor} 
          isDragging={isDragging}
          {...props} 
        />
      </div>
    </div>
  );
}

function CompetitorRow({ 
  competitor, 
  isWinner, 
  isLoser, 
  isSuggested, 
  onClick, 
  onScoreChange, 
  color, 
  canClick, 
  isAdmin, 
  isDragging,
  rank 
}: { 
  competitor?: MatchCompetitor; 
  isWinner: boolean; 
  isLoser: boolean; 
  isSuggested?: boolean; 
  onClick: () => void; 
  onScoreChange: (val: number) => void; 
  color: 'blue' | 'red'; 
  canClick: boolean; 
  isAdmin?: boolean; 
  isDragging?: boolean;
  rank?: string | null;
}) {
  if (!competitor) {
    return (
      <div className="p-4 py-3 flex items-center gap-3 opacity-20 bg-black/20">
        <div className="w-6 h-6 rounded bg-stone-800" />
        <div className="h-2 w-20 bg-stone-800 rounded" />
      </div>
    );
  }

  return (
    <div 
      onClick={canClick ? onClick : undefined}
      className={cn(
        "p-4 py-3 flex items-center justify-between transition-all relative overflow-hidden",
        canClick ? "cursor-pointer hover:bg-white/5 active:scale-95" : "cursor-default",
        isWinner && (color === 'blue' ? "bg-blue-600/20" : "bg-red-600/20"),
        isSuggested && !isWinner && "ring-1 ring-inset ring-amber-500/30 bg-amber-500/5",
        isLoser && "grayscale opacity-50",
        isDragging && "opacity-0"
      )}
    >
      <div className="flex items-center gap-3 z-10">
        <div className={cn(
          "w-6 h-6 rounded flex items-center justify-center text-[10px] font-black text-white shadow-sm",
          color === 'blue' ? "bg-blue-600" : "bg-red-600",
          competitor.isBye && "bg-stone-800 opacity-50"
        )}>
          {competitor.isBye ? '?' : color === 'blue' ? 'A' : 'B'}
        </div>
        
        {isAdmin && !competitor.isBye && !isWinner && !isLoser && (
          <GripVertical className="w-3 h-3 text-stone-600 -ml-1 cursor-grab active:cursor-grabbing" />
        )}

        <div className="flex flex-col">
          <span className={cn(
            "text-xs font-black uppercase tracking-tight",
            isWinner ? "text-white" : "text-stone-400"
          )}>
            {competitor.name}
          </span>
          <span className="text-[8px] font-bold text-stone-600 uppercase tracking-widest leading-none mt-0.5">
            {competitor.isBye ? 'Sorteio de Chave' : competitor.academy}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 z-10">
        {isAdmin && !competitor.isBye ? (
          <input 
            type="number"
            value={competitor.score || 0}
            onChange={(e) => onScoreChange(parseInt(e.target.value) || 0)}
            onClick={(e) => e.stopPropagation()}
            className={cn(
              "w-12 h-8 bg-black/40 border border-white/10 rounded font-black text-center text-xs focus:border-amber-500/50 outline-none transition-all",
              color === 'blue' ? "text-blue-400" : "text-red-400"
            )}
          />
        ) : (
          <div className="text-xl font-black text-white/20 px-2 italic">
            {competitor.score || 0}
          </div>
        )}

        {(isWinner || rank) && (
          <div className={cn(
            "text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded shadow-sm flex items-center gap-1",
            rank === '1º' ? "bg-amber-500 text-stone-950 font-black" :
            rank === '2º' ? "bg-slate-300 text-stone-900" :
            rank === '3º' ? "bg-amber-800 text-white" :
            color === 'blue' ? "bg-blue-500 text-white" : "bg-red-500 text-white"
          )}>
            {rank ? (
              <>
                {rank === '1º' && <Trophy className="w-2.5 h-2.5" />}
                {rank} Lugar
              </>
            ) : 'Vencedor'}
          </div>
        )}
      </div>
    </div>
  );
}
