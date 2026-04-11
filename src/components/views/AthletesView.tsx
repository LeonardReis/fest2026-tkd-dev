import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Camera, Edit, Trash2, Calendar, UserPlus, Search } from 'lucide-react';
import { collection, addDoc, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError, getAgeCategory, getWeightCategory } from '../../utils';
import { BELT_OPTIONS } from '../../constants';
import { Athlete, Academy, Registration, UserProfile, OperationType } from '../../types';
import { User } from 'firebase/auth';
import { Button, Card, Input, Select, cn } from '../ui';
import { BeltBadge } from '../BeltBadge';

export function AthletesView({ profile, user, athletes, academies, registrations }: { profile: UserProfile | null; user: User | null; athletes: Athlete[]; academies: Academy[]; registrations: Registration[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Sincroniza academyId inicial para inscrições se necessário (embora handleSubmit já force)
  React.useEffect(() => {
    if (isAdding && profile?.role === 'master' && profile.academyId) {
       // Não precisamos setar no formData aqui pois RegistrationsView 
       // usa o athleteId para determinar a academia, BUT
       // handleSubmit agora força profile.academyId para masters.
    }
  }, [isAdding, profile]);
  const [isUploading, setIsUploading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    birthYear: '' as number | '',
    gender: 'M' as 'M' | 'F',
    belt: '',
    weight: 0,
    academyId: '',
    avatar: ''
  });

  // Sincroniza academyId inicial quando o perfil carrega
  React.useEffect(() => {
    if (profile?.academyId && !formData.academyId && !isAdding) {
      setFormData(prev => ({ ...prev, academyId: profile.academyId }));
    }
  }, [profile, isAdding]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 800000) {
      alert('A imagem é muito grande. Por favor, envie uma imagem menor (máx 800KB).');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        setFormData(prev => ({ ...prev, avatar: base64String }));
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao processar foto:", error);
      alert('Erro ao processar foto.');
      setIsUploading(false);
    }
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        const hasRegistrations = registrations.some(r => r.athleteId === editingId);
        if (hasRegistrations) {
            const original = athletes.find(a => a.id === editingId);
            if (original && (original.birthYear !== formData.birthYear || original.gender !== formData.gender || original.weight !== formData.weight)) {
                if (!window.confirm("ATENÇÃO: Este atleta possui inscrições ativas.\n\nA alteração de Ano de Nascimento, Gênero ou Peso pode afetar o enquadramento em categorias.\n\nDeseja forçar a edição?")) {
                    setIsSubmitting(false);
                    return;
                }
            }
        }
        await updateDoc(doc(db, 'athletes', editingId), {
            ...formData,
            academyId: profile.role === 'admin' ? formData.academyId : profile.academyId
        });
      } else {
        await addDoc(collection(db, 'athletes'), {
          ...formData,
          academyId: profile.role === 'admin' ? formData.academyId : profile.academyId,
          createdBy: profile.uid
        });
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: '', birthYear: '', gender: 'M', belt: '', weight: 0, academyId: profile.academyId || '', avatar: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'athletes');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (athlete: Athlete) => {
    setFormData({
      name: athlete.name,
      birthYear: athlete.birthYear,
      gender: athlete.gender,
      belt: athlete.belt,
      weight: athlete.weight,
      academyId: athlete.academyId,
      avatar: athlete.avatar || ''
    });
    setEditingId(athlete.id);
    setIsAdding(true);
  };

  const handleDelete = async (id: string) => {
    const athleteRegs = registrations.filter(r => r.athleteId === id);
    if (athleteRegs.length > 0) {
      alert(`SISTEMA DE SEGURANÇA\nEste atleta possui ${athleteRegs.length} inscrição(ões) ativa(s).\nRemova as inscrições antes de excluir o atleta.`);
      return;
    }

    if (window.confirm('Confirmar exclusão permanente deste atleta?')) {
      try {
        await deleteDoc(doc(db, 'athletes', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, 'athletes');
      }
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Gestão de Atletas</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Inscreva e organize seus competidores</p>
        </div>
        {!isAdding && (
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative group/search w-full sm:w-64">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-500 group-focus-within/search:text-red-500 transition-colors" />
              <input 
                type="text" 
                placeholder="Buscar atleta..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-2.5 pl-11 pr-4 text-sm text-white placeholder:text-stone-600 focus:outline-none focus:border-red-500/50 focus:bg-white/[0.08] transition-all"
              />
            </div>
            <Button onClick={() => setIsAdding(true)} variant="primary" className="shadow-red-600/20 w-full sm:w-auto">
              <Plus className="w-5 h-5" /> Novo Atleta
            </Button>
          </div>
        )}
      </header>

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto border-white/5 shadow-2xl">
          <form onSubmit={handleSubmit} className="space-y-8">
            <div className="flex justify-between items-center border-b border-white/5 pb-4">
              <h3 className="text-xl font-black text-white italic uppercase tracking-tighter">
                {editingId ? 'Editar Cadastro' : 'Novo Competidor'}
              </h3>
              {!editingId && profile?.displayName && (
                <button 
                  type="button" 
                  className="text-[10px] font-black text-red-500 uppercase tracking-widest hover:text-red-400 transition-colors"
                  onClick={() => setFormData(prev => ({ 
                    ...prev, 
                    name: profile.displayName || user?.displayName || '', 
                    avatar: profile.photoURL || user?.photoURL || '',
                    birthYear: profile.birthYear || '',
                    gender: profile.gender || 'M'
                  }))}
                >
                  Usar meu Perfil
                </button>
              )}
            </div>

            <div className="flex flex-col items-center gap-4">
              <div className="relative group/photo">
                <div className="absolute inset-0 bg-red-600/10 rounded-full blur-2xl opacity-0 group-hover/photo:opacity-100 transition-opacity" />
                {formData.avatar ? (
                  <img src={formData.avatar} alt="Avatar" className="w-32 h-32 rounded-3xl object-cover border-2 border-white/10 shadow-2xl relative z-10" />
                ) : (
                  <div className="w-32 h-32 rounded-3xl bg-white/5 border-2 border-white/10 shadow-2xl flex items-center justify-center relative z-10">
                    <UserPlus className="w-12 h-12 text-stone-700" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="absolute -bottom-2 -right-2 p-3 bg-red-600 text-white rounded-2xl hover:bg-red-500 transition-all z-20 hover:scale-110 shadow-xl"
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input type="file" ref={fileInputRef} onChange={handlePhotoUpload} accept="image/*" className="hidden" />
              </div>
              <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Foto de Identificação</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <Input label="Nome Completo" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
              </div>
              <Input label="Ano de Nascimento" type="number" min="1900" max="2026" value={formData.birthYear} onChange={e => setFormData({ ...formData, birthYear: Number(e.target.value) })} required />
              <Select 
                label="Gênero" 
                options={[{ value: 'M', label: 'Masculino' }, { value: 'F', label: 'Feminino' }]} 
                value={formData.gender}
                onChange={e => setFormData({ ...formData, gender: e.target.value as 'M' | 'F' })}
                required
              />
              <Select 
                label="Graduação (Faixa)" 
                options={BELT_OPTIONS} 
                value={formData.belt}
                onChange={e => setFormData({ ...formData, belt: e.target.value })}
                required
              />
              <Input label="Peso Atual (kg)" type="number" step="0.1" value={formData.weight} onChange={e => setFormData({ ...formData, weight: Number(e.target.value) })} required />
              <div className="md:col-span-2">
                {profile?.role === 'admin' ? (
                  <Select 
                    label="Academia / Equipe" 
                    options={academies.map(a => ({ value: a.id, label: a.name }))} 
                    value={formData.academyId}
                    onChange={e => setFormData({ ...formData, academyId: e.target.value })}
                    required
                  />
                ) : (
                  <Input 
                    label="Academia Vinculada" 
                    value={academies.find(a => a.id === profile?.academyId)?.name || 'Carregando...'} 
                    readOnly 
                    className="opacity-70 grayscale"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-white/5">
              <Button type="submit" className="flex-1 py-4 text-sm" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Confirmar Atleta')}</Button>
              <Button type="button" variant="secondary" className="flex-1 py-4 text-sm" onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '', birthYear: '', gender: 'M', belt: '', weight: 0, academyId: '', avatar: '' });
              }}>Cancelar</Button>
            </div>
          </form>
        </Card>
      ) : (
        <Card className="border-white/5 bg-white/[0.02]">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-white/5 border-b border-white/5">
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Competidor</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Categoria Oficial</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Graduação</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Peso</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em]">Equipe</th>
                  <th className="px-8 py-5 text-[10px] font-black text-stone-500 uppercase tracking-[0.2em] text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {athletes
                  .filter(a => {
                    const isVisible = profile?.role === 'admin' || a.academyId === profile?.academyId;
                    if (!isVisible) return false;
                    if (!searchTerm) return true;
                    const search = searchTerm.toLowerCase();
                    const academyName = academies.find(ac => ac.id === a.academyId)?.name.toLowerCase() || '';
                    return a.name.toLowerCase().includes(search) || academyName.includes(search);
                  })
                  .sort((a, b) => {
                    const aIdx = BELT_OPTIONS.findIndex(opt => opt.value === a.belt);
                    const bIdx = BELT_OPTIONS.findIndex(opt => opt.value === b.belt);
                    return bIdx - aIdx;
                  })
                  .map(athlete => {
                    const ageCat = getAgeCategory(athlete.birthYear, athlete.belt);
                    const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
                    return (
                      <tr key={athlete.id} className="hover:bg-white/[0.03] transition-colors group/row">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-4">
                            <div className="relative">
                              <div className="absolute inset-0 bg-red-600/20 rounded-2xl blur-lg opacity-0 group-hover/row:opacity-100 transition-opacity" />
                              {athlete.avatar ? (
                                <img src={athlete.avatar} alt={athlete.name} className="w-12 h-12 rounded-2xl object-cover border border-white/10 relative z-10 p-0.5 shadow-xl" />
                              ) : (
                                <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center text-stone-600 border border-white/10 relative z-10">
                                  <span className="text-xl font-black uppercase select-none">{athlete.name.charAt(0)}</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-black text-white uppercase tracking-tight leading-none">{athlete.name}</p>
                                {athlete.createdBy === profile?.uid && athlete.name === profile?.displayName && (
                                  <span className="px-2 py-0.5 bg-blue-600/20 text-blue-400 text-[8px] font-black rounded uppercase tracking-widest border border-blue-500/20">Você</span>
                                )}
                              </div>
                              <p className="text-[10px] text-stone-500 uppercase font-bold tracking-widest mt-1.5 flex items-center gap-2">
                                <Calendar className="w-3 h-3" />
                                Ano: {athlete.birthYear}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <div className="space-y-1">
                            <p className="text-xs font-black text-white uppercase tracking-tighter">
                              {ageCat} • {athlete.gender === 'M' ? 'Masc' : 'Fem'}
                            </p>
                            <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest opacity-60">{weightCat}</p>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <BeltBadge belt={athlete.belt} />
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-black text-white">{athlete.weight}</span>
                            <span className="text-[10px] font-bold text-stone-500 uppercase">kg</span>
                          </div>
                        </td>
                        <td className="px-8 py-6">
                          <p className="text-xs font-bold text-stone-400 uppercase tracking-wide">
                            {academies.find(a => a.id === athlete.academyId)?.name || 'N/A'}
                          </p>
                        </td>
                        <td className="px-8 py-6">
                          <div className="flex justify-center gap-2">
                            <Button variant="ghost" className="p-3 bg-white/5 hover:bg-emerald-600/20 group/edit" onClick={() => handleEdit(athlete)}>
                              <Edit className="w-4 h-4 group-hover/edit:text-emerald-500 transition-colors" />
                            </Button>
                            <Button variant="ghost" className="p-3 bg-white/5 hover:bg-red-600/20 group/del" onClick={() => handleDelete(athlete.id)}>
                              <Trash2 className="w-4 h-4 group-hover/del:text-red-500 transition-colors" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4 p-4">
            {athletes
              .filter(a => {
                const isVisible = profile?.role === 'admin' || a.academyId === profile?.academyId;
                if (!isVisible) return false;
                if (!searchTerm) return true;
                const search = searchTerm.toLowerCase();
                const academyName = academies.find(ac => ac.id === a.academyId)?.name.toLowerCase() || '';
                return a.name.toLowerCase().includes(search) || academyName.includes(search);
              })
              .map(athlete => {
                const ageCat = getAgeCategory(athlete.birthYear, athlete.belt);
                const weightCat = getWeightCategory(ageCat, athlete.gender, athlete.weight, athlete.belt);
                return (
                  <div key={athlete.id} className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-4">
                      {athlete.avatar ? (
                        <img src={athlete.avatar} alt={athlete.name} className="w-14 h-14 rounded-xl object-cover border border-white/10" />
                      ) : (
                        <div className="w-14 h-14 rounded-xl bg-white/5 flex items-center justify-center text-stone-600 border border-white/10 text-xl font-black">
                          {athlete.name.charAt(0)}
                        </div>
                      )}
                      <div className="flex-1">
                        <p className="font-black text-white uppercase tracking-tight text-sm">{athlete.name}</p>
                        <p className="text-[9px] text-stone-500 uppercase font-black tracking-widest mt-1">
                          {academies.find(ac => ac.id === athlete.academyId)?.name || 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                        <p className="text-[8px] text-stone-500 font-black uppercase tracking-widest mb-1">Categoria</p>
                        <p className="text-[10px] font-black text-white uppercase">{ageCat} • {athlete.gender}</p>
                        <p className="text-[8px] text-stone-600 font-bold uppercase mt-0.5">{weightCat}</p>
                      </div>
                      <div className="bg-black/20 p-2 rounded-xl border border-white/5">
                        <p className="text-[8px] text-stone-500 font-black uppercase tracking-widest mb-1">Graduação</p>
                        <BeltBadge belt={athlete.belt} />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-white">{athlete.weight}</span>
                        <span className="text-[10px] font-bold text-stone-500 uppercase mt-1">kg</span>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="ghost" className="p-2.5 bg-white/5 h-9 w-9" onClick={() => handleEdit(athlete)}>
                          <Edit className="w-4 h-4 text-emerald-500" />
                        </Button>
                        <Button variant="ghost" className="p-2.5 bg-white/5 h-9 w-9" onClick={() => handleDelete(athlete.id)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
          {athletes.length === 0 && (
            <div className="py-32 flex flex-col items-center justify-center gap-6">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center border border-white/5">
                <UserPlus className="w-10 h-10 text-stone-800" />
              </div>
              <p className="text-[10px] text-stone-600 uppercase font-black tracking-widest">Nenhum atleta cadastrado nesta conta</p>
              <Button onClick={() => setIsAdding(true)} variant="secondary" className="px-8 py-3">Começar Cadastro</Button>
            </div>
          )}
        </Card>
      )}
    </motion.div>
  );
}
