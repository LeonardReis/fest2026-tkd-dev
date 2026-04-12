import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Clock, AlertCircle, Check, Ban, Flag, Trophy, User as UserIcon, Keyboard, Play, PlaySquare, RotateCcw, FileText, Radio, Loader2, Mic, PlusSquare, MinusSquare, ChevronDown, ChevronUp, SkipForward } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, query, collection, where, orderBy, limit, updateDoc, serverTimestamp, runTransaction, writeBatch } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { validateCourtSession, submitPoomsaeScore, callMatch, postponeMatch, finishMatch, batchCallMatches, batchResetCourtMatches, processCourtRanking, PodiumData, updateMatchRoundScore, finishAndCycleMatch, PodiumWinner, pingCourtSession } from '../../services/courtService';
import { CourtSession, Match } from '../../types';
import { BeltBadge } from '../BeltBadge';
import { Button, Card, cn } from '../ui';
import { KyopaScoreboard } from '../KyopaScoreboard';
import { User } from 'firebase/auth';
import { UserProfile } from '../../types';

interface CourtViewProps {
  sessionId: string;
  user?: User | null;
  profile?: UserProfile | null;
  authInitialized?: boolean;
  deviceId?: string;
}

export function CourtView({ sessionId, user, profile, authInitialized, deviceId }: CourtViewProps) {
  const [session, setSession] = useState<CourtSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [diagnostic, setDiagnostic] = useState<{ status: string; count: number; lastUpdate: string }>({
    status: 'Iniciando...',
    count: 0,
    lastUpdate: '-'
  });
  
  const [judgeIndex, setJudgeIndex] = useState<number | null>(null);
  const [internalUser, setInternalUser] = useState<User | null>(null);
  const [internalInitialized, setInternalInitialized] = useState(false);
  const [isProcessingRanking, setIsProcessingRanking] = useState(false);
  const [podiumData, setPodiumData] = useState<PodiumData | null>(null);

  // Estados de Segurança (PIN)
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // Verificar persistência do PIN no sessionStorage
  useEffect(() => {
    if (sessionId) {
      const authKey = `arena_auth_${sessionId}`;
      const savedAuth = sessionStorage.getItem(authKey);
      if (savedAuth === 'true') {
        setIsAuthenticated(true);
      }
    }
  }, [sessionId]);

  useEffect(() => {
    if (authInitialized !== undefined) {
        setInternalUser(user || null);
        setInternalInitialized(authInitialized);
        return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
        setInternalUser(u);
        setInternalInitialized(true);
    });
    return unsub;
  }, [user, authInitialized]);

  useEffect(() => {
    if (!internalInitialized) return;

    const initSession = async () => {
      try {
        setDiagnostic(prev => ({ ...prev, status: 'Autenticando...' }));
        
        if (!internalUser) {
          await signInAnonymously(auth);
        }
        
        setDiagnostic(prev => ({ ...prev, status: 'Validando Token...' }));
        const courtSession = await validateCourtSession(sessionId);
        if (!courtSession) {
          setError("Sessão inválida ou expirada.");
          setLoading(false);
          return;
        }
        
        setSession(courtSession);
        setDiagnostic(prev => ({ ...prev, status: 'Conectando à Fila...' }));
        
        const q = query(
          collection(db, 'matches'),
          where('courtId', '==', Number(courtSession.courtId))
        );
        
        const unsub = onSnapshot(q, (snap) => {
          let docs = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
          // Incluímos 'finished' para o cálculo do progresso no painel
          docs = docs.filter(m => m.status === 'scheduled' || m.status === 'live' || m.status === 'finished');
          docs.sort((a, b) => (a.matchSequence || 0) - (b.matchSequence || 0));
          
          setMatches(docs);
          setDiagnostic({
            status: 'Operacional',
            count: docs.length,
            lastUpdate: new Date().toLocaleTimeString()
          });
          setLoading(false);
        }, (err) => {
          setDiagnostic(prev => ({ ...prev, status: 'Erro Sinc' }));
        });
        
        return unsub;
      } catch (err: any) {
        console.error("CourtView Init Error:", err);
        setError(err.message || "Erro de autenticação ou permissão.");
        setLoading(false);
      }
    };
    
    const unsubPromise = initSession();
    return () => {
      unsubPromise.then(unsub => unsub && unsub());
    };
  }, [sessionId, internalInitialized, internalUser]);

  // Sincroniza a posição (judgeIndex) do dispositivo a partir do Firestore
  useEffect(() => {
    if (!deviceId || !internalInitialized) return;

    const deviceRef = doc(db, 'waiting_devices', deviceId);
    const unsub = onSnapshot(deviceRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        if (data.judgeIndex !== undefined && judgeIndex === null) {
          console.log(`[CourtView] Sincronizando posto de trabalho: ${data.judgeIndex}`);
          setJudgeIndex(data.judgeIndex);
        }
      }
    });

    return unsub;
  }, [deviceId, internalInitialized, judgeIndex]);

  // HEARTBEAT (Pulso de Arena)
  useEffect(() => {
    if (!sessionId || !isAuthenticated) return;
    
    // Ping inicial
    pingCourtSession(sessionId);

    const interval = setInterval(() => {
      pingCourtSession(sessionId);
    }, 30000); // 30 segundos

    return () => clearInterval(interval);
  }, [sessionId, isAuthenticated]);

  // Fallback: Se for Luta ou Quebramento e não houver deviceId ou atribuição, assume-se Mesa Central
  useEffect(() => {
    if (session && (session.type === 'kyorugui' || session.type === 'kyopa') && judgeIndex === null && !deviceId) {
      setJudgeIndex(0);
    }
  }, [session, judgeIndex, deviceId]);

  const activeMatch = matches.find(m => m.status === 'live');
  const nextMatches = matches.filter(m => m.status === 'scheduled');

  const handleSkipCurrentMatch = async () => {
    if (!activeMatch || isProcessingRanking) return;
    if (!confirm(`Deseja ADIAR a luta atual?\n${activeMatch.competitorA?.name} VS ${activeMatch.competitorB?.name}\n\nEla voltará para a fila para ser chamada depois.`)) return;
    
    setIsProcessingRanking(true);
    try {
      await postponeMatch(activeMatch.id);
    } catch (err) {
      console.error(err);
      alert("Erro ao adiar luta.");
    } finally {
      setIsProcessingRanking(false);
    }
  };

  const handleCallSpecificMatch = async (matchId: string) => {
    if (isProcessingRanking) return;
    
    // Se clicar na luta que já é a live, não faz nada
    if (activeMatch?.id === matchId) return;

    // Se já existe uma luta live, pergunta se quer trocar
    if (activeMatch) {
       if (!confirm("Já existe uma luta em andamento. Deseja ADIÁ-LA e chamar esta nova luta?")) return;
       setIsProcessingRanking(true);
       try {
         await postponeMatch(activeMatch.id);
       } catch (err) { 
         console.error(err);
         setIsProcessingRanking(false);
         return;
       }
    }

    setIsProcessingRanking(true);
    try {
      await callMatch(matchId);
    } catch (err) {
      console.error(err);
      alert("Erro ao chamar luta específica.");
    } finally {
      setIsProcessingRanking(false);
    }
  };

  const renderContent = () => {
    if (loading) return <LoadingView />;
    if (error || !session) return <ErrorView message={error || "Erro fatal"} />;

    // EXIGIR PIN se não estiver autenticado
    if (!isAuthenticated) {
      return (
        <PinGate 
          onSuccess={() => {
            sessionStorage.setItem(`arena_auth_${sessionId}`, 'true');
            setIsAuthenticated(true);
          }} 
          error={pinError}
          setError={setPinError}
        />
      );
    }

    // SE houver pódio para exibir, ele sobrepõe o conteúdo principal da quadra
    if (podiumData && judgeIndex === 0) {
      return (
        <PodiumView 
          data={podiumData} 
          onDone={() => setPodiumData(null)} 
          nextMatch={nextMatches[0]} 
        />
      );
    }

    if (session.type === 'poomsae' && judgeIndex === null) {
      const handleSelectPost = (idx: number) => {
        setJudgeIndex(idx);
        if (deviceId) {
          import('../../services/courtService').then(m => m.assignDeviceToPost(deviceId, idx));
        }
      };
      return <JudgeSelection session={session} onSelect={handleSelectPost} />;
    }

    return (
      <div className="min-h-screen bg-black flex flex-col font-sans select-none overflow-hidden text-white">
      {/* HUD Superior Compacto */}
      <header className="h-14 bg-stone-950 border-b border-white/10 flex items-center justify-between px-4 sm:px-8 shrink-0 z-50">
        <div className="flex items-center gap-4">
          <div className="flex flex-col">
            <h1 className="text-base sm:text-lg font-black text-white uppercase italic tracking-tighter leading-none group flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse" />
              {session.label}
            </h1>
            <p className="text-[8px] text-stone-500 font-black uppercase tracking-widest mt-0.5">
              {judgeIndex === 0 ? 'Mesa Central' : `Árbitro #${judgeIndex}`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-6">
          {judgeIndex === 0 && (
            <div className="flex items-center gap-2 pr-3 sm:pr-6 border-r border-white/10">
              <Button 
                disabled={isProcessingRanking}
                  onClick={async () => {
                    const isForced = window.confirm("Deseja FORÇAR o ranking? (Use apenas se a categoria estiver travada)");
                    if (!isForced && !confirm("Confirmar processamento de ranking normal?")) return;
                    
                    setIsProcessingRanking(true);
                    try {
                      const result = await processCourtRanking(
                        Number(session.courtId), 
                        undefined, 
                        session.type as any,
                        isForced
                      );
                      if (result.success && result.winners) setPodiumData(result.winners);
                    } catch (e: any) { alert(e.message); } finally { setIsProcessingRanking(false); }
                  }}
                variant="ghost" 
                className="h-8 px-3 text-[9px] font-black uppercase tracking-widest gap-2 bg-amber-500/10 border border-amber-500/20 text-amber-500 hover:bg-amber-500/20"
              >
                <Trophy className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">Pódio</span>
              </Button>
            </div>
          )}
          
          <div className="flex items-center gap-4">
            <div className="hidden xs:flex flex-col items-end">
              <span className="text-[10px] font-black text-white leading-none">{matches.length}</span>
              <span className="text-[7px] text-stone-600 uppercase font-black tracking-widest">Fila</span>
            </div>
            <div className="w-8 h-8 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">
              <Shield className="w-4 h-4 text-stone-500" />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        {judgeIndex === 0 && (
          <div className="bg-stone-900 border-b border-white/5 flex flex-col sm:flex-row items-stretch sm:items-center px-4 sm:px-8 py-2 gap-4 shrink-0 shadow-lg">
            {/* Próximas Lutas (Pills) */}
            <div className="flex-1 flex items-center gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x">
              {nextMatches.length > 0 ? (
                nextMatches.map((m, i) => (
                  <button 
                    key={m.id} 
                    onClick={() => handleCallSpecificMatch(m.id)}
                    className={cn(
                      "snap-start shrink-0 h-10 px-4 rounded-xl border flex items-center gap-3 transition-all hover:scale-105 active:scale-95 disabled:opacity-50",
                      i === 0 ? 'bg-blue-600/10 border-blue-500/30' : 'bg-white/5 border-white/5'
                    )}
                    disabled={isProcessingRanking}
                  >
                    <div className="flex flex-col items-start">
                      <span className="text-[7px] font-black text-white/40 uppercase leading-none mb-0.5 whitespace-nowrap">
                        #{m.modalitySequence || m.matchSequence}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-white uppercase whitespace-nowrap">{m.competitorA?.name?.split(' ')[0]}</span>
                        <span className="text-[8px] font-bold text-stone-600">vs</span>
                        <span className="text-[10px] font-black text-white uppercase whitespace-nowrap">{m.competitorB?.name?.split(' ')[0]}</span>
                      </div>
                    </div>
                    {i === 0 && <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />}
                  </button>
                ))
              ) : (
                <span className="text-[10px] font-black text-stone-600 uppercase italic">Fila Vazia...</span>
              )}
            </div>

            {/* Ações Rápidas & Progresso */}
            <div className="flex items-center gap-3 pl-0 sm:pl-6 border-t sm:border-t-0 sm:border-l border-white/10 pt-2 sm:pt-0">
               <div className="flex items-center gap-1.5 mr-2">
                 <div className="w-20 sm:w-24 h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-red-600 transition-all duration-1000"
                      style={{ width: `${(matches.filter(m => m.status === 'finished').length / (matches.length || 1)) * 100}%` }}
                    />
                 </div>
                 <span className="text-[9px] font-black text-stone-500">{matches.filter(m => m.status === 'finished').length}/{matches.length}</span>
               </div>

               <div className="flex items-center gap-2">
                 <Button 
                   onClick={async () => {
                     const toCall = matches.filter(m => m.status === 'scheduled').map(m => m.id);
                     if (toCall.length === 0) return;
                     setIsProcessingRanking(true);
                     try { await batchCallMatches(toCall); } finally { setIsProcessingRanking(false); }
                   }}
                   disabled={isProcessingRanking || !matches.some(m => m.status === 'scheduled')}
                   variant="ghost"
                   className="h-8 px-3 text-[8px] font-black uppercase tracking-widest gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20"
                 >
                   <PlaySquare className="w-3.5 h-3.5" />
                   Chamar
                 </Button>

                 <Button 
                   onClick={async () => {
                     const confirmClear = prompt("Para limpar TODA a fila, digite LIMPAR:");
                     if (confirmClear !== 'LIMPAR') return;
                     setIsProcessingRanking(true);
                     try {
                        const toReset = matches.filter(m => m.status === 'live' || m.status === 'scheduled').map(m => m.id);
                        if (toReset.length > 0) await batchResetCourtMatches(toReset);
                     } finally { setIsProcessingRanking(false); }
                   }}
                   disabled={isProcessingRanking}
                   variant="ghost"
                   className="h-8 w-8 p-0 bg-stone-500/10 border border-white/5 text-stone-500 hover:text-red-500"
                 >
                   <RotateCcw className="w-3.5 h-3.5" />
                 </Button>
               </div>
            </div>
          </div>
        )}

        <section className="flex-1 flex flex-col bg-black relative overflow-y-auto">
          {activeMatch && judgeIndex === 0 && (
            <div className="px-8 py-2 border-b border-white/5 bg-white/[0.01]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded">Duelo Ativo</span>
                  <p className="text-xs font-black text-white uppercase italic">
                    {activeMatch.competitorA?.name} <span className="text-stone-700 mx-2">VS</span> {activeMatch.competitorB?.name}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-[8px] font-black text-stone-600 uppercase tracking-widest">{activeMatch.groupKey}</div>
                  <Button 
                    onClick={handleSkipCurrentMatch}
                    disabled={isProcessingRanking}
                    variant="ghost"
                    className="h-7 px-2 text-[8px] font-black uppercase tracking-widest gap-1.5 bg-red-500/10 border border-red-500/20 text-red-500 hover:bg-red-500/20"
                  >
                    <SkipForward className="w-3 h-3" />
                    Pular Luta
                  </Button>
                </div>
              </div>
            </div>
          )}


           <AnimatePresence mode="wait">
             {activeMatch ? (
               <ActiveMatchPanel 
                 key={activeMatch.id}
                 match={activeMatch} 
                 session={session} 
                 judgeIndex={judgeIndex} 
                 isLastOfGroup={!nextMatches.some(nm => nm.groupKey === activeMatch.groupKey)}
                 nextMatchId={nextMatches[0]?.id || null}
                 onPodium={(data) => setPodiumData(data)}
               />
             ) : (
               <EmptyState 
                 session={session} 
                 nextMatch={nextMatches[0]} 
                 judgeIndex={judgeIndex} 
                 matches={matches}
               />
             )}
          </AnimatePresence>
        </section>
      </main>

      <footer className="h-10 bg-black border-t border-white/5 flex items-center justify-between px-8 text-[9px] font-black uppercase tracking-widest text-stone-600">
        <div className="flex gap-4">
          <span>{diagnostic.status}</span>
          <span>Sinc: {diagnostic.lastUpdate}</span>
        </div>
        <div className="flex gap-4">
          <span className="text-red-900">v3.0.0-PRO</span>
          <span>Indomitable Spirit Lab</span>
        </div>
      </footer>
    </div>
    );
  };

  return (
    <>
      {renderContent()}
      
      <div className="fixed bottom-0 left-0 right-0 p-2 bg-black/80 backdrop-blur-md border-t border-white/5 flex items-center justify-between z-[9999]">
        <div className="flex items-center gap-4 text-[9px] font-mono text-stone-500 uppercase tracking-widest">
          <div className="flex items-center gap-1.5 px-2">
            <span className={internalUser ? "text-emerald-500" : "text-red-500"}>●</span>
            AUTH: {internalUser ? internalUser.uid.slice(0, 8) : 'OFFLINE'}
          </div>
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
            SESSION: {sessionId ? sessionId.slice(0, 8) : 'NONE'}
          </div>
          <div className="flex items-center gap-1.5 border-l border-white/10 pl-4">
            STATUS: <span className="text-white">{diagnostic.status}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => {
              localStorage.clear();
              window.location.reload();
            }}
            className="text-[9px] font-black uppercase tracking-widest text-stone-400 hover:text-red-500 transition-colors px-3 py-1 bg-white/5 rounded-full border border-white/5"
          >
            Limpar e Reiniciar
          </button>
        </div>
      </div>
    </>
  );
}

