import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const Button = ({ 
  children, 
  className, 
  variant = 'primary', 
  ...props 
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' }) => {
  const variants = {
    primary: 'bg-red-600 text-white hover:bg-red-500 shadow-[0_0_20px_rgba(220,38,38,0.2)] hover:shadow-[0_0_30px_rgba(220,38,38,0.4)]',
    secondary: 'bg-white/5 text-white border border-white/10 hover:bg-white/10 hover:border-white/20',
    success: 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.4)]',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-[0_8_20px_rgba(220,38,38,0.2)]',
    ghost: 'bg-transparent text-stone-400 hover:bg-white/5 hover:text-white'
  };

  return (
    <button 
      className={cn(
        'px-4 py-2 rounded-xl font-bold uppercase text-[10px] tracking-[0.2em] transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-95',
        variants[variant],
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
};

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('bg-stone-900/40 backdrop-blur-2xl rounded-3xl border border-white/5 shadow-2xl overflow-hidden', className)}>
    {children}
  </div>
);

export const Input = ({ label, error, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string }) => (
  <div className="space-y-2 w-full">
    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">{label}</label>
    <div className="relative group">
      <input 
        className={cn(
          'w-full bg-white/5 px-4 py-3 rounded-2xl border border-white/5 text-white placeholder:text-stone-600 focus:ring-2 focus:ring-red-600/20 focus:border-red-600/50 outline-none transition-all',
          error && 'border-red-500/50 focus:ring-red-500/10 focus:border-red-500'
        )}
        {...props}
      />
    </div>
    {error && <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-1">{error}</p>}
  </div>
);

export const Select = ({ label, options, error, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; options: { value: string; label: string }[]; error?: string }) => (
  <div className="space-y-2 w-full">
    <label className="text-[10px] font-black text-stone-500 uppercase tracking-widest ml-1">{label}</label>
    <select 
      className={cn(
        'w-full bg-stone-900 px-4 py-3 rounded-2xl border border-white/5 text-white focus:ring-2 focus:ring-red-600/20 focus:border-red-600/50 outline-none transition-all appearance-none cursor-pointer',
        error && 'border-red-500/50 focus:ring-red-500/10 focus:border-red-500'
      )}
      {...props}
    >
      <option value="" className="bg-stone-900">Selecione...</option>
      {options.map(opt => (
        <option key={opt.value} value={opt.value} className="bg-stone-900">{opt.label}</option>
      ))}
    </select>
    {error && <p className="text-[10px] text-red-500 font-bold uppercase tracking-wider mt-1">{error}</p>}
  </div>
);
