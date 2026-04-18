import React, { useState, useMemo } from 'react';
import { motion } from 'motion/react';
import { CreditCard, FileText, Trash2 } from 'lucide-react';
import { doc, setDoc, updateDoc, deleteDoc, collection, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, calculatePrice, calculateCashback, calculateBoards } from '../../utils';
import { Registration, Athlete, Academy, UserProfile, OperationType, Transaction } from '../../types';
import { User } from 'firebase/auth';
import { Button, Card, cn } from '../ui';
import { CompetitionView } from './CompetitionView';
import { FinancialLedger } from './FinancialLedger';

export function AdminView({ profile, user, registrations, athletes, academies, receipts, transactions, settings, onViewReceipt, key }: { profile: UserProfile | null; user: User | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; transactions: Transaction[]; settings: any; onViewReceipt: (data: string) => void; key?: string }) {
  const [adminTab, setAdminTab] = useState<'finance' | 'ledger'>('finance');

  const academyStats = useMemo(() => academies.map(academy => {
    const academyRegs = registrations.filter(r => r.academyId === academy.id);
    const totalGross = academyRegs.reduce((sum, r) => sum + calculatePrice(r.categories, academy.name), 0);
    const totalCashback = academyRegs.reduce((sum, r) => sum + calculateCashback(r.categories, academy.name), 0);
    const totalNet = totalGross - totalCashback;

    const paidGross = academyRegs.filter(r => r.paymentStatus === 'Pago').reduce((sum, r) => sum + calculatePrice(r.categories, academy.name), 0);
    const paidCashback = academyRegs.filter(r => r.paymentStatus === 'Pago').reduce((sum, r) => sum + calculateCashback(r.categories, academy.name), 0);
    const paidNet = paidGross - paidCashback;
    
    const academyTransactions = transactions.filter(t => t.academyId === academy.id);
    
    // Créditos da Academia: A academia forneceu algo ao evento (Despesa para o Evento)
    const academyCredits = academyTransactions.filter(t => t.type === 'EXPENSE' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0); 
    // Débitos da Academia: A academia comprou algo do evento (Receita para o Evento)
    const academyDebts = academyTransactions.filter(t => t.type === 'INCOME' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0); 
    
    const internalSettlements = academyTransactions.filter(t => t.category === 'settlement').reduce((sum, t) => {
      // Settlements adjust the net directly to balance the books
      // EXPENSE means Event paid Academy -> Academy credit goes DOWN (-)
      // INCOME means Academy paid Event -> Academy credit goes UP (+)
      if (t.type === 'EXPENSE') return sum - t.amount;
      if (t.type === 'INCOME') return sum + t.amount;
      return sum;
    }, 0);

    const transactionsNet = academyCredits - academyDebts + internalSettlements;

    const pendingNet = totalNet - paidNet - transactionsNet;

    const totalBoards = academyRegs.filter(r => r.status === 'Confirmado').reduce((sum, r) => sum + calculateBoards(r.categories), 0);
    const totalConf = academyRegs.filter(r => r.status === 'Confirmado').length;
    
    return {
      ...academy,
      totalRegs: academyRegs.length,
      // ✅ Atletas únicos: usa Set de IDs para não inflar com múltiplas modalidades
      uniqueAthletes: new Set(academyRegs.map(r => r.athleteId)).size,
      totalGross,
      totalCashback,
      totalNet,
      paidNet,
      pendingNet,
      totalBoards,
      totalConf,
      pendingRegs: academyRegs.filter(r => r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise')
    };
  }).filter(a => a.totalRegs > 0).sort((a, b) => b.totalConf - a.totalConf), [academies, registrations, settings, transactions]);

  const globalStats = useMemo(() => {
    const totalPaidInscriptions = academyStats.reduce((sum, a) => sum + a.paidNet, 0);
    const totalPendingInscriptions = academyStats.reduce((sum, a) => sum + a.pendingNet, 0);
    const totalBoards = academyStats.reduce((sum, a) => sum + a.totalBoards, 0);
    
    const extraIncome = transactions.filter(t => t.type === 'INCOME' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0);
    const extraExpense = transactions.filter(t => t.type === 'EXPENSE' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0);

    const netProfit = totalPaidInscriptions + extraIncome - extraExpense;

    return { totalPaidInscriptions, totalPendingInscriptions, totalBoards, extraIncome, extraExpense, netProfit };
  }, [academyStats, transactions]);

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

  const handleUndoApproveAll = async (academyId: string) => {
    if (!window.confirm('Atenção: Desfazer a liberação deste lote? As inscrições pagas voltarão para o status Pendente.')) return;
    
    const paidRegs = registrations.filter(r => r.academyId === academyId && r.paymentStatus === 'Pago');
    
    try {
      await Promise.all(paidRegs.map(reg => 
        updateDoc(doc(db, 'registrations', reg.id), {
          paymentStatus: 'Pendente',
          status: 'Pendente'
        })
      ));
      alert('Liberação desfeita. Inscrições voltaram para Pendente.');
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

  const handleSettleDebt = async (academyId: string, pendingNet: number) => {
    if (!profile) return;
    const isAcademyOwed = pendingNet < 0;
    const amountToSettle = Math.abs(pendingNet);
    const actionText = isAcademyOwed ? 'pagamento (saída) para liquidar o saldo que o evento deve à' : 'recebimento (entrada) do saldo que está pendente da';
    
    if (!window.confirm(`Deseja registrar o ${actionText} academia no valor de R$ ${amountToSettle.toFixed(2)}?`)) return;

    try {
      await addDoc(collection(db, 'transactions'), {
        type: isAcademyOwed ? 'EXPENSE' : 'INCOME',
        category: 'settlement',
        amount: amountToSettle,
        description: `Acerto financeiro (Baixa Interna)`,
        date: new Date().toISOString(),
        academyId,
        createdBy: profile.uid
      });
      alert('Acerto financeiro registrado no caixa!');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'transactions');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Administração</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gestão financeira e operacional do evento</p>
        </div>
        <div className="flex bg-white/5 p-1 rounded-2xl border border-white/5 overflow-x-auto">
          <button 
            onClick={() => setAdminTab('finance')}
            className={cn("px-4 py-2 text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all rounded-xl", adminTab === 'finance' ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white")}
          >
            Inscrições (Academias)
          </button>
          <button 
            onClick={() => setAdminTab('ledger')}
            className={cn("px-4 py-2 text-[10px] whitespace-nowrap font-black uppercase tracking-widest transition-all rounded-xl", adminTab === 'ledger' ? "bg-red-600 text-white shadow-lg" : "text-stone-500 hover:text-white")}
          >
            Caixa / Extras
          </button>
        </div>
      </header>

      {adminTab === 'ledger' && (
        <FinancialLedger transactions={transactions} academies={academies} profile={profile} />
      )}

      {adminTab === 'finance' && (
        <div className="space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
            <Card className="col-span-1 md:col-span-3 lg:col-span-4 p-8 border-red-500/20 bg-gradient-to-br from-red-600/10 to-transparent relative overflow-hidden">
               <div className="relative z-10">
                 <p className="text-[10px] font-black text-red-500 uppercase tracking-widest mb-2">Lucro Líquido Real (Caixa Atualizador)</p>
                 <p className="text-5xl font-black text-white tracking-tighter italic">R$ {globalStats.netProfit.toFixed(2).replace('.', ',')}</p>
                 <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-4">
                   Composição: (Inscrições: <span className="text-emerald-500">R$ {globalStats.totalPaidInscriptions.toFixed(0)}</span>) + (Ganhos Extra: <span className="text-emerald-500">R$ {globalStats.extraIncome.toFixed(0)}</span>) - (Despesas: <span className="text-red-500">R$ {globalStats.extraExpense.toFixed(0)}</span>)
                 </p>
               </div>
            </Card>

            <Card className="p-8 border-white/5 bg-gradient-to-br from-emerald-600/10 to-transparent">
              <p className="text-[10px] font-black text-emerald-500 uppercase tracking-widest mb-2">Inscrições Quites (Líquido)</p>
              <p className="text-3xl font-black text-white tracking-tighter italic">R$ {globalStats.totalPaidInscriptions.toFixed(2).replace('.', ',')}</p>
              <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest mt-2">Bruto: R$ {academyStats.reduce((sum, a) => sum + a.totalGross, 0).toFixed(0)} | CB: R$ {academyStats.reduce((sum, a) => sum + a.totalCashback, 0).toFixed(0)}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-gradient-to-br from-amber-600/10 to-transparent">
              <p className="text-[10px] font-black text-amber-500 uppercase tracking-widest mb-2">Inscrições Pendentes (Líquido)</p>
              <p className="text-3xl font-black text-white tracking-tighter italic">R$ {globalStats.totalPendingInscriptions.toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-gradient-to-br from-blue-600/10 to-transparent">
              <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Fluxo Caixa (Extras)</p>
              <p className="text-3xl font-black text-white tracking-tighter italic">R$ {(globalStats.extraIncome - globalStats.extraExpense).toFixed(2).replace('.', ',')}</p>
            </Card>
            <Card className="p-8 border-white/5 bg-gradient-to-br from-orange-600/10 to-transparent">
              <p className="text-[10px] font-black text-orange-500 uppercase tracking-widest mb-2">Tábuas (Conf.)</p>
              <p className="text-3xl font-black text-white tracking-tighter italic">{globalStats.totalBoards}</p>
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
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Atletas único</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Inscrições</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">CB Total</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pendente (Liq)</th>
                    <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pago (Liq)</th>
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
                           <span className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-black text-white">
                             {stat.uniqueAthletes}
                           </span>
                        </td>
                        <td className="px-8 py-6">
                           <span className="px-2.5 py-1 bg-blue-500/10 border border-blue-500/20 rounded-lg text-[10px] font-black text-blue-400">
                             {stat.totalRegs}
                           </span>
                        </td>
                        <td className="px-8 py-6 text-amber-500/50 font-bold tabular-nums text-xs">
                           R$ {stat.totalCashback.toFixed(0)}
                        </td>
                        <td className="px-8 py-6 text-amber-500 font-black tabular-nums tracking-tighter">
                           R$ {stat.pendingNet.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-8 py-6 text-emerald-500 font-black tabular-nums tracking-tighter">
                           R$ {stat.paidNet.toFixed(2).replace('.', ',')}
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
                             {stat.pendingRegs.length > 0 && (
                               <Button 
                                 variant="success" 
                                 className="px-6 py-2.5 text-[10px] font-black uppercase tracking-widest shadow-emerald-600/20"
                                 onClick={() => handleApproveAll(stat.id)}
                               >
                                 Liberar Lote
                               </Button>
                             )}
                             {(stat.totalRegs - stat.pendingRegs.length) > 0 && (
                               <Button 
                                 variant="ghost" 
                                 className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest text-stone-500 hover:text-red-500 hover:bg-red-500/10"
                                 onClick={() => handleUndoApproveAll(stat.id)}
                               >
                                 Desfazer Lote
                               </Button>
                             )}
                             {stat.pendingNet !== 0 && (
                               <Button 
                                 onClick={() => handleSettleDebt(stat.id, stat.pendingNet)}
                                 variant="primary"
                                 className={cn(
                                   "text-[9px] px-3 py-2 rounded-xl whitespace-nowrap",
                                   stat.pendingNet < 0 ? "bg-stone-800 hover:bg-stone-700 text-amber-500" : "bg-emerald-600 hover:bg-emerald-700 text-white"
                                 )}
                                 title="Realizar um Lançamento Extra (Acerto Interno) no Caixa sem afetar o status dos atletas."
                               >
                                 {stat.pendingNet < 0 ? "PAGAR DÍVIDA R$" : "BAIXA MANUAL R$"} {Math.abs(stat.pendingNet).toFixed(2).replace('.', ',')}
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
      )}
      
    </motion.div>
  );
}
