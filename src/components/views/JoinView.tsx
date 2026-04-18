import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Smartphone, Loader2, CheckCircle2, QrCode, LayoutGrid, User, MapPin, Monitor } from 'lucide-react';
import { Button, Card, Input } from '../ui';
import { registerWaitingDevice, updateDeviceHeartbeat, assignDeviceToCourt, ARENA_ACCESS_PIN } from '../../services/courtService';
import { db, auth } from '../../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';

type Step = 'name' | 'pin' | 'court' | 'role' | 'completing';

export function JoinView({ onNavigate }: { onNavigate: (view: any, params: any) => void }) {
  const [step, setStep] = useState<Step>('name');
  const [deviceName, setDeviceName] = useState('');
  const [inputPin, setInputPin] = useState('');
  const [selectedCourt, setSelectedCourt] = useState<1 | 2 | 3 | null>(null);
  const [selectedRole, setSelectedRole] = useState<{ label: string, index: number } | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [preSelectedCourt, setPreSelectedCourt] = useState<number | null>(null);
  const [preSelectedType, setPreSelectedType] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const c = params.get('court');
    const t = params.get('type');
    if (c) setPreSelectedCourt(parseInt(c));
    if (t) setPreSelectedType(t.toLowerCase());
  }, []);

  const handleRegisterName = async () => {
    if (!deviceName.trim()) return;
    setLoading(true);
    try {
      if (!auth.currentUser) await signInAnonymously(auth);
      const id = await registerWaitingDevice(deviceName);
      setDeviceId(id);
      setStep('pin');
    } catch (err: any) {
      alert("Erro ao registrar: " + (err.message || "Tente novamente."));
    } finally {
      setLoading(false);
    }
  };

  const handleValidatePin = () => {
    if (inputPin === ARENA_ACCESS_PIN) {
      if (preSelectedCourt) {
        console.log("🚀 Usando Arena pré-selecionada:", preSelectedCourt);
        handleCourtSelect(preSelectedCourt as any);
      } else {
        setStep('court');
      }
    } else {
      alert("PIN de Acesso Inválido. Verifique no Organizador de Arena.");
      setInputPin('');
    }
  };

  const handleCourtSelect = (courtId: number) => {
    setSelectedCourt(courtId as any);
    
    // Se vier da URL como poomsae, ou se for a quadra 1 (legado/fallback)
    const isPoomsae = preSelectedType === 'poomsae' || (courtId === 1 && !preSelectedType);

    if (isPoomsae) {
      setStep('role');
    } else {
      setSelectedRole({ label: 'Mesário', index: 0 });
      setStep('completing');
    }
  };

  const handleRoleSelect = (role: { label: string, index: number }) => {
    setSelectedRole(role);
    setStep('completing');
  };

  useEffect(() => {
    if (step === 'completing' && deviceId && selectedCourt && selectedRole) {
      const completeAssignment = async () => {
        setLoading(true);
        try {
          const sessionId = `arena_court_${selectedCourt}`;
          await assignDeviceToCourt(deviceId, selectedCourt, sessionId, `${deviceName} (${selectedRole.label})`, selectedRole.index);
          onNavigate('court', { sessionId, deviceId });
        } catch (err) {
          alert("Erro na atribuição. Reinicie o processo.");
          setStep('name');
        } finally {
          setLoading(false);
        }
      };
      completeAssignment();
    }
  }, [step, deviceId, selectedCourt, selectedRole, onNavigate, deviceName]);

  useEffect(() => {
    if (!deviceId) return;
    const interval = setInterval(() => updateDeviceHeartbeat(deviceId), 30000);
    return () => clearInterval(interval);
  }, [deviceId]);

  return (
    <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 text-white font-sans overflow-hidden">
      {/* Background Dinâmico */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-30">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] bg-red-600/20 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] bg-blue-600/20 rounded-full blur-[150px] animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }} 
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-10">
          <div className="w-24 h-24 bg-gradient-to-br from-red-600 to-red-900 rounded-[2.5rem] flex items-center justify-center mx-auto mb-8 shadow-[0_20px_40px_rgba(220,38,38,0.3)]">
            <Shield className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-black uppercase italic tracking-tighter leading-none">
            Pareamento<br/>de Arena
          </h1>
          <p className="text-stone-500 text-[10px] font-black uppercase tracking-[0.4em] mt-4">
            Security & Access Portal
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'name' && (
            <motion.div key="name" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}>
              <Card className="p-10 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[3rem]">
                <div className="space-y-8">
                  <div className="text-center">
                    <User className="w-8 h-8 text-red-500 mx-auto mb-4" />
                    <h3 className="text-sm font-black uppercase tracking-widest text-stone-400">Identificação</h3>
                  </div>
                  <Input 
                    label="Identificador do Dispositivo"
                    placeholder="Ex: Tablet_01 ou Seu Nome" 
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    className="bg-black/50 border-white/10 h-16 text-center text-xl font-bold rounded-2xl focus:border-red-600 transition-all"
                  />
                  <Button 
                    onClick={handleRegisterName} 
                    disabled={loading || !deviceName}
                    className="w-full h-20 bg-red-600 hover:bg-white hover:text-red-600 text-white font-black uppercase tracking-[0.2em] text-xs shadow-2xl rounded-3xl transition-all"
                  >
                    {loading ? <Loader2 className="w-6 h-6 animate-spin mx-auto" /> : "Prosseguir"}
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 'pin' && (
            <motion.div key="pin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <Card className="p-10 bg-white/5 backdrop-blur-3xl border border-white/10 rounded-[3rem]">
                <div className="space-y-8">
                   <div className="text-center font-black uppercase tracking-widest text-red-500 text-xs">
                     Validação de Segurança
                   </div>
                   <Input 
                    label="PIN de Acesso à Arena"
                    type="password"
                    placeholder="••••••" 
                    value={inputPin}
                    onChange={(e) => setInputPin(e.target.value)}
                    className="bg-black/50 border-white/10 h-20 text-center text-4xl font-black tracking-[0.3em] rounded-2xl"
                  />
                  <Button 
                    onClick={handleValidatePin}
                    className="w-full h-20 bg-white text-black font-black uppercase tracking-[0.2em] text-xs shadow-2xl rounded-3xl"
                  >
                    Validar Acesso
                  </Button>
                  <button onClick={() => setStep('name')} className="w-full text-[10px] font-black uppercase text-stone-600 hover:text-white transition-all">
                    Voltar
                  </button>
                </div>
              </Card>
            </motion.div>
          )}

          {step === 'court' && (
            <motion.div key="court" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
              <div className="space-y-4">
                 <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-stone-500 mb-6">Selecione o Posto de Trabalho</p>
                 {[1, 2, 3].map(c => (
                   <button
                    key={c}
                    onClick={() => handleCourtSelect(c as 1|2|3)}
                    className="w-full p-8 bg-white/5 border border-white/10 rounded-[2.5rem] flex items-center justify-between hover:bg-red-600 transition-all group"
                   >
                     <div className="flex items-center gap-6">
                        <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center border border-white/10 group-hover:bg-white group-hover:text-red-600">
                           <span className="text-xl font-black italic">{c}</span>
                        </div>
                        <div className="text-left">
                           <h4 className="text-lg font-black uppercase italic leading-none">Arena {c}</h4>
                           <p className="text-[10px] font-bold text-stone-500 group-hover:text-red-100 uppercase tracking-widest mt-1">
                             {c === 1 ? 'Poomsae / Kyopa' : 'Kyorugui / Festival'}
                           </p>
                        </div>
                     </div>
                     <MapPin className="w-6 h-6 text-stone-700 group-hover:text-white" />
                   </button>
                 ))}
              </div>
            </motion.div>
          )}

          {step === 'role' && (
            <motion.div key="role" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="space-y-4">
                <p className="text-center text-[10px] font-black uppercase tracking-[0.3em] text-stone-500 mb-6">Defina sua Função</p>
                {[
                  { label: 'Mesário (Principal)', index: 0 },
                  { label: 'Juiz 01', index: 1 },
                  { label: 'Juiz 02', index: 2 },
                  { label: 'Juiz 03', index: 3 }
                ].map(r => (
                  <button
                    key={r.index}
                    onClick={() => handleRoleSelect(r)}
                    className="w-full p-6 bg-white/5 border border-white/10 rounded-3xl flex items-center justify-between hover:bg-blue-600 transition-all group"
                  >
                    <span className="text-sm font-black uppercase italic tracking-widest">{r.label}</span>
                    <LayoutGrid className="w-5 h-5 text-stone-700 group-hover:text-white" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'completing' && (
            <motion.div key="completing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center space-y-8 p-10">
               <div className="relative inline-block">
                 <Loader2 className="w-20 h-20 text-red-600 animate-spin" />
                 <QrCode className="w-8 h-8 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
               </div>
               <div className="space-y-2">
                 <h3 className="text-xl font-black uppercase italic tracking-widest">Sincronizando...</h3>
                 <p className="text-stone-500 text-[10px] font-bold uppercase tracking-widest">Estabelecendo conexão segura com a Arena</p>
               </div>
            </motion.div>
          )}
        </AnimatePresence>

        {step === 'name' && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            transition={{ delay: 0.5 }}
            className="mt-8 flex flex-col items-center gap-4"
          >
            <div className="h-px w-12 bg-white/10" />
            <button 
              onClick={() => onNavigate('call-panel', {})}
              className="flex items-center gap-3 px-6 py-3 bg-white/5 hover:bg-white/10 border border-white/5 rounded-2xl transition-all group"
            >
              <Monitor className="w-4 h-4 text-stone-500 group-hover:text-red-500 transition-colors" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 group-hover:text-white">
                Abrir Painel de Chamadas Pública
              </span>
            </button>
          </motion.div>
        )}

        <p className="mt-16 text-center text-stone-700 text-[9px] font-black uppercase tracking-[0.3em] italic">
          Indomitable Spirit Arena Protocol • v2.0
        </p>
      </motion.div>
    </div>
  );
}
