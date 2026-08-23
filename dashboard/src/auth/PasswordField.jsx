import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export default function PasswordField({ label = 'Password', ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="block">
      <span className="cyber-label">{label}</span>
      <span className="relative block mt-1.5">
        <input {...props} type={visible ? 'text' : 'password'} className="cyber-input pr-11" />
        <button type="button" onClick={() => setVisible(value => !value)} className="absolute right-1 top-1/2 -translate-y-1/2 cyber-icon-button" aria-label={visible ? 'Hide password' : 'Show password'}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </label>
  );
}

export function PasswordStrength({ password }) {
  const length = password.length;
  const score = Math.min(4, (length >= 15 ? 2 : length >= 10 ? 1 : 0) + (length >= 20 ? 1 : 0) + (new Set(password).size >= 10 ? 1 : 0));
  const labels = ['Too short', 'Weak', 'Acceptable', 'Strong', 'Very strong'];
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1">{[1, 2, 3, 4].map(value => <span key={value} className={`h-1 rounded-full ${score >= value ? 'bg-cyan-400' : 'bg-white/[0.07]'}`} />)}</div>
      <p className="text-[11px] text-zinc-600 mt-1">{labels[score]} · minimum 15 characters</p>
    </div>
  );
}
