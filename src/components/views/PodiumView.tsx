import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  collection, 
  query, 
  where, 
  onSnapshot,
  orderBy
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Match } from '../../types';
import { 
  Trophy, 
  Medal, 
  Printer, 
  ChevronLeft,
  Calendar,
  MapPin,
  Target
} from 'lucide-react';
import { Card, Button, cn } from '../ui';
import { motion } from 'motion/react';

export function PodiumView() {
  const [searchParams] = useSearchParams();
  const courtId = parseInt(searchParams.get('courtId') || '1');
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    console.log(`[PodiumView] Carregando pódios para Quadra ${courtId}`);
    
    // Buscar todas as lutas FINALIZADAS desta quadra
    const q = query(
      collection(db, 'matches'),
      where('courtId', '==', courtId),
      where('status', '==', 'finished'),
      orderBy('finishedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Match));
      setMatches(data);
      setLoading(false);
    }, (err) => {
      console.error("Erro ao carregar pódios:", err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [courtId]);

  // Agrupar matches por categoria (groupKey)
  // Para Poomsae/Kyopa, cada match tem um 'finalScore' e competidores. 
  // Na verdade, no Poomsae 'groupKey' é a categoria.
  const categories = matches.reduce((acc, m) => {
    const key = m.groupKey || 'Categoria Indefinida';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {} as Record<string, Match[]>);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-stone-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-950 text-white p-4 md:p-8 selection:bg-red-500/30">
      {/* Elementos que NÃO aparecem na impressão */}
      <div className="max-w-4xl mx-auto mb-8 flex items-center justify-between print:hidden">
        <Button variant="ghost" onClick={() => window.close()} className="text-stone-400 hover:text-white">
          <ChevronLeft className="w-4 h-4 mr-2" />
          Voltar para Arena
        </Button>
        <Button onClick={handlePrint} className="bg-red-600 hover:bg-red-500 shadow-lg shadow-red-600/20">
          <Printer className="w-4 h-4 mr-2" />
          Imprimir Relatório
        </Button>
      </div>

      {/* Cabeçalho do Relatório (Aparece na tela e na impressão) */}
      <div className="max-w-4xl mx-auto mb-12 text-center space-y-4 print:text-black">
        <div className="flex items-center justify-center gap-6 mb-6">
          <img src="/logo-colombo.png" alt="Logo" className="w-20 h-20 object-contain print:invert-0" />
          <div className="text-left border-l border-white/10 pl-6 print:border-black/20">
            <h1 className="text-3xl font-black uppercase italic tracking-tighter leading-none print:text-2xl">Relatório de Pódio</h1>
            <p className="text-red-500 font-black uppercase tracking-[0.2em] text-[10px] mt-1">3º Festival União Lopes de Taekwondo</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 py-4 border-y border-white/5 print:border-black/10">
          <div className="flex flex-col items-center gap-1">
            <Target className="w-4 h-4 text-stone-500 print:text-black" />
            <span className="text-[10px] uppercase font-black text-stone-500 print:text-black">Arena</span>
            <span className="text-lg font-black">{courtId}</span>
          </div>
          <div className="flex flex-col items-center gap-1 border-x border-white/5 print:border-black/10">
            <Calendar className="w-4 h-4 text-stone-500 print:text-black" />
            <span className="text-[10px] uppercase font-black text-stone-500 print:text-black">Data</span>
            <span className="text-lg font-black">{new Date().toLocaleDateString('pt-BR')}</span>
          </div>
          <div className="flex flex-col items-center gap-1">
            <MapPin className="w-4 h-4 text-stone-500 print:text-black" />
            <span className="text-[10px] uppercase font-black text-stone-500 print:text-black">Local</span>
            <span className="text-lg font-black">Colombo / PR</span>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto space-y-12">
        {Object.entries(categories).length === 0 ? (
          <div className="py-20 text-center space-y-4">
            <Trophy className="w-16 h-16 text-stone-800 mx-auto mb-4" />
            <p className="text-stone-500 font-bold uppercase tracking-widest text-sm">Nenhum pódio gerado nesta quadra ainda.</p>
          </div>
        ) : (
          Object.entries(categories).map(([category, catMatches], idx) => {
            // No Poomsae/Kyopa, cada luta é um atleta. Precisamos ordenar por nota.
            // No Kyorugui, o ganhador da final é o 1º, perdedor 2º, etc.
            // Simplificação inicial: listar os atletas com melhores notas/resultados.
            
            const results = [...catMatches].sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0));

            return (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                key={category} 
                className="bg-stone-900/40 border border-white/5 rounded-3xl p-6 md:p-8 shadow-2xl overflow-hidden relative group print:bg-white print:border-black print:text-black print:rounded-none print:shadow-none print:p-4"
              >
                {/* Badge de fundo */}
                <div className="absolute -right-8 -top-8 opacity-[0.03] rotate-12 group-hover:rotate-6 transition-transform print:hidden">
                  <Trophy size={200} />
                </div>

                <div className="relative z-10 space-y-8">
                  <div className="border-b border-white/5 pb-4 print:border-black/20">
                    <h2 className="text-xl font-black uppercase italic tracking-tight text-white print:text-black print:text-lg">
                      {category}
                    </h2>
                  </div>

                  <div className="grid gap-6">
                    {results.slice(0, 3).map((match, pos) => {
                      const athlete = match.competitorA; // Em Poomsae/Kyopa o atleta está no competidorA
                      if (!athlete || athlete.isBye || athlete.name.toUpperCase().includes('SORTEIO')) return null;

                      const colors = [
                        'from-amber-400 to-amber-600 text-amber-950', // Gold
                        'from-stone-300 to-stone-500 text-stone-950', // Silver
                        'from-orange-400 to-orange-700 text-orange-950', // Bronze
                      ][pos];

                      return (
                        <div key={match.id} className="flex items-center gap-6 group/item">
                          <div className={cn(
                            "w-14 h-14 rounded-2xl bg-gradient-to-br flex flex-col items-center justify-center shrink-0 shadow-lg print:border print:border-black print:bg-none print:text-black",
                            colors
                          )}>
                            <span className="text-[10px] font-black uppercase leading-none">{pos + 1}º</span>
                            <Medal className="w-6 h-6" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <p className="text-lg font-black uppercase tracking-tight truncate text-white print:text-black">
                              {athlete.name}
                            </p>
                            <p className="text-sm font-bold text-stone-500 uppercase tracking-widest truncate print:text-black/60">
                              {athlete.academy}
                            </p>
                          </div>

                          <div className="text-right">
                             <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-1 print:text-black">Pontuação</p>
                             <p className="text-2xl font-black text-white tabular-nums print:text-black">
                               {(match.finalScore || 0).toFixed(2)}
                             </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Assinaturas na Impressão */}
                <div className="hidden print:grid grid-cols-2 gap-12 mt-20 pt-12">
                   <div className="border-t border-black/20 text-center pt-2">
                     <p className="text-[8px] font-black uppercase tracking-widest">Árbitro de Arena</p>
                   </div>
                   <div className="border-t border-black/20 text-center pt-2">
                     <p className="text-[8px] font-black uppercase tracking-widest">Diretor de Provas</p>
                   </div>
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          body { background: white !important; color: black !important; }
          .min-h-screen { min-height: auto !important; height: auto !important; background: white !important; padding: 0 !important; }
          .p-4, .p-8 { padding: 0 !important; }
          .bg-stone-950, .bg-stone-900/40 { background: white !important; }
          .text-white, .text-stone-400, .text-stone-500 { color: black !important; }
          .border-white/5, .border-white/10 { border-color: #eee !important; }
          .shadow-2xl, .shadow-lg { box-shadow: none !important; }
          button { display: none !important; }
          @page { margin: 2cm; }
        }
      `}} />
    </div>
  );
}
