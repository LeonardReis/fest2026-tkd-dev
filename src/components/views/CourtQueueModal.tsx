import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  Search, 
  Smartphone, 
  Monitor, 
  AlertCircle, 
  Trash2, 
  Clock, 
  Copy, 
  ExternalLink,
  Mic,
  LayoutGrid,
  Shield
} from 'lucide-react';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  doc, 
  updateDoc, 
  serverTimestamp,
  getDocs
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Button } from '../ui';
import { QRCodeSVG } from 'qrcode.react';
import { Match } from '../../types';
import { assignCourtQueues, ensureFixedSessions, ARENA_ACCESS_PIN } from '../../services/courtService';
import { getCategoryPriorityWeight, getCurrentTurno } from '../../utils';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CourtQueueModalProps {
  matches: Match[];
  onClose: () => void;
}

export function CourtQueueModal({ matches, onClose }: CourtQueueModalProps) {
  const [loading, setLoading] = useState(false);
  const [turno, setTurno] = useState<'manha' | 'tarde'>(getCurrentTurno());
  const [activeSessions, setActiveSessions] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);

  const arenaUrl = `${window.location.origin}/?join=arena`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(arenaUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const pendingMatches = matches.filter(m => m.status === 'scheduled' && !m.courtId);

  useEffect(() => {
    const initArena = async () => {
      await ensureFixedSessions();
      const q = query(collection(db, 'court_sessions'));
      const snap = await getDocs(q);
      setActiveSessions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    };
    initArena();
  }, []);

  const handleGenerate = async () => {
    if (pendingMatches.length === 0) {
      alert("Nenhuma luta pendente para organizar.");
      return;
    }

    setLoading(true);
    try {
      const assignments: { matchId: string, courtId: 1 | 2 | 3, sequence: number }[] = [];
      const courtSequences: Record<number, number> = { 1: 101, 2: 201, 3: 301 };
      
      const groups: Record<string, any[]> = {};
      pendingMatches.forEach(m => {
        if (!groups[m.groupKey]) groups[m.groupKey] = [];
        groups[m.groupKey].push(m);
      });

      const sortedGroupKeys = Object.keys(groups).sort((a,b) => {
        const isA_K = !a.includes('Poomsae') && !a.includes('tábuas');
        const isB_K = !b.includes('Poomsae') && !b.includes('tábuas');
        const wA = getCategoryPriorityWeight(a, isA_K ? 'Kyorugui' : 'Poomsae', turno);
        const wB = getCategoryPriorityWeight(b, isB_K ? 'Kyorugui' : 'Poomsae', turno);
        return wA - wB;
      });

      const courtConfigs = [
        { id: 1, allowedModalities: ['Poomsae', 'Kyopa'], load: 0 },
        { id: 2, allowedModalities: ['Kyorugui'], load: 0 },
        { id: 3, allowedModalities: ['Kyorugui'], load: 0 }
      ];

      for (const groupKey of sortedGroupKeys) {
        const groupMatches = groups[groupKey];
        const isSpecial = groupKey.toLowerCase().includes('poomsae') || groupKey.toLowerCase().includes('tábuas');
        const bestCourt = courtConfigs
          .filter(c => isSpecial ? c.allowedModalities.includes('Poomsae') : c.allowedModalities.includes('Kyorugui'))
          .sort((a, b) => a.load - b.load)[0];

        if (bestCourt) {
          groupMatches.forEach((m) => {
            assignments.push({
              matchId: m.id,
              courtId: bestCourt.id as 1 | 2 | 3,
              sequence: courtSequences[bestCourt.id]++
            });
          });
          bestCourt.load += groupMatches.length;
        }
      }

      await assignCourtQueues(assignments);
      alert("Fila da Arena sincronizada com sucesso!");
      
    } catch (error) {
      console.error(error);
      alert("Erro ao organizar filas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl">
      <motion.div 
        initial={{ opacity: 0, y: 30 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="w-full max-w-6xl bg-[#0a0a0a] border border-white/5 rounded-[4rem] overflow-hidden shadow-[0_0_100px_rgba(255,0,0,0.1)] flex flex-col max-h-[95vh] relative"
      >
        {/* Header Tático */}
        <div className="relative p-12 overflow-hidden bg-stone-900/50">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-transparent pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-8">
              <div className="w-20 h-20 bg-gradient-to-br from-red-600 to-red-900 rounded-[2.5rem] flex items-center justify-center shadow-2xl shadow-red-600/30">
                <LayoutGrid className="w-10 h-10 text-white" />
              </div>
              <div>
                <h2 className="text-4xl font-black text-white uppercase italic tracking-tighter leading-none">
                  Organizador de Arena
                </h2>
                <div className="flex items-center gap-3 mt-3">
                   <div className="h-[2px] w-12 bg-red-600" />
                   <p className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em]">
                     Central de Comando Tático
                   </p>
                </div>
              </div>
            </div>

            {/* PIN de Acesso - SEGURANÇA */}
            <div className="bg-white/5 border border-white/10 rounded-[2rem] px-8 py-4 text-center backdrop-blur-md">
               <p className="text-[9px] font-black text-red-500 uppercase tracking-widest mb-1">PIN DE ACESSO ARENA</p>
               <div className="flex items-center gap-2">
                 <Shield className="w-4 h-4 text-red-500" />
                 <span className="text-2xl font-black text-white tracking-[0.2em]">{ARENA_ACCESS_PIN}</span>
               </div>
            </div>

            <button onClick={onClose} className="p-4 bg-white/5 hover:bg-white/10 text-stone-500 hover:text-white rounded-[2rem] transition-all">
              <Trash2 className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="p-12 overflow-y-auto flex-1 custom-scrollbar space-y-12">
          {/* Dashboard Superior */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
               <div className="grid grid-cols-2 gap-6">
                  <div className="bg-stone-900/40 border border-white/5 rounded-[3rem] p-10 flex items-center justify-between group hover:border-red-600/20 transition-all">
                    <div>
                      <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-2">Lutas em Espera</p>
                      <h3 className="text-6xl font-black text-white tracking-tighter italic">{pendingMatches.length}</h3>
                    </div>
                    {pendingMatches.length > 0 && (
                       <div className="w-16 h-16 bg-red-600/10 rounded-full flex items-center justify-center animate-pulse">
                         <Clock className="w-8 h-8 text-red-600" />
                       </div>
                    )}
                  </div>
                  
                  <div className="bg-stone-900/40 border border-white/5 rounded-[3rem] p-10">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-4">Turno de Operação</p>
                    <div className="flex gap-4">
                      {['manha', 'tarde'].map((t) => (
                        <button
                          key={t}
                          onClick={() => setTurno(t as any)}
                          className={cn(
                            "flex-1 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all",
                            turno === t ? "bg-red-600 text-white shadow-lg" : "bg-white/5 text-stone-600 hover:text-white"
                          )}
                        >
                          {t === 'manha' ? 'Manhã' : 'Tarde'}
                        </button>
                      ))}
                    </div>
                  </div>
               </div>

               <div className="bg-gradient-to-br from-red-600 to-red-900 rounded-[3rem] p-8 flex items-center justify-between shadow-2xl shadow-red-600/20">
                  <div className="max-w-md">
                    <h4 className="text-xl font-black text-white uppercase italic tracking-tight">Sincronização Inteligente</h4>
                    <p className="text-red-100/50 text-xs font-bold leading-relaxed mt-2">
                      Balanceador tático de quadras baseado no turno e modalidade.
                    </p>
                  </div>
                  {pendingMatches.length > 0 ? (
                    <Button 
                      onClick={handleGenerate}
                      disabled={loading}
                      className="h-20 px-12 bg-white text-black text-sm font-black uppercase italic tracking-widest hover:scale-105 transition-all shadow-2xl rounded-3xl"
                    >
                      {loading ? "Processando..." : "Sincronizar Arena"}
                    </Button>
                  ) : (
                    <div className="px-8 py-4 bg-black/20 rounded-2xl border border-white/5">
                      <p className="text-[9px] text-white/40 font-black uppercase italic">Fluxo Estabilizado</p>
                    </div>
                  )}
               </div>
            </div>

            <div className="bg-white/5 border border-white/10 rounded-[3.5rem] p-8 flex flex-col items-center justify-center space-y-6 text-center">
               <div className="p-6 bg-white rounded-[3rem] shadow-[0_0_50px_rgba(255,255,255,0.1)] group relative">
                 <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-[3rem] flex items-center justify-center pointer-events-none">
                    <ExternalLink className="w-8 h-8 text-black" />
                 </div>
                 <QRCodeSVG value={arenaUrl} size={180} />
               </div>
               
               <div className="w-full space-y-4">
                 <div>
                   <h4 className="text-lg font-black text-white uppercase italic">Pareamento Central</h4>
                   <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest leading-loose mt-2">
                     Aponte o celular ou copie o link para<br/>os dispositivos da arena.
                   </p>
                 </div>

                 <Button 
                   onClick={handleCopyLink}
                   variant="ghost" 
                   className={cn(
                     "w-full h-14 rounded-2xl border border-white/10 text-[10px] font-black uppercase tracking-widest transition-all gap-3",
                     copied ? "bg-emerald-600 border-emerald-500 text-white" : "bg-white/5 hover:bg-white/10 text-stone-300"
                   )}
                 >
                   {copied ? (
                     <>
                       <Check className="w-4 h-4" />
                       Link Copiado!
                     </>
                   ) : (
                     <>
                       <Copy className="w-4 h-4" />
                       Copiar Link do Portal
                     </>
                   )}
                 </Button>
               </div>
            </div>
          </div>

          <div className="space-y-6">
            <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-[0.5em] text-center">Distribuição Organizacional</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map(q => (
                <div key={q} className="relative group">
                   <div className="absolute -inset-[1px] bg-gradient-to-b from-white/10 to-transparent rounded-[3.5rem] opacity-50 group-hover:opacity-100 transition-opacity" />
                   <div className="relative bg-[#0d0d0d] rounded-[3.5rem] p-10 border border-white/5">
                      <div className="flex items-center justify-between mb-8">
                        <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center border border-white/5">
                          <span className="text-2xl font-black text-white italic">{q}</span>
                        </div>
                        {q === 1 ? (
                          <div className="p-3 bg-blue-600/10 border border-blue-600/20 rounded-xl">
                            <Mic className="w-5 h-5 text-blue-500" />
                          </div>
                        ) : (
                          <div className="p-3 bg-red-600/10 border border-red-600/20 rounded-xl">
                            <Smartphone className="w-5 h-5 text-red-500" />
                          </div>
                        )}
                      </div>
                      
                      <div>
                        <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest mb-1">Quadra {q}</p>
                        <h5 className="text-lg font-black text-white uppercase italic tracking-tight">
                          {q === 1 ? 'Poomsae / Kyopa' : 'Kyorugui / Festival'}
                        </h5>
                      </div>

                      <div className="mt-8 pt-8 border-t border-white/5">
                        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-emerald-500/40">
                          <span>Status do Terminal</span>
                          <span className="animate-pulse">Sincronizado</span>
                        </div>
                      </div>
                   </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="p-10 bg-stone-900/30 flex justify-between items-center px-12 border-t border-white/5">
          <p className="text-[9px] text-stone-600 font-bold uppercase tracking-[0.3em]">
            Protocolo União Lopes 2026 • Indomitable Spirit Data Lab
          </p>
          <Button onClick={onClose} variant="ghost" className="text-[10px] font-black uppercase tracking-[0.2em] hover:text-red-500">
            Fechar Organizador
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