function JudgeSelection({ session, onSelect }: { session: CourtSession, onSelect: (idx: number) => void }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-4xl text-center">
        <h1 className="text-5xl font-black text-white uppercase italic tracking-tighter mb-4">Acesso à Quadra {session.courtId}</h1>
        {session.refereeName && (
          <div className="bg-red-600/10 border border-red-600/20 py-2 px-6 rounded-full inline-block mb-6">
            <span className="text-red-500 text-xs font-black uppercase tracking-widest">Árbitro Responsável: {session.refereeName}</span>
          </div>
        )}
        <p className="text-stone-500 text-lg font-bold uppercase tracking-widest mb-12">Selecione seu posto de trabalho</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {Array.from({ length: session.judgeCount || 3 }).map((_, i) => (
            <button
              key={i}
              onClick={() => onSelect(i + 1)}
              className="group h-64 bg-stone-900 border-2 border-white/5 rounded-[2.5rem] flex flex-col items-center justify-center gap-6 transition-all hover:border-red-600 hover:bg-red-600/5 active:scale-95 shadow-2xl"
            >
              <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center group-hover:bg-red-600/20 transition-colors">
                <UserIcon className="w-10 h-10 text-stone-400 group-hover:text-red-500" />
              </div>
              <div>
                <span className="block text-4xl font-black text-white">#{i + 1}</span>
                <span className="text-xs font-black text-stone-600 uppercase tracking-widest group-hover:text-red-400">Árbitro Lateral</span>
              </div>
            </button>
          ))}
          <button
            onClick={() => onSelect(0)}
            className="md:col-span-3 h-32 bg-stone-900 border-2 border-white/5 rounded-[2.5rem] flex items-center justify-center gap-8 transition-all hover:border-emerald-500 hover:bg-emerald-500/5 active:scale-95 shadow-2xl group"
          >
            <Keyboard className="w-10 h-10 text-stone-500 group-hover:text-emerald-500" />
            <div className="text-left">
               <span className="block text-2xl font-black text-white uppercase italic">Mesa Central (Mesário)</span>
               <span className="text-xs font-black text-stone-600 uppercase tracking-widest">Controle total da fila e placares finais</span>
            </div>
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function EmptyState({ session, nextMatch, judgeIndex, matches }: { session: CourtSession, nextMatch: Match, judgeIndex: number | null, matches: Match[] }) {
  const [loading, setLoading] = useState(false);
  
  const handleCall = async () => {
    if (!nextMatch) return;
    setLoading(true);
    try { await callMatch(nextMatch.id); } catch(e) {}
    setLoading(false);
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 flex flex-col items-center justify-center p-12 text-center">
      <div className="w-32 h-32 bg-stone-900 rounded-[3rem] flex items-center justify-center mb-8 border border-white/5 shadow-2xl">
        <Clock className="w-16 h-16 text-stone-700" />
      </div>
      <h2 className="text-4xl font-black text-stone-500 uppercase tracking-tighter mb-4">Aguardando Início</h2>
      
      {nextMatch && judgeIndex === 0 ? (
        <div className="mt-8 space-y-8">
           <div className="p-8 bg-white/5 rounded-3xl border border-white/10 max-w-sm mx-auto">
             <p className="text-[10px] font-black text-stone-600 uppercase tracking-widest mb-2">Próxima Luta ➔ {nextMatch.matchSequence}</p>
             <p className="text-xl font-black text-white uppercase">{nextMatch.competitorA?.name}</p>
             {nextMatch.competitorB && <p className="text-sm font-bold text-stone-500 uppercase mt-1">vs {nextMatch.competitorB.name}</p>}
           </div>
           <div className="flex flex-col gap-3">
             <Button 
              disabled={loading} 
              onClick={handleCall} 
              className="h-20 px-12 text-xl font-black uppercase italic tracking-tighter bg-red-600 hover:bg-red-500 rounded-[2rem] shadow-[0_15px_30px_rgba(220,38,38,0.2)] hover:scale-105 active:scale-95 transition-all"
             >
              {loading ? 'Chamando...' : 'Próxima Chamada'}
             </Button>
             
             <div className="flex gap-2 justify-center">
               <Button 
                disabled={loading || matches.length === 0} 
                onClick={async () => {
                  setLoading(true);
                  try {
                    const toCall = matches.filter(m => m.status === 'scheduled').map(m => m.id);
                    if (toCall.length > 0) await batchCallMatches(toCall);
                  } finally { setLoading(false); }
                }}
                variant="ghost"
                className="h-16 px-10 text-xs font-black uppercase italic tracking-tighter gap-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-[1.5rem] shadow-[0_10px_20px_rgba(16,185,129,0.2)] hover:scale-105 transition-all"
               >
                <Play className="w-5 h-5 fill-current" />
                Iniciar Categoria
               </Button>

               <Button 
                disabled={loading || matches.length === 0} 
                onClick={async () => {
                  const confirmClear = prompt("Para limpar toda a fila desta quadra, digite LIMPAR:");
                  if (confirmClear !== 'LIMPAR') return;
                  
                  setLoading(true);
                  try {
                    const toReset = matches.filter(m => m.status === 'live' || m.status === 'scheduled').map(m => m.id);
                    if (toReset.length > 0) await batchResetCourtMatches(toReset);
                  } finally { setLoading(false); }
                }}
                variant="ghost"
                className="h-12 px-6 text-[9px] font-black uppercase tracking-widest gap-2 bg-stone-500/10 border border-white/5 text-stone-400 hover:bg-red-500/10 hover:text-red-500 rounded-2xl"
               >
                <RotateCcw className="w-4 h-4" />
                Limpar Quadra
               </Button>
             </div>
           </div>
        </div>
      ) : (
        <p className="text-stone-700 font-bold uppercase tracking-widest mt-4">Aguardando comando da Mesa Central</p>
      )}
    </motion.div>
  );
}

function ActiveMatchPanel({ 
  match, session, judgeIndex, isLastOfGroup, nextMatchId, onPodium
}: { 
  match: Match, session: CourtSession, judgeIndex: number | null, isLastOfGroup: boolean, nextMatchId: string | null, onPodium: (data: PodiumData) => void
}) {
  if (session.type === 'poomsae') return <PoomsaeEngine match={match} session={session} judgeIndex={judgeIndex} isLastOfGroup={isLastOfGroup} nextMatchId={nextMatchId} onPodium={onPodium} />;
  if (session.type === 'kyopa') return <KyopaEngine match={match} session={session} judgeIndex={judgeIndex} isLastOfGroup={isLastOfGroup} nextMatchId={nextMatchId} onPodium={onPodium} />;
  return <KyoruguiEngine match={match} judgeIndex={judgeIndex} isLastOfGroup={isLastOfGroup} nextMatchId={nextMatchId} session={session} onPodium={onPodium} />;
}

function KyoruguiEngine({ 
  match, judgeIndex, isLastOfGroup, nextMatchId, session, onPodium 
}: { 
  match: Match, judgeIndex: number | null, isLastOfGroup: boolean, nextMatchId: string | null, session: CourtSession, onPodium: (data: PodiumData) => void 
}) {
  const [isFinishing, setIsFinishing] = useState(false);
  const [activeRound, setActiveRound] = useState<1 | 2 | 3>(match.currentRound || 1);
  
  const [rounds, setRounds] = useState(match.roundScores || {
    r1: { a: 0, b: 0, gamA: 0, gamB: 0 },
    r2: { a: 0, b: 0, gamA: 0, gamB: 0 },
    r3: { a: 0, b: 0, gamA: 0, gamB: 0 }
  });

  const [roundWinners, setRoundWinners] = useState<Array<'a' | 'b' | null>>(match.roundWinners || [null, null, null]);
  const [winnerRounds, setWinnerRounds] = useState<{ a: number, b: number }>(match.winnerRounds || { a: 0, b: 0 });

  useEffect(() => {
    if (match.roundScores) setRounds(match.roundScores);
    if (match.currentRound) setActiveRound(match.currentRound);
    if (match.roundWinners) setRoundWinners(match.roundWinners);
    if (match.winnerRounds) setWinnerRounds(match.winnerRounds);
  }, [match.id, match.roundScores, match.currentRound, match.roundWinners, match.winnerRounds]);

  // Atalhos de teclado para o Mesário
  useEffect(() => {
    if (judgeIndex !== 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch(e.key) {
        case '1': updateScore('a', 1); break;
        case '2': updateScore('a', 2); break;
        case '3': updateScore('a', 3); break;
        case 'q': updateScore('gamA', 1); break;
        case 'a': updateScore('gamA', -1); break;
        
        case '7': updateScore('b', 1); break;
        case '8': updateScore('b', 2); break;
        case '9': updateScore('b', 3); break;
        case 'p': updateScore('gamB', 1); break;
        case 'l': updateScore('gamB', -1); break;

        case 'Enter': 
          if (winnerRounds.a >= 2 || winnerRounds.b >= 2) {
             const winnerId = winnerRounds.a > winnerRounds.b ? match.competitorA?.athleteId : match.competitorB?.athleteId;
             handleFinish(winnerId);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [match.id, activeRound, judgeIndex, winnerRounds, rounds]);

  if (judgeIndex !== 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-12">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-12 w-full max-w-5xl">
          <KyoruguiCompetitor comp={match.competitorA} side="blue" />
          <div className="text-6xl font-black text-stone-800 italic">VS</div>
          <KyoruguiCompetitor comp={match.competitorB} side="red" />
        </div>
        <p className="text-stone-600 font-black uppercase tracking-widest text-sm">* Utilize o App de Pontuação Lateral para votos *</p>
      </div>
    );
  }

  const updateScore = async (side: 'a' | 'b' | 'gamA' | 'gamB', delta: number) => {
    const rKey = `r${activeRound}` as keyof typeof rounds;
    const newRounds = {
      ...rounds,
      [rKey]: {
        ...rounds[rKey],
        [side]: Math.max(0, rounds[rKey][side] + delta)
      }
    };
    setRounds(newRounds);
    try {
      await updateMatchRoundScore(match.id, activeRound, newRounds);
    } catch (e) {}
  };

  const confirmRoundWinner = async (winner: 'a' | 'b') => {
    const newWinners = [...roundWinners];
    newWinners[activeRound - 1] = winner;
    
    const newWinnerRounds = { a: 0, b: 0 };
    newWinners.forEach(w => {
      if (w === 'a') newWinnerRounds.a++;
      if (w === 'b') newWinnerRounds.b++;
    });

    setRoundWinners(newWinners);
    setWinnerRounds(newWinnerRounds);

    try {
      const isFinalDecision = newWinnerRounds.a === 2 || newWinnerRounds.b === 2 || activeRound === 3;
      
      await updateDoc(doc(db, 'matches', match.id), {
        roundWinners: newWinners,
        winnerRounds: newWinnerRounds,
        currentRound: isFinalDecision ? activeRound : Math.min(3, activeRound + 1) as any,
        updatedAt: serverTimestamp()
      });

      if (!isFinalDecision) {
        setActiveRound(prev => Math.min(3, prev + 1) as any);
      }
    } catch (e) {
      console.error("Erro ao confirmar vencedor do round:", e);
    }
  };

  const handleFinish = async (manualWinnerId?: string) => {
    if (isFinishing) return;
    setIsFinishing(true);
    try {
      const winningId = manualWinnerId || (winnerRounds.a > winnerRounds.b ? match.competitorA?.athleteId : match.competitorB?.athleteId);
      const totalA = rounds.r1.a + rounds.r2.a + rounds.r3.a;
      const totalB = rounds.r1.b + rounds.r2.b + rounds.r3.b;

      const result = await finishAndCycleMatch(match.id, {
        courtId: session.courtId,
        nextMatchId,
        isLastOfGroup,
        groupKey: match.groupKey,
        winnerId: winningId,
        scoreA: totalA,
        scoreB: totalB,
        roundScores: rounds,
        roundWinners: roundWinners,
        winnerRounds: winnerRounds
      });

      if (result.podiumWinners) {
        onPodium(result.podiumWinners);
      }
    } catch (e) {
      console.error(e);
    } finally { setIsFinishing(false); }
  };

  const currentR = rounds[`r${activeRound}` as keyof typeof rounds];
  const totalA = rounds.r1.a + rounds.r2.a + rounds.r3.a;
  const totalB = rounds.r1.b + rounds.r2.b + rounds.r3.b;

  return (
    <div className="flex-1 flex flex-col h-full bg-black/20 overflow-hidden relative">
      <div className="flex-1 overflow-y-auto p-4 sm:p-8 pb-32">
        <div className="max-w-7xl mx-auto space-y-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-4">
              <div className="flex flex-col items-center sm:items-start">
                 <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-3">Round Ativo</span>
                 <div className="flex gap-3">
                    {[1, 2, 3].map(r => (
                      <button 
                        key={r}
                        onClick={() => setActiveRound(r as 1|2|3)}
                        className={cn(
                          "w-12 h-12 rounded-xl border-2 font-black transition-all flex items-center justify-center relative",
                          activeRound === r ? "bg-red-600 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.4)]" : "bg-stone-900 border-white/5 text-stone-600 hover:border-white/20"
                        )}
                      >
                        {r}
                        {roundWinners[r-1] && (
                          <div className={cn("absolute -top-1 -right-1 w-4 h-4 rounded-full border border-black flex items-center justify-center", roundWinners[r-1] === 'a' ? 'bg-blue-600' : 'bg-red-600')}>
                            <Check className="w-2.5 h-2.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                 </div>
              </div>

              <div className="hidden lg:flex flex-col items-center">
                 <div className="bg-stone-900 px-6 py-3 rounded-2xl border border-white/5 flex items-center gap-6 shadow-xl">
                    <div className="text-center">
                      <span className="block text-[8px] font-black text-blue-500 uppercase">Rounds Azul</span>
                      <span className="text-2xl font-black text-white">{winnerRounds.a}</span>
                    </div>
                    <div className="w-px h-8 bg-white/10" />
                    <div className="text-center">
                      <span className="block text-[8px] font-black text-red-500 uppercase">Rounds Vermelho</span>
                      <span className="text-2xl font-black text-white">{winnerRounds.b}</span>
                    </div>
                 </div>
              </div>

              <div className="flex flex-col items-center sm:items-end">
                <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em] mb-3">Categoria</span>
                <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10 text-[10px] font-black text-stone-300 uppercase tracking-widest truncate max-w-[200px]">
                  {match.groupKey}
                </div>
              </div>
          </div>
          
          <div className="flex flex-col lg:grid lg:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-8 items-start w-full">
            <div className="space-y-6">
              <KyoruguiCompetitor comp={match.competitorA} side="blue" />
              <div className="bg-stone-900 rounded-[2.5rem] p-8 border border-blue-600/20 shadow-2xl">
                <div className="flex justify-between items-end mb-8">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Placar R{activeRound}</span>
                  </div>
                  <span className="text-6xl font-black text-white tabular-nums leading-none">{currentR.a}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => updateScore('a', 1)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-blue-600/20 active:scale-95 transition-all">+1</button>
                  <button onClick={() => updateScore('a', 2)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-blue-600/20 active:scale-95 transition-all">+2</button>
                  <button onClick={() => updateScore('a', 3)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-blue-600/20 active:scale-95 transition-all">+3</button>
                  <button onClick={() => updateScore('a', -1)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-stone-800 active:scale-95 transition-all">-1</button>
                </div>
                <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center">
                   <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest text-center">Gam-jeom</span>
                   <div className="flex items-center gap-4">
                     <button onClick={() => updateScore('gamA', -1)} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-stone-500">-</button>
                     <span className="text-3xl font-black text-amber-500">{currentR.gamA}</span>
                     <button onClick={() => updateScore('gamA', 1)} className="w-10 h-10 rounded-full border border-amber-500/30 flex items-center justify-center text-amber-500 bg-amber-500/10">+1</button>
                   </div>
                </div>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-center pt-16 gap-10">
               <div className="text-center bg-stone-900/50 p-8 rounded-[2rem] border border-white/5 shadow-inner">
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.4em] block mb-6">BEST OF 3</span>
                  <div className="text-3xl font-black text-stone-800 animate-pulse">VS</div>
                  <div className="mt-8 pt-6 border-t border-white/5 flex flex-col gap-1">
                    <span className="text-[8px] font-black text-stone-600 uppercase tracking-widest">Total</span>
                    <span className="text-lg font-black text-stone-400 tabular-nums">{totalA} x {totalB}</span>
                  </div>
               </div>
            </div>

            <div className="space-y-6">
              <KyoruguiCompetitor comp={match.competitorB} side="red" />
              <div className="bg-stone-900 rounded-[2.5rem] p-8 border border-red-600/20 shadow-2xl">
                <div className="flex justify-between items-end mb-8">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Placar R{activeRound}</span>
                  </div>
                  <span className="text-6xl font-black text-white tabular-nums leading-none">{currentR.b}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => updateScore('b', 1)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-red-600/20 active:scale-95 transition-all">+1</button>
                  <button onClick={() => updateScore('b', 2)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-red-600/20 active:scale-95 transition-all">+2</button>
                  <button onClick={() => updateScore('b', 3)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-red-600/20 active:scale-95 transition-all">+3</button>
                  <button onClick={() => updateScore('b', -1)} className="h-16 bg-white/5 rounded-2xl border border-white/10 font-black text-xl hover:bg-stone-800 active:scale-95 transition-all">-1</button>
                </div>
                <div className="mt-6 pt-6 border-t border-white/5 flex justify-between items-center">
                   <span className="text-[10px] font-black text-red-500 uppercase tracking-widest text-center">Gam-jeom</span>
                   <div className="flex items-center gap-4">
                     <button onClick={() => updateScore('gamB', -1)} className="w-10 h-10 rounded-full border border-white/10 flex items-center justify-center text-stone-500">-</button>
                     <span className="text-3xl font-black text-amber-500">{currentR.gamB}</span>
                     <button onClick={() => updateScore('gamB', 1)} className="w-10 h-10 rounded-full border border-amber-500/30 flex items-center justify-center text-amber-500 bg-amber-500/10">+1</button>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sticky bottom-0 w-full bg-stone-900/80 backdrop-blur-xl border-t border-white/10 p-4 sm:p-6 flex flex-col items-center gap-4 z-30 shadow-[0_-20px_40px_rgba(0,0,0,0.5)]">
        {!isFinishing && !roundWinners[activeRound-1] && (
          <div className="flex gap-3 sm:gap-6 w-full max-w-3xl animate-in slide-in-from-bottom-2 duration-300">
             <button 
               onClick={() => {
                 if (currentR.a < currentR.b && !confirm("Pontuação inferior. Confirmar vitória por Superioridade?")) return;
                 confirmRoundWinner('a');
               }}
               className="flex-1 h-14 sm:h-16 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-blue-900/20 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
             >
               <span>Vencer Round</span>
               <span className="opacity-60 text-[8px]">AZUL</span>
             </button>
             <button 
               onClick={() => {
                 if (currentR.b < currentR.a && !confirm("Pontuação inferior. Confirmar vitória por Superioridade?")) return;
                 confirmRoundWinner('b');
               }}
               className="flex-1 h-14 sm:h-16 bg-red-600 hover:bg-red-500 text-white rounded-2xl text-[10px] sm:text-xs font-black uppercase tracking-widest shadow-lg shadow-red-900/20 transition-all active:scale-95 flex flex-col items-center justify-center gap-1"
             >
               <span>Vencer Round</span>
               <span className="opacity-60 text-[8px]">VERMELHO</span>
             </button>
          </div>
        )}

        <button 
          disabled={isFinishing || (winnerRounds.a < 2 && winnerRounds.b < 2 && activeRound < 3)}
          onClick={() => {
            const winnerId = winnerRounds.a > winnerRounds.b ? match.competitorA?.athleteId : match.competitorB?.athleteId;
            handleFinish(winnerId);
          }}
          className={cn(
            (winnerRounds.a >= 2 || winnerRounds.b >= 2)
              ? 'bg-emerald-600 hover:bg-emerald-500 text-white animate-pulse'
              : 'bg-stone-800 text-stone-600 opacity-50 cursor-not-allowed'
          )}
        >
          {isFinishing ? 'Processando...' : (winnerRounds.a >= 2 || winnerRounds.b >= 2) ? 'Finalizar Combate' : 'Aguardando Vencedor'}
        </button>
      </div>
    </div>
  );
}

function PoomsaeEngine({ 
  match, session, judgeIndex, isLastOfGroup, nextMatchId, onPodium 
}: { 
  match: Match, session: CourtSession, judgeIndex: number | null, isLastOfGroup: boolean, nextMatchId: string | null, onPodium: (data: PodiumData) => void 
}) {
  const [tecnica, setTecnica] = useState(4.0);
  const [deductions, setDeductions] = useState<number[]>([]);
  const [apresentacao, setApresentacao] = useState({ v: 1.5, r: 1.5, e: 1.5 });
  const [submitted, setSubmitted] = useState(false);

  const totalApres = +(apresentacao.v + apresentacao.r + apresentacao.e).toFixed(1);
  const total = +(tecnica + totalApres).toFixed(2);

  useEffect(() => {
    setTecnica(4.0); setDeductions([]); setApresentacao({ v: 1.5, r: 1.5, e: 1.5 }); setSubmitted(false);
  }, [match.id]);

  if (judgeIndex === 0) return <PoomsaeMesario match={match} session={session} isLastOfGroup={isLastOfGroup} nextMatchId={nextMatchId} onPodium={onPodium} />;

  const myScore = match.poomsaeScores && (match.poomsaeScores as any)[`judge_${judgeIndex}`];
  if (myScore || submitted) return <PoomsaeAwaiting match={match} session={session} myScore={myScore || { total }} />;

  const adjust = (key: 'v'|'r'|'e', delta: number) => {
    setApresentacao(prev => ({ ...prev, [key]: +(Math.min(2.0, Math.max(0.5, prev[key] + delta))).toFixed(1) }));
  };

  const handleScore = async () => {
    setSubmitted(true);
    try {
      await submitPoomsaeScore(match.id, judgeIndex!, {
        tecnica, velocidade: apresentacao.v, ritmo: apresentacao.r, expressao: apresentacao.e,
        totalApresentacao: totalApres, total
      }, session.judgeCount || 3);
    } catch(e) { setSubmitted(false); }
  };

  return (
    <div className="flex-1 flex flex-col p-8 overflow-y-auto">
      <div className="text-center mb-8">
        <h2 className="text-stone-500 font-black uppercase text-xs tracking-widest">{match.groupKey}</h2>
        <h3 className="text-4xl font-black text-white uppercase italic tracking-tighter">{match.competitorA?.name}</h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto w-full flex-1">
        <div className="bg-stone-900 rounded-[3rem] p-10 flex flex-col border border-white/5 shadow-2xl">
           <div className="flex justify-between items-start mb-10">
              <span className="text-xs font-black text-blue-500 uppercase tracking-widest">Técnica (Base 4.0)</span>
              <div className="text-right">
                <span className="text-7xl font-black text-white tabular-nums leading-none">{tecnica.toFixed(1)}</span>
                <span className="block text-[10px] text-stone-600 font-black uppercase mt-1">Pontos Restantes</span>
              </div>
           </div>
           <div className="grid grid-cols-2 gap-4 flex-1">
              <button 
                onClick={() => { setTecnica(t => +(Math.max(0, t - 0.1)).toFixed(1)); setDeductions(d => [...d, 0.1]); }}
                className="rounded-[2rem] bg-amber-500/10 border-2 border-amber-500/30 text-amber-500 font-black flex flex-col items-center justify-center hover:bg-amber-500/20 active:scale-90 transition-all"
              >
                <span className="text-4xl mb-1">-0.1</span>
                <span className="text-[10px] uppercase opacity-60">Pequeno</span>
              </button>
              <button 
                onClick={() => { setTecnica(t => +(Math.max(0, t - 0.3)).toFixed(1)); setDeductions(d => [...d, 0.3]); }}
                className="rounded-[2rem] bg-red-600/10 border-2 border-red-600/30 text-red-500 font-black flex flex-col items-center justify-center hover:bg-red-600/20 active:scale-90 transition-all"
              >
                <span className="text-4xl mb-1">-0.3</span>
                <span className="text-[10px] uppercase opacity-60">Grande</span>
              </button>
           </div>
           <button 
            disabled={deductions.length === 0}
            onClick={() => {
              const last = deductions.pop();
              if (last) setTecnica(t => +(t + last).toFixed(1));
              setDeductions([...deductions]);
            }}
            className="mt-6 h-12 rounded-xl text-stone-600 font-black uppercase text-[10px] tracking-widest border border-white/5 hover:bg-white/5 disabled:opacity-0 transition-opacity"
           >
            Desfazer ({deductions.length})
           </button>
        </div>

        <div className="bg-stone-900 rounded-[3rem] p-10 flex flex-col border border-white/5 shadow-2xl">
           <div className="flex justify-between items-start mb-10">
              <span className="text-xs font-black text-purple-500 uppercase tracking-widest">Apresentação (Máx 6.0)</span>
              <div className="text-right">
                <span className="text-7xl font-black text-white tabular-nums leading-none">{totalApres.toFixed(1)}</span>
                <span className="block text-[10px] text-stone-600 font-black uppercase mt-1">Acumulado</span>
              </div>
           </div>
            <div className="space-y-12 flex-1 justify-center flex flex-col p-6">
              <PoomsaeSlider label="Velocidade" val={apresentacao.v} onChange={v => setApresentacao(p => ({ ...p, v }))} />
              <PoomsaeSlider label="Ritmo" val={apresentacao.r} onChange={v => setApresentacao(p => ({ ...p, r: v }))} />
              <PoomsaeSlider label="Expressão" val={apresentacao.e} onChange={v => setApresentacao(p => ({ ...p, e: v }))} />
            </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-12">
        <div className="text-center">
            <span className="text-8xl font-black text-white italic drop-shadow-[0_0_40px_rgba(255,255,255,0.2)]">{total.toFixed(2)}</span>
            <span className="block text-xs font-black text-stone-600 uppercase tracking-[0.3em] mt-2">Nota Final Sugerida</span>
        </div>
        <button 
          onClick={handleScore}
          disabled={submitted}
          className="h-32 px-20 rounded-[3rem] bg-white text-black font-black uppercase italic tracking-tighter text-4xl shadow-2xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
        >
          {submitted ? 'Enviando...' : 'Confirmar'}
        </button>
      </div>
    </div>
  );
}

function PoomsaeMesario({ 
  match, session, isLastOfGroup, nextMatchId, onPodium 
}: { 
  match: Match, session: CourtSession, isLastOfGroup: boolean, nextMatchId: string | null, onPodium: (data: PodiumData) => void 
}) {
  const [isFinishing, setIsFinishing] = useState(false);
  const judges = Array.from({ length: session.judgeCount || 3 }).map((_, i) => {
    const score = match.poomsaeScores && (match.poomsaeScores as any)[`judge_${i+1}`];
    return { id: i+1, score };
  });

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
       <div className="mb-16">
          <h2 className="text-stone-500 font-black uppercase tracking-[0.3em] text-sm mb-2">{match.groupKey}</h2>
          <h1 className="text-7xl font-black text-white uppercase italic tracking-tight">{match.competitorA?.name}</h1>
          <p className="text-stone-400 font-bold uppercase tracking-widest mt-2">{match.competitorA?.academy}</p>
       </div>

       <div className="flex gap-12 mb-20">
          {judges.map(j => (
            <div key={j.id} className="flex flex-col items-center gap-4">
               <div className={`w-32 h-32 rounded-[2.5rem] border-4 flex items-center justify-center text-4xl font-black transition-all ${j.score ? 'bg-emerald-600/10 border-emerald-600 text-white' : 'bg-stone-900 border-stone-800 text-stone-800 animate-pulse'}`}>
                 {j.score ? j.score.total.toFixed(2) : '?'}
               </div>
               <span className="text-xs font-black text-stone-600 uppercase tracking-widest">Juiz #{j.id}</span>
            </div>
          ))}
       </div>

       {match.finalScore ? (
         <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-8">
            <div className="text-9xl font-black text-red-600 italic drop-shadow-[0_0_60px_rgba(220,38,38,0.5)]">
              {match.finalScore.toFixed(2)}
            </div>
             <Button 
                disabled={isFinishing}
                onClick={async () => {
                   setIsFinishing(true);
                   try {
                     const result = await import('../../services/courtService').then(m => m.finishAndCycleMatch(match.id, {
                        courtId: session.courtId,
                        nextMatchId,
                        isLastOfGroup,
                        groupKey: match.groupKey
                     }));
                     if (result.podiumWinners) {
                       onPodium(result.podiumWinners);
                     }
                    } catch (e: any) {
                      console.error("Falha ao finalizar luta:", e);
                      alert("Erro ao salvar! Verifique sua conexão ou se a rodada já foi encerrada por outro juiz.\n\nDetalhes: " + (e.message || "Erro desconhecido"));
                    } finally { setIsFinishing(false); }
                }}
                className={`h-20 px-16 text-2xl font-black uppercase italic tracking-tighter rounded-[2rem] shadow-2xl transition-all ${
                  isLastOfGroup 
                    ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400' 
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                {isFinishing ? 'Processando...' : isLastOfGroup ? 'Finalizar Categoria e Ranking' : 'Concluir e Chamar Próximo'}
             </Button>
         </motion.div>
       ) : (
         <div className="flex items-center gap-3 text-stone-600 animate-pulse">
           <div className="w-2 h-2 rounded-full bg-stone-600" />
           <span className="text-sm font-black uppercase tracking-widest">Aguardando Avaliação da Banca Técnica</span>
         </div>
       )}
    </div>
  );
}

function PoomsaeAwaiting({ match, session, myScore }: { match: Match, session: CourtSession, myScore: any }) {
  const isFinished = match.finalScore !== undefined;
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center bg-black/80">
      <div className="w-24 h-24 bg-emerald-600/20 rounded-full flex items-center justify-center mb-10 shadow-[0_0_50px_rgba(16,185,129,0.2)]">
        <Check className="w-12 h-12 text-emerald-500" />
      </div>
      <h2 className="text-5xl font-black text-white uppercase italic tracking-tighter">Voto Registrado</h2>
      <p className="text-stone-500 font-bold uppercase tracking-widest mt-2">{myScore.total.toFixed(2)} pts</p>

      {isFinished ? (
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-16 bg-white/5 p-12 rounded-[3rem] border border-white/10">
          <span className="text-xs font-black text-stone-500 uppercase tracking-[0.3em]">Média Final da Quadra</span>
          <div className="text-9xl font-black text-red-600 italic mt-4">{match.finalScore?.toFixed(2)}</div>
        </motion.div>
      ) : (
        <div className="mt-20 flex gap-4">
           {Array.from({ length: session.judgeCount || 3 }).map((_, i) => (
             <div key={i} className="w-3 h-3 rounded-full bg-stone-800" />
           ))}
        </div>
      )}
    </div>
  );
}

function KyopaEngine({ 
  match, session, judgeIndex, isLastOfGroup, nextMatchId, onPodium 
}: { 
  match: Match, session: CourtSession, judgeIndex: number | null, isLastOfGroup: boolean, nextMatchId: string | null, onPodium: (data: PodiumData) => void 
}) {
  if (judgeIndex !== 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center opacity-40">
        <AlertCircle className="w-20 h-20 text-stone-700 mb-8" />
        <h2 className="text-2xl font-black text-stone-500 uppercase">Mesa Central Única</h2>
        <p className="text-xs font-bold text-stone-600 uppercase tracking-widest">O quebramento é julgado apenas pelo mesário</p>
      </div>
    );
  }
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-stone-900/40">
       <KyopaScoreboard 
         matchId={match.id} 
         athleteName={match.competitorA?.name || 'Incompleto'} 
         isLastOfGroup={isLastOfGroup} 
         nextMatchId={nextMatchId} 
         courtId={Number(session.courtId)} 
         onPodium={onPodium}
       />
    </div>
  );
}

function PoomsaeSlider({ label, val, onChange }: { label: string, val: number, onChange: (v: number) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-end">
        <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.3em]">{label}</span>
        <span className="text-4xl font-black text-white tabular-nums drop-shadow-[0_0_15px_rgba(168,85,247,0.4)]">{val.toFixed(1)}</span>
      </div>
      <div className="relative h-14 flex items-center group">
        {/* Track */}
        <div className="absolute inset-0 bg-black rounded-2xl border border-white/5 shadow-inner" />
        {/* Fill */}
        <motion.div 
           className="absolute left-0 h-full bg-gradient-to-r from-purple-900/50 to-purple-600 rounded-2xl border border-purple-500/30"
           initial={false}
           animate={{ width: `${((val - 0.5) / 1.5) * 100}%` }}
        />
        {/* Native Input Range hidden but functional */}
        <input 
          type="range"
          min="0.5"
          max="2.0"
          step="0.01" // Free movement
          value={val}
          onChange={(e) => {
            const raw = parseFloat(e.target.value);
            // Arredondar no final ou enquanto desliza? 
            // O usuário disse: "gosto mais do arredondar" para minha pergunta se Snapping ou Round no final.
            // Para feedback visual imediato, vou manter o valor bruto enquanto desliza, e o display mostra o arredondado.
            // Ou simplesmente arredondar o valor passado para o estado.
            onChange(+(Math.round(raw * 10) / 10).toFixed(1));
          }}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        {/* Thumb Visual */}
        <motion.div 
          className="absolute w-12 h-12 bg-white rounded-xl shadow-[0_0_20px_rgba(255,255,255,0.3)] border-2 border-white/20 flex items-center justify-center pointer-events-none"
          animate={{ left: `calc(${((val - 0.5) / 1.5) * 100}% - 24px)` }}
          transition={{ type: "spring", bounce: 0, duration: 0.1 }}
        >
          <div className="w-1 h-4 bg-stone-300 rounded-full mx-0.5" />
          <div className="w-1 h-4 bg-stone-300 rounded-full mx-0.5" />
        </motion.div>
      </div>
    </div>
  );
}

function KyoruguiCompetitor({ comp, side }: { comp: any, side: 'red' | 'blue' }) {
  if (!comp) return <div className="h-48 bg-stone-900 rounded-[2rem] border-2 border-dashed border-white/5 opacity-20" />;
  return (
    <div className={`p-8 rounded-[2rem] border-2 text-center shadow-2xl transition-all ${
      side === 'red' ? 'bg-red-600/10 border-red-600/30' : 'bg-blue-600/10 border-blue-600/30'
    }`}>
      <h3 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-1">{comp.name}</h3>
      <p className="text-xs font-bold text-stone-500 uppercase tracking-widest mb-6">{comp.academy}</p>
      <div className="flex justify-center"><BeltBadge belt={comp.belt} size="lg" /></div>
    </div>
  );
}

function LoadingView() {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 space-y-8">
      <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} className="w-16 h-16 border-4 border-red-600/20 border-t-red-600 rounded-full" />
      <span className="text-[10px] font-black text-stone-500 uppercase tracking-[0.5em] animate-pulse">Sincronizando com a Fila</span>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center text-white">
      <AlertCircle className="w-20 h-20 text-red-600 mb-8" />
      <h2 className="text-2xl font-black uppercase mb-4">Falha Fatal na Sessão</h2>
      <p className="text-stone-500 font-bold uppercase tracking-widest max-w-sm mb-12">{message}</p>
      <div className="flex flex-col gap-4">
        <Button onClick={() => window.location.reload()} className="bg-white text-black font-black uppercase tracking-widest min-w-[240px]">Tentar Reconectar</Button>
        <button 
          onClick={() => {
            localStorage.removeItem('last_view');
            localStorage.removeItem('last_view_params');
            window.location.href = '/';
          }}
          className="text-stone-500 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all"
        >
          Limpar Memória e Voltar ao Início
        </button>
      </div>
    </div>
  );
}

function PodiumView({ data, onDone, nextMatch }: { data: PodiumData, onDone: () => void, nextMatch?: Match }) {
  // Pegamos a primeira categoria dos dados para o título principal (geralmente é apenas uma)
  const groupKeys = Object.keys(data);
  const firstKey = groupKeys[0] || "Premiação";

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 overflow-y-auto"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.15)_0%,transparent_70%)] pointer-events-none" />
      
      <header className="text-center mb-16 relative">
        <div className="inline-block px-6 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs font-black uppercase tracking-[0.4em] mb-4">
          Cerimônia de Premiação
        </div>
        <h1 className="text-6xl font-black text-white uppercase italic tracking-tighter drop-shadow-2xl">
          {firstKey}
        </h1>
        <div className="h-1 w-24 bg-red-600 mx-auto mt-6 rounded-full" />
      </header>

      <div className="w-full max-w-6xl space-y-24">
        {groupKeys.map(groupKey => (
          <div key={groupKey} className="flex flex-col items-center">
            {groupKeys.length > 1 && (
               <h2 className="text-2xl font-black text-stone-500 uppercase tracking-widest mb-12">{groupKey}</h2>
            )}
            
            <div className="flex flex-wrap justify-center items-end gap-4 md:gap-12 w-full">
              {/* Segundo Lugar (Lado Esquerdo) */}
              {data[groupKey].find(w => w.place === 2) && (
                <PodiumSpot 
                  winner={data[groupKey].find(w => w.place === 2)!} 
                  place={2} 
                  color="text-stone-400" 
                  bg="bg-stone-400/10" 
                  border="border-stone-400/30" 
                />
              )}

              {/* Primeiro Lugar (Centro - Mais Alto) */}
              {data[groupKey].find(w => w.place === 1) && (
                <PodiumSpot 
                  winner={data[groupKey].find(w => w.place === 1)!} 
                  place={1} 
                  color="text-amber-500" 
                  bg="bg-amber-500/10" 
                  border="border-amber-500/30" 
                  isWinner
                />
              )}

              {/* Terceiro Lugar (Lado Direito) */}
              {data[groupKey].filter(w => w.place === 3).map((winner, idx) => (
                <PodiumSpot 
                  key={idx}
                  winner={winner} 
                  place={3} 
                  color="text-orange-700" 
                  bg="bg-orange-700/10" 
                  border="border-orange-700/30" 
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <footer className="mt-24 flex flex-col items-center gap-8 relative">
        {nextMatch ? (
          <div className="flex flex-col items-center gap-6">
            <p className="text-stone-500 text-[10px] font-black uppercase tracking-[0.5em]">Próximo em Combate</p>
            <div className="flex items-center gap-6 px-10 py-5 bg-white/5 border border-white/10 rounded-[2.5rem] backdrop-blur-md">
                   <div className="text-left">
                     <span className="block text-2xl font-black text-white uppercase italic">{nextMatch.competitorA?.name}</span>
                     {nextMatch.competitorB && (
                       <span className="text-xs font-bold text-stone-500 uppercase">vs {nextMatch.competitorB.name}</span>
                     )}
                   </div>
                   <div className="w-px h-10 bg-white/10" />
                   <Button 
                    onClick={onDone}
                    className="h-14 px-8 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-black uppercase italic tracking-tighter text-lg shadow-[0_10px_20px_rgba(220,38,38,0.3)] transition-all hover:scale-105 active:scale-95"
                   >
                    Chamar Agora
                   </Button>
            </div>
          </div>
        ) : (
          <Button 
            onClick={onDone}
            className="h-20 px-16 rounded-[2rem] bg-white text-black font-black uppercase italic tracking-tighter text-xl shadow-2xl hover:bg-stone-200 transition-all"
          >
            Concluir Premiação
          </Button>
        )}
      </footer>
    </motion.div>
  );
}

function PodiumSpot({ 
  winner, place, color, bg, border, isWinner = false 
}: { 
  winner: PodiumWinner, place: number, color: string, bg: string, border: string, isWinner?: boolean 
}) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: place === 1 ? 0.2 : place === 2 ? 0.4 : 0.6 }}
      className={`flex flex-col items-center w-full max-w-[280px] group ${isWinner ? 'order-1 md:order-none' : ''}`}
    >
      <div className={`w-full aspect-square rounded-[3rem] ${bg} border-2 ${border} flex flex-col items-center justify-center relative mb-6 shadow-2xl transition-all group-hover:scale-105`}>
        {isWinner && (
          <div className="absolute -top-6 -right-6 w-20 h-20 bg-amber-500 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(245,158,11,0.5)] animate-bounce">
            <Trophy className="w-10 h-10 text-white" />
          </div>
        )}
        <span className={`text-8xl font-black ${color} italic`}>{place}º</span>
      </div>
      
      <div className="text-center">
        <h3 className="text-2xl font-black text-white uppercase italic tracking-tighter truncate w-full px-4">{winner.athleteName}</h3>
        <p className="text-xs font-black text-stone-500 uppercase tracking-widest mt-1">{winner.academy}</p>
        {winner.score !== undefined && (
          <div className={`mt-3 inline-block px-4 py-1 rounded-full ${bg} border ${border}`}>
            <span className={`text-[10px] font-black ${color}`}>{winner.score.toFixed(2)} PTS</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}



function PinGate({ onSuccess, error, setError }: { onSuccess: () => void, error: boolean, setError: (v: boolean) => void }) {
  const [pin, setPin] = useState('');
  const CORRECT_PIN = '202611';

  const handleInput = (val: string) => {
    setError(false);
    if (pin.length < 6) {
      const newPin = pin + val;
      setPin(newPin);
      if (newPin.length === 6) {
        if (newPin === CORRECT_PIN) {
          onSuccess();
        } else {
          setError(true);
          setTimeout(() => setPin(''), 500);
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 z-[10000] relative overflow-hidden">
      {/* Background Decor */}
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,rgba(220,38,38,0.1)_0%,transparent_70%)] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }} 
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center"
      >
        <div className="w-20 h-20 bg-red-600/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-red-600/20 shadow-[0_0_30px_rgba(220,38,38,0.1)]">
          <Shield className="w-10 h-10 text-red-600" />
        </div>
        
        <h1 className="text-3xl font-black text-white uppercase italic tracking-tighter mb-2">Acesso Restrito</h1>
        <p className="text-stone-500 text-xs font-black uppercase tracking-widest mb-12">Insira o PIN da Arena para continuar</p>

        {/* PIN Display */}
        <div className="flex justify-center gap-3 mb-12">
          {[...Array(6)].map((_, i) => (
            <div 
              key={i} 
              className={cn(
                "w-12 h-16 rounded-2xl border-2 flex items-center justify-center text-2xl font-black transition-all",
                error ? "border-red-600 bg-red-600/10 text-red-600 animate-bounce" :
                pin.length > i ? "border-emerald-500 bg-emerald-500/10 text-white" : "border-white/5 bg-white/5 text-stone-700"
              )}
            >
              {pin[i] ? "●" : ""}
            </div>
          ))}
        </div>

        {/* Pin Pad */}
        <div className="grid grid-cols-3 gap-4 max-w-xs mx-auto">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
            <button 
              key={n}
              onClick={() => handleInput(n.toString())}
              className="h-16 rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-white hover:bg-white/10 active:scale-90 transition-all"
            >
              {n}
            </button>
          ))}
          <div />
          <button 
            onClick={() => handleInput('0')}
            className="h-16 rounded-2xl bg-white/5 border border-white/10 text-2xl font-black text-white hover:bg-white/10 active:scale-90 transition-all"
          >
            0
          </button>
          <button 
            onClick={() => setPin(pin.slice(0, -1))}
            className="h-16 rounded-2xl bg-white/5 border border-white/10 text-xl font-black text-stone-500 hover:text-white active:scale-90 transition-all"
          >
            ←
          </button>
        </div>

        {error && (
          <motion.p 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            className="mt-8 text-red-500 text-[10px] font-black uppercase tracking-widest"
          >
            PIN Incorreto. Tente novamente.
          </motion.p>
        )}
      </motion.div>
    </div>
  );
}


