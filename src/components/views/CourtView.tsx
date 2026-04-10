import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Clock, AlertCircle, ChevronRight, Check } from 'lucide-react';
import { signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, onSnapshot, query, collection, where, orderBy, limit } from 'firebase/firestore';
import { auth, db } from '../../firebase';
import { validateCourtSession, submitPoomsaeScore, callMatch } from '../../services/courtService';
import { CourtSession, Match } from '../../types';
import { BeltBadge } from '../BeltBadge';
import { Button } from '../ui';
import { handleFirestoreError } from '../../utils';

interface CourtViewProps {
  sessionId: string;
}

export function CourtView({ sessionId }: CourtViewProps) {
  const [session, setSession] = useState<CourtSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  
  // Para Poomsae: identificação do árbitro logado
  const [judgeIndex, setJudgeIndex] = useState<number | null>(null);
  const [currentScore, setCurrentScore] = useState<number>(0);
  
  useEffect(() => {
    // Autenticar anonimamente para visualizar
    const initSession = async () => {
      try {
        await signInAnonymously(auth);
        
        // Validar e obter a sessão
        const courtSession = await validateCourtSession(sessionId);
        if (!courtSession) {
          setError("Sessão inválida, expirada ou revogada.");
          setLoading(false);
          return;
        }
        
        setSession(courtSession);
        
        // Escutar as lutas direcionadas para esta quadra
        const today = new Date();
        // Na vida real você filtraria talvez pelo status='pending' ou 'live' 
        // e ordenaria pela matchSequence
        const q = query(
          collection(db, 'matches'),
          where('courtId', '==', courtSession.courtId),
          // Fila: apenas scheduled ou live
          where('status', 'in', ['scheduled', 'live']),
          orderBy('matchSequence', 'asc'),
          limit(10)
        );
        
        const unsub = onSnapshot(q, (snap) => {
          setMatches(snap.docs.map(d => ({ id: d.id, ...d.data() } as Match)));
          setLoading(false);
        });
        
        return () => unsub();
      } catch (err) {
        console.error("Court Auth Error", err);
        setError("Erro de autenticação para o Modo Quiosque.");
        setLoading(false);
      }
    };
    
    initSession();
  }, [sessionId]);

  const activeMatch = matches.find(m => m.status === 'live');
  const nextMatches = matches.filter(m => m.status === 'scheduled');

  if (loading) return <LoadingView />;
  if (error || !session) return <ErrorView message={error || "Erro desconhecido"} />;

  // Se Poomsae e ainda não selecionou qual julgador é na tela do tablet
  if (session.type === 'poomsae' && judgeIndex === null) {
    return (
      <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 space-y-8">
        <h1 className="text-3xl font-black text-white uppercase italic">Quadra {session.courtId} - Seção de Poomsae</h1>
        <p className="text-stone-400">Qual posição você ocupará neste tablet?</p>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {session.judgeCount && Array.from({ length: session.judgeCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => setJudgeIndex(i + 1)}
              className="py-12 bg-white/5 border border-white/10 rounded-2xl text-2xl font-black text-white hover:bg-red-600 hover:border-red-500 transition-all uppercase shadow-xl"
            >
              Julgador {i + 1}
            </button>
          ))}
          <button
            onClick={() => setJudgeIndex(0)}
            className="py-12 bg-white/5 border border-white/10 rounded-2xl text-2xl font-black text-amber-500 hover:bg-amber-600 hover:text-white transition-all uppercase shadow-xl md:col-span-3"
          >
            Apenas Mesário (Mesa Central)
          </button>
        </div>
      </div>
    );
  }

  // --- RENDER DE LUTA ATIVA ---
  return (
    <div className="min-h-screen bg-stone-950 flex flex-col font-sans selection:bg-red-600 selection:text-white text-white">
      {/* Header Info */}
      <header className="p-6 bg-stone-900 border-b border-white/10 flex items-center justify-between shadow-2xl z-10">
        <div>
          <h1 className="text-2xl font-black italic uppercase tracking-tighter text-red-500">
            {session.label}
          </h1>
          <p className="text-stone-400 text-xs font-bold uppercase tracking-widest mt-1">
            {session.type === 'poomsae' && judgeIndex !== 0 ? `Árbitro: Julgador ${judgeIndex}` : 'Modo Mesário Central'}
          </p>
        </div>
        
        {/* Identificação Segura */}
        <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
          <Shield className="w-5 h-5 text-emerald-500" />
          <span className="text-xs font-black uppercase tracking-widest text-emerald-500">Sessão Autenticada</span>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Painel Central (Foco na Luta) */}
        <section className="flex-1 p-8 flex flex-col justify-center overflow-y-auto">
          {activeMatch ? (
            <ActiveMatchPanel 
              match={activeMatch} 
              session={session} 
              judgeIndex={judgeIndex} 
            />
          ) : (
            <div className="text-center space-y-6">
              <Clock className="w-16 h-16 text-stone-700 mx-auto" />
              <h2 className="text-2xl font-black uppercase tracking-tighter text-stone-500">Aguardando Luta</h2>
              {nextMatches.length > 0 && (judgeIndex === 0 || session.type === 'kyorugui') && (
                <Button onClick={() => callMatch(nextMatches[0].id)} className="px-12 py-6 text-xl font-black uppercase shadow-[0_0_30px_rgba(220,38,38,0.3)] hover:scale-105 transition-all">
                  Chamar Próxima Luta
                </Button>
              )}
            </div>
          )}
        </section>

        {/* Sidebar Direita (Fila) */}
        <aside className="w-96 bg-stone-900/50 border-l border-white/5 flex flex-col overflow-hidden">
          <div className="p-6 border-b border-white/5 bg-stone-900">
            <h3 className="font-black text-sm uppercase tracking-widest">Próximos na Fila</h3>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {nextMatches.map(m => (
              <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-4 flex gap-4 opacity-70">
                <div className="flex-1 space-y-1">
                  <p className="text-xs font-bold text-stone-400 capitalize">{m.groupKey}</p>
                  <p className="font-black uppercase">{m.competitorA?.name}</p>
                  {m.competitorB && <p className="font-black uppercase text-stone-500">vs {m.competitorB.name}</p>}
                </div>
              </div>
            ))}
            {nextMatches.length === 0 && (
              <p className="text-xs text-stone-500 font-bold uppercase text-center p-8">Fila Vazia</p>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

// ------ Componentes de Luta (Kyorugui vs Poomsae) ------

function ActiveMatchPanel({ match, session, judgeIndex }: { match: Match, session: CourtSession, judgeIndex: number | null }) {
  
  if (session.type === 'poomsae') {
    return <PoomsaeActiveMatch match={match} session={session} judgeIndex={judgeIndex} />;
  }

  // Fallback para Kyorugui UI (pode expandir depois)
  return (
    <div className="max-w-4xl w-full mx-auto space-y-12">
      <div className="text-center space-y-2 mb-12">
        <h2 className="text-stone-400 font-bold uppercase tracking-widest">{match.groupKey}</h2>
        <div className="inline-flex items-center gap-2 px-6 py-2 rounded-full bg-red-600/20 border border-red-500/30 text-red-500 font-black uppercase tracking-[0.2em] animate-pulse">
          Luta em Andamento
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-8">
        <CompetitorCard comp={match.competitorA} side="red" />
        <div className="text-4xl font-black text-stone-700 italic px-8">VS</div>
        <CompetitorCard comp={match.competitorB} side="blue" />
      </div>

      {/* Mesário Controls - Simplificado pois Kyorugui o winner é clicado no Bracket */}
      <div className="pt-12 text-center text-stone-500 font-bold uppercase text-xs">
        * No Kyorugui, a pontuação é gerenciada via App de Luta / Bracket de Admin.
      </div>
    </div>
  );
}

function PoomsaeActiveMatch({ match, session, judgeIndex }: { match: Match, session: CourtSession, judgeIndex: number | null }) {
  const [score, setScore] = useState<string>('');
  
  // Verifica se eu (árbitro) já votei
  const myVote = judgeIndex && match.poomsaeScores ? match.poomsaeScores[`judge_${judgeIndex}`] : null;

  const handleSubmitScore = async () => {
    const numScore = parseFloat(score);
    if (isNaN(numScore) || numScore < 0 || numScore > 10) {
      alert("Nota deve ser entre 0.0 e 10.0");
      return;
    }
    if (judgeIndex === null || judgeIndex === 0) return;
    
    try {
      await submitPoomsaeScore(match.id, judgeIndex, numScore, session.judgeCount || 3);
    } catch (e: any) {
      alert("Erro ao enviar nota: " + e.message);
    }
  };

  // UI Mesário (Visualização de tudo)
  if (judgeIndex === 0) {
    return (
      <div className="max-w-4xl w-full mx-auto space-y-12 text-center">
        <h2 className="text-stone-400 font-bold uppercase tracking-widest">{match.groupKey}</h2>
        <h1 className="text-6xl font-black uppercase text-white tracking-tighter">
          {match.competitorA?.name}
        </h1>
        
        {/* Placar Real-time */}
        <div className="flex items-center justify-center gap-8 pt-8">
          {Array.from({ length: session.judgeCount || 3 }).map((_, i) => {
            const hasVoted = match.poomsaeScores && match.poomsaeScores[`judge_${i + 1}`] !== undefined;
            return (
              <div key={i} className="flex flex-col items-center gap-4">
                <div className={`w-24 h-24 rounded-full border-4 flex items-center justify-center text-4xl shadow-2xl transition-all ${hasVoted ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' : 'bg-stone-900 border-stone-800 text-stone-700'}`}>
                   {hasVoted ? <Check className="w-12 h-12" /> : '⏳'}
                </div>
                <p className="text-sm font-black text-stone-500 uppercase tracking-widest">J{i + 1}</p>
              </div>
            );
          })}
        </div>
        
        {/* Se finalizado (todos votaram) */}
        {match.finalScore !== undefined && (
          <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pt-12">
            <p className="text-stone-400 text-lg uppercase font-black tracking-widest mb-2">Nota Final</p>
            <p className="text-9xl font-black text-amber-500 drop-shadow-[0_0_50px_rgba(245,158,11,0.5)]">
              {match.finalScore.toFixed(2)}
            </p>
            <p className="text-stone-500 mt-4 max-w-sm mx-auto text-xs uppercase font-bold">Lembre-se: com 5 juízes, a maior e menor notas são descartadas automaticamente pelo sistema.</p>
          </motion.div>
        )}
      </div>
    );
  }

  // --- UI Árbitro ---
  if (myVote !== null && myVote !== undefined) {
    // Tela de "Aguarde os outros"
    const isFinished = match.finalScore !== undefined;
    
    return (
       <div className="max-w-2xl w-full mx-auto space-y-12 text-center flex flex-col items-center">
          <Check className="w-32 h-32 text-emerald-500 mx-auto drop-shadow-[0_0_30px_rgba(16,185,129,0.5)]" />
          <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Nota Registrada</h2>
          <p className="text-2xl text-emerald-500 font-black">{myVote.toFixed(2)}</p>
          
          <div className="p-8 bg-white/5 border border-white/10 rounded-3xl mt-8">
            <h3 className="text-stone-400 uppercase tracking-widest text-sm font-bold mb-6">Status dos outros juízes</h3>
            <div className="flex items-center justify-center gap-6">
               {Array.from({ length: session.judgeCount || 3 }).map((_, i) => {
                  const hasVoted = match.poomsaeScores && match.poomsaeScores[`judge_${i + 1}`] !== undefined;
                  return (
                    <div key={i} className={`w-16 h-16 rounded-full border-2 flex items-center justify-center ${hasVoted ? 'border-emerald-500 text-emerald-500' : 'border-stone-700 text-stone-700'}`}>
                      {hasVoted ? <Check className="w-8 h-8" /> : '⏳'}
                    </div>
                  );
                })}
            </div>
          </div>
          
          {isFinished && (
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="mt-8 bg-amber-500/20 text-amber-100 p-8 rounded-3xl border border-amber-500/30 w-full shadow-[0_0_50px_rgba(245,158,11,0.2)]">
              <p className="text-sm font-black uppercase tracking-widest opacity-80 mb-2">Nota Final Calculada</p>
              <p className="text-6xl font-black">{match.finalScore?.toFixed(2)}</p>
            </motion.div>
          )}
       </div>
    );
  }

  // Tela de imput da nota para o Árbitro
  return (
    <div className="max-w-2xl w-full mx-auto space-y-10">
      <div className="text-center space-y-4">
         <h2 className="text-stone-400 font-bold uppercase tracking-[0.2em]">{match.groupKey}</h2>
         <h1 className="text-6xl font-black uppercase text-white tracking-tighter">{match.competitorA?.name}</h1>
         <p className="text-2xl text-stone-500 italic font-medium">{match.competitorA?.academy}</p>
      </div>

      <div className="bg-stone-900 border border-white/10 p-8 rounded-3xl space-y-8 shadow-2xl">
        <div>
          <label className="block text-center text-stone-400 text-lg uppercase font-black tracking-widest mb-6">Insira a Nota Poomsae</label>
          <input 
            type="number" 
            step="0.1" 
            min="0" max="10"
            value={score}
            onChange={(e) => setScore(e.target.value)}
            className="w-full text-center text-7xl font-black bg-black/50 border border-white/10 rounded-2xl py-8 outline-none focus:border-red-500 focus:shadow-[0_0_30px_rgba(220,38,38,0.3)] transition-all"
            placeholder="0.0"
          />
        </div>
        
        <Button onClick={handleSubmitScore} className="w-full py-8 text-2xl font-black uppercase tracking-wider bg-red-600 hover:bg-red-500 shadow-[0_4px_30px_rgba(220,38,38,0.5)] hover:scale-105 transition-all">
          Confirmar Nota {score ? `(${parseFloat(score).toFixed(1)})` : ''}
        </Button>
      </div>
    </div>
  );
}

function CompetitorCard({ comp, side }: { comp: any, side: 'red' | 'blue' }) {
  if (!comp) return <div className="h-64 border-2 border-dashed border-white/5 rounded-3xl" />;
  
  return (
    <div className={`p-8 rounded-3xl border text-center shadow-2xl bg-gradient-to-b ${
      side === 'red' ? 'from-red-600/20 to-stone-900 border-red-500/30' : 'from-blue-600/20 to-stone-900 border-blue-500/30'
    }`}>
      <h3 className="text-4xl font-black uppercase tracking-tighter text-white mb-2">{comp.name}</h3>
      <p className="text-stone-400 font-bold uppercase tracking-widest text-sm mb-6">{comp.academy}</p>
      <BeltBadge belt={comp.belt} size="lg" />
    </div>
  );
}


function LoadingView() {
  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 space-y-6">
      <div className="w-16 h-16 border-4 border-white/10 border-t-red-600 rounded-full animate-spin" />
      <h2 className="text-white text-xl font-black uppercase tracking-widest">Validando Sessão...</h2>
    </div>
  );
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-stone-950 flex flex-col items-center justify-center p-6 space-y-6">
      <AlertCircle className="w-24 h-24 text-red-500 drop-shadow-[0_0_20px_rgba(220,38,38,0.5)]" />
      <h1 className="text-3xl font-black text-white uppercase italic text-center leading-tight">Acesso<br />Negado</h1>
      <p className="text-stone-400 max-w-sm text-center">{message}</p>
      <p className="text-xs text-stone-600 uppercase tracking-widest mt-8">Por favor, recarregue ou re-escaneie o QR Code.</p>
    </div>
  );
}
