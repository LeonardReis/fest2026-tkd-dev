import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Radio, Clock, Shield, Trophy, Users, Monitor, ChevronRight } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { Match } from '../../types';
import { cn } from '../ui';

export function ArenaCallPanel() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Escuta todas as lutas ativas ou agendadas
    const q = query(
      collection(db, 'matches'),
      where('status', 'in', ['live', 'scheduled']),
      orderBy('matchSequence', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      setMatches(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const getCourtMatches = (courtId: number) => {
    const courtMatches = matches.filter(m => {
        return String(m.courtId) === String(courtId);
    });
    
    return {
      active: courtMatches.find(m => m.status === 'live'),
      upcoming: courtMatches.filter(m => m.status === 'scheduled').slice(0, 3)
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-6">
        <div className="w-16 h-16 border-4 border-red-600/20 border-t-red-600 rounded-full animate-spin" />
        <p className="text-stone-500 font-black uppercase tracking-[0.3em] text-xs">Sincronizando Arena...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white overflow-hidden p-8 flex flex-col gap-8">
      {/* Header Estilo Evento */}
      <header className="flex items-center justify-between border-b border-white/10 pb-8">
        <div className="flex items-center gap-6">
          <div className="w-20 h-20 bg-white/5 rounded-3xl p-3 border border-white/10 shadow-2xl">
            <img src="/logo-colombo.png" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-5xl font-black italic tracking-tighter uppercase leading-none">
              Painel de <span className="text-red-600">Chamadas</span>
            </h1>
            <p className="text-stone-500 text-sm font-black uppercase tracking-[0.4em] mt-2 flex items-center gap-3">
              <span className="flex h-2 w-2 rounded-full bg-red-600 animate-pulse" />
              Arena em Tempo Real • 3º Festival União Lopes
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="text-3xl font-black font-mono tracking-tighter text-white/20">
            {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          <div className="flex items-center gap-2 bg-emerald-500/10 px-4 py-1.5 rounded-full border border-emerald-500/20">
            <Monitor className="w-3 h-3 text-emerald-500" />
            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">Digital Arena Protocol v3</span>
          </div>
        </div>
      </header>

      {/* Grid de Quadras */}
      <main className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-8 pb-12">
        {[1, 2, 3].map(id => {
          const { active, upcoming } = getCourtMatches(id);
          return (
            <CourtColumn 
                key={id} 
                id={id} 
                active={active || null} 
                upcoming={upcoming} 
            />
          );
        })}
      </main>

      {/* Footer / Marquee */}
      <footer className="h-16 border-t border-white/10 flex items-center justify-between px-8 bg-white/[0.02]">
        <div className="flex items-center gap-4 text-stone-500">
           <Radio className="w-4 h-4 animate-pulse text-red-500" />
           <span className="text-[10px] font-black uppercase tracking-[0.2em]">Fluxo de Chamadas Ativo</span>
        </div>
        <div className="flex gap-8 text-[10px] font-black uppercase tracking-widest text-stone-600 italic">
           <span>Kyorugui</span>
           <span className="text-red-900">●</span>
           <span>Poomsae</span>
           <span className="text-red-900">●</span>
           <span>Kyopa</span>
           <span className="text-red-900">●</span>
           <span>Festival</span>
        </div>
      </footer>
    </div>
  );
}

function CourtColumn({ id, active, upcoming }: { id: number, active: Match | null, upcoming: Match[] }) {
  return (
    <div className="flex flex-col h-full bg-white/[0.02] rounded-[3rem] border border-white/5 overflow-hidden shadow-2xl group transition-all duration-500 hover:border-red-600/30">
      {/* Court Header */}
      <div className="p-8 border-b border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent">
        <div className="flex items-center gap-4">
           <div className="w-16 h-16 bg-red-600 rounded-2xl flex items-center justify-center border-4 border-white/10 shadow-lg rotate-[-5deg] group-hover:rotate-0 transition-transform">
              <span className="text-3xl font-black italic">{id}</span>
           </div>
           <div>
              <h2 className="text-2xl font-black uppercase italic tracking-tighter">Quadra {id}</h2>
              <div className="flex items-center gap-2 mt-1">
                 <span className={cn(
                    "w-1.5 h-1.5 rounded-full animate-pulse",
                    active ? "bg-emerald-500" : "bg-stone-700"
                 )} />
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500">
                    {active ? 'Duelo em Curso' : 'Aguardando Atividades'}
                 </span>
              </div>
           </div>
        </div>
      </div>

      {/* Live Section */}
      <div className="flex-1 p-8 space-y-8">
        <AnimatePresence mode="wait">
          {active ? (
            <motion.div
              key={active.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              className="space-y-8"
            >
              <div className="space-y-2">
                 <span className="text-[9px] font-black text-emerald-500 uppercase tracking-[0.3em] bg-emerald-500/10 px-3 py-1.5 rounded-full border border-emerald-500/20">
                    Agora
                 </span>
                 <div className="space-y-4 pt-4">
                    <CompetitorBox name={active.competitorA?.name || '---'} side="A" />
                    <div className="flex items-center justify-center h-8 relative">
                       <div className="absolute inset-x-0 h-[1px] bg-white/5" />
                       <span className="relative z-10 bg-[#0c0c0c] px-4 text-[10px] font-black italic text-stone-600">VS</span>
                    </div>
                    <CompetitorBox name={active.competitorB?.name || '---'} side="B" />
                 </div>
              </div>

              <div className="pt-6 border-t border-white/5">
                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-500 mb-2">Categoria</div>
                <div className="text-lg font-black uppercase italic text-white line-clamp-2">
                  {active.groupKey}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center opacity-20 py-20 grayscale">
               <Trophy className="w-16 h-16 text-stone-600 mb-6" />
               <p className="text-[10px] font-black uppercase tracking-[0.3em] text-center">Nenhum Atleta<br/>Chamado</p>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Upcoming Section */}
      <div className="p-8 bg-black/40 border-t border-white/5">
         <div className="flex items-center justify-between mb-6">
            <h3 className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-500">Próximas</h3>
            <div className="h-px flex-1 mx-4 bg-white/5" />
            <Clock className="w-3 h-3 text-stone-700" />
         </div>
         
         <div className="space-y-3">
            {upcoming.length > 0 ? upcoming.map((m, idx) => (
               <motion.div 
                 key={m.id}
                 initial={{ opacity: 0, x: -10 }}
                 animate={{ opacity: 1, x: 0 }}
                 transition={{ delay: idx * 0.1 }}
                 className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl group/item"
               >
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-bold group-hover/item:bg-red-600/20 transition-colors">
                     #{m.matchSequence}
                  </div>
                  <div className="flex-1 min-w-0">
                     <p className="text-[11px] font-black uppercase italic truncate text-white">
                        {m.competitorA?.name} <span className="text-stone-600 italic px-1">X</span> {m.competitorB?.name}
                     </p>
                     <p className="text-[8px] font-bold text-stone-500 truncate uppercase mt-0.5">
                        {m.groupKey}
                     </p>
                  </div>
                  <ChevronRight className="w-3 h-3 text-stone-700 group-hover/item:text-red-500 transition-colors" />
               </motion.div>
            )) : (
                <p className="text-[9px] text-stone-700 italic text-center py-4">Sem lutas na fila</p>
            )}
         </div>
      </div>
    </div>
  );
}

function CompetitorBox({ name, side }: { name: string, side: 'A' | 'B' }) {
  return (
    <div className={cn(
      "p-5 rounded-[2rem] border transition-all duration-500",
      side === 'A' 
        ? "bg-gradient-to-br from-blue-600/10 to-blue-900/5 border-blue-600/20 group-hover:border-blue-500/40" 
        : "bg-gradient-to-br from-red-600/10 to-red-900/5 border-red-600/20 group-hover:border-red-500/40"
    )}>
      <div className="flex flex-col">
        <span className={cn(
           "text-[8px] font-black uppercase tracking-[0.3em] mb-1.5",
           side === 'A' ? "text-blue-500" : "text-red-500"
        )}>
          Competidor {side}
        </span>
        <div className="text-xl font-black uppercase italic truncate text-white tracking-tighter">
          {name}
        </div>
      </div>
    </div>
  );
}
