import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useI18n } from '../i18n.jsx';

export default function PasswordField({ label, ...props }) {
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const resolvedLabel = label || t('auth.password', 'Password');
  return (
    <label className="block">
      <span className="cyber-label">{resolvedLabel}</span>
      <span className="relative block mt-1.5">
        <input {...props} type={visible ? 'text' : 'password'} className="cyber-input pr-11" />
        <button type="button" onClick={() => setVisible(value => !value)} className="absolute right-1 top-1/2 -translate-y-1/2 cyber-icon-button" aria-label={visible ? t('auth.hidePw', 'Hide password') : t('auth.showPw', 'Show password')}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </span>
    </label>
  );
}

export function PasswordStrength({ password }) {
  const { t } = useI18n();
  const length = password.length;
  const score = Math.min(4, (length >= 15 ? 2 : length >= 10 ? 1 : 0) + (length >= 20 ? 1 : 0) + (new Set(password).size >= 10 ? 1 : 0));
  const labels = [
    t('auth.pwTooShort', 'Too short'),
    t('auth.pwWeak', 'Weak'),
    t('auth.pwAcceptable', 'Acceptable'),
    t('auth.pwStrong', 'Strong'),
    t('auth.pwVeryStrong', 'Very strong'),
  ];
  return (
    <div className="mt-2">
      <div className="grid grid-cols-4 gap-1" role="img" aria-label={`${labels[score]}`}>{[1, 2, 3, 4].map(value => <span key={value} className={`h-1 rounded-full ${score >= value ? 'bg-cyan-400' : 'bg-white/[0.07]'}`} />)}</div>
      <p className="text-[11px] text-zinc-500 mt-1">{labels[score]} · {t('auth.pwMin', 'minimum 15 characters')}</p>
    </div>
  );
}
