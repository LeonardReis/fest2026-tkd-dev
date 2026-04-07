import React, { useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  School, Users, Trophy, Calendar, Shield, CheckCircle2,
  Clock, Swords, BookOpen, Coffee, Star, AlertCircle,
  TrendingUp, Zap, Target, ChevronRight, Medal
} from 'lucide-react';
import { UserProfile, Academy, Registration, Athlete } from '../../types';
import { Card, cn } from '../ui';
import { SCHEDULE, getAgeCategory, calculatePrice, calculateBoards } from '../../utils';

/* ─── Props ──────────────────────────────────────────────────────────────────── */
interface DashboardProps {
  stats: { academies: number; athletes: number; registrations: number };
  profile: UserProfile | null;
  settings?: any;
  academies: Academy[];
  registrations: Registration[];
  athletes: Athlete[];
}

/* ─── Main ───────────────────────────────────────────────────────────────────── */
export function DashboardView({ stats, profile, settings, academies, registrations, athletes }: DashboardProps) {
  const isAdmin = profile?.role === 'admin';

  /* ── Ranking global ─────────────────────────────────────────── */
  const ranking = React.useMemo(() => {
    const map: Record<string, any> = {};
    academies.forEach(a => {
      map[a.id] = { academyId: a.id, name: a.name, points: 0, gold: 0, silver: 0, bronze: 0 };
    });
    registrations.filter(r => r.status === 'Confirmado' && r.results).forEach(reg => {
      const st = map[reg.academyId];
      if (!st) return;
      reg.results?.forEach(res => {
        if (res.place === 1)      { st.points += 10; st.gold   += 1; }
        else if (res.place === 2) { st.points += 7;  st.silver += 1; }
        else if (res.place === 3) { st.points += 5;  st.bronze += 1; }
      });
    });
    return Object.values(map).sort((a, b) => b.points - a.points);
  }, [academies, registrations]);

  const scheduleStyle: Record<string, { icon: React.ReactNode; color: string; bg: string }> = {
    ceremony: { icon: <Star  className="w-3.5 h-3.5" />, color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
    fight:    { icon: <Swords className="w-3.5 h-3.5" />, color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/20'   },
    poomsae:  { icon: <BookOpen className="w-3.5 h-3.5" />, color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
    break:    { icon: <Coffee className="w-3.5 h-3.5" />, color: 'text-stone-400', bg: 'bg-stone-700/30 border-stone-600/20' },
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">

      {isAdmin
        ? <AdminDashboard stats={stats} academies={academies} registrations={registrations} athletes={athletes} ranking={ranking} />
        : <AcademyDashboard profile={profile} academies={academies} registrations={registrations} athletes={athletes} ranking={ranking} />
      }

      {/* Cronograma — visível para todos */}
      <ScheduleCard scheduleStyle={scheduleStyle} />

      {/* Informações do Festival — visível para todos */}
      <Card className="p-8 bg-stone-900/60 border-red-600/20 relative overflow-hidden group">
        <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl group-hover:bg-red-600/10 transition-colors" />
        <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-2">Informações do Festival</h3>
        <p className="text-red-500 text-[10px] font-black uppercase tracking-[0.2em] mb-8">3º Festival União Lopes 2026</p>
        <div className="space-y-6">
          <div className="flex items-center gap-4 group/item">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-red-500/50 transition-colors">
              <Calendar className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <p className="text-sm font-black text-white uppercase tracking-tight">12 de Abril, 2026</p>
              <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Domingo • 08:00 às 19:30</p>
            </div>
          </div>
          <div className="flex items-center gap-4 group/item">
            <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover/item:border-blue-500/50 transition-colors">
              <Shield className="text-blue-500 w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-black text-white uppercase tracking-tight">C. E. Cívico-Militar Alfredo Chaves</p>
              <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest">Colombo, PR • Rio Verde</p>
            </div>
          </div>
        </div>
      </Card>

      <TributeCard settings={settings} />
    </motion.div>
  );
}

/* ─── Admin Dashboard ────────────────────────────────────────────────────────── */
function AdminDashboard({ stats, academies, registrations, athletes, ranking }: any) {
  const confirmed   = registrations.filter((r: Registration) => r.status === 'Confirmado').length;
  const inAnalysis  = registrations.filter((r: Registration) => r.paymentStatus === 'Em Análise').length;
  const pending     = registrations.filter((r: Registration) => r.paymentStatus === 'Pendente').length;
  const totalRevenue = registrations
    .filter((r: Registration) => r.paymentStatus === 'Pago' || r.paymentStatus === 'Em Análise')
    .reduce((sum: number, r: Registration) => {
      const academy = academies.find((a: Academy) => a.id === r.academyId);
      return sum + calculatePrice(r.categories, academy?.name);
    }, 0);
  const totalBoards = registrations
    .filter((r: Registration) => r.status === 'Confirmado')
    .reduce((sum: number, r: Registration) => sum + calculateBoards(r.categories), 0);
  const confirmRate = stats.registrations > 0 ? Math.round((confirmed / stats.registrations) * 100) : 0;

  const sortedAcademies = useMemo(() => {
    return [...academies].sort((a, b) => {
      const aConf = registrations.filter(r => r.academyId === a.id && r.status === 'Confirmado').length;
      const bConf = registrations.filter(r => r.academyId === b.id && r.status === 'Confirmado').length;
      return bConf - aConf;
    });
  }, [academies, registrations]);

  return (
    <div className="space-y-8">
      {/* KPIs Globais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Academias" value={stats.academies} icon={<School className="w-5 h-5" />} color="blue" />
        <KpiCard label="Atletas" value={stats.athletes} icon={<Users className="w-5 h-5" />} color="emerald" />
        <KpiCard label="Confirmados" value={confirmed} icon={<CheckCircle2 className="w-5 h-5" />} color="green" />
        <KpiCard label="Total Tábuas" value={totalBoards} icon={<Target className="w-5 h-5" />} color="orange" />
      </div>

      {/* Barra de progresso + receita */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6 border-white/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Taxa de Confirmação</p>
            <span className="text-2xl font-black text-white tracking-tighter">{confirmRate}%</span>
          </div>
          <ProgressBar value={confirmRate} color="emerald" />
          <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest mt-3">
            {confirmed} confirmados de {stats.registrations} inscrições
          </p>
          {pending > 0 && (
            <div className="mt-4 flex items-center gap-2 text-amber-500">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[9px] font-black uppercase tracking-widest">{pending} aguardando pagamento</p>
            </div>
          )}
        </Card>

        <Card className="p-6 border-white/5">
          <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-1">Receita Prevista</p>
          <p className="text-3xl font-black text-emerald-400 tracking-tighter italic">
            R$ {totalRevenue.toFixed(2).replace('.', ',')}
          </p>
          <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest mt-2">Confirmados + Em Análise</p>
          <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest">Inscrições</p>
              <p className="text-xl font-black text-white">{stats.registrations}</p>
            </div>
            <div>
              <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest">Pendentes</p>
              <p className={cn("text-xl font-black", pending > 0 ? "text-amber-400" : "text-white")}>{pending}</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Tabela por Academia + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <Card className="p-0 border-white/5 bg-white/[0.02] overflow-hidden lg:col-span-2">
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between">
            <h3 className="text-sm font-black text-white italic uppercase tracking-tighter">Status por Academia</h3>
            <TrendingUp className="w-4 h-4 text-stone-500" />
          </div>
          <div className="divide-y divide-white/5">
            {sortedAcademies.map((academy: Academy) => {
              const acRegs  = registrations.filter((r: Registration) => r.academyId === academy.id);
              const acConf  = acRegs.filter((r: Registration) => r.status === 'Confirmado').length;
              const acAths  = athletes.filter((a: Athlete) => a.academyId === academy.id).length;
              const acRev   = acRegs.filter((r: Registration) => r.paymentStatus === 'Pago').reduce((s: number, r: Registration) => s + calculatePrice(r.categories, academy.name), 0);
              return (
                <div key={academy.id} className="flex items-center gap-4 px-6 py-4 hover:bg-white/[0.03] transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-black text-white uppercase tracking-tight truncate">{academy.name}</p>
                    <p className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mt-0.5">{academy.master}</p>
                  </div>
                  <div className="flex items-center gap-6 shrink-0">
                    <Chip label="Atletas" value={acAths} />
                    <Chip label="Inscritos" value={acRegs.length} />
                    <Chip label="Confirmados" value={acConf} highlight={acConf > 0} />
                    <Chip label="Tábuas" value={acRegs.filter(r => r.status === 'Confirmado').reduce((s, r) => s + calculateBoards(r.categories), 0)} />
                    <span className="text-[10px] font-black text-emerald-400 w-20 text-right">
                      {acRev > 0 ? `R$\u00a0${acRev.toFixed(0)}` : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
            {academies.length === 0 && (
              <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest text-center py-10">Nenhuma academia cadastrada</p>
            )}
          </div>
        </Card>

        {/* Ranking Top 5 (admin) */}
        <RankingCard ranking={ranking} limit={5} />
      </div>
    </div>
  );
}

/* ─── Academy Dashboard ──────────────────────────────────────────────────────── */
function AcademyDashboard({ profile, academies, registrations, athletes, ranking }: any) {
  const myAcademy   = academies.find((a: Academy) => a.id === profile?.academyId);
  const myAthletes  = athletes.filter((a: Athlete) => a.academyId === profile?.academyId);
  const myRegs      = registrations.filter((r: Registration) => r.academyId === profile?.academyId);
  const myConfirmed = myRegs.filter((r: Registration) => r.status === 'Confirmado').length;
  const myPending   = myRegs.filter((r: Registration) => r.paymentStatus === 'Pendente').length;
  const myBoards    = myRegs.filter((r: Registration) => r.status === 'Confirmado').reduce((sum, r) => sum + calculateBoards(r.categories), 0);

  const inscribedAthleteIds = new Set(myRegs.map((r: Registration) => r.athleteId));
  const uninscribed = myAthletes.filter((a: Athlete) => !inscribedAthleteIds.has(a.id));
  const completeness = myAthletes.length > 0 ? Math.round((myRegs.length / myAthletes.length) * 100) : 0;

  const myRankPosition = ranking.findIndex((r: any) => r.academyId === profile?.academyId);
  const myRankData     = myRankPosition >= 0 ? ranking[myRankPosition] : null;
  const nextRankData   = myRankPosition > 0 ? ranking[myRankPosition - 1] : null;

  return (
    <div className="space-y-8">
      {/* Header da Academia */}
      {myAcademy && (
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600 to-red-800 flex items-center justify-center shadow-2xl">
            <School className="w-8 h-8 text-white" />
          </div>
          <div>
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Minha Academia</p>
            <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">{myAcademy.name}</h2>
            <p className="text-[10px] text-red-500 font-black uppercase tracking-widest">Mestre {myAcademy.master}</p>
          </div>
        </div>
      )}

      {/* KPIs da academia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Atletas" value={myAthletes.length} icon={<Users className="w-5 h-5" />} color="blue" />
        <KpiCard label="Inscritos" value={myRegs.length} icon={<Target className="w-5 h-5" />} color="amber" />
        <KpiCard label="Confirmados" value={myConfirmed} icon={<CheckCircle2 className="w-5 h-5" />} color="green" />
        <KpiCard label="Minhas Tábuas" value={myBoards} icon={<Target className="w-5 h-5" />} color="orange" />
      </div>

      {/* Progresso + Ranking */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Índice de participação */}
        <Card className="p-6 border-white/5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Participação da Academia</p>
            <span className={cn("text-2xl font-black tracking-tighter", completeness === 100 ? "text-emerald-400" : "text-white")}>{completeness}%</span>
          </div>
          <ProgressBar value={completeness} color={completeness === 100 ? 'emerald' : 'red'} />
          <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest mt-3">
            {myRegs.length} de {myAthletes.length} atletas inscritos
          </p>
          {completeness === 100 && (
            <div className="mt-4 flex items-center gap-2 text-emerald-400">
              <Zap className="w-3.5 h-3.5 shrink-0" />
              <p className="text-[9px] font-black uppercase tracking-widest">Todos os atletas inscritos! 🎉</p>
            </div>
          )}
        </Card>

        {/* Posição no Ranking */}
        <Card className={cn("p-6 border relative overflow-hidden", myRankData ? "border-amber-500/20 bg-amber-500/5" : "border-white/5")}>
          {myRankData && <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl -mr-8 -mt-8" />}
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Minha Posição no Ranking</p>
              <Medal className="w-4 h-4 text-amber-500" />
            </div>
            {myRankData && myRankData.points > 0 ? (
              <>
                <div className="flex items-end gap-3 mb-3">
                  <span className={cn(
                    "text-5xl font-black italic tracking-tighter",
                    myRankPosition === 0 ? "text-amber-400" : myRankPosition === 1 ? "text-slate-300" : myRankPosition === 2 ? "text-amber-700" : "text-white"
                  )}>
                    {myRankPosition + 1}º
                  </span>
                  <span className="text-stone-500 text-sm font-bold pb-2">lugar</span>
                </div>
                <div className="flex gap-3 text-[9px] font-black uppercase tracking-widest">
                  {myRankData.gold   > 0 && <span className="text-amber-400">🥇 {myRankData.gold}</span>}
                  {myRankData.silver > 0 && <span className="text-slate-300">🥈 {myRankData.silver}</span>}
                  {myRankData.bronze > 0 && <span className="text-amber-700">🥉 {myRankData.bronze}</span>}
                  <span className="text-stone-400 ml-auto">{myRankData.points} pts</span>
                </div>
                {nextRankData && (
                  <div className="mt-4 pt-4 border-t border-white/5 flex items-center gap-2 text-[9px] text-stone-400 font-bold uppercase tracking-widest">
                    <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
                    Faltam <span className="text-emerald-400 font-black">{nextRankData.points - myRankData.points} pts</span> para subir para {myRankPosition}º
                  </div>
                )}
                {myRankPosition === 0 && (
                  <p className="mt-4 text-[9px] text-amber-400 font-black uppercase tracking-widest">🏆 Você está em 1º! Mantenha a liderança.</p>
                )}
              </>
            ) : (
              <div className="py-4">
                <p className="text-[10px] text-stone-600 font-black uppercase tracking-widest mb-1 italic">Aguardando Resultado</p>
                <div className="flex items-center gap-2">
                   <Clock className="w-3 h-3 text-stone-700" />
                   <p className="text-[9px] text-stone-700 font-bold uppercase tracking-widest">Compita para pontuar no ranking</p>
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Atletas sem inscrição */}
      {uninscribed.length > 0 && (
        <Card className="p-0 border-orange-500/20 bg-orange-500/5 overflow-hidden">
          <div className="px-6 py-4 border-b border-orange-500/20 flex items-center gap-3">
            <AlertCircle className="w-4 h-4 text-orange-400 shrink-0" />
            <p className="text-xs font-black text-orange-400 uppercase tracking-widest">
              {uninscribed.length} Atleta{uninscribed.length > 1 ? 's' : ''} sem Inscrição
            </p>
          </div>
          <div className="divide-y divide-white/5">
            {uninscribed.map((athlete: Athlete) => {
              const ageCat = getAgeCategory(athlete.birthYear, athlete.belt);
              return (
                <div key={athlete.id} className="flex items-center justify-between px-6 py-3 hover:bg-white/[0.02] transition-colors group">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center border border-white/5 text-xs font-black text-white">
                      {athlete.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-black text-white uppercase tracking-tight">{athlete.name}</p>
                      <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest">{ageCat} • {athlete.belt}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[9px] text-orange-400 font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                    Inscrever <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Próximos Passos — só aparece se faltar alguma ação */}
      {(myAthletes.length === 0 || myRegs.length === 0 || myConfirmed === 0) && (
        <Card className="p-8 border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent">
          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter mb-6">Próximos Passos</h3>
          <div className="space-y-6">
            <StepItem done={true}            label="Cadastrar sua Academia" description="Academia configurada com sucesso." />
            <StepItem done={myAthletes.length > 0}  label="Cadastrar Atletas"    description="Adicione os alunos no menu 'Atletas'." />
            <StepItem done={myRegs.length > 0}      label="Realizar Inscrições"  description="Inscreva os atletas nas modalidades." />
            <StepItem done={myConfirmed > 0}        label="Confirmar Pagamento"  description="Envie o comprovante para confirmar." />
          </div>
        </Card>
      )}

      {/* Ranking Top 3 (visível para todos) */}
      <RankingCard ranking={ranking} limit={3} />
    </div>
  );
}

/* ─── Cronograma ─────────────────────────────────────────────────────────────── */
function ScheduleCard({ scheduleStyle }: { scheduleStyle: any }) {
  return (
    <Card className="p-8 border-white/5 bg-white/[0.02]">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-2xl bg-red-600/10 border border-red-500/20 flex items-center justify-center">
          <Clock className="w-5 h-5 text-red-500" />
        </div>
        <div>
          <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Cronograma do Dia</h3>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">12 de Abril de 2026</p>
        </div>
      </div>
      <div className="relative">
        <div className="absolute left-[88px] top-0 bottom-0 w-px bg-white/5 hidden md:block" />
        <div className="space-y-3">
          {SCHEDULE.map((item, i) => {
            const style = scheduleStyle[item.type];
            return (
              <div key={i} className="flex gap-4 items-start group/row">
                <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest shrink-0 w-20 pt-3 text-right">{item.time}</span>
                <div className="relative hidden md:flex items-center justify-center shrink-0 mt-2.5">
                  <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center z-10", style.bg, style.color)}>
                    {style.icon}
                  </div>
                </div>
                <div className={cn("flex-1 rounded-2xl border px-5 py-3 transition-all group-hover/row:brightness-110", style.bg)}>
                  <div className="flex items-start justify-between gap-4">
                    <p className={cn("text-xs font-black uppercase tracking-tight", style.color)}>{item.activity}</p>
                    {item.location && (
                      <span className="shrink-0 text-[9px] font-black text-stone-500 uppercase tracking-widest bg-black/30 px-2 py-0.5 rounded-md">{item.location}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

/* ─── Ranking Card ───────────────────────────────────────────────────────────── */
function RankingCard({ ranking, limit }: { ranking: any[]; limit: number }) {
  const topN = ranking.slice(0, limit);
  const placeStyle = (idx: number) =>
    idx === 0 ? 'bg-amber-500 text-white' :
    idx === 1 ? 'bg-slate-400 text-white' :
    idx === 2 ? 'bg-amber-700 text-white' : 'bg-stone-800 text-stone-400';

  return (
    <Card className="p-8 border-white/5 bg-white/[0.02]">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-black text-white italic uppercase tracking-tighter">Ranking Geral</h3>
        <Trophy className="w-4 h-4 text-amber-500" />
      </div>
      <div className="space-y-3">
        {topN.length === 0 ? (
          <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest text-center py-8">Nenhum resultado ainda</p>
        ) : (
          topN.map((res, idx) => (
            <div key={res.academyId} className="p-3 rounded-xl bg-white/5 border border-white/5 space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={cn("w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black", placeStyle(idx))}>
                    {idx + 1}
                  </span>
                  <p className="text-xs font-black text-white uppercase truncate max-w-[130px]">{res.name}</p>
                </div>
                <p className="text-sm font-black text-amber-500 italic">{res.points} <span className="text-[10px] opacity-50">pts</span></p>
              </div>
              {(res.gold > 0 || res.silver > 0 || res.bronze > 0) && (
                <div className="flex gap-2 pl-9">
                  {res.gold   > 0 && <span className="text-[9px] font-black text-amber-400">🥇 {res.gold}</span>}
                  {res.silver > 0 && <span className="text-[9px] font-black text-slate-400">🥈 {res.silver}</span>}
                  {res.bronze > 0 && <span className="text-[9px] font-black text-amber-700">🥉 {res.bronze}</span>}
                </div>
              )}
            </div>
          ))
        )}
        <p className="text-[8px] text-stone-600 font-bold uppercase tracking-[0.2em] text-center pt-2">
          {limit === 3 ? 'Top 3 • Visível para todos' : `Top ${limit} • Visão do Administrador`}
        </p>
      </div>
    </Card>
  );
}

/* ─── Shared Components ──────────────────────────────────────────────────────── */
function KpiCard({ label, value, icon, color, badge }: { label: string; value: number; icon: React.ReactNode; color: string; badge?: string }) {
  const colors: Record<string, string> = {
    blue: 'from-blue-600 to-blue-400',
    emerald: 'from-emerald-600 to-emerald-400',
    green: 'from-green-600 to-green-400',
    amber: 'from-amber-600 to-amber-400',
    orange: 'from-orange-600 to-orange-400',
    stone: 'from-stone-600 to-stone-400',
  };
  return (
    <Card className="p-5 flex items-center gap-4 group hover:border-white/10 transition-colors relative overflow-hidden">
      {badge && (
        <span className="absolute top-2 right-2 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center text-[8px] font-black text-white">{badge}</span>
      )}
      <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg bg-gradient-to-br shrink-0', colors[color] || colors.stone)}>
        {icon}
      </div>
      <div>
        <p className="text-[9px] font-black text-stone-500 uppercase tracking-[0.2em]">{label}</p>
        <p className="text-3xl font-black text-white tracking-tighter">{value}</p>
      </div>
    </Card>
  );
}

function ProgressBar({ value, color }: { value: number; color: string }) {
  const barColor = color === 'emerald' ? 'bg-emerald-500' : color === 'red' ? 'bg-red-500' : 'bg-amber-500';
  return (
    <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
      <motion.div
        className={cn("h-full rounded-full", barColor)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(value, 100)}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
      />
    </div>
  );
}

function Chip({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="text-center hidden sm:block">
      <p className="text-[8px] font-bold text-stone-600 uppercase tracking-widest">{label}</p>
      <p className={cn("text-sm font-black", highlight ? "text-emerald-400" : "text-white")}>{value}</p>
    </div>
  );
}

export function TributeCard({ settings }: { settings?: any }) {
  const tributeImage = settings?.tributeImage || "/tribute.jpg";
  return (
    <Card className="p-8 bg-black/40 border-white/5 relative overflow-hidden group">
      <div className="absolute top-0 right-0 w-64 h-64 bg-red-600/10 rounded-full blur-[100px] -mr-32 -mt-32 group-hover:bg-red-600/20 transition-all duration-700" />
      <div className="relative z-10 flex flex-col md:flex-row gap-8 items-center md:items-start">
        <div className="relative">
          <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl animate-pulse" />
          <div className="w-32 h-32 shrink-0 rounded-full overflow-hidden border-2 border-red-500/50 shadow-[0_0_30px_rgba(220,38,38,0.3)] relative z-10">
            <img src={tributeImage} alt="Homenagem" className="w-full h-full object-cover scale-110 group-hover:scale-125 transition-transform duration-700" />
          </div>
        </div>
        <div className="space-y-4 text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-600/10 border border-red-500/20 text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">
            <Trophy className="w-3 h-3" />
            Homenagem Especial
          </div>
          <h3 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none">Mestre Chuck Norris</h3>
          <p className="text-stone-400 text-sm font-bold uppercase tracking-[0.1em]">O Legado Indomável • Embaixador Global</p>
          <p className="text-stone-300 text-sm leading-relaxed max-w-2xl font-medium opacity-80">
            "O Taekwondo não é apenas luta, é o desenvolvimento da mente e do espírito." Homenageamos aquele que elevou nossa arte ao cenário mundial com honra, disciplina e o verdadeiro espírito marcial.
          </p>
        </div>
      </div>
    </Card>
  );
}

function StepItem({ done, label, description }: { done: boolean; label: string; description: string }) {
  return (
    <div className="flex gap-5 group/step">
      <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-300',
        done ? 'bg-emerald-500 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-stone-600 border border-white/10 group-hover/step:border-white/20'
      )}>
        {done ? <CheckCircle2 className="w-5 h-5" /> : <div className="w-2 h-2 rounded-full bg-stone-700" />}
      </div>
      <div>
        <p className={cn('text-sm font-black uppercase tracking-tight transition-colors', done ? 'text-stone-500 line-through' : 'text-white')}>{label}</p>
        <p className="text-xs text-stone-500 font-bold uppercase tracking-widest mt-1">{description}</p>
      </div>
    </div>
  );
}
