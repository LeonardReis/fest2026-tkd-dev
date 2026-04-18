import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Check, 
  Smartphone, 
  Trash2, 
  Clock, 
  Copy, 
  LayoutGrid,
  Shield,
  RefreshCcw,
  Zap,
  Info,
  AlertTriangle
} from 'lucide-react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Button } from '../ui';
import { QRCodeSVG } from 'qrcode.react';
import { Match } from '../../types';
import { 
  assignCourtQueues, 
  ensureFixedSessions, 
  ARENA_ACCESS_PIN, 
  getNextSequenceForCourt,
  revokeCourtSession,
  generateCourtSession
} from '../../services/courtService';
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
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const pendingMatches = matches.filter(m => m.status === 'scheduled' && !m.courtId);

  // Escuta sessões em tempo real
  useEffect(() => {
    const q = query(
      collection(db, 'court_sessions'), 
      orderBy('courtId', 'asc')
    );
    
    // Garantir que as fixas existam primeiro
    ensureFixedSessions();

    const unsub = onSnapshot(q, (snap) => {
      const allSessions = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      // Agrupamento Tático: Mantemos apenas 1 card por Arena
      const grouped: Record<number, any> = {};
      
      allSessions.forEach((s: any) => {
        const cid = s.courtId;
        const existing = grouped[cid];

        // Regra de Ouro:
        // 1. Se a nova for ativa, ela substitui qualquer inativa anterior.
        // 2. Se já tivermos uma ativa, ignoramos qualquer outra.
        // 3. Se ambas forem inativas, mantemos a que tiver id fixo ou a mais recente.
        
        if (!existing) {
          grouped[cid] = s;
        } else if (!existing.active && s.active) {
          grouped[cid] = s;
        } else if (!existing.active && !s.active) {
          // Mantém a mais recente (assume-se que docs estão vindo via query padrão)
          // Mas como queremos garantir, comparamos stamps se existirem
          const timeA = new Date(existing.updatedAt?.seconds * 1000 || existing.expiresAt).getTime();
          const timeB = new Date(s.updatedAt?.seconds * 1000 || s.expiresAt).getTime();
          if (timeB > timeA) grouped[cid] = s;
        }
      });

      setActiveSessions(Object.values(grouped).sort((a: any, b: any) => a.courtId - b.courtId));
    });
    
    return () => unsub();
  }, []);

  const handleCopy = (id: string, url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleRevoke = async (id: string) => {
    try {
      await revokeCourtSession(id);
      setRevokingId(null);
    } catch (error) {
      alert("Erro ao revogar sessão.");
    }
  };

  const handleRegenerate = async (session: any) => {
    if (!confirm(`Deseja regenerar o acesso da Arena ${session.courtId}? O link atual será invalidado.`)) return;
    
    setLoading(true);
    try {
      await revokeCourtSession(session.id);
      await generateCourtSession(session.courtId, session.type, session.judgeCount || 3, 'admin');
    } catch (error) {
      alert("Erro ao regenerar sessão.");
    } finally {
      setLoading(false);
    }
  };

  const handleSyncQueues = async () => {
    if (pendingMatches.length === 0) {
      alert("Nenhuma luta pendente para organizar.");
      return;
    }

    setLoading(true);
    try {
      const assignments: { matchId: string, courtId: 1 | 2 | 3, sequence: number }[] = [];
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

      const courtConfigs = activeSessions
        .filter(s => s.active)
        .map(s => ({
          id: s.courtId,
          allowedModalities: s.type === 'poomsae' ? ['Poomsae', 'Kyopa'] : ['Kyorugui'],
          load: 0
        }));

      const courtSequences: Record<number, number> = {};
      for (const s of activeSessions.filter(s => s.active)) {
        courtSequences[s.courtId] = await getNextSequenceForCourt(s.courtId as any);
      }

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
    } catch (error) {
      console.error(error);
      alert("Erro ao organizar filas.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-xl overflow-hidden">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }} 
        animate={{ opacity: 1, scale: 1 }} 
        className="w-full max-w-7xl bg-[#0a0a0a] border border-white/5 rounded-[4rem] overflow-hidden shadow-[0_0_100px_rgba(255,0,0,0.1)] flex flex-col max-h-[92vh] relative"
      >
        {/* Header de Comando */}
        <div className="relative p-10 overflow-hidden border-b border-white/5">
          <div className="absolute inset-0 bg-gradient-to-r from-red-600/10 to-transparent pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-red-600/20">
                <LayoutGrid className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-3xl font-black text-white uppercase italic tracking-tighter leading-none">
                  Gestão de Arenas
                </h2>
                <div className="flex items-center gap-2 mt-2">
                   <div className="h-[2px] w-8 bg-red-600" />
                   <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest">Controle Tático de Sessões</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Info Geral de Espera */}
              <div className="hidden md:flex flex-col items-end px-6 py-3 bg-white/5 border border-white/5 rounded-2xl">
                <span className="text-[8px] font-black text-stone-500 uppercase tracking-widest">Lutas p/ Sincronizar</span>
                <span className="text-xl font-black text-white">{pendingMatches.length}</span>
              </div>

              {/* PIN de Segurança */}
              <div className="bg-red-600/10 border border-red-600/20 rounded-2xl px-6 py-3 text-center">
                 <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-1">PIN ARENA</p>
                 <div className="flex items-center gap-2">
                   <Shield className="w-3 h-3 text-red-500" />
                   <span className="text-lg font-black text-white tracking-widest">{ARENA_ACCESS_PIN}</span>
                 </div>
              </div>

              <button 
                onClick={onClose} 
                className="p-4 bg-white/5 hover:bg-red-600/20 text-stone-500 hover:text-red-500 rounded-2xl transition-all"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        <div className="p-8 overflow-y-auto flex-1 custom-scrollbar space-y-10 bg-[#0d0d0d]">
          
          {/* Dashboard de Sincronização */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-stone-900/40 border border-white/5 rounded-[3rem] p-8 flex items-center justify-between gap-8 group hover:border-red-600/20 transition-all">
              <div className="flex items-center gap-8">
                <div className="p-6 bg-red-600/10 rounded-[2rem]">
                  <Zap className="w-10 h-10 text-red-600" />
                </div>
                <div>
                  <h4 className="text-xl font-black text-white uppercase italic">Sincronizador Inteligente</h4>
                  <p className="text-stone-500 text-[10px] font-bold uppercase tracking-wider mt-1 max-w-xs">
                    Distribui automaticamente as lutas pendentes entre as arenas ativas respeitando a prioridade do turno.
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-6">
                <div className="flex flex-col gap-2">
                  <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
                    {['manha', 'tarde'].map((t) => (
                      <button
                        key={t}
                        onClick={() => setTurno(t as any)}
                        className={cn(
                          "px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all",
                          turno === t ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white"
                        )}
                      >
                        {t === 'manha' ? 'Manhã' : 'Tarde'}
                      </button>
                    ))}
                  </div>
                </div>
                <Button 
                  onClick={handleSyncQueues}
                  disabled={loading || pendingMatches.length === 0}
                  className={cn(
                    "h-16 px-8 rounded-2xl text-[10px] font-black uppercase italic tracking-widest transition-all",
                    pendingMatches.length > 0 ? "bg-white text-black hover:scale-105" : "bg-white/5 text-stone-600 border border-white/5 cursor-not-allowed"
                  )}
                >
                  {loading ? "Processando..." : (pendingMatches.length > 0 ? "Distribuir Lutas" : "Fila Limpa")}
                </Button>
              </div>
            </div>

            <div className="bg-stone-900/40 border border-white/5 rounded-[3rem] p-8 flex items-center justify-center text-center">
              <div>
                <Info className="w-6 h-6 text-stone-600 mx-auto mb-3" />
                <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest leading-relaxed">
                  Utilize o link com <span className="text-white">?session=HASH</span> para acesso seguro. <br/>
                  Sessões revogadas bloqueiam o acesso instantaneamente.
                </p>
              </div>
            </div>
          </div>

          {/* Grid de Arenas Reativo */}
          <div className="space-y-6">
            <div className="flex items-center gap-4 px-4">
              <div className="h-[1px] flex-1 bg-white/5" />
              <h3 className="text-[10px] font-black text-stone-600 uppercase tracking-[0.5em]">Estado das Arenas</h3>
              <div className="h-[1px] flex-1 bg-white/5" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
              <AnimatePresence mode="popLayout">
                {activeSessions.map((session) => {
                  const arenaUrl = `${window.location.origin}/?session=${session.id}`;
                  const isActive = session.active;
                  
                  return (
                    <motion.div 
                      key={session.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={cn(
                        "relative group rounded-[3.5rem] border transition-all duration-500",
                        isActive ? "bg-[#0f0f12] border-white/5 hover:border-red-600/30" : "bg-black/40 border-dashed border-stone-800 opacity-80"
                      )}
                    >
                      {/* Badge de Status */}
                      <div className="absolute top-8 right-8 flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full animate-pulse", isActive ? "bg-emerald-500" : "bg-stone-600")} />
                        <span className={cn("text-[8px] font-black uppercase tracking-widest", isActive ? "text-emerald-500" : "text-stone-600")}>
                          {isActive ? "Operacional" : "Revogada"}
                        </span>
                      </div>

                      <div className="p-10 space-y-8">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center border transition-all",
                            isActive ? "bg-white/5 border-white/10" : "bg-stone-900 border-stone-800"
                          )}>
                            <span className={cn("text-2xl font-black italic", isActive ? "text-white" : "text-stone-700")}>
                              {session.courtId}
                            </span>
                          </div>
                          <div>
                            <p className="text-[9px] font-black text-stone-500 uppercase tracking-widest mb-0.5">Arena de Combate</p>
                            <h5 className={cn("text-lg font-black uppercase italic tracking-tight", isActive ? "text-white" : "text-stone-600")}>
                              {session.type === 'poomsae' ? 'Poomsae / Kyopa' : 'Kyorugui / Festival'}
                            </h5>
                          </div>
                        </div>

                        {/* Área do QR Code com Overlay de Segurança */}
                        <div className="relative aspect-square bg-white rounded-[2.5rem] p-6 flex items-center justify-center shadow-2xl group/qr overflow-hidden">
                           {!isActive && (
                             <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-10 flex flex-col items-center justify-center p-6 text-center">
                               <AlertTriangle className="w-10 h-10 text-red-500 mb-4" />
                               <p className="text-[10px] font-black text-white uppercase tracking-widest">Sessão Expirada</p>
                               <p className="text-[8px] text-stone-400 mt-2">Gere um novo acesso para reativar</p>
                             </div>
                           )}
                           <div className={cn("transition-all duration-700", !isActive && "blur-xl scale-95 opacity-50")}>
                             <QRCodeSVG value={arenaUrl} size={200} level="H" />
                           </div>
                           
                           {isActive && (
                             <div className="absolute inset-0 bg-black/5 opacity-0 group-hover/qr:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                <Smartphone className="w-12 h-12 text-black/20" />
                             </div>
                           )}
                        </div>

                        {/* Hash Visual de Auditoria */}
                        <div className="bg-black/30 rounded-xl px-4 py-3 font-mono text-[8px] text-stone-500 truncate text-center border border-white/5">
                           ID: {session.id}
                        </div>

                        {/* Controles de Ação */}
                        <div className="grid grid-cols-2 gap-3">
                          <Button 
                            onClick={() => handleCopy(session.id, arenaUrl)}
                            disabled={!isActive}
                            className={cn(
                              "h-12 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all gap-2",
                              copiedId === session.id 
                                ? "bg-emerald-600 text-white" 
                                : "bg-white/5 hover:bg-white/10 text-stone-300 border border-white/5"
                            )}
                          >
                            {copiedId === session.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            {copiedId === session.id ? "Copiado" : "Copiar Link"}
                          </Button>

                          {isActive ? (
                            <Button 
                              onClick={() => setRevokingId(session.id)}
                              className="h-12 rounded-xl bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 text-[9px] font-black uppercase tracking-widest transition-all gap-2"
                            >
                              <Trash2 className="w-3 h-3" />
                              Revogar
                            </Button>
                          ) : (
                            <Button 
                              onClick={() => handleRegenerate(session)}
                              className="h-12 rounded-xl bg-emerald-600/10 hover:bg-emerald-600 text-emerald-500 hover:text-white border border-emerald-600/20 text-[9px] font-black uppercase tracking-widest transition-all gap-2"
                            >
                              <RefreshCcw className="w-3 h-3" />
                              Reativar
                            </Button>
                          )}

                          {isActive && (
                            <button 
                              onClick={() => handleRegenerate(session)}
                              className="col-span-2 py-2 text-[8px] font-black text-stone-600 uppercase tracking-[0.2em] hover:text-white transition-all flex items-center justify-center gap-2"
                            >
                              <RefreshCcw className="w-3 h-3" />
                              Regenerar Hash (Revogar Atual)
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Overlay de Confirmação de Revogação */}
                      <AnimatePresence>
                        {revokingId === session.id && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 z-50 bg-black/95 backdrop-blur-md rounded-[3.5rem] p-10 flex flex-col items-center justify-center text-center space-y-6"
                          >
                             <div className="w-20 h-20 bg-red-600/20 rounded-full flex items-center justify-center">
                               <AlertTriangle className="w-10 h-10 text-red-600" />
                             </div>
                             <div>
                               <h6 className="text-white font-black uppercase italic tracking-tight">Revogar Acesso?</h6>
                               <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest leading-loose mt-2">
                                 Todos os dispositivos desta arena serão desconectados imediatamente.
                               </p>
                             </div>
                             <div className="flex flex-col gap-3 w-full">
                               <Button 
                                 onClick={() => handleRevoke(session.id)}
                                 className="w-full bg-red-600 text-white font-black uppercase italic tracking-widest rounded-2xl h-14"
                               >
                                 Confirmar Revogação
                               </Button>
                               <button 
                                 onClick={() => setRevokingId(null)}
                                 className="text-[10px] font-black text-stone-600 hover:text-white uppercase tracking-widest"
                               >
                                 Cancelar
                               </button>
                             </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Footer Institucional */}
        <div className="p-8 bg-stone-900/30 flex justify-between items-center px-12 border-t border-white/5">
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/5 flex items-center justify-center text-[10px] font-black text-stone-500">
               IDL
            </div>
            <p className="text-[8px] text-stone-600 font-bold uppercase tracking-[0.3em]">
              Protocolo Arena v2.6 • Indomitable Spirit Data Lab
            </p>
          </div>
          <div className="flex items-center gap-6">
            <button className="text-[10px] font-black text-stone-500 hover:text-white uppercase tracking-widest transition-all">Doc. de Segurança</button>
            <Button onClick={onClose} variant="ghost" className="h-10 px-8 border border-white/10 text-[9px] font-black uppercase tracking-[0.2em] hover:text-red-500 rounded-xl">
              Fechar Terminal
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
