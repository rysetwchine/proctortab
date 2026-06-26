import React from 'react';

interface ContentCardProps {
  children: React.ReactNode;
  className?: string;
}

export const ContentCard: React.FC<ContentCardProps> = ({ children, className = "" }) => {
  return (
    <div className={`bg-slate-900/60 backdrop-blur-md border border-slate-700/50 rounded-xl shadow-lg p-6 ${className}`}>
      {children}
    </div>
  );
};
