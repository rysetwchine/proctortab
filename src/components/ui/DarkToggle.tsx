import React from 'react';

interface DarkToggleProps {
  id?: string;
  enabled: boolean;
  onChange: () => void;
}

export const DarkToggle: React.FC<DarkToggleProps> = ({ id, enabled, onChange }) => (
  <button
    id={id}
    type="button"
    onClick={onChange}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-300 ${
      enabled ? 'bg-cyan-600' : 'bg-slate-700'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-300 ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);
