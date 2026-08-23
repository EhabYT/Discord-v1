import React from 'react';

export default function AuthLayout({ eyebrow, title, description, children, footer }) {
  return (
    <main className="min-h-screen overflow-auto flex items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-md animate-slide-up">
        <a href="/" className="flex items-center justify-center gap-3 mb-6">
          <img src="/eb_logo.svg" alt="EB BOT" className="w-12 h-12 rounded-2xl object-cover ring-1 ring-white/10" />
          <div><p className="text-sm font-bold text-white">EB BOT</p><p className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">Dashboard V2</p></div>
        </a>
        <section className="cyber-card p-5 sm:p-7">
          <p className="cyber-label text-cyan-300">{eyebrow}</p>
          <h1 className="text-2xl font-bold text-white mt-2">{title}</h1>
          <p className="text-sm text-zinc-500 mt-2 leading-relaxed">{description}</p>
          <div className="mt-6">{children}</div>
        </section>
        {footer && <p className="text-xs text-zinc-500 text-center mt-5">{footer}</p>}
      </div>
    </main>
  );
}
