import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { Trophy, Medal, Award, Star } from 'lucide-react';
import { Registration, Academy } from '../../types';
import { Card, cn } from '../ui';

interface RankingStats {
  academyId: string;
  name: string;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
}

export function RankingView({ academies, registrations }: { academies: Academy[]; registrations: Registration[] }) {
  const ranking = useMemo(() => {
    const statsMap: Record<string, RankingStats> = {};

    academies.forEach(a => {
      statsMap[a.id] = { academyId: a.id, name: a.name, points: 0, gold: 0, silver: 0, bronze: 0 };
    });

    registrations.filter(r => r.status === 'Confirmado' && r.results).forEach(reg => {
      const stats = statsMap[reg.academyId];
      if (!stats) return;

      reg.results?.forEach(res => {
        if (res.place === 1) {
          stats.points += 10;
          stats.gold += 1;
        } else if (res.place === 2) {
          stats.points += 5;
          stats.silver += 1;
        } else if (res.place === 3) {
          stats.points += 3;
          stats.bronze += 1;
        }
      });
    });

    return Object.values(statsMap)
      .filter(s => s.points > 0 || s.gold > 0 || s.silver > 0 || s.bronze > 0)
      .sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.gold !== a.gold) return b.gold - a.gold;
        if (b.silver !== a.silver) return b.silver - a.silver;
        if (b.bronze !== a.bronze) return b.bronze - a.bronze;
        return a.name.localeCompare(b.name);
      });
  }, [academies, registrations]);

  const top3 = ranking.slice(0, 3);
  const others = ranking.slice(3);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header>
        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Ranking Geral</h2>
        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Classificação Oficial de Academias (Ouro: 10, Prata: 5, Bronze: 3)</p>
      </header>

      {ranking.length === 0 ? (
        <Card className="py-32 text-center border-white/5 bg-white/[0.02]">
          <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-white/5 group">
            <Trophy className="w-10 h-10 text-stone-700 group-hover:text-amber-500 group-hover:scale-110 transition-all" />
          </div>
          <p className="text-[10px] text-stone-600 font-black uppercase tracking-[0.2em]">Nenhum resultado registrado ainda</p>
        </Card>
      ) : (
        <div className="space-y-12">
          {/* Podium */}
          {top3.length > 0 && (
            <div className="flex flex-col md:flex-row items-end justify-center gap-4 md:gap-8 pt-12 pb-8 px-4 h-auto md:h-96">
              {/* 2nd Place */}
              {top3[1] && (
                <motion.div 
                  initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                  className="w-full md:w-64 flex flex-col items-center order-2 md:order-1"
                >
                  <div className="w-full bg-gradient-to-t from-slate-400/20 to-slate-300/10 border-t-4 border-slate-300 rounded-t-2xl p-6 text-center shadow-[0_-10px_40px_rgba(203,213,225,0.1)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                    <Medal className="w-12 h-12 text-slate-300 mx-auto mb-4 drop-shadow-lg" />
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">2º Lugar</p>
                    <p className="text-lg font-black text-white uppercase tracking-tight leading-tight truncate px-2">{top3[1].name}</p>
                    <p className="text-3xl font-black text-slate-300 mt-4 italic">{top3[1].points} <span className="text-xs">pts</span></p>
                  </div>
                </motion.div>
              )}

              {/* 1st Place */}
              <motion.div 
                initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
                className="w-full md:w-72 flex flex-col items-center order-1 md:order-2 z-10 md:-mb-8"
              >
                <div className="w-full bg-gradient-to-t from-amber-500/30 to-amber-400/20 border-t-4 border-amber-400 rounded-t-2xl p-8 text-center shadow-[0_-20px_60px_rgba(251,191,36,0.2)] relative overflow-hidden">
                  <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                  <div className="absolute top-0 right-0 w-32 h-32 bg-white/20 blur-3xl rounded-full" />
                  <Trophy className="w-16 h-16 text-amber-400 mx-auto mb-4 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
                  <p className="text-xs font-black text-amber-500 uppercase tracking-[0.2em] mb-2">Grande Campeã</p>
                  <p className="text-xl font-black text-white uppercase tracking-tight leading-tight truncate px-2">{top3[0].name}</p>
                  <p className="text-5xl font-black text-amber-400 mt-4 italic drop-shadow-lg">{top3[0].points} <span className="text-sm">pts</span></p>
                </div>
              </motion.div>

              {/* 3rd Place */}
              {top3[2] && (
                <motion.div 
                  initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.0 }}
                  className="w-full md:w-64 flex flex-col items-center order-3 md:order-3 md:mt-16"
                >
                  <div className="w-full bg-gradient-to-t from-amber-700/20 to-amber-600/10 border-t-4 border-amber-700 rounded-t-2xl p-6 text-center shadow-[0_-10px_40px_rgba(180,83,9,0.1)] relative overflow-hidden">
                    <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 mix-blend-overlay" />
                    <Award className="w-10 h-10 text-amber-700 mx-auto mb-4 drop-shadow-lg" />
                    <p className="text-[10px] font-black text-amber-700/80 uppercase tracking-widest mb-2">3º Lugar</p>
                    <p className="text-lg font-black text-white uppercase tracking-tight leading-tight truncate px-2">{top3[2].name}</p>
                    <p className="text-3xl font-black text-amber-600 mt-4 italic">{top3[2].points} <span className="text-xs">pts</span></p>
                  </div>
                </motion.div>
              )}
            </div>
          )}

          {/* Table */}
          <Card className="border-white/5 bg-white/[0.02] p-0 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[600px]">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pos</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Academia</th>
                    <th className="px-8 py-5 text-[10px] font-black text-amber-500 uppercase tracking-[0.2em] text-center">Ouro (10)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-slate-300 uppercase tracking-[0.2em] text-center">Prata (5)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-amber-700 uppercase tracking-[0.2em] text-center">Bronze (3)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-white uppercase tracking-[0.2em] text-right">Pontos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {ranking.map((stats, idx) => (
                    <tr key={stats.academyId} className="hover:bg-white/[0.03] transition-colors group/row">
                      <td className="px-8 py-4">
                        <span className="text-sm font-black text-stone-500 italic">{idx + 1}º</span>
                      </td>
                      <td className="px-8 py-4">
                        <p className="font-black text-white uppercase tracking-tight">{stats.name}</p>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-500/10 text-amber-500 font-black border border-amber-500/20 text-sm">
                          {stats.gold}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-300/10 text-slate-300 font-black border border-slate-300/20 text-sm">
                          {stats.silver}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-amber-700/10 text-amber-700 font-black border border-amber-700/20 text-sm">
                          {stats.bronze}
                        </span>
                      </td>
                      <td className="px-8 py-4 text-right">
                        <p className="font-black text-white text-xl italic tracking-tighter">
                          {stats.points}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </motion.div>
  );
}
