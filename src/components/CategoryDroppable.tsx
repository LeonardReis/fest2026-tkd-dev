import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { cn } from './ui';

interface CategoryDroppableProps {
  id: string; // O groupKey da categoria
  children: React.ReactNode;
  athleteCount: number;
  className?: string;
}

export function CategoryDroppable({ id, children, athleteCount, className }: CategoryDroppableProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: id,
    data: {
      groupKey: id
    }
  });

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "relative rounded-3xl transition-all duration-300",
        isOver ? "ring-2 ring-amber-500 ring-offset-4 ring-offset-[#0a0a0a] bg-amber-500/5 scale-[1.02] z-40" : "bg-transparent",
        className
      )}
    >
      {isOver && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="px-4 py-2 bg-amber-500 text-white font-black text-xs uppercase rounded-full shadow-2xl animate-bounce">
            Soltar Aqui
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
