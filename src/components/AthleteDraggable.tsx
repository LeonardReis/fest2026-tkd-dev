import React from 'react';
import { useDraggable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
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
}

export function AthleteDraggable({ 
  athlete, 
  idx, 
  fightRules, 
  isAdmin, 
  selectedCategory, 
  onUpdateScores,
  groupKey,
  groupAthletesCount
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
        "flex justify-between items-center group/item p-3 rounded-xl transition-all",
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
        <div className="w-8 h-8 rounded-lg bg-stone-900 border border-white/5 flex items-center justify-center text-[10px] font-black text-white">
          {idx + 1}
        </div>
        <div>
          <p className="font-black text-white uppercase tracking-tight text-sm">{athlete.name}</p>
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
        
        {isAdmin && athlete.isMatched && (
          <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="h-8 w-[1px] bg-white/10 mx-1" />
            <div className="flex flex-col gap-1">
              <label className="text-[7px] font-black text-stone-500 uppercase tracking-widest ml-1">
                {selectedCategory === 'Kyorugui' ? 'Pontos' : 'Nota'}
              </label>
              {selectedCategory === 'Kyorugui' ? (
                <input 
                  type="number"
                  placeholder="0"
                  className="w-16 bg-white/5 border border-white/10 rounded-lg text-xs font-black text-center text-white h-8 outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all shadow-inner"
                  value={athlete.points || ''}
                  onChange={(e) => onUpdateScores(groupKey, athlete.regId, 'points', parseInt(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <input 
                  type="number"
                  step="0.1"
                  placeholder="0.0"
                  className="w-16 bg-white/5 border border-white/10 rounded-lg text-xs font-black text-center text-white h-8 outline-none focus:border-red-500/50 focus:bg-red-500/5 transition-all shadow-inner"
                  value={athlete.score || ''}
                  onChange={(e) => onUpdateScores(groupKey, athlete.regId, 'score', parseFloat(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
            
            <div className="flex flex-col gap-1">
              <label className="text-[7px] font-black text-stone-500 uppercase tracking-widest ml-1">Classificação</label>
              <select 
                className={cn(
                  "bg-white/5 border rounded-lg text-[9px] font-black uppercase px-2 h-8 outline-none transition-all shadow-inner",
                  (athlete.points > 0 || athlete.score > 0 || athlete.place === 'WO') 
                    ? "border-amber-500/50 text-amber-400 bg-amber-500/10" 
                    : "border-white/10 text-stone-500 opacity-50"
                )}
                value={athlete.place || ''}
                onChange={(e) => onUpdateScores(groupKey, athlete.regId, 'place', e.target.value === 'WO' ? 'WO' : (parseInt(e.target.value) || null))}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="" className="bg-stone-900">Pos...</option>
                <option value="1" className="bg-stone-900 text-amber-400">1º (Ouro)</option>
                <option value="2" className="bg-stone-900 text-slate-300">2º (Prata)</option>
                <option value="3" className="bg-stone-900 text-amber-700">3º (Bronze)</option>
                <option value="WO" className="bg-stone-900 text-red-500">W.O.</option>
              </select>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
