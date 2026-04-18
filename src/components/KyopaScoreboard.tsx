import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Target, CheckCircle2, AlertCircle, Save, Loader2, Trophy } from 'lucide-react';
import { Button, Card } from './ui';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

import { PodiumData } from '../services/courtService';

interface KyopaScoreboardProps {
  matchId: string;
  athleteName: string;
  onSuccess?: () => void;
  onPodium?: (data: PodiumData) => void;
  isLastOfGroup?: boolean;
  nextMatchId?: string | null;
  courtId: number;
}

export function KyopaScoreboard({ matchId, athleteName, onSuccess, onPodium, isLastOfGroup, nextMatchId, courtId }: KyopaScoreboardProps) {
  const [attempted, setAttempted] = useState(1);
  const [broken, setBroken] = useState(1);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (broken > attempted) {
      alert("Erro: O número de placas quebradas não pode ser maior que o de tentadas.");
      return;
    }

    setLoading(true);
    try {
      // Salva o resultado no formato que o sistema espera
      // Usamos finalScore para facilitar a ordenação (ex: placas quebradas + (quebradas/tentadas)/1000)
      const finalScore = broken + (broken / (attempted || 1)) / 100;
      
      const { finishAndCycleMatch } = await import('../services/courtService');
      
      const result = await finishAndCycleMatch(matchId, {
        courtId: courtId as 1 | 2 | 3,
        nextMatchId,
        isLastOfGroup,
        scoreA: finalScore, // Para Kyopa, competitorA.score é o finalScore
      });

      if (result.podiumWinners && onPodium) {
        onPodium(result.podiumWinners);
      }

      // Nota: O update do kyopaResult específico ainda é bom ter
      const matchRef = doc(db, 'matches', matchId);
      await updateDoc(matchRef, {
        kyopaResult: { attempted, broken }
      });
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error("Erro ao salvar resultado Kyopa:", error);
      alert("Erro ao salvar resultado. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-8 border-white/5 bg-gradient-to-br from-white/[0.05] to-transparent shadow-2xl rounded-[32px]">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-2xl bg-red-600 flex items-center justify-center shadow-[0_0_20px_rgba(220,38,38,0.4)]">
          <Target className="w-6 h-6 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Estação de Quebramento</p>
          <h3 className="text-xl font-black text-white uppercase tracking-tight">{athleteName}</h3>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-8">
        <div className="space-y-3">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Placas Tentadas</label>
          <div className="flex items-center gap-4">
             <button 
              onClick={() => setAttempted(Math.max(1, attempted - 1))}
              className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all text-xl"
            >-</button>
            <span className="text-4xl font-black text-white w-8 text-center">{attempted}</span>
            <button 
              onClick={() => setAttempted(attempted + 1)}
              className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all text-xl"
            >+</button>
          </div>
        </div>

        <div className="space-y-3">
          <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Placas Quebradas</label>
          <div className="flex items-center gap-4">
             <button 
              onClick={() => setBroken(Math.max(0, broken - 1))}
              className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all text-xl"
            >-</button>
            <span className="text-4xl font-black text-white w-8 text-center">{broken}</span>
            <button 
              onClick={() => {
                if (broken < attempted) setBroken(broken + 1);
              }}
              className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 text-white font-black hover:bg-white/10 transition-all text-xl"
            >+</button>
          </div>
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-white/5 border border-white/5 mb-8 flex items-center gap-4">
        <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
        <p className="text-[10px] font-bold text-stone-400 uppercase leading-relaxed tracking-wider">
          O critério de desempate é eficiência: Em caso de igualdade de placas, quem tentou menos placas (ou teve maior % de sucesso) vence.
        </p>
      </div>

      <Button 
        onClick={handleSave}
        disabled={loading}
        className={`w-full h-16 rounded-2xl font-black uppercase tracking-widest text-sm flex items-center justify-center gap-3 transition-all ${
          isLastOfGroup 
            ? 'bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 shadow-[0_0_30px_rgba(245,158,11,0.3)]' 
            : 'bg-red-600 hover:bg-red-700 shadow-[0_0_30px_rgba(220,38,38,0.3)]'
        }`}
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : isLastOfGroup ? <Trophy className="w-5 h-5" /> : <Save className="w-5 h-5" />}
        {loading ? 'Salvando...' : isLastOfGroup ? 'Finalizar Categoria e Ranking' : 'Finalizar e Salvar'}
      </Button>

      <button
        onClick={async () => {
          if (!confirm(`Confirmar W.O. para ${athleteName}?`)) return;
          setLoading(true);
          try {
            const { markAthleteAsAbsent } = await import('../services/courtService');
            const result = await markAthleteAsAbsent(matchId, {
              courtId: courtId as 1 | 2 | 3,
              nextMatchId,
              isLastOfGroup
            });
            if (result.podiumWinners && onPodium) {
              onPodium(result.podiumWinners);
            }
            if (onSuccess) onSuccess();
          } catch (e) {
            console.error(e);
            alert("Erro ao processar W.O.");
          } finally { setLoading(false); }
        }}
        disabled={loading}
        className="w-full mt-4 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-red-500 transition-colors"
      >
        Atleta Ausente (W.O.)
      </button>
    </Card>
  );
}
