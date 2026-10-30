import React from 'react';
import { useI18n } from '../i18n.jsx';
import { rememberReturn } from '../lib/returnUrl.js';

function ProviderMark({ provider }) {
  if (provider === 'discord') {
    return (
      <span aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-gradient-to-br from-[#6875ff] to-[#4752c4] text-white shadow-[0_5px_14px_rgba(88,101,242,0.24)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" focusable="false">
          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.211.375-.444.866-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .032.055 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.027c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.29a.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.196.373.29a.077.077 0 0 1-.006.128c-.599.35-1.225.649-1.873.891a.076.076 0 0 0-.04.107c.36.698.772 1.362 1.225 1.993a.077.077 0 0 0 .084.028 19.83 19.83 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 0 0-.031-.027ZM8.02 15.33c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.419 0 1.333-.955 2.419-2.157 2.419Zm7.974 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.211 0 2.176 1.096 2.157 2.419 0 1.333-.955 2.419-2.157 2.419Z" />
        </svg>
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white shadow-[0_5px_14px_rgba(255,255,255,0.08)]">
      <span className="bg-clip-text text-[21px] font-black leading-none text-transparent bg-[conic-gradient(from_-45deg,#4285F4_0_25%,#34A853_25%_48%,#FBBC05_48%_72%,#EA4335_72%_88%,#4285F4_88%)]">G</span>
    </span>
  );
}

export default function OAuthButtons({ auth = {}, returnParam, mode = 'login' }) {
  const { t } = useI18n();
  // Keep both options visible even when an OAuth provider is not configured.
  // A hidden button looks like a missing feature; a disabled, labeled option
  // tells the user it exists but cannot be used in this environment.
  const providers = [
    {
      id: 'discord',
      enabled: Boolean(auth.oauthEnabled),
      href: '/api/auth/discord',
      label: t(mode === 'signup' ? 'auth.signupDiscord' : 'auth.continueDiscord', mode === 'signup' ? 'Sign up with Discord' : 'Continue with Discord'),
    },
    {
      id: 'google',
      enabled: Boolean(auth.googleOAuthEnabled),
      href: '/api/auth/google',
      label: t(mode === 'signup' ? 'auth.signupGoogle' : 'auth.continueGoogle', mode === 'signup' ? 'Sign up with Google' : 'Continue with Google'),
    },
  ];

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-zinc-400">
        <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
        <span>{t('auth.or', 'or')}</span>
        <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
      </div>
      <div className="grid grid-cols-1 gap-2.5">
        {providers.map((provider) => {
          const unavailableLabel = t('auth.providerUnavailable', 'Unavailable');
          const contents = (
            <span className={`flex min-w-0 items-center gap-3 ${provider.enabled ? 'justify-center' : 'w-full justify-start text-start'}`}>
              <ProviderMark provider={provider.id} />
              <span className="min-w-0 flex-1">
                <span className={`block leading-tight ${provider.enabled ? '' : 'text-[14px] font-semibold text-zinc-100'}`}>
                  {provider.label}
                </span>
                {!provider.enabled && (
                  <span id={`oauth-${provider.id}-status`} className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium leading-tight text-zinc-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-300/80 shadow-[0_0_8px_rgba(252,211,77,0.32)]" aria-hidden="true" />
                    {unavailableLabel}
                  </span>
                )}
              </span>
            </span>
          );
          const className = `w-full rounded-2xl border px-4 py-3 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
            provider.enabled
              ? 'flex min-h-14 items-center justify-center border-white/10 bg-white/[0.04] text-zinc-100 hover:bg-white/[0.08] hover:border-cyan-300/30'
              : 'flex min-h-[68px] items-center justify-start border-white/[0.10] bg-gradient-to-r from-white/[0.055] via-white/[0.025] to-white/[0.04] text-zinc-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)] cursor-not-allowed'
          }`;

          return provider.enabled ? (
            <a
              key={provider.id}
              href={provider.href}
              onClick={() => rememberReturn(returnParam)}
              className={className}
            >
              {contents}
            </a>
          ) : (
            <button
              key={provider.id}
              type="button"
              aria-disabled="true"
              aria-label={provider.label}
              aria-describedby={`oauth-${provider.id}-status`}
              title={t('auth.providerUnavailable', 'This sign-in provider is not enabled on this server.')}
              className={className}
            >
              {contents}
            </button>
          );
        })}
      </div>
      {providers.some((provider) => !provider.enabled) && (
        <p role="note" className="text-center text-[11px] text-zinc-400 leading-relaxed">
          {t('auth.oauthUnavailableHint', 'Social sign-in is not configured on this server yet.')}
        </p>
      )}
    </div>
  );
}
