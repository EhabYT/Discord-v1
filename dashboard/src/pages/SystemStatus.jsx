import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity, Bot, CheckCircle2, Database, Languages, Monitor, RefreshCw,
  ShieldCheck, XCircle,
} from 'lucide-react';
import api from '../api.js';
import PageHeader from '../components/PageHeader.jsx';
import { useI18n } from '../i18n.jsx';

const CHECK_META = {
  dashboardBuilt: { icon: Monitor, en: 'Dashboard build', ar: 'بناء لوحة التحكم' },
  databaseOnline: { icon: Database, en: 'Supabase PostgreSQL', ar: 'قاعدة Supabase' },
  discordConfigured: { icon: Bot, en: 'Discord configuration', ar: 'إعداد Discord' },
  oauthConfigured: { icon: ShieldCheck, en: 'Discord OAuth', ar: 'دخول Discord' },
  botOnline: { icon: Activity, en: 'Bot connection', ar: 'اتصال البوت' },
};

export default function SystemStatus({ pageHint }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setError('');
    try {
      setSnapshot(await api.get('/api/developer/system-status'));
    } catch (err) {
      setError(err.message || 'Status request failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="page-shell">
      <PageHeader
        icon={Activity}
        title={ar ? 'حالة النظام' : 'System status'}
        subtitle={ar ? 'جاهزية Dashboard وDiscord وSupabase' : (pageHint || 'Dashboard, Discord and Supabase readiness')}
      >
        <button onClick={refresh} disabled={loading} className="cyber-button inline-flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {ar ? 'تحديث' : 'Refresh'}
        </button>
      </PageHeader>

      {error && <div className="cyber-warning text-sm text-amber-200">{error}</div>}

      <section className="cyber-card-accent p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="cyber-label">EB Dashboard V2</p>
          <h2 className="text-2xl font-bold text-white mt-1">{snapshot?.release || '2.0.0'}</h2>
          <p className="text-xs text-zinc-500 mt-1">
            {ar ? 'واجهة API' : 'API'} {snapshot?.apiVersion || 'v2'}
          </p>
        </div>
        <span className={`self-start sm:self-auto inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold ${
          snapshot?.status === 'ready'
            ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300'
            : 'border-amber-400/30 bg-amber-400/10 text-amber-300'
        }`}>
          {snapshot?.status === 'ready' ? <CheckCircle2 size={15} /> : <XCircle size={15} />}
          {snapshot?.status === 'ready' ? (ar ? 'جاهز' : 'Ready') : (ar ? 'إعداد غير مكتمل' : 'Degraded')}
        </span>
      </section>

      {snapshot?.botBootstrap && snapshot.botBootstrap.state !== 'ready' && (
        <section className="cyber-info">
          <Bot size={17} className="text-cyan-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-cyan-100">
              {ar ? 'حالة إعادة اتصال البوت' : 'Bot recovery state'}: {snapshot.botBootstrap.state}
            </p>
            <p className="text-xs text-cyan-200/65 mt-1">
              {snapshot.botBootstrap.lastError || (ar ? 'في انتظار الإعداد' : 'Waiting for configuration')}
              {snapshot.botBootstrap.nextRetryAt
                ? ` · ${ar ? 'المحاولة التالية' : 'next retry'} ${new Date(snapshot.botBootstrap.nextRetryAt).toLocaleTimeString(locale)}`
                : ''}
            </p>
          </div>
        </section>
      )}

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(CHECK_META).map(([key, meta]) => {
          const ok = !!snapshot?.checks?.[key];
          const Icon = meta.icon;
          return (
            <div key={key} className="cyber-card p-4 flex items-center gap-3">
              <span className={`w-10 h-10 rounded-xl border flex items-center justify-center ${
                ok ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-red-400/20 bg-red-400/10 text-red-300'
              }`}><Icon size={17} /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{ar ? meta.ar : meta.en}</p>
                <p className={`text-xs mt-0.5 ${ok ? 'text-emerald-400' : 'text-red-400'}`}>
                  {ok ? (ar ? 'يعمل' : 'Operational') : (ar ? 'غير جاهز' : 'Not ready')}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      {snapshot?.databaseError && (
        <section className="cyber-warning">
          <Database size={17} className="text-amber-300 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-100">{ar ? 'مشكلة قاعدة البيانات' : 'Database issue'}</p>
            <p className="text-xs text-amber-200/70 mt-1 break-words">{snapshot.databaseError}</p>
          </div>
        </section>
      )}

      <section className="cyber-card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Languages size={16} className="text-cyan-300" />
          <h3 className="text-sm font-semibold text-white">{ar ? 'قدرات V2' : 'V2 capabilities'}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {(snapshot?.capabilities?.bilingual || ['en', 'ar']).map((lang) => (
            <span key={lang} className="cyber-badge-cyan">{lang.toUpperCase()}</span>
          ))}
          {snapshot?.capabilities?.rtl && <span className="cyber-badge-purple">RTL</span>}
          {(snapshot?.capabilities?.realtime || []).map((item) => (
            <span key={item} className="cyber-badge-green">{item}</span>
          ))}
          <span className="cyber-badge-yellow">{snapshot?.capabilities?.storage || 'supabase-postgresql'}</span>
        </div>
      </section>
    </div>
  );
}
