import React from 'react';

export function BeltBadge({ belt, size = 'md' }: { belt: string | null | undefined; size?: 'sm' | 'md' | 'lg' }) {
  if (!belt) return null;

  let style: React.CSSProperties = {};
  let className = "px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 border ";
  
  // Custom Gradients for striped belts
  if (belt.includes('Branca/Amarela')) {
    style = { background: 'linear-gradient(90deg, #ffffff 50%, #facc15 50%)', color: '#000', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Amarela/Verde')) {
    style = { background: 'linear-gradient(90deg, #facc15 50%, #22c55e 50%)', color: '#000', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Verde/Azul')) {
    style = { background: 'linear-gradient(90deg, #22c55e 50%, #3b82f6 50%)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Azul/Vermelha')) {
    style = { background: 'linear-gradient(90deg, #3b82f6 50%, #ef4444 50%)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' };
  } else if (belt.includes('Vermelha/Preta')) {
    style = { background: 'linear-gradient(90deg, #ef4444 50%, #000000 50%)', color: '#fff', borderColor: 'rgba(255,255,255,0.2)' };
  } 
  // Solid belts
  else if (belt.includes('Branca')) {
    className += 'bg-white text-black border-white/20';
  } else if (belt.includes('Cinza')) {
    className += 'bg-stone-500 text-white border-white/10';
  } else if (belt.includes('Amarela')) {
    className += 'bg-yellow-400 text-black border-yellow-500/50';
  } else if (belt.includes('Laranja')) {
    className += 'bg-orange-500 text-white border-orange-600/50';
  } else if (belt.includes('Verde Claro')) {
    className += 'bg-emerald-400 text-black border-emerald-500/50';
  } else if (belt.includes('Verde Escuro')) {
    className += 'bg-emerald-900 text-white border-emerald-800/50';
  } else if (belt.includes('Azul Claro')) {
    className += 'bg-sky-400 text-black border-sky-500/50';
  } else if (belt.includes('Azul Escuro')) {
    className += 'bg-blue-800 text-white border-blue-700/50';
  } else if (belt.includes('Vermelha Escura') || belt.includes('Bordô')) {
    className += 'bg-red-900 text-white border-red-800/50';
  } else if (belt.includes('Vermelha')) {
    className += 'bg-red-600 text-white border-red-500/50';
  } else if (belt.includes('Preta')) {
    className += 'bg-stone-950 text-white border-white/20 shadow-[0_0_10px_rgba(255,255,255,0.1)]';
  } else {
    className += 'bg-white/5 text-stone-400 border-white/5';
  }

  return (
    <span className={className} style={style}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-50" />
      {belt}
    </span>
  );
}
