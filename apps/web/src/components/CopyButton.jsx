import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { copyText } from '../lib/clipboard.js';

export default function CopyButton({
  value,
  label = 'Copy',
  copiedLabel = 'Copied',
  className = '',
  onCopied,
}) {
  const [ok, setOk] = useState(false);

  const run = async (e) => {
    e?.stopPropagation?.();
    const done = await copyText(value);
    if (!done) return;
    setOk(true);
    onCopied?.();
    setTimeout(() => setOk(false), 1600);
  };

  return (
    <button
      type="button"
      onClick={run}
      aria-live="polite"
      aria-label={ok ? copiedLabel : `${label}: ${value}`}
      title={value}
      className={`${className || 'cyber-button flex items-center gap-1.5 text-xs py-1.5 px-3'} min-h-[36px]`}
    >
      {ok
        ? <Check size={12} className="text-emerald-300" aria-hidden="true" />
        : <Copy size={12} aria-hidden="true" />}
      {ok ? copiedLabel : label}
    </button>
  );
}
