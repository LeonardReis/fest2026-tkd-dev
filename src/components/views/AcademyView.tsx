import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Plus, Camera, Edit, School } from 'lucide-react';
import { collection, addDoc, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { handleFirestoreError } from '../../utils';
import { PREDEFINED_ACADEMIES } from '../../constants';
import { Academy, UserProfile, OperationType } from '../../types';
import { Button, Card, Input, Select } from '../ui';

const UNIAO_LOPES_LOGO = "/logo-colombo.png";

export function AcademyView({ profile, academies, key }: { profile: UserProfile | null; academies: Academy[]; key?: string }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', coach: '', master: '', contact: '', logo: '' });
  const [isCustomName, setIsCustomName] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile || isSubmitting) return;
    setIsSubmitting(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'academies', editingId), formData);
      } else {
        await addDoc(collection(db, 'academies'), {
          ...formData,
          createdBy: profile.uid
        });
      }
      setIsAdding(false);
      setEditingId(null);
      setFormData({ name: '', coach: '', master: '', contact: '', logo: '' });
      setIsCustomName(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'academies');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEdit = (academy: Academy) => {
    setFormData({
      name: academy.name,
      coach: academy.coach || '',
      master: academy.master,
      contact: academy.contact,
      logo: academy.logo || ''
    });
    setEditingId(academy.id);
    setIsAdding(true);
    setIsCustomName(!PREDEFINED_ACADEMIES.some(a => a.value === academy.name));
  };

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
        setFormData(prev => ({ ...prev, logo: base64String }));
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao processar foto:", error);
      alert('Erro ao processar foto.');
      setIsUploading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black text-white italic uppercase tracking-tighter">Minha Academia</h2>
          <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gerencie os dados da sua equipe</p>
        </div>
        {!isAdding && (
          <Button onClick={() => setIsAdding(true)} variant="primary" className="flex items-center gap-2">
            <Plus className="w-5 h-5" /> 
            <span>Nova Academia</span>
          </Button>
        )}
      </header>

      {isAdding ? (
        <Card className="p-8 max-w-2xl mx-auto border-white/5 shadow-red-600/5">
          <form onSubmit={handleSubmit} className="space-y-8">
            <h3 className="text-xl font-black text-white italic uppercase tracking-tighter border-b border-white/5 pb-4">
              {editingId ? 'Editar Detalhes' : 'Nova Inscrição de Academia'}
            </h3>
            
            <div className="flex flex-col items-center gap-4 mb-8">
              <div className="relative group/photo">
                <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl opacity-0 group-hover/photo:opacity-100 transition-opacity" />
                {formData.logo ? (
                  <img src={formData.logo} alt="Logo" className="w-32 h-32 rounded-3xl border-2 border-white/10 shadow-2xl object-cover bg-white/5 relative z-10" />
                ) : (
                  <div className="w-32 h-32 rounded-3xl border-2 border-white/10 shadow-2xl bg-white/5 flex items-center justify-center relative z-10">
                    <School className="w-12 h-12 text-stone-700" />
                  </div>
                )}
                <button 
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-2 -right-2 p-3 bg-red-600 text-white rounded-2xl shadow-xl hover:bg-red-500 transition-all z-20 hover:scale-110 active:scale-90"
                  disabled={isUploading}
                >
                  <Camera className="w-5 h-5" />
                </button>
                <input 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  ref={fileInputRef}
                  onChange={handlePhotoUpload}
                />
              </div>
              <p className="text-[10px] text-stone-500 font-black uppercase tracking-widest">Escudo da Academia</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Select 
                label="Academia" 
                options={PREDEFINED_ACADEMIES} 
                value={isCustomName ? 'Outra' : formData.name}
                onChange={e => {
                  const val = e.target.value;
                  if (val === 'Outra') {
                    setIsCustomName(true);
                    setFormData({ ...formData, name: '' });
                  } else {
                    setIsCustomName(false);
                    setFormData({ ...formData, name: val });
                  }
                }}
                required
              />

              {isCustomName && (
                <Input 
                  label="Nome Personalizado" 
                  placeholder="Ex: União Lopes Matriz" 
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  required
                />
              )}

              <Input 
                label="Técnico Responsável" 
                placeholder="Nome do Técnico" 
                value={formData.coach}
                onChange={e => setFormData({ ...formData, coach: e.target.value })}
                required
              />
              <Input 
                label="WhatsApp de Contato" 
                placeholder="(00) 00000-0000" 
                value={formData.contact}
                onChange={e => setFormData({ ...formData, contact: e.target.value })}
                required
              />
              <Input 
                label="Mestre Responsável" 
                placeholder="Nome do Mestre" 
                value={formData.master}
                onChange={e => setFormData({ ...formData, master: e.target.value })}
                required
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-white/5">
              <Button type="submit" className="flex-1 py-4 text-sm" disabled={isSubmitting}>{isSubmitting ? 'Salvando...' : (editingId ? 'Salvar Alterações' : 'Confirmar Cadastro')}</Button>
              <Button type="button" variant="secondary" className="flex-1 py-4 text-sm" onClick={() => {
                setIsAdding(false);
                setEditingId(null);
                setFormData({ name: '', coach: '', master: '', contact: '', logo: '' });
                setIsCustomName(false);
              }}>Cancelar</Button>
            </div>
            
            <div className="pt-4 flex justify-center">
              <button 
                type="button" 
                className="text-[10px] font-black text-stone-600 hover:text-red-500 transition-colors uppercase tracking-[0.2em]"
                onClick={() => setFormData(prev => ({ ...prev, logo: UNIAO_LOPES_LOGO }))}
              >
                Resetar para Logo Oficial Festival
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {academies.map(academy => (
            <Card key={academy.id} className="p-8 group hover:border-red-600/30 transition-all duration-500 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full blur-3xl group-hover:bg-red-600/10 transition-colors" />
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex gap-4 items-center">
                    {academy.logo ? (
                      <img src={academy.logo} alt={academy.name} className="w-20 h-20 rounded-2xl object-cover bg-white/5 border border-white/10 p-1 shadow-2xl" />
                    ) : (
                      <div className="w-20 h-20 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-center p-1 shadow-2xl">
                        <School className="w-10 h-10 text-stone-700" />
                      </div>
                    )}
                    <div>
                      <h4 className="text-2xl font-black text-white italic tracking-tighter uppercase leading-none">{academy.name}</h4>
                      <div className="mt-2 flex items-center gap-2">
                        <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                        <span className="text-[10px] font-black text-stone-500 uppercase tracking-widest italic">Academia Ativa</span>
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" className="p-3 bg-white/5 hover:bg-red-600/20 group/edit" onClick={() => handleEdit(academy)}>
                    <Edit className="w-4 h-4 group-hover/edit:text-red-500 transition-colors" />
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-8 p-4 bg-white/[0.02] rounded-2xl border border-white/5">
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Técnico Principal</p>
                    <p className="text-sm font-bold text-white uppercase">{academy.coach}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">Mestre Responsável</p>
                    <p className="text-sm font-bold text-white uppercase">{academy.master}</p>
                  </div>
                  <div className="col-span-full space-y-1">
                    <p className="text-[10px] font-black text-stone-500 uppercase tracking-widest">WhatsApp / Contato</p>
                    <p className="text-sm font-bold text-white">{academy.contact}</p>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {academies.length === 0 && (
            <div className="col-span-full py-32 rounded-3xl border-2 border-dashed border-white/5 flex flex-col items-center justify-center gap-6 group hover:border-white/10 transition-colors">
              <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center border border-white/5 group-hover:scale-110 transition-transform duration-500">
                <School className="w-10 h-10 text-stone-700" />
              </div>
              <div className="text-center space-y-2">
                <p className="text-xl font-black text-white italic uppercase tracking-tighter">Nenhuma Academia</p>
                <p className="text-[10px] text-stone-600 uppercase font-black tracking-widest">Clique em "Nova Academia" para começar</p>
              </div>
              <Button onClick={() => setIsAdding(true)} variant="primary" className="px-10 py-4"><Plus className="w-5 h-5" /> Cadastrar agora</Button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
