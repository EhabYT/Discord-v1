import React from 'react';

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <main className="min-h-screen overflow-auto flex items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[36rem] max-w-[90vw] h-64 bg-gradient-to-r from-cyan-400/[0.08] via-sky-400/[0.05] to-indigo-400/[0.08] blur-3xl rounded-full" />
      </div>
      <div className="relative w-full max-w-md animate-slide-up">
        <a href="/" className="flex items-center justify-center gap-3 mb-6 group">
          <span className="relative">
            <span className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-cyan-400/30 to-indigo-400/30 blur-md opacity-70 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
            <img src="/eb_logo.svg" alt="EB BOT" className="relative w-12 h-12 rounded-2xl object-cover ring-1 ring-white/15" />
          </span>
          <div className="text-left"><p className="text-sm font-bold text-white tracking-tight">EB BOT</p><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Dashboard V2</p></div>
        </a>
        <section className="glass-panel gradient-border p-5 sm:p-7 relative overflow-hidden">
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent pointer-events-none" aria-hidden="true" />
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-cyan-200">{eyebrow}</p>
          <h1 className="text-2xl font-bold text-white mt-2 tracking-tight">{title}</h1>
          <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
        {footer && <p className="text-xs text-zinc-500 text-center mt-5 leading-relaxed">{footer}</p>}
      </div>
    </main>
  );
}
