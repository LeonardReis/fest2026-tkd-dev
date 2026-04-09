import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, ArrowUpRight, ArrowDownRight, Building2, Globe } from 'lucide-react';
import { collection, addDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError } from '../../utils';
import { Transaction, Academy, UserProfile, OperationType } from '../../types';
import { Button, Card, Input, Select, cn } from '../ui';

interface FinancialLedgerProps {
  transactions: Transaction[];
  academies: Academy[];
  profile: UserProfile | null;
}

export function FinancialLedger({ transactions, academies, profile }: FinancialLedgerProps) {
  const [isAdding, setIsAdding] = useState(false);
  
  const organizerAcademy = academies.find(a => a.name.toUpperCase().includes('UNIÃO LOPES') || a.name.toUpperCase().includes('UNIAO LOPES'));
  const initialAcademyId = organizerAcademy ? organizerAcademy.id : 'general';

  const [type, setType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [category, setCategory] = useState<Transaction['category']>('rent');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [academyId, setAcademyId] = useState<string>(initialAcademyId);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Se a academia carregou depois do mount, tentar forçar como padrão:
  useEffect(() => {
    if (academyId === 'general' && organizerAcademy) {
      setAcademyId(organizerAcademy.id);
    }
  }, [organizerAcademy?.id]);

  const stats = useMemo(() => {
    const totalIncome = transactions.filter(t => t.type === 'INCOME' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = transactions.filter(t => t.type === 'EXPENSE' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0);
    return { totalIncome, totalExpense, balance: totalIncome - totalExpense };
  }, [transactions]);

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      alert("Valor inválido.");
      return;
    }
    if (!description.trim()) {
      alert("A descrição é obrigatória.");
      return;
    }

    setIsSubmitting(true);
    try {
      const newTransaction: any = {
        type,
        category,
        amount: Number(amount),
        description: description.trim(),
        date: new Date().toISOString(),
        createdBy: profile.uid,
      };
      
      if (academyId !== 'general') {
        newTransaction.academyId = academyId;
      }

      await addDoc(collection(db, 'transactions'), newTransaction);
      
      // Reset form
      setType('EXPENSE');
      setCategory('rent');
      setAmount('');
      setDescription('');
      setAcademyId(organizerAcademy ? organizerAcademy.id : 'general');
      setIsAdding(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover este lançamento? Esta ação afeta o caixa geral e os balancetes das academias vinculadas.")) return;
    try {
      await deleteDoc(doc(db, 'transactions', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 border-white/5 bg-gradient-to-br from-blue-600/10 to-transparent">
          <p className="text-[10px] items-center gap-1 flex font-black text-blue-500 uppercase tracking-widest mb-2">
            <ArrowUpRight className="w-3 h-3" /> Entradas Extra
          </p>
          <p className="text-3xl font-black text-white tracking-tighter italic">
            R$ {stats.totalIncome.toFixed(2).replace('.', ',')}
          </p>
        </Card>
        <Card className="p-6 border-white/5 bg-gradient-to-br from-red-600/10 to-transparent">
          <p className="text-[10px] items-center gap-1 flex font-black text-red-500 uppercase tracking-widest mb-2">
            <ArrowDownRight className="w-3 h-3" /> Despesas / Isenções
          </p>
          <p className="text-3xl font-black text-white tracking-tighter italic">
            R$ {stats.totalExpense.toFixed(2).replace('.', ',')}
          </p>
        </Card>
        <Card className={cn("p-6 border-white/5 bg-gradient-to-br to-transparent", stats.balance >= 0 ? "from-emerald-600/10" : "from-amber-600/10")}>
          <p className={cn("text-[10px] font-black uppercase tracking-widest mb-2", stats.balance >= 0 ? "text-emerald-500" : "text-amber-500")}>
            Saldo Extra Evento
          </p>
          <p className="text-3xl font-black text-white tracking-tighter italic">
            R$ {stats.balance.toFixed(2).replace('.', ',')}
          </p>
        </Card>
      </div>

      {/* Tabela e Formulário */}
      <Card className="border-white/5 bg-white/[0.02] overflow-hidden">
        <div className="p-6 border-b border-white/5 bg-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">Histórico de Lançamentos</h3>
            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Registros extras do evento e acertos com Academias</p>
          </div>
          <Button 
            onClick={() => setIsAdding(!isAdding)} 
            variant="secondary" 
            className="gap-2 text-[10px] uppercase font-black"
          >
            <Plus className="w-4 h-4" /> Novo Lançamento
          </Button>
        </div>

        <AnimatePresence>
          {isAdding && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="border-b border-white/5 overflow-hidden bg-white/[0.01]"
            >
              <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <Select 
                      label="Natureza do Lançamento" 
                      value={type} 
                      onChange={(e) => setType(e.target.value as 'INCOME' | 'EXPENSE')}
                      options={[
                        { value: 'EXPENSE', label: 'Despesa p/ Evento (Ex: Pagar Aluguel, Isenção, Compra)' },
                        { value: 'INCOME', label: 'Receita p/ Evento (Ex: Patrocínio, Taxa Extra)' }
                      ]} 
                    />
                  </div>
                  <div>
                    <Select 
                      label="Categoria" 
                      value={category} 
                      onChange={(e) => setCategory(e.target.value as any)}
                      options={[
                        { value: 'rent', label: 'Locação / Aluguel de Equipamento' },
                        { value: 'bonus', label: 'Bônus / Isenção (Academias)' },
                        { value: 'medals', label: 'Premiação / Medalhas' },
                        { value: 'staff', label: 'Equipe / Arbitragem / Staff' },
                        { value: 'other', label: 'Outros Lançamentos' }
                      ]} 
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Input 
                      label="Valor (R$)"
                      type="number" 
                      step="0.01" 
                      min="0.01"
                      required
                      placeholder="0.00" 
                      value={amount} 
                      onChange={(e) => setAmount(e.target.value)} 
                    />
                  </div>
                  <div>
                    <Select 
                      label="Vínculo com Academia?"
                      value={academyId} 
                      onChange={(e) => setAcademyId(e.target.value)}
                      options={[
                        ...(organizerAcademy ? [] : [{ value: 'general', label: 'Geral (Caixa do Evento)' }]),
                        ...academies
                          .map(a => ({ 
                            value: a.id, 
                            label: a.id === organizerAcademy?.id ? `⭐ ORGANIZADOR: ${a.name}` : `${a.name} (${a.master})` 
                          }))
                          .sort((a, b) => a.label.startsWith('⭐') ? -1 : b.label.startsWith('⭐') ? 1 : a.label.localeCompare(b.label))
                      ]}
                    />
                    <p className="text-[9px] text-stone-500 mt-1">
                      Despesas ou receitas da organização devem preferencialmente ficar na conta da União Lopes.
                    </p>
                  </div>
                </div>

                <div className="md:col-span-2 space-y-4">
                  <div>
                    <Input 
                      label="Descrição / Motivo"
                      required
                      placeholder="Ex: Aluguel de 20 coletes da Real Samuray..." 
                      value={description} 
                      onChange={(e) => setDescription(e.target.value)} 
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
                    <Button type="button" variant="ghost" onClick={() => setIsAdding(false)}>Cancelar</Button>
                    <Button type="submit" variant="primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Salvando...' : 'Salvar Lançamento'}
                    </Button>
                  </div>
                </div>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-white/5 border-b border-white/5">
                <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] w-16">Tipo</th>
                <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Data</th>
                <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Descrição / Vínculo</th>
                <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Valor</th>
                <th className="px-6 py-4 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {sortedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-stone-500 text-sm font-medium">
                    Nenhum lançamento extra registrado.
                  </td>
                </tr>
              ) : (
                sortedTransactions.map(t => {
                  const linkedAcademy = academies.find(a => a.id === t.academyId);
                  
                  return (
                    <tr key={t.id} className="hover:bg-white/[0.03] transition-colors">
                      <td className="px-6 py-4">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center",
                          t.type === 'INCOME' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                        )}>
                          {t.type === 'INCOME' ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-medium text-stone-400">
                        {new Date(t.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-white mb-1">{t.description}</p>
                        <div className="flex gap-2">
                          {linkedAcademy ? (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 text-[9px] font-bold uppercase text-stone-400 border border-white/5">
                              <Building2 className="w-3 h-3" /> {linkedAcademy.name}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-blue-500/10 text-[9px] font-bold uppercase text-blue-500 border border-blue-500/20">
                              <Globe className="w-3 h-3" /> Conta Geral do Evento
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "font-black tracking-tighter",
                          t.type === 'INCOME' ? "text-emerald-500" : "text-red-500"
                        )}>
                          {t.type === 'INCOME' ? '+' : '-'} R$ {t.amount.toFixed(2).replace('.', ',')}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="ghost" 
                          className="p-2 text-stone-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg"
                          onClick={() => handleDelete(t.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </motion.div>
  );
}
