import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, ShieldAlert, Users } from 'lucide-react';
import { Button, Card } from './ui';

interface WinnerReasonModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (reason: 'superiority' | 'punches' | 'referee') => void;
  winnerName: string;
}

export function WinnerReasonModal({ isOpen, onClose, onSelect, winnerName }: WinnerReasonModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="w-full max-w-md bg-stone-900 border border-white/10 rounded-[32px] overflow-hidden shadow-2xl"
      >
        <div className="p-8 border-b border-white/5">
          <div className="w-12 h-12 rounded-2xl bg-amber-600/20 flex items-center justify-center mb-4">
            <AlertCircle className="w-6 h-6 text-amber-500" />
          </div>
          <h3 className="text-xl font-black text-white uppercase tracking-tight">Decisão Técnica</h3>
          <p className="text-xs text-stone-500 font-bold uppercase tracking-widest mt-2">
            A luta terminou empatada. Selecione o motivo da vitória de <span className="text-amber-500">{winnerName}</span>:
          </p>
        </div>

        <div className="p-6 space-y-3">
          <ReasonButton 
            icon={<ShieldAlert className="w-5 h-5" />}
            title="Superioridade Técnica"
            description="Baseado no volume de luta e combatividade"
            onClick={() => onSelect('superiority')}
          />
          <ReasonButton 
            icon={<Users className="w-5 h-5" />}
            title="Decisão por Punhos"
            description="Maior número de socos válidos computados"
            onClick={() => onSelect('punches')}
          />
          <ReasonButton 
            icon={<CheckCircle2 className="w-5 h-5" />}
            title="Decisão Arbitral"
            description="Escolha do árbitro central em consenso"
            onClick={() => onSelect('referee')}
          />
        </div>

        <div className="p-6 bg-black/40 flex justify-end">
          <Button variant="ghost" onClick={onClose} className="text-[10px] font-black uppercase tracking-widest">
            Cancelar
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

function ReasonButton({ icon, title, description, onClick }: { icon: React.ReactNode, title: string, description: string, onClick: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all flex items-center gap-4 text-left group"
    >
      <div className="w-10 h-10 rounded-xl bg-stone-800 flex items-center justify-center text-stone-400 group-hover:text-amber-500 transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-sm font-black text-white uppercase tracking-tight">{title}</p>
        <p className="text-[10px] text-stone-500 font-bold uppercase tracking-widest">{description}</p>
      </div>
    </button>
  );
}
