import React, { useState, useRef, useMemo } from 'react';
import { motion } from 'motion/react';
import { Plus, AlertCircle, Clock, Copy, CheckCircle2, Trash2, Search, Users, Wallet, TrendingUp } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, calculatePrice, calculateCashback, generatePix, formatWhatsAppNumber, getAgeCategory } from '../../utils';
import { Registration, Athlete, Academy, UserProfile, OperationType, Transaction } from '../../types';
import { Button, Card, Select, cn } from '../ui';

export function RegistrationsView({ profile, registrations, athletes, academies, receipts, settings, transactions, onViewReceipt, initialAthleteId }: { profile: UserProfile | null; registrations: Registration[]; athletes: Athlete[]; academies: Academy[]; receipts: any[]; settings: any; transactions: Transaction[]; onViewReceipt: (data: string) => void; initialAthleteId?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({
    athleteId: '',
    categories: [] as ('Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)')[],
    isElite: false
  });
  const [isUploadingReceipt, setIsUploadingReceipt] = useState(false);
  const [uploadingAcademyId, setUploadingAcademyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedAcademyId, setSelectedAcademyId] = useState('');
  
  React.useEffect(() => {
    if (initialAthleteId) {
      setIsAdding(true);
      setFormData(prev => ({ ...prev, athleteId: initialAthleteId }));
    }
  }, [initialAthleteId]);

  const selectedAthlete = useMemo(() => athletes.find(a => a.id === formData.athleteId), [athletes, formData.athleteId]);
  const academyForSelected = useMemo(() => {
    if (selectedAthlete) return academies.find(a => a.id === selectedAthlete.academyId);
    if (profile?.role !== 'admin') return academies.find(a => a.id === profile?.academyId);
    return null;
  }, [selectedAthlete, academies, profile]);

  const currentPrice = useMemo(() => calculatePrice(formData.categories, academyForSelected?.name), [formData.categories, academyForSelected?.name]);

  const toggleCategory = (cat: 'Kyorugui' | 'Poomsae' | 'Kyopa (3 tábuas)' | 'Kyopa (5 tábuas)') => {
    setFormData(prev => ({
      ...prev,
      categories: prev.categories.includes(cat) 
        ? prev.categories.filter(c => c !== cat)
        : [...prev.categories, cat]
    }));
  };

  const handleReceiptUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uploadingAcademyId) return;

    if (file.size > 800000) {
      alert('Arquivo muito grande (máx 800KB). Para arquivos maiores, use formatos comprimidos ou PDF.');
      return;
    }

    setIsUploadingReceipt(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await addDoc(collection(db, 'receipts'), {
          academyId: uploadingAcademyId,
          receiptData: base64String,
          createdAt: new Date().toISOString()
        });

        const pendingRegs = registrations.filter(r => r.academyId === uploadingAcademyId && r.paymentStatus === 'Pendente');
        await Promise.all(pendingRegs.map(reg => 
          updateDoc(doc(db, 'registrations', reg.id), {
            paymentStatus: 'Em Análise'
          })
        ));

        alert('Comprovante enviado com sucesso! Aguarde a liberação.');
        setIsUploadingReceipt(false);
        setUploadingAcademyId(null);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao enviar comprovante:", error);
      alert('Erro ao enviar comprovante.');
      setIsUploadingReceipt(false);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || isSubmitting) return;
    if (formData.categories.length === 0) {
      alert("Selecione pelo menos uma categoria.");
      return;
    }
    
    const athlete = athletes.find(a => a.id === formData.athleteId);
    if (!athlete) return;

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, 'registrations'), {
        ...formData,
        academyId: profile.role === 'admin' ? athlete.academyId : profile.academyId,
        status: 'Pendente',
        paymentStatus: 'Pendente',
        createdAt: new Date().toISOString()
      });

      setIsAdding(false);
      setFormData({ athleteId: '', categories: [], isElite: false });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'registrations');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRegistration = async (id: string) => {
    if (window.confirm('Tem certeza que deseja cancelar esta inscrição?')) {
      try {
        await deleteDoc(doc(db, 'registrations', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'registrations');
      }
    }
  };

  const academiesWithPendingOrAnalysis = academies
    .filter(a => profile?.role === 'admin' || a.id === profile?.academyId)
    .filter(a => 
      registrations.some(r => r.academyId === a.id && (r.paymentStatus === 'Pendente' || r.paymentStatus === 'Em Análise'))
    );

  const academiesWithRegistrations = useMemo(() => {
    const registeredIds = new Set(registrations.map(r => r.academyId));
    return academies.filter(a => registeredIds.has(a.id));
  }, [registrations, academies]);

  const filteredRegs = useMemo(() => {
    const list = profile?.role === 'admin'
      ? registrations
      : registrations.filter(r => r.academyId === profile?.academyId);
    
    let result = selectedAcademyId 
      ? list.filter(r => r.academyId === selectedAcademyId)
      : list;

    if (searchTerm) {
      const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const search = normalize(searchTerm);
      result = result.filter(reg => {
        const athlete = athletes.find(a => a.id === reg.athleteId);
        const academy = academies.find(a => a.id === reg.academyId);
        return (
          normalize(athlete?.name || '').includes(search) || 
          normalize(academy?.name || '').includes(search)
        );
      });
    }

    const statusWeight = {
      'Pago': 0,
      'Em Análise': 1,
      'Pendente': 2
    };

    return [...result].sort((a, b) => {
      const weightA = statusWeight[a.paymentStatus as keyof typeof statusWeight] ?? 3;
      const weightB = statusWeight[b.paymentStatus as keyof typeof statusWeight] ?? 3;
      if (weightA !== weightB) return weightA - weightB;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [profile, registrations, searchTerm, selectedAcademyId, athletes, academies]);

  const overviewStats = useMemo(() => {
    let totalGrossPaid = 0;
    let totalGrossPending = 0;
    let totalCashbackPaid = 0;
    let totalCashbackPending = 0;
    let paidCount = 0;

    filteredRegs.forEach(reg => {
      const academy = academies.find(a => a.id === reg.academyId);
      const price = calculatePrice(reg.categories, academy?.name);
      const cb = calculateCashback(reg.categories, academy?.name);
      
      if (reg.paymentStatus === 'Pago') {
        totalGrossPaid += price;
        totalCashbackPaid += cb;
        paidCount++;
      } else {
        totalGrossPending += price;
        totalCashbackPending += cb;
      }
    });

    const conversionRate = filteredRegs.length > 0 ? Math.round((paidCount / filteredRegs.length) * 100) : 0;

    return {
      totalInscriptions: filteredRegs.length,
      totalPaid: totalGrossPaid - totalCashbackPaid,
      totalPending: totalGrossPending - totalCashbackPending,
      totalGrossPaid,
      totalGrossPending,
      totalCashbackPaid,
      totalCashbackPending,
      conversionRate
    };
  }, [filteredRegs, academies]);

  const handlePaymentStatus = async (regId: string, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'Pago' ? 'Pendente' : 'Pago';
      await updateDoc(doc(db, 'registrations', regId), {
        paymentStatus: newStatus,
        status: newStatus === 'Pago' ? 'Confirmado' : 'Pendente'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'registrations');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Inscrições</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Festival União Lopes 2026</p>
        </div>
        {!isAdding && (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {profile?.role === 'admin' && (
              <div className="w-full sm:w-48">
                <select 
                  value={selectedAcademyId}
                  onChange={e => setSelectedAcademyId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 px-4 text-xs text-white focus:outline-none focus:border-red-500/50 appearance-none cursor-pointer transition-all"
                >
                  <option value="" className="bg-stone-900">Todas Academias</option>
                  {academiesWithRegistrations.map(a => (
                    <option key={a.id} value={a.id} className="bg-stone-900">{a.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="relative group/search w-full sm:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 group-focus-within/search:text-red-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar inscrição..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>
            {athletes.length > 0 && (
              <Button onClick={() => setIsAdding(true)} variant="primary" className="shadow-red-600/20 w-full sm:w-auto">
                <Plus className="w-5 h-5" /> Nova Inscrição
              </Button>
            )}
          </div>
        )}
      </header>

      {!isAdding && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
          <Card className="p-6 border-white/5 bg-gradient-to-br from-blue-900/10 to-transparent">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 rounded-xl border border-blue-500/20">
                <Users className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Inscritos Totais</p>
                <p className="text-2xl font-black text-white">{overviewStats.totalInscriptions}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-white/5 bg-gradient-to-br from-emerald-900/10 to-transparent">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                <Wallet className="w-5 h-5 text-emerald-400" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Arrecadação Líquida</p>
                <p className="text-2xl font-black text-emerald-400 tabular-nums">
                  <span className="text-sm text-emerald-500/50 mr-1">R$</span> 
                  {overviewStats.totalPaid.toFixed(2).replace('.', ',')}
                </p>
                <p className="text-[8px] text-stone-600 font-bold uppercase tracking-widest">Bruto: {overviewStats.totalGrossPaid.toFixed(0)} | CB: {overviewStats.totalCashbackPaid.toFixed(0)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-white/5 bg-gradient-to-br from-amber-900/10 to-transparent">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-500/20">
                <Clock className="w-5 h-5 text-amber-400" />
              </div>
              <div className="flex-1">
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Líquido a Receber</p>
                <p className="text-2xl font-black text-amber-400 tabular-nums">
                  <span className="text-sm text-amber-500/50 mr-1">R$</span> 
                  {overviewStats.totalPending.toFixed(2).replace('.', ',')}
                </p>
                <p className="text-[8px] text-stone-600 font-bold uppercase tracking_widest">Bruto: {overviewStats.totalGrossPending.toFixed(0)} | CB: {overviewStats.totalCashbackPending.toFixed(0)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6 border-white/5 bg-gradient-to-br from-purple-900/10 to-transparent">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl border border-purple-500/20">
                <TrendingUp className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest">Conversão</p>
                <p className="text-2xl font-black text-white">{overviewStats.conversionRate}%</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto border-white/5">
          <form onSubmit={handleSubmit} className="space-y-8">
            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter border-b border-white/5 pb-4">Nova Inscrição</h3>
            <Select 
              label="Competidor" 
              options={athletes
                .filter(a => profile?.role === 'admin' || a.academyId === profile?.academyId)
                .map(a => ({ value: a.id, label: a.name }))} 
              value={formData.athleteId}
              onChange={e => setFormData({ ...formData, athleteId: e.target.value })}
              required
            />

            {/* Alerta de Laudo Médico para Master */}
            {(() => {
              const selectedAthlete = athletes.find(a => a.id === formData.athleteId);
              if (!selectedAthlete) return null;
              const ageCat = getAgeCategory(selectedAthlete.birthYear, selectedAthlete.belt);
              if (!ageCat.toLowerCase().includes('master')) return null;
              return (
                <div className="flex items-start gap-3 p-4 bg-orange-600/10 border border-orange-500/30 rounded-2xl">
                  <AlertCircle className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-black text-orange-400 uppercase tracking-widest">Laudo Médico Obrigatório</p>
                    <p className="text-[10px] text-stone-400 font-bold uppercase tracking-widest mt-1 leading-relaxed">
                      Atletas na categoria <span className="text-orange-400">{ageCat}</span> devem apresentar laudo médico válido no dia do evento. (Regulamento, seção 5.1)
                    </p>
                  </div>
                </div>
              );
            })()}

            {/* Opção Elite para Graduados */}
            {(() => {
              const selectedAthlete = athletes.find(a => a.id === formData.athleteId);
              if (!selectedAthlete) return null;
              const b = selectedAthlete.belt.toLowerCase();
              const isGraduado = b.includes('azul escuro') || b.includes('vermelha') || b.includes('3º gub') || b.includes('2º gub') || b.includes('1º gub');
              if (!isGraduado) return null;
              
              return (
                <div className="space-y-4 pt-2">
                  <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Categoria Especial</label>
                  <label className={cn(
                    "flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group",
                    formData.isElite 
                      ? "bg-amber-600/20 text-amber-400 border-amber-500/50 shadow-xl" 
                      : "bg-white/5 border-white/5 text-stone-400 hover:border-white/10 hover:bg-white/[0.08]"
                  )}>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={formData.isElite}
                      onChange={() => setFormData(prev => ({ ...prev, isElite: !prev.isElite }))}
                    />
                    <div className={cn(
                      "w-5 h-5 rounded-lg border flex items-center justify-center transition-colors",
                      formData.isElite ? "bg-amber-500 text-stone-950 border-amber-500" : "border-white/10"
                    )}>
                      {formData.isElite && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <div>
                      <span className="font-black uppercase tracking-tight text-sm block">Participar como Elite (Lutar com Preta)</span>
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-widest">Aplica-se apenas para a modalidade Kyorugui</span>
                    </div>
                    {formData.isElite && (
                      <div className="absolute right-0 top-0 h-full w-1.5 bg-amber-500/50" />
                    )}
                  </label>
                </div>
              );
            })()}
            
            <div className="space-y-4">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">Disciplinas</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(['Kyorugui', 'Poomsae', 'Kyopa (3 tábuas)', 'Kyopa (5 tábuas)'] as const).map(cat => (
                  <label key={cat} className={cn(
                    "flex items-center gap-4 p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group",
                    formData.categories.includes(cat) 
                      ? "bg-red-600 text-white border-red-500 shadow-xl" 
                      : "bg-white/5 border-white/5 text-stone-400 hover:border-white/10 hover:bg-white/[0.08]"
                  )}>
                    <input 
                      type="checkbox" 
                      className="hidden"
                      checked={formData.categories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                    />
                    <div className={cn(
                      "w-5 h-5 rounded-lg border flex items-center justify-center transition-colors",
                      formData.categories.includes(cat) ? "bg-white text-red-600 border-white" : "border-white/10"
                    )}>
                      {formData.categories.includes(cat) && <CheckCircle2 className="w-3 h-3" />}
                    </div>
                    <span className="font-black uppercase tracking-tight text-sm">{cat}</span>
                    {formData.categories.includes(cat) && (
                      <div className="absolute right-0 top-0 h-full w-1.5 bg-white/20" />
                    )}
                  </label>
                ))}
              </div>
            </div>

            {currentPrice > 0 && (
              <div className="bg-stone-900/60 p-8 rounded-3xl border border-white/5 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl -mr-16 -mt-16" />
                <div className="flex justify-between items-center border-b border-white/5 pb-6">
                  <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Investimento</span>
                  <span className="text-4xl font-black text-white tracking-tighter">R$ {currentPrice.toFixed(2).replace('.', ',')}</span>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-8 items-center">
                  <div className="bg-white p-2 rounded-2xl shadow-2xl shrink-0">
                    <QRCodeSVG 
                      value={generatePix(
                        currentPrice, 
                        `Insc: ${athletes.find(a => a.id === formData.athleteId)?.name.substring(0, 15)}`, 
                        "NOVO"
                      )} 
                      size={100} 
                    />
                  </div>
                  <div className="space-y-4 flex-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Pagamento Via PIX</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        readOnly 
                        value={generatePix(
                          currentPrice, 
                          `Insc: ${athletes.find(a => a.id === formData.athleteId)?.name.substring(0, 15)}`, 
                          "NOVO"
                        )} 
                        className="w-full text-[10px] font-mono px-4 py-2.5 bg-black/40 border border-white/5 rounded-xl text-stone-400 outline-none" 
                      />
                      <Button 
                        type="button" 
                        variant="ghost" 
                        className="px-4 py-2 text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-white/10"
                        onClick={() => {
                          navigator.clipboard.writeText(generatePix(
                            currentPrice, 
                            `Insc: ${athletes.find(a => a.id === formData.athleteId)?.name.substring(0, 15)}`, 
                            "NOVO"
                          ));
                          alert('PIX Copiado!');
                        }}
                      >
                        Copiar
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <Button type="submit" className="flex-1 py-4 text-sm shadow-red-600/20" disabled={isSubmitting}>{isSubmitting ? 'Registrando...' : 'Finalizar Inscrição'}</Button>
              <Button type="button" variant="secondary" className="flex-1 py-4 text-sm" onClick={() => {
                setIsAdding(false);
                setFormData({ athleteId: '', categories: [], isElite: false });
              }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="border-white/5 bg-white/[0.02]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Competidor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Categorias</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Pagamento</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Data</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredRegs.map(reg => {
                  const athlete = athletes.find(a => a.id === reg.athleteId);
                  return (
                    <tr key={reg.id} className="hover:bg-white/[0.03] transition-colors group/row">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/5">
                             <span className="text-sm font-black text-white">{athlete?.name.charAt(0)}</span>
                          </div>
                          <div>
                            <p className="font-black text-white uppercase tracking-tight leading-none">{athlete?.name}</p>
                            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1.5 italic">
                              {academies.find(a => a.id === reg.academyId)?.name}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-wrap gap-2">
                          {reg.categories.map(cat => (
                            <span key={cat} className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-md text-[9px] font-black text-stone-300 uppercase tracking-widest whitespace-nowrap">
                              {cat}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className={cn(
                          "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest",
                          reg.paymentStatus === 'Pago' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" :
                          reg.paymentStatus === 'Em Análise' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"
                        )}>
                          {reg.paymentStatus === 'Pago' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          {reg.paymentStatus}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">
                          {new Date(reg.createdAt).toLocaleDateString('pt-BR')}
                        </p>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex justify-center gap-2">
                          <Button 
                            variant="ghost" 
                            className="p-3 bg-white/5 hover:bg-emerald-600/20 group/wa" 
                            onClick={() => {
                              const text = `Olá! A inscrição do atleta *${athlete?.name}* no 3º Festival União Lopes está *${reg.paymentStatus}*. 🥋\n\n*Categorias:* ${reg.categories.join(', ')}`;
                              const academy = academies.find(a => a.id === reg.academyId);
                              let url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                              if (profile?.role === 'admin' && academy?.contact) {
                                url = `https://wa.me/${formatWhatsAppNumber(academy.contact)}?text=${encodeURIComponent(text)}`;
                              }
                              window.open(url, '_blank');
                            }}
                          >
                            <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest px-1">WA</span>
                          </Button>
                          {profile?.role === 'admin' && (
                            <Button 
                              variant="ghost" 
                              className="p-3 bg-white/5 hover:bg-emerald-600/20 group/approve" 
                              onClick={() => handlePaymentStatus(reg.id, reg.paymentStatus)}
                            >
                              <CheckCircle2 className="w-4 h-4 group-hover/approve:text-emerald-500 transition-colors" />
                            </Button>
                          )}
                          {(profile?.role === 'admin' || reg.paymentStatus === 'Pendente') ? (
                            <Button variant="ghost" className="p-3 bg-white/5 hover:bg-red-600/20 group/del" onClick={() => handleDeleteRegistration(reg.id)}>
                              <Trash2 className="w-4 h-4 group-hover/del:text-red-500 transition-colors" />
                            </Button>
                          ) : (
                            <Button 
                              variant="ghost" 
                              className="p-3 bg-white/5 hover:bg-amber-600/20 group/req" 
                              onClick={() => {
                                const text = `Olá Leonardo! Preciso de uma edição na inscrição do atleta *${athlete?.name}* (ID: ${reg.id.substring(0,5)}). Pode me ajudar? 🥋`;
                                window.open(`https://wa.me/5541999999999?text=${encodeURIComponent(text)}`, '_blank');
                              }}
                            >
                               <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest px-1">Editar</span>
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
          {filteredRegs.length === 0 && (
            <div className="py-24 text-center">
              <p className="text-[10px] text-stone-600 uppercase font-black tracking-[0.2em]">Sem inscrições realizadas</p>
            </div>
          )}
        </Card>
      )}

      {!isAdding && academiesWithPendingOrAnalysis.map(academy => {
        const pendingRegs = registrations.filter(r => r.academyId === academy.id && r.paymentStatus === 'Pendente');
        const analysisRegs = registrations.filter(r => r.academyId === academy.id && r.paymentStatus === 'Em Análise');
        
        const academyTransactions = transactions ? transactions.filter(t => t.academyId === academy.id) : [];
        const academyCredits = academyTransactions.filter(t => t.type === 'EXPENSE' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0); 
        const academyDebts = academyTransactions.filter(t => t.type === 'INCOME' && t.category !== 'settlement').reduce((sum, t) => sum + t.amount, 0); 
        
        const internalSettlements = academyTransactions.filter(t => t.category === 'settlement').reduce((sum, t) => {
          if (t.type === 'EXPENSE') return sum - t.amount;
          if (t.type === 'INCOME') return sum + t.amount;
          return sum;
        }, 0);

        const transactionsNet = academyCredits - academyDebts + internalSettlements;
        
        const academyRegs = filteredRegs.filter(r => r.academyId === academy.id);
        const academyTotalGross = academyRegs.reduce((sum, r) => sum + calculatePrice(r.categories, academy.name), 0);
        const academyTotalCashback = academyRegs.reduce((sum, r) => sum + calculateCashback(r.categories, academy.name), 0);
        const academyTotalNet = academyTotalGross - academyTotalCashback;
        
        const paidGross = academyRegs.filter(r => r.paymentStatus === 'Pago').reduce((sum, r) => sum + calculatePrice(r.categories, academy.name), 0);
        const paidCashback = academyRegs.filter(r => r.paymentStatus === 'Pago').reduce((sum, r) => sum + calculateCashback(r.categories, academy.name), 0);
        const paidNet = paidGross - paidCashback;

        const pendingNet = academyTotalNet - paidNet - transactionsNet;
        const finalAmountToPay = pendingNet > 0 ? pendingNet : 0;
        const academyReceipts = receipts.filter(r => r.academyId === academy.id);

        return (
          <Card key={academy.id} className="p-0 border-white/5 bg-gradient-to-br from-amber-600/5 to-transparent overflow-hidden">
            <div className="p-8 flex flex-col lg:flex-row gap-10 items-start justify-between">
              <div className="flex-1 w-full flex flex-col h-full">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                    <AlertCircle className="w-6 h-6 text-amber-500" />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white uppercase tracking-tighter italic">
                      {pendingRegs.length > 0 ? "Aguardando Pagamento" : "Em Análise de Comprovante"}
                    </h3>
                    <p className="text-[10px] text-amber-500/60 font-black uppercase tracking-[0.2em]">{academy.name}</p>
                  </div>
                </div>

                <div className="flex-1 bg-black/20 rounded-2xl border border-white/5 p-4 mb-6">
                  <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-4 ml-1">Atletas neste lote</p>
                  <div className="space-y-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {[...pendingRegs, ...analysisRegs].map(reg => {
                      const athlete = athletes.find(a => a.id === reg.athleteId);
                      return (
                        <div key={reg.id} className="flex justify-between items-center group/item p-2 hover:bg-white/5 rounded-xl transition-colors">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center border border-white/5">
                              <span className="text-xs font-black text-white">{athlete?.name.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-xs font-bold text-white uppercase tracking-tight">{athlete?.name}</p>
                              <p className="text-[8px] text-stone-500 font-bold uppercase tracking-widest">{reg.categories.join(' + ')}</p>
                            </div>
                          </div>
                          <p className="text-xs font-black text-white tabular-nums tracking-tighter">
                            R$ {(calculatePrice(reg.categories, academy.name) - calculateCashback(reg.categories, academy.name)).toFixed(2).replace('.', ',')}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {pendingRegs.length > 0 && (
                  <div className="mt-auto space-y-1">
                    <div className="flex items-baseline justify-between mb-2">
                      <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Total Líquido</p>
                      <div className="text-right">
                        <p className="text-[10px] text-stone-600 font-bold uppercase tracking-widest">Inscrições: R$ {(academyTotalNet - paidNet).toFixed(0)}</p>
                        {transactionsNet !== 0 && (
                          <p className={transactionsNet > 0 ? "text-[10px] font-bold uppercase tracking-widest text-emerald-500" : "text-[10px] font-bold uppercase tracking-widest text-red-500"}>
                            Lançamentos Extras: {transactionsNet > 0 ? '-' : '+'} R$ {Math.abs(transactionsNet).toFixed(0)}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-5xl font-black text-white tracking-tighter italic">R$ {finalAmountToPay.toFixed(2).replace('.', ',')}</p>
                  </div>
                )}
              </div>

              {pendingRegs.length > 0 ? (
                <div className="w-full lg:w-96 flex flex-col gap-6">
                  {finalAmountToPay > 0 ? (
                    <div className="bg-white p-6 rounded-3xl shadow-[0_0_50px_rgba(255,255,255,0.05)] border-4 border-white/20 relative group/pix">
                      <div className="absolute inset-0 bg-red-600/5 rounded-[22px] blur-xl opacity-0 group-hover/pix:opacity-100 transition-opacity" />
                      <div className="relative z-10 flex flex-col items-center gap-4">
                        <QRCodeSVG 
                          value={generatePix(
                            finalAmountToPay, 
                            `Lote ${academy.name.substring(0, 10)}`, 
                            academy.id.substring(0, 5)
                          )} 
                          size={180} 
                          className="w-full h-auto max-w-[180px]" 
                          level="H" 
                        />
                        <div className="w-full space-y-3 mt-2">
                          <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest text-center mt-4">PIX Copia e Cola (Leonardo Reis)</p>
                          <div className="flex gap-2">
                            <input 
                              type="text" 
                              readOnly 
                              value={generatePix(
                                finalAmountToPay, 
                                `Lote ${academy.name.substring(0, 10)}`, 
                                academy.id.substring(0, 5)
                              )} 
                              className="w-full text-[10px] font-mono px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white outline-none focus:border-red-600/50 transition-all" 
                            />
                            <Button 
                              variant="primary" 
                              className="shrink-0 px-4 py-3 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 group/copy"
                              onClick={() => {
                                navigator.clipboard.writeText(generatePix(
                                  finalAmountToPay, 
                                  `Lote ${academy.name.substring(0, 10)}`, 
                                  academy.id.substring(0, 5)
                                ));
                                alert('Código PIX com valor e descrição automática copiado!');
                              }}
                            >
                              <Copy className="w-3.5 h-3.5 group-hover/copy:scale-110 transition-transform" />
                              <span>Copiar</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white/5 p-6 rounded-3xl border border-white/10 text-center text-stone-400">
                      <p className="text-sm font-bold uppercase">Sem saldo a pagar pendente.</p>
                      <p className="text-[10px] mt-2">Os lançamentos extras já cobrem os custos das inscrições aguardando pagamento.</p>
                    </div>
                  )}

                  <div className="space-y-4">

                    <Button 
                      variant="primary" 
                      className="w-full py-5 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.2)]"
                      onClick={() => {
                        setUploadingAcademyId(academy.id);
                        fileInputRef.current?.click();
                      }}
                      disabled={isUploadingReceipt}
                    >
                      {isUploadingReceipt ? 'Enviando...' : 'Anexar Comprovante'}
                    </Button>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest text-center leading-relaxed">
                      Lote será confirmado após<br/>validação manual do mestre
                    </p>
                  </div>
                </div>
              ) : (
                <div className="w-full lg:w-96 flex flex-col items-center justify-center p-12 bg-blue-600/5 rounded-[40px] border border-blue-500/20 gap-6">
                  <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20 group">
                    <Clock className="w-10 h-10 text-blue-500 group-hover:rotate-12 transition-transform" />
                  </div>
                  <div className="text-center space-y-2">
                    <h4 className="text-xl font-black text-white uppercase tracking-tighter italic">Em Análise</h4>
                    <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest leading-relaxed">
                      Aguardando conferência do<br/>setor financeiro (24h úteis)
                    </p>
                  </div>
                  {academyReceipts.length > 0 && (
                     <button 
                       onClick={() => onViewReceipt(academyReceipts[0].receiptData)}
                       className="text-[10px] font-black text-blue-500 uppercase tracking-widest hover:underline"
                     >
                       Ver comprovante enviado
                     </button>
                   )}
                </div>
              )}
            </div>
          </Card>
        );
      })}
      {/* Hidden Global Input for Receipts */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleReceiptUpload} 
        accept="image/*,application/pdf" 
        className="hidden" 
      />
    </motion.div>
  );
}
