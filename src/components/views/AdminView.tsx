import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { CreditCard, FileText, Trash2 } from 'lucide-react';
import { doc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, calculatePrice, calculateBoards } from '../../utils';
import { Registration, Athlete, Academy, UserProfile, OperationType } from '../../types';
import { User } from 'firebase/auth';
import { Button, Card, cn } from '../ui';
import { CompetitionView } from './CompetitionView';

export function AdminView({ profile, user, registrations, athletes, academies, receipts, settings, onViewReceipt, key }: { profile: UserProfile | null; user: User | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; settings: any; onViewReceipt: (data: string) => void; key?: string }) {
  const [adminTab, setAdminTab] = useState<'finance' | 'competition'>('finance');

  const academyStats = useMemo(() => academies.map(academy => {
    const academyRegs = registrations.filter(r => r.academyId === academy.id);
    const totalValue = academyRegs.reduce((sum, r) => sum + calculatePrice(r.categories, academy.name), 0);
    const paidValue = academyRegs.filter(r => r.paymentStatus === 'Pago').reduce((sum, r) => sum + calculatePrice(r.categories, academy.name), 0);
    const pendingValue = totalValue - paidValue;
    const totalBoards = academyRegs.filter(r => r.status === 'Confirmado').reduce((sum, r) => sum + calculateBoards(r.categories), 0);
    const totalConf = academyRegs.filter(r => r.status === 'Confirmado').length;
    
    return {
      ...academy,
      totalRegs: academyRegs.length,
      totalValue,
      paidValue,
      pendingValue,
      totalBoards,
      totalConf,
      pendingRegs: academyRegs.filter(r => r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise')
    };
  }).filter(a => a.totalRegs > 0).sort((a, b) => b.totalConf - a.totalConf), [academies, registrations, settings]);

  const handleApproveAll = async (academyId: string) => {
    if (!window.confirm('Aprovar todos os pagamentos pendentes desta academia?')) return;
    
    const pendingRegs = registrations.filter(r => r.academyId === academyId && (r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise'));
    
    try {
      await Promise.all(pendingRegs.map(reg => 
        updateDoc(doc(db, 'registrations', reg.id), {
          paymentStatus: 'Pago',
          status: 'Confirmado'
        })
      ));

      const academyReceipts = receipts.filter(r => r.academyId === academyId);
      await Promise.all(academyReceipts.map(receipt => 
        deleteDoc(doc(db, 'receipts', receipt.id))
      ));

      alert('Pagamentos aprovados com sucesso!');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  const handleRejectReceipt = async (receiptId: string, academyId: string) => {
    if (!window.confirm('Rejeitar este comprovante? As inscrições voltarão para Pendente.')) return;
    
    const pendingRegs = registrations.filter(r => r.academyId === academyId && r.paymentStatus === 'Em Análise');
    
    try {
      await Promise.all(pendingRegs.map(reg => 
        updateDoc(doc(db, 'registrations', reg.id), {
          paymentStatus: 'Pendente'
        })
      ));
      
      await deleteDoc(doc(db, 'receipts', receiptId));
      alert('Comprovante rejeitado.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'receipts');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Administração</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gestão financeira e operacional do evento</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5">
          <button 
            onClick={() => setAdminTab('finance')}
            className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", adminTab === 'finance' ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white")}
          >
            Financeiro
          </button>
          <button 
            onClick={() => setAdminTab('competition')}
            className={cn("px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all", adminTab === 'competition' ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white")}
          >
            Competição
          </button>
        </div>
      </header>

      {adminTab === 'finance' ? (
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-8 border-white/5 bg-gradient-to-br from-emerald-600/10 to-transparent">
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Total Arrecadado</p>
              <p className="text-4xl font-black text-white tracking-tighter italic">R$ {academyStats.reduce((sum, a) => sum + a.paidValue, 0).toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-gradient-to-br from-amber-600/10 to-transparent">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Total Pendente</p>
              <p className="text-4xl font-black text-white tracking-tighter italic">R$ {academyStats.reduce((sum, a) => sum + a.pendingValue, 0).toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-gradient-to-br from-orange-600/10 to-transparent">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2">Total de Tábuas (Confirmadas)</p>
              <p className="text-4xl font-black text-white tracking-tighter italic">{academyStats.reduce((sum, a) => sum + a.totalBoards, 0)}</p>
            </Card>
          </div>

          <Card className="border-white/5 bg-white/[0.02] p-8 flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-5">
              <div className="p-4 bg-blue-600/10 rounded-2xl border border-blue-500/20">
                <CreditCard className="w-8 h-8 text-blue-500" />
              </div>
              <div>
                <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Mercado Pago</h4>
                <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Botão de pagamento para academias</p>
              </div>
            </div>
            <button
              onClick={async () => {
                try {
                  await setDoc(doc(db, 'settings', 'payment'), {
                    mercadoPagoEnabled: !settings.mercadoPagoEnabled
                  }, { merge: true });
                } catch (e) {
                  alert('Erro ao atualizar configuração.');
                }
              }}
              className={cn(
                "w-16 h-8 rounded-full transition-all relative p-1",
                settings.mercadoPagoEnabled ? 'bg-red-600' : 'bg-stone-800'
              )}
            >
              <div className={cn(
                "w-6 h-6 rounded-full bg-white transition-all shadow-lg",
                settings.mercadoPagoEnabled ? 'ml-8' : 'ml-0'
              )} />
            </button>
          </Card>

          <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
            <div className="p-8 border-b border-white/5 bg-white/5">
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Resumo por Academia</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-white/5 border-b border-white/5">
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Academia</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Responsável</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Atletas</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pendente</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pago</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Tábuas</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {academyStats.map(stat => {
                    const academyReceipts = receipts.filter(r => r.academyId === stat.id);
                    return (
                      <tr key={stat.id} className="hover:bg-white/[0.03] transition-colors group/row">
                        <td className="px-8 py-6">
                           <p className="font-black text-white uppercase tracking-tight">{stat.name}</p>
                           <p className="text-[9px] text-stone-500 font-bold uppercase tracking-widest mt-1 italic">{stat.contact}</p>
                        </td>
                        <td className="px-8 py-6">
                           <p className="text-xs font-bold text-stone-300 uppercase tracking-tight">{stat.coach}</p>
                        </td>
                        <td className="px-8 py-6">
                           <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-white">
                             {stat.totalRegs}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-amber-500 font-black tabular-nums tracking-tighter">
                           R$ {stat.pendingValue.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-8 py-6 text-emerald-500 font-black tabular-nums tracking-tighter">
                           R$ {stat.paidValue.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-8 py-6">
                           <span className={cn("px-2.5 py-1 rounded-lg text-[10px] font-black", stat.totalBoards > 0 ? "bg-orange-500/10 border border-orange-500/20 text-orange-500" : "bg-white/5 border border-white/10 text-stone-500")}>
                             {stat.totalBoards}
                           </span>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex justify-center gap-3">
                             {academyReceipts.length > 0 && (
                               <div className="flex gap-2">
                                 <Button 
                                   variant="ghost" 
                                   className="p-3 bg-blue-600/10 hover:bg-blue-600/20 text-blue-500 rounded-xl"
                                   onClick={() => onViewReceipt(academyReceipts[0].receiptData)}
                                 >
                                    <FileText className="w-4 h-4" />
                                 </Button>
                                 <Button 
                                   variant="ghost" 
                                   className="p-3 bg-red-600/10 hover:bg-red-600/20 text-red-500 rounded-xl"
                                   onClick={() => handleRejectReceipt(academyReceipts[0].id, stat.id)}
                                 >
                                    <Trash2 className="w-4 h-4" />
                                 </Button>
                               </div>
                             )}
                             {stat.pendingValue > 0 && (
                               <Button 
                                 variant="success" 
                                 className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-emerald-600/20"
                                 onClick={() => handleApproveAll(stat.id)}
                               >
                                 Liberar Lote
                               </Button>
                             )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        <CompetitionView registrations={registrations} athletes={athletes} academies={academies} user={user!} profile={profile} />
      )}
    </motion.div>
  );
}
