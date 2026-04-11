import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical, CheckCircle2, Trophy, Medal } from 'lucide-react';
import { cn } from './ui';
import { BeltBadge } from './BeltBadge';

interface AthleteDraggableProps {
  athlete: any;
  idx: number;
  fightRules: any;
  isAdmin: boolean;
  selectedCategory: string;
  onUpdateScores: (groupKey: string, regId: string, field: string, value: any) => void;
  groupKey: string;
  groupAthletesCount: number;
  match?: any;
}

export function AthleteDraggable({ 
  athlete, 
  idx, 
  fightRules, 
  isAdmin, 
  selectedCategory, 
  onUpdateScores,
  groupKey,
  groupAthletesCount,
  match
}: AthleteDraggableProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: athlete.id,
    data: {
      athlete,
      originGroup: groupKey
    },
    disabled: !isAdmin
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
  } : undefined;

  return (
    <div 
      ref={setNodeRef} 
      style={style}
      className={cn(
        "flex justify-between items-center group/item p-3 rounded-xl transition-all border",
        Number(athlete.place) === 1 ? "bg-amber-500/5 border-amber-500/20 shadow-[inset_0_0_20px_rgba(245,158,11,0.05)]" :
        Number(athlete.place) === 2 ? "bg-slate-400/5 border-white/10" :
        Number(athlete.place) === 3 ? "bg-orange-700/5 border-orange-700/20" :
        "bg-transparent border-transparent",
        isDragging ? "bg-amber-500/10 border border-amber-500/20 shadow-2xl z-50 opacity-100 scale-105" : "hover:bg-white/[0.02]"
      )}
    >
      <div className="flex items-center gap-4">
        {isAdmin && (
          <button 
            {...attributes} 
            {...listeners}
            className="p-1 hover:bg-white/5 rounded text-stone-600 hover:text-amber-500 cursor-grab active:cursor-grabbing transition-colors"
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
        <div className={cn(
          "w-10 h-10 rounded-xl border-2 flex flex-col items-center justify-center transition-all duration-500",
          Number(athlete.place) === 1 ? "bg-gradient-to-b from-amber-300 to-amber-600 border-amber-200 text-black shadow-[0_0_20px_rgba(245,158,11,0.4)] scale-110" :
          Number(athlete.place) === 2 ? "bg-gradient-to-b from-slate-200 to-slate-400 border-slate-100 text-black shadow-[0_0_20px_rgba(226,232,240,0.3)]" :
          Number(athlete.place) === 3 ? "bg-gradient-to-b from-orange-500 to-orange-800 border-orange-400 text-white shadow-[0_0_20px_rgba(194,65,12,0.3)]" :
          "bg-stone-900 border-white/5 text-stone-500"
        )}>
          {Number(athlete.place) === 1 ? (
            <>
              <Trophy className="w-5 h-5" />
              <span className="text-[6px] font-black uppercase leading-none mt-0.5">OURO</span>
            </>
          ) : Number(athlete.place) === 2 ? (
            <>
              <Medal className="w-5 h-5" />
              <span className="text-[6px] font-black uppercase leading-none mt-0.5">PRATA</span>
            </>
          ) : Number(athlete.place) === 3 ? (
            <>
              <Medal className="w-5 h-5" />
              <span className="text-[6px] font-black uppercase leading-none mt-0.5">BRONZE</span>
            </>
          ) : (
            <span className="text-xs font-black">{idx + 1}</span>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-black text-white uppercase tracking-tight text-sm">{athlete.name}</p>
            {Number(athlete.place) === 1 && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-black text-[7px] font-black rounded uppercase tracking-tighter shadow-[0_0_10px_rgba(245,158,11,0.5)]">Campeão</span>
            )}
            {Number(athlete.place) === 2 && (
              <span className="px-1.5 py-0.5 bg-slate-200 text-black text-[7px] font-black rounded uppercase tracking-tighter">Vice-Campeão</span>
            )}
            {Number(athlete.place) === 3 && (
              <span className="px-1.5 py-0.5 bg-orange-700 text-white text-[7px] font-black rounded uppercase tracking-tighter">3º Lugar</span>
            )}
          </div>
          <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-0.5 italic">{athlete.academy}</p>
          {fightRules && (
            <span className={cn("text-[8px] font-black uppercase tracking-widest", fightRules.color)}>
              ⚡ {fightRules.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <BeltBadge belt={athlete.belt} size="sm" />
          <p className="text-[9px] font-black text-stone-600 uppercase tracking-widest mt-1.5">{athlete.weight}kg</p>
        </div>
        
        {isAdmin && athlete.isMatched && !match?.courtId && !match?.status && (
          <div className="flex items-center animate-in fade-in slide-in-from-right-4 duration-500 ml-4">
            <div className="h-10 w-[1px] bg-white/10" />
            
            <div className="grid grid-cols-2 gap-4 pl-4">
              <div className="flex flex-col gap-1.5 min-w-[70px]">
                <label className="text-[7px] font-black text-stone-500 uppercase tracking-[0.2em] leading-none">
                  {selectedCategory === 'Kyorugui' ? 'Pontos' : 'Nota'}
                </label>
                {selectedCategory === 'Kyorugui' ? (
                  <input 
                    type="number"
                    placeholder="0"
                    className="w-full bg-white/5 border border-white/10 rounded-lg text-xs font-black text-center text-white h-9 outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all shadow-inner"
                    value={athlete.points || ''}
                    onChange={(e) => onUpdateScores(groupKey, athlete.regId, 'points', parseInt(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <input 
                    type="number"
                    step="0.1"
                    placeholder="0.0"
                    className="w-full bg-white/5 border border-white/10 rounded-lg text-xs font-black text-center text-white h-9 outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all shadow-inner"
                    value={athlete.score || ''}
                    onChange={(e) => onUpdateScores(groupKey, athlete.regId, 'score', parseFloat(e.target.value))}
                    onClick={(e) => e.stopPropagation()}
                  />
                )}
              </div>
              
              <div className="flex flex-col gap-1.5 min-w-[140px]">
                <label className="text-[7px] font-black text-stone-500 uppercase tracking-[0.2em] leading-none">Pódio / Classificação</label>
                <div className="flex gap-1 h-9">
                  {[
                    { val: '1', label: '1º', color: 'amber', icon: Trophy, bg: 'bg-amber-500' },
                    { val: '2', label: '2º', color: 'slate', icon: Medal, bg: 'bg-slate-300' },
                    { val: '3', label: '3º', color: 'orange', icon: Medal, bg: 'bg-orange-700' },
                    { val: 'WO', label: 'WO', color: 'red', icon: CheckCircle2, bg: 'bg-red-500' }
                  ].map((pos) => (
                    <button
                      key={pos.val}
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateScores(groupKey, athlete.regId, 'place', athlete.place === pos.val ? null : (pos.val === 'WO' ? 'WO' : parseInt(pos.val)));
                      }}
                      className={cn(
                        "flex-1 flex flex-col items-center justify-center rounded-lg border transition-all relative overflow-hidden group/btn",
                        athlete.place?.toString() === pos.val
                          ? `${pos.bg} border-white/20 text-black shadow-lg`
                          : "bg-white/5 border-white/10 text-stone-600 hover:border-white/20 hover:bg-white/10"
                      )}
                      title={pos.label}
                    >
                      <pos.icon className={cn(
                        "w-3 h-3",
                        athlete.place?.toString() === pos.val ? "text-black" : `text-${pos.color}-500/50`
                      )} />
                      <span className="text-[7px] font-black mt-0.5">{pos.label}</span>
                      {athlete.place?.toString() === pos.val && (
                        <div className="absolute inset-0 bg-white/10 animate-pulse" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Status Indicators Migrated for Zero Overlap */}
        {match && (
           <div className="flex items-center gap-3 ml-4">
              {match.status === 'finished' ? (
                <div className="flex items-center gap-3 bg-black/40 px-3 py-1.5 rounded-xl border border-white/10 shadow-lg">
                  <div className="text-right border-r border-white/10 pr-3">
                    <p className="text-[6px] font-black text-emerald-500 uppercase tracking-widest leading-none mb-1">Nota</p>
                    <p className="text-[11px] font-black text-white leading-none">{(match.finalScore || 0).toFixed(2)}</p>
                  </div>
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shadow-inner",
                    match.positionInNextMatch ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" : "bg-emerald-500 text-black shadow-emerald-500/50"
                  )}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-end gap-1">
                  {match.courtId && (
                    <span className="px-1.5 py-0.5 bg-amber-500/20 border border-amber-500/30 rounded text-[7px] font-black text-amber-500 uppercase">
                      Q{match.courtId} | #{match.matchSequence}
                    </span>
                  )}
                  <span className={cn(
                    "px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-tighter",
                    match.status === 'live' ? "bg-emerald-500 text-white animate-pulse" : "bg-stone-800 text-stone-500"
                  )}>
                    {match.status === 'live' ? 'Em Quadra' : 'Pendente'}
                  </span>
                </div>
              )}
           </div>
        )}
      </div>
    </div>
  );
}
