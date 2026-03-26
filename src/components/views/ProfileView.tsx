import React, { useState, useRef } from 'react';
import { motion } from 'motion/react';
import { Camera } from 'lucide-react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserProfile } from '../../types';
import { User } from 'firebase/auth';
import { Button, Card, Input, Select } from '../ui';

export function ProfileView({ profile, user, key }: { profile: UserProfile | null; user: User; key?: string }) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;

    if (file.size > 800000) {
      alert('A imagem é muito grande. Por favor, envie uma imagem menor (máx 800KB).');
      return;
    }

    setIsUploading(true);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        await updateDoc(doc(db, 'users', profile.uid), {
          photoURL: base64String
        });
        alert('Foto atualizada com sucesso!');
        setIsUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error("Erro ao atualizar foto:", error);
      alert('Erro ao atualizar foto.');
      setIsUploading(false);
    }
  };

  const handleUseGooglePhoto = async () => {
    if (!profile || !user.photoURL) return;
    try {
      await updateDoc(doc(db, 'users', profile.uid), {
        photoURL: user.photoURL
      });
      alert('Foto do Google vinculada com sucesso!');
    } catch (error) {
      console.error("Erro ao atualizar foto:", error);
      alert('Erro ao atualizar foto.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-10 max-w-4xl mx-auto">
      <header>
        <h2 className="text-3xl font-black text-white italic uppercase tracking-tighter">Meu Perfil</h2>
        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest mt-1">Gerenciamento de conta e identidade</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <Card className="md:col-span-1 p-8 border-white/5 bg-white/[0.02] flex flex-col items-center text-center">
          <div className="relative group/avatar">
            <div className="absolute inset-0 bg-red-600/20 rounded-full blur-2xl opacity-0 group-hover/avatar:opacity-100 transition-opacity" />
            <img 
              src={profile?.photoURL || user.photoURL || ''} 
              alt="Avatar" 
              className="w-40 h-40 rounded-full border-4 border-white/10 shadow-2xl object-cover bg-stone-900 relative z-10"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-2 right-2 p-4 bg-red-600 text-white rounded-2xl shadow-xl hover:bg-red-700 transition-all z-20 group-hover/avatar:scale-110"
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
          
          <div className="mt-8 space-y-2">
            <h3 className="text-2xl font-black text-white uppercase tracking-tighter italic">{profile?.displayName || user.displayName}</h3>
            <p className="text-[10px] font-black text-red-500 uppercase tracking-[0.2em]">{profile?.role}</p>
          </div>
        </Card>

        <Card className="md:col-span-2 p-10 border-white/5 bg-white/[0.02] space-y-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-10">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">E-mail de Acesso</label>
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-white font-bold tracking-tight">
                {profile?.email}
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">UID do Sistema</label>
              <div className="p-4 bg-black/40 border border-white/5 rounded-2xl text-stone-500 font-mono text-[10px] truncate">
                {profile?.uid}
              </div>
            </div>
            <div className="space-y-2">
              <Input 
                label="Ano de Nascimento" 
                type="number" 
                min="1900"
                max="2026"
                value={profile?.birthYear || ''} 
                onChange={async (e) => {
                  try {
                    await updateDoc(doc(db, 'users', profile!.uid), { birthYear: Number(e.target.value) });
                  } catch (err) {
                    alert('Erro ao atualizar ano de nascimento.');
                  }
                }} 
              />
            </div>
            <div className="space-y-2">
              <Select 
                label="Gênero" 
                options={[
                  { value: 'M', label: 'Masculino' }, 
                  { value: 'F', label: 'Feminino' }
                ]} 
                value={profile?.gender || 'M'}
                onChange={async (e) => {
                  try {
                    await updateDoc(doc(db, 'users', profile!.uid), { gender: e.target.value });
                  } catch (err) {
                    alert('Erro ao atualizar gênero.');
                  }
                }}
              />
            </div>
          </div>

          <div className="pt-6 border-t border-white/5">
             <h4 className="text-[10px] font-black text-stone-500 uppercase tracking-widest mb-6 ml-1">Sincronização de Foto</h4>
             <div className="flex flex-col sm:flex-row gap-4">
              <Button 
                variant="primary" 
                className="flex-1 py-4"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? 'Processando...' : 'Carregar Nova Imagem'}
              </Button>
              {user.photoURL && (
                <Button 
                  variant="secondary" 
                  className="flex-1 py-4"
                  onClick={handleUseGooglePhoto}
                >
                  Vincular Foto do Google
                </Button>
              )}
            </div>
            <p className="text-[9px] text-stone-600 font-bold uppercase tracking-widest mt-6 text-center italic">
              Imagens recomendadas em formato quadrado (máx 800KB)
            </p>
          </div>
        </Card>
      </div>
    </motion.div>
  );
}
