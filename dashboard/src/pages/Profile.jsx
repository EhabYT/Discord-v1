import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, BadgeCheck, Bell, Camera, Check, CheckCircle2, ChevronRight, Code2,
  Clock, Gamepad2, Globe, KeyRound, Link2, LockKeyhole, LogOut, Mail, MapPin,
  Monitor, Moon, QrCode, RefreshCw, Save, ShieldCheck, Smartphone, Sun,
  Upload, UserRound, X,
} from 'lucide-react';
import PageHeader from '../components/PageHeader.jsx';
import CyanToggle from '../components/CyanToggle.jsx';
import ConfirmModal from '../components/ConfirmModal.jsx';
import EmptyState from '../components/EmptyState.jsx';
import PasswordField, { PasswordStrength } from '../auth/PasswordField.jsx';
import { useAuth } from '../auth/AuthContext.jsx';
import { useToast } from '../components/Toast.jsx';
import { useI18n, LOCALES } from '../i18n.jsx';
import { timeAgo } from '../lib/time.js';
import api from '../api.js';

// ---------------------------------------------------------------------------
// Device-scoped linkage only. Identity, password, MFA, sessions, Discord
// linkage, bio and preferences are owned by the account API; GitHub/Google
// OAuth has no backend yet, so those two links persist per-account in
// localStorage until real OAuth lands (labeled "On this device" in the UI).
// ---------------------------------------------------------------------------
function readText(key, fallback = '') {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function writeText(key, value) {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

// Merge the server projection over client defaults so sessions minted before
// the bio/preferences columns existed still render (and save) sanely.
function prefsFromAccount(account) {
  const raw = account?.preferences && typeof account.preferences === 'object' ? account.preferences : {};
  const notifications = raw.notifications && typeof raw.notifications === 'object' ? raw.notifications : {};
  return {
    theme: ['light', 'dark', 'system'].includes(raw.theme) ? raw.theme : 'dark',
    language: ['en', 'ar', 'de', 'fr', 'es', 'tr'].includes(raw.language) ? raw.language : 'en',
    timeZone: typeof raw.timeZone === 'string' ? raw.timeZone : '',
    notifications: {
      email: notifications.email !== false,
      push: notifications.push !== false,
      marketing: notifications.marketing === true,
    },
  };
}

const BIO_MAX = 160;
const USERNAME_RE = /^[A-Za-z][A-Za-z0-9_]{2,23}$/;
const TIMEZONES = (() => {
  try {
    if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone');
  } catch { /* fall through */ }
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Europe/Paris', 'Africa/Cairo', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Pacific/Auckland'];
})();

// Username validation returns a stable code (not a message) so the component
// can render it through the locale dictionaries.
function validateUsername(value) {
  if (!value) return 'required';
  if (value.length < 3 || value.length > 24) return 'length';
  if (!USERNAME_RE.test(value)) return 'format';
  return '';
}

function usernameErrorText(code, t) {
  if (code === 'required') return t('profile.usernameErrRequired', 'Username is required.');
  if (code === 'length') return t('profile.usernameErrLength', 'Use 3–24 characters.');
  if (code === 'format') return t('profile.usernameErrFormat', 'Start with a letter; letters, numbers and underscores only.');
  return '';
}

function formatInZone(iso, timeZone) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, timeZone ? { timeZone } : undefined);
  } catch { return new Date(iso).toLocaleString(); }
}

function Modal({ open, title, subtitle, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md animate-fade-in" onClick={onClose} />
      <div className={`palette-glass gradient-border relative p-6 w-full ${wide ? 'max-w-lg' : 'max-w-md'} max-h-[90vh] overflow-y-auto animate-palette-in`}>
        <button onClick={onClose} aria-label="Close dialog" className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-100 hover:bg-white/[0.07] transition-all">
          <X size={14} />
        </button>
        <h2 className="text-base font-bold text-white tracking-tight pr-8">{title}</h2>
        {subtitle && <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{subtitle}</p>}
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

function Section({ id, icon: Icon, title, description, children, action }) {
  return (
    <section id={`profile-${id}`} aria-label={title} className="eb-section scroll-mt-24 overflow-hidden">
      <div className="p-5 sm:p-6 pb-0">
        <div className="eb-section-head">
          <span className="eb-section-icon"><Icon size={15} /></span>
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-bold text-white tracking-tight">{title}</h2>
            <p className="text-xs text-zinc-500 mt-0.5 leading-relaxed">{description}</p>
          </div>
          {action}
        </div>
      </div>
      <div className="p-5 sm:p-6 pt-4 space-y-4">{children}</div>
    </section>
  );
}

const SECTIONS = [
  { id: 'account', icon: UserRound },
  { id: 'security', icon: ShieldCheck },
  { id: 'linked', icon: Link2 },
  { id: 'preferences', icon: Globe },
  { id: 'danger', icon: AlertTriangle },
];

export default function Profile({ account, discord, auth }) {
  const { applyAccount } = useAuth();
  const toast = useToast();
  const { locale, locales, setLocale, t } = useI18n();
  const accountKey = account?.id || 'anonymous';

  // ---- Account information state -----------------------------------------
  const [profile, setProfile] = useState({ displayName: '', username: '' });
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [emailForm, setEmailForm] = useState({ email: '', currentPassword: '' });
  const [bio, setBio] = useState(() => account?.bio || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState('');

  // ---- Security state ------------------------------------------------------
  const [sessions, setSessions] = useState([]);
  const [activity, setActivity] = useState([]);
  const [passwordModal, setPasswordModal] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '', code: '', revokeOtherSessions: true });
  const [mfaSetupOpen, setMfaSetupOpen] = useState(false);
  const [mfaDisableOpen, setMfaDisableOpen] = useState(false);
  const [mfaPassword, setMfaPassword] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [enrollment, setEnrollment] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState([]);

  // ---- Linked accounts (GitHub/Google are client-side until backend lands) --
  const [github, setGithub] = useState(() => readText(`eb.linked.github:${accountKey}`, ''));
  const [google, setGoogle] = useState(() => readText(`eb.linked.google:${accountKey}`, ''));
  const [linkDraft, setLinkDraft] = useState({ provider: null, username: '' });
  const [unlinkTarget, setUnlinkTarget] = useState(null);

  // ---- Preferences (server-owned; local state is an optimistic mirror) ------
  const detectedZone = useMemo(() => {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
  }, []);
  const serverPrefs = useMemo(() => prefsFromAccount(account), [account]);
  const [theme, setTheme] = useState(() => serverPrefs.theme);
  const [timeZone, setTimeZone] = useState(() => serverPrefs.timeZone);
  const [notifications, setNotifications] = useState(() => serverPrefs.notifications);

  // ---- Danger zone ------------------------------------------------------------
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteOpenConfirm] = useState(false);
  const [reauth, setReauth] = useState({ currentPassword: '', code: '', confirmation: '' });
  const [reauthenticated, setReauthenticated] = useState(false);

  const [activeSection, setActiveSection] = useState('account');
  const SECTION_LABELS = {
    account: t('profile.secAccount', 'Account'),
    security: t('profile.secSecurity', 'Security'),
    linked: t('profile.secLinked', 'Linked'),
    preferences: t('profile.secPreferences', 'Preferences'),
    danger: t('profile.secDanger', 'Danger'),
  };

  // ---- Sync from server projection -------------------------------------------
  useEffect(() => {
    setProfile({ displayName: account?.displayName || '', username: account?.username || '' });
    setUsernameTouched(false);
    setBio(account?.bio || '');
    setGithub(readText(`eb.linked.github:${account?.id || 'anonymous'}`, ''));
    setGoogle(readText(`eb.linked.google:${account?.id || 'anonymous'}`, ''));
    const prefs = prefsFromAccount(account);
    setTheme(prefs.theme);
    setTimeZone(prefs.timeZone);
    setNotifications(prefs.notifications);
    // A language saved on another device wins over this browser's stored one.
    if (prefs.language && prefs.language !== locale) setLocale(prefs.language);
  }, [account?.id]);

  useEffect(() => {
    if (!avatarFile) { setPreview(null); return undefined; }
    const url = window.URL.createObjectURL(avatarFile);
    setPreview(url);
    return () => window.URL.revokeObjectURL(url);
  }, [avatarFile]);

  useEffect(() => {
    if (!account) return undefined;
    let live = true;
    Promise.all([api.get('/api/account/sessions').catch(() => []), api.get('/api/account/activity').catch(() => [])])
      .then(([nextSessions, nextActivity]) => {
        if (!live) return;
        setSessions(Array.isArray(nextSessions) ? nextSessions : []);
        setActivity(Array.isArray(nextActivity) ? nextActivity : []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [account]);

  // Track visible section for the sticky nav highlight.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id.replace('profile-', ''));
        });
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(`profile-${id}`);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [account]);

  // Deep-link support: /profile#profile-security scrolls straight to the
  // section. replaceState (not location.hash) keeps App.jsx hash routing on
  // the profile page instead of navigating away.
  useEffect(() => {
    const ids = new Set(SECTIONS.map(({ id }) => id));
    const jump = () => {
      const target = window.location.hash.replace('#profile-', '');
      if (!ids.has(target)) return;
      setActiveSection(target);
      // Sections render after the account gate above; defer one frame.
      requestAnimationFrame(() => {
        document.getElementById(`profile-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    };
    jump();
    window.addEventListener('hashchange', jump);
    return () => window.removeEventListener('hashchange', jump);
  }, [account]);

  // Apply theme preference to the document so the choice is visible now and
  // ready when a light theme ships: dark (default glass), system (follows OS),
  // light (opt-in preview flag consumed by future styles). Persistence happens
  // in the event handlers below via PUT /api/account/preferences.
  useEffect(() => {
    try {
      const root = document.documentElement;
      const systemDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches !== false;
      const effective = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
      root.dataset.theme = effective;
    } catch { /* ignore */ }
  }, [theme]);

  if (!auth?.loggedIn) {
    return (
      <div className="min-h-full flex items-center justify-center p-5">
        <div className="cyber-card max-w-md w-full p-7 text-center animate-slide-up">
          <img src="/eb_logo.svg" alt="EB BOT" className="w-14 h-14 rounded-2xl mx-auto ring-1 ring-white/10" />
          <h1 className="text-xl font-bold text-white mt-4">{t('profile.signinTitle', 'Sign in to view your profile')}</h1>
          <p className="text-sm text-zinc-500 mt-2">{t('profile.signinSub', 'Your account is protected by the existing server session.')}</p>
          <a href="/login" className="cyber-button-solid inline-flex mt-5">{t('profile.signinBtn', 'Sign in')}</a>
        </div>
      </div>
    );
  }
  if (!account) return <div className="page-shell-sm"><div className="cyber-warning">{t('profile.storagePending', 'Account storage is not ready.')}</div></div>;

  const avatar = preview || account.avatarUrl || discord?.avatar;
  const initial = (profile.displayName || account.displayName || account.username || '?')[0]?.toUpperCase();
  const usernameError = usernameTouched ? validateUsername(profile.username.trim()) : '';
  const effectiveZone = timeZone || detectedZone;
  const ago = (iso) => {
    const ts = new Date(iso).getTime();
    return !iso || Number.isNaN(ts) ? '—' : timeAgo(ts, t);
  };

  const scrollTo = (id) => {
    setActiveSection(id);
    try { window.history.replaceState(null, '', `#profile-${id}`); } catch { /* ignore */ }
    document.getElementById(`profile-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // ---- Account actions ---------------------------------------------------------
  const saveProfile = async (event) => {
    event?.preventDefault();
    const err = validateUsername(profile.username.trim());
    if (err) { setUsernameTouched(true); toast.error(usernameErrorText(err, t)); return; }
    setBusy('profile');
    try {
      const result = await api.patch('/api/account/profile', {
        displayName: profile.displayName.trim(),
        username: profile.username.trim(),
      });
      applyAccount(result.account);
      toast.success(t('profile.toastProfile', 'Profile updated'));
    } catch (err2) { toast.error(err2.message); }
    finally { setBusy(''); }
  };

  const saveBio = async () => {
    setBusy('bio');
    try {
      const result = await api.patch('/api/account/profile', {
        displayName: (profile.displayName || account.displayName || '').trim(),
        username: (profile.username || account.username || '').trim(),
        bio: bio.slice(0, BIO_MAX),
      });
      applyAccount(result.account);
      toast.success(t('profile.toastBio', 'Bio saved to your account'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const changeEmail = async (event) => {
    event.preventDefault(); setBusy('email');
    try {
      const result = await api.post('/api/account/email/change', emailForm);
      setEmailForm({ email: '', currentPassword: '' });
      toast.success(result.message || t('profile.toastEmailPending', 'Verify the new address before it replaces your current email.'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const resendVerification = async () => {
    try { await api.post('/api/auth/resend-verification', {}); toast.success(t('profile.toastEmailReq', 'Verification email requested')); }
    catch (err) { toast.error(err.message); }
  };

  const uploadAvatar = async () => {
    if (!avatarFile) return; setBusy('avatar');
    try {
      const data = new FormData();
      data.append('avatar', avatarFile);
      const result = await api.upload('/api/account/avatar', data);
      applyAccount(result.account);
      setAvatarFile(null);
      toast.success(t('profile.toastAvatar', 'Avatar updated'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const removeAvatar = async () => {
    setBusy('avatar');
    try {
      const result = await api.delete('/api/account/avatar');
      applyAccount(result.account);
      setAvatarFile(null);
      toast.success(t('profile.toastAvatarRemoved', 'Custom avatar removed'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  // ---- Security actions ----------------------------------------------------------
  const changePassword = async (event) => {
    event.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) { toast.error(t('profile.toastPwMismatch', 'New passwords do not match')); return; }
    setBusy('password');
    try {
      const result = await api.post('/api/account/password/change', passwordForm);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '', code: '', revokeOtherSessions: true });
      setPasswordModal(false);
      setSessions(await api.get('/api/account/sessions').catch(() => []));
      toast.success(result.otherSessionsRevoked
        ? t('profile.toastPwChangedOthers', 'Password changed. Other sessions were signed out.')
        : t('profile.toastPwChanged', 'Password changed'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const beginMfaEnroll = async (event) => {
    event?.preventDefault();
    setBusy('enroll');
    try {
      setEnrollment(await api.post('/api/account/mfa/enroll', { currentPassword: mfaPassword }));
      setMfaPassword('');
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const confirmMfaEnroll = async (event) => {
    event.preventDefault(); setBusy('confirm');
    try {
      const result = await api.post('/api/account/mfa/confirm', { code: mfaCode });
      applyAccount(result.account);
      setRecoveryCodes(result.recoveryCodes || []);
      setEnrollment(null); setMfaCode('');
      toast.success(t('profile.toastMfaOn', 'Two-factor authentication enabled'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const disableMfa = async (event) => {
    event.preventDefault(); setBusy('disable');
    try {
      const result = await api.post('/api/account/mfa/disable', { currentPassword: mfaPassword, code: mfaCode });
      if (result.account) applyAccount(result.account);
      setMfaPassword(''); setMfaCode(''); setMfaDisableOpen(false);
      toast.success(t('profile.toastMfaOff', 'Two-factor authentication disabled'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const downloadRecoveryCodes = () => {
    const blob = new Blob([`${recoveryCodes.join('\n')}\n`], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'eb-recovery-codes.txt'; link.click();
    window.URL.revokeObjectURL(url);
  };

  const refreshSessions = async () => {
    try { setSessions(await api.get('/api/account/sessions')); }
    catch (err) { toast.error(err.message); }
  };

  const revokeSession = async (id) => {
    try {
      const result = await api.delete(`/api/account/sessions/${id}`);
      if (result.currentSessionRevoked) window.location.replace('/login');
      else { setSessions((items) => items.filter((item) => item.id !== id)); toast.success(t('profile.toastSessRevoked', 'Session revoked')); }
    } catch (err) { toast.error(err.message); }
  };

  const revokeOthers = async () => {
    try {
      await api.post('/api/account/sessions/revoke-others', {});
      setSessions((items) => items.filter((item) => item.current));
      toast.success(t('profile.toastOthersRevoked', 'Other sessions revoked'));
    } catch (err) { toast.error(err.message); }
  };

  // ---- Linked account actions ------------------------------------------------------
  const confirmLink = () => {
    const name = linkDraft.username.trim();
    if (!name) { toast.error(t('profile.toastLinkName', 'Enter a username to link')); return; }
    if (linkDraft.provider === 'github') { setGithub(name); writeText(`eb.linked.github:${accountKey}`, name); }
    if (linkDraft.provider === 'google') { setGoogle(name); writeText(`eb.linked.google:${accountKey}`, name); }
    toast.success(t('profile.toastLinked', 'Account linked on this device'));
    setLinkDraft({ provider: null, username: '' });
  };

  const confirmUnlink = () => {
    if (unlinkTarget === 'github') { setGithub(''); writeText(`eb.linked.github:${accountKey}`, ''); }
    if (unlinkTarget === 'google') { setGoogle(''); writeText(`eb.linked.google:${accountKey}`, ''); }
    // Discord linkage is owned by the OAuth session: there is no standalone
    // unlink endpoint, so Disconnect re-starts OAuth (link a different
    // identity) rather than destroying the local account.
    setUnlinkTarget(null);
    toast.success(t('profile.toastUnlinked', 'Account disconnected'));
  };

  // ---- Danger zone ------------------------------------------------------------------
  const performReauth = async (event) => {
    event.preventDefault(); setBusy('reauth');
    try {
      await api.post('/api/account/reauthenticate', { currentPassword: reauth.currentPassword, code: reauth.code });
      setReauthenticated(true);
      toast.success(t('profile.toastReauthOk', 'Identity confirmed for ten minutes'));
    } catch (err) { toast.error(err.message); }
    finally { setBusy(''); }
  };

  const deactivate = async () => {
    try {
      await api.post('/api/account/deactivate', { confirmation: reauth.confirmation });
      window.location.replace('/login');
    } catch (err) { toast.error(err.message); }
  };

  // Optimistic preferences writer. Local state updates immediately; on
  // failure the error surfaces and state rolls back to the server projection.
  const putPreferences = async (next) => {
    try {
      const result = await api.put('/api/account/preferences', next);
      applyAccount(result.account);
      return true;
    } catch (err) {
      toast.error(err.message);
      const prefs = prefsFromAccount(account);
      setTheme(prefs.theme);
      setTimeZone(prefs.timeZone);
      setNotifications(prefs.notifications);
      return false;
    }
  };

  const currentPrefs = () => ({ theme, timeZone, language: locale, notifications });

  const setNotif = (key, value) => {
    const next = { ...notifications, [key]: value };
    setNotifications(next);
    putPreferences({ ...currentPrefs(), notifications: next });
  };

  return (
    <div className="page-shell animate-fade-in">
      <PageHeader
        icon={UserRound}
        title={t('profile.title', 'Profile settings')}
        subtitle={t('profile.sub', 'Identity, sign-in security, connected accounts, preferences and account lifecycle — in the Liquid Glass system.')}
        crumb={`@${account.username}`}
        badge={account.emailVerified ? t('profile.badgeVerified', 'Email verified') : t('profile.badgeUnverified', 'Email unverified')}
        badgeColor={account.emailVerified ? 'green' : 'yellow'}
      >
        <a href="/settings/security" className="cyber-button inline-flex items-center gap-1.5 text-xs">
          <ShieldCheck size={13} /> {t('profile.fullLog', 'Full security log')}
        </a>
      </PageHeader>

      {/* Section nav: sticky segmented control, wraps on small screens */}
      <nav aria-label={t('profile.sectionsAria', 'Profile sections')} className="seg-tabs lg:sticky lg:top-3 z-10">
        {SECTIONS.map(({ id, icon: Icon }) => (
          <button
            key={id}
            onClick={() => scrollTo(id)}
            aria-current={activeSection === id ? 'true' : undefined}
            className={activeSection === id ? 'seg-tab-active' : 'seg-tab'}
          >
            <Icon size={14} />
            {SECTION_LABELS[id]}
          </button>
        ))}
      </nav>

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)] items-start">
        {/* Identity rail */}
        <aside className="cyber-card p-5 text-center lg:sticky lg:top-[72px]">
          <div
            className="group relative w-24 h-24 mx-auto rounded-full overflow-hidden ring-2 ring-cyan-300/30 shadow-[0_0_28px_rgba(34,211,238,0.18)] bg-gradient-to-br from-cyan-400/20 to-indigo-400/20"
            title={avatar ? t('profile.photoHas', 'Profile photo') : t('profile.photoNone', 'No photo yet')}
          >
            {avatar
              ? <img src={avatar} alt={t('profile.photoAlt', 'Profile avatar')} className="w-full h-full object-cover" />
              : <span className="w-full h-full flex items-center justify-center text-3xl font-bold text-cyan-200">{initial}</span>}
            <button
              onClick={() => fileRef.current?.click()}
              aria-label={t('profile.editPhotoAria', 'Change profile photo')}
              className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 transition-opacity text-white"
            >
              <span className="flex flex-col items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                <Camera size={18} />
                {t('profile.editPhoto', 'Edit')}
              </span>
            </button>
          </div>
          <h2 className="text-base font-bold text-white mt-3 truncate">{account.displayName}</h2>
          <p className="text-xs text-cyan-300">@{account.username}</p>
          {bio ? <p className="text-xs text-zinc-400 mt-2 leading-relaxed break-words">{bio}</p> : null}
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            <span className={account.emailVerified ? 'cyber-badge-green' : 'cyber-badge-yellow'}>
              {account.emailVerified ? t('profile.badgeVerifiedShort', 'Verified') : t('profile.badgeUnverifiedShort', 'Unverified')}
            </span>
            <span className={account.mfaEnabled ? 'cyber-badge-green' : 'cyber-badge'}>
              2FA {account.mfaEnabled ? t('profile.on', 'on') : t('profile.off', 'off')}
            </span>
            <span className={discord ? 'cyber-badge-cyan' : 'cyber-badge-yellow'}>
              {discord ? t('profile.badgeDcLinked', 'Discord linked') : t('profile.badgeDcNone', 'No Discord')}
            </span>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            aria-label={t('profile.choosePhoto', 'Choose a profile photo')}
            onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
          />
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={() => fileRef.current?.click()} className="cyber-button text-xs">{t('profile.changePhoto', 'Change Photo')}</button>
            <button onClick={removeAvatar} disabled={!account.avatarUrl || busy === 'avatar'} className="cyber-button-danger text-xs disabled:opacity-40 disabled:cursor-not-allowed">{t('profile.removePhoto', 'Remove')}</button>
          </div>
          {avatarFile && (
            <div className="mt-3 rounded-xl border border-cyan-300/25 bg-cyan-400/[0.06] p-2.5 text-left animate-fade-in">
              <p className="text-[11px] text-cyan-100 truncate">{t('profile.readyUpload', 'Ready to upload')}: {avatarFile.name}</p>
              <button onClick={uploadAvatar} disabled={busy === 'avatar'} className="cyber-button-solid w-full mt-2 text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50">
                <Upload size={13} /> {busy === 'avatar' ? t('profile.uploading', 'Uploading…') : t('profile.uploadAvatar', 'Upload avatar')}
              </button>
            </div>
          )}
          <p className="text-[10px] text-zinc-600 mt-3 leading-relaxed">{t('profile.photoHint', 'PNG, JPEG or WebP up to 2 MiB. Square-cropped server-side.')}</p>
        </aside>

        {/* Main column */}
        <div className="space-y-4 min-w-0">
          {/* 1 — Account information */}
          <Section
            id="account"
            icon={UserRound}
            title={t('profile.acctTitle', 'Account information')}
            description={t('profile.acctDesc', 'How your name, handle, email and bio appear across the dashboard.')}
          >
            <form onSubmit={saveProfile} className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="eb-field-label">{t('profile.fullName', 'Full name')}</span>
                <input
                  required
                  maxLength={64}
                  value={profile.displayName}
                  onChange={(e) => setProfile({ ...profile, displayName: e.target.value })}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  className="cyber-input"
                />
              </label>
              <div>
                <label className="block" htmlFor="profile-username">
                  <span className="eb-field-label">{t('profile.username', 'Username')}</span>
                  <input
                    id="profile-username"
                    required
                    minLength={3}
                    maxLength={24}
                    value={profile.username}
                    onChange={(e) => { setProfile({ ...profile, username: e.target.value }); setUsernameTouched(true); }}
                    onBlur={() => setUsernameTouched(true)}
                    aria-invalid={Boolean(usernameError)}
                    aria-describedby={usernameError ? 'profile-username-hint' : undefined}
                    autoComplete="username"
                    spellCheck={false}
                    className={`cyber-input font-mono ${usernameError ? '!border-red-400/60' : profile.username && !usernameError ? '!border-emerald-400/50' : ''}`}
                  />
                </label>
                <p id="profile-username-hint" className={`text-[11px] mt-1.5 flex items-center gap-1 ${usernameError ? 'text-red-300' : 'text-zinc-500'}`}>
                  {usernameError
                    ? <><X size={11} /> {usernameErrorText(usernameError, t)}</>
                    : profile.username
                      ? <><Check size={11} className="text-emerald-300" /> {t('profile.usernameFormatOk', 'Available format — uniqueness is checked on save.')}</>
                      : t('profile.usernameHint', '3–24 chars, start with a letter. Changeable once every 30 days.')}
                </p>
              </div>
              <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                <button disabled={busy === 'profile' || Boolean(usernameError)} className="cyber-button-solid inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Save size={14} /> {busy === 'profile' ? t('profile.saving', 'Saving…') : t('profile.saveChanges', 'Save changes')}
                </button>
                <span className="text-[11px] text-zinc-600">{t('profile.cooldownNote', 'Username cooldown: once every 30 days.')}</span>
              </div>
            </form>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="eb-field-label !mb-0 flex items-center gap-1.5"><Mail size={11} /> {t('profile.emailAddr', 'Email address')}</p>
                  <p className="text-sm text-zinc-200 mt-1 truncate">{account.email || t('profile.noEmail', 'No email set')}</p>
                </div>
                <span className="inline-flex items-center gap-1.5">
                  {account.emailVerified
                    ? <span className="cyber-badge-green inline-flex items-center gap-1"><BadgeCheck size={11} /> {t('profile.verified', 'Verified')}</span>
                    : <span className="cyber-badge-yellow inline-flex items-center gap-1"><AlertTriangle size={11} /> {t('profile.verifyBadge', 'Verify')}</span>}
                  {!account.emailVerified && (
                    <button onClick={resendVerification} className="cyber-button text-xs !py-1.5">{t('profile.resend', 'Resend email')}</button>
                  )}
                </span>
              </div>
              <form onSubmit={changeEmail} className="grid sm:grid-cols-2 gap-3 mt-4">
                <label className="block">
                  <span className="eb-field-label">{t('profile.newEmail', 'New email')}</span>
                  <input type="email" required maxLength={254} autoComplete="email" value={emailForm.email} onChange={(e) => setEmailForm({ ...emailForm, email: e.target.value })} placeholder="you@example.com" className="cyber-input" />
                </label>
                <PasswordField label={t('profile.currentPw', 'Current password')} required autoComplete="current-password" value={emailForm.currentPassword} onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })} />
                <div className="sm:col-span-2">
                  <button disabled={busy === 'email'} className="cyber-button text-xs inline-flex items-center gap-1.5 disabled:opacity-50">
                    <Mail size={13} /> {busy === 'email' ? t('profile.requesting', 'Requesting…') : t('profile.verifyNewEmail', 'Verify new email')}
                  </button>
                  <p className="text-[11px] text-zinc-600 mt-1.5">{t('profile.emailHint', 'The new address replaces the current one only after verification.')}</p>
                </div>
              </form>
            </div>

            <div>
              <label className="block" htmlFor="profile-bio">
                <span className="eb-field-label">{t('profile.bioLabel', 'Bio / About me')}</span>
                <textarea
                  id="profile-bio"
                  rows={3}
                  maxLength={BIO_MAX}
                  value={bio}
                  onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
                  placeholder={t('profile.bioPh', 'Staff lead, night owl, bot wrangler…')}
                  className="cyber-textarea"
                />
              </label>
              <div className="flex items-center justify-between gap-3 mt-1.5">
                <p className={`text-[11px] tabular-nums ${bio.length >= BIO_MAX ? 'text-amber-300' : 'text-zinc-600'}`}>
                  {bio.length}/{BIO_MAX}
                </p>
                <button onClick={saveBio} disabled={busy === 'bio'} className="cyber-button text-xs disabled:opacity-50">{busy === 'bio' ? t('profile.saving', 'Saving…') : t('profile.saveBio', 'Save bio')}</button>
              </div>
            </div>
          </Section>

          {/* 2 — Security */}
          <Section
            id="security"
            icon={ShieldCheck}
            title={t('profile.secTitle', 'Security')}
            description={t('profile.secDesc', 'Password, two-factor authentication and every active session.')}
            action={<span className={account.mfaEnabled ? 'cyber-badge-green' : 'cyber-badge-yellow'}>{account.mfaEnabled ? t('profile.tfaEnabled', '2FA enabled') : t('profile.tfaDisabled', '2FA disabled')}</span>}
          >
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-white flex items-center gap-2"><LockKeyhole size={14} className="text-cyan-300" /> {t('profile.pwTitle', 'Password')}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('profile.pwDesc', 'Minimum 15 characters. Changing it can sign out other devices.')}</p>
                <button onClick={() => setPasswordModal(true)} className="cyber-button-solid text-xs mt-3">{t('profile.changePw', 'Change Password')}</button>
              </div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-4">
                <p className="text-sm font-semibold text-white flex items-center gap-2"><Smartphone size={14} className="text-cyan-300" /> {t('profile.tfaTitle', 'Two-factor authentication')}</p>
                <p className="text-xs text-zinc-500 mt-1 leading-relaxed">{t('profile.tfaDesc', 'Authenticator-app TOTP codes after your password.')}</p>
                <div className="mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3">
                  <CyanToggle
                    enabled={Boolean(account.mfaEnabled)}
                    onChange={(next) => { if (next) setMfaSetupOpen(true); else setMfaDisableOpen(true); }}
                    label={account.mfaEnabled ? t('profile.tfaOn', '2FA is on') : t('profile.tfaOff', '2FA is off')}
                    description={account.mfaEnabled ? t('profile.tfaOnDesc', 'Codes are required at sign-in.') : t('profile.tfaOffDesc', 'Enable for phishing-resistant sign-in.')}
                  />
                </div>
                <button onClick={() => setMfaSetupOpen(true)} className="cyber-button text-xs mt-3 inline-flex items-center gap-1.5">
                  <QrCode size={13} /> {account.mfaEnabled ? t('profile.viewSetup', 'View setup / codes') : t('profile.setup2fa', 'Setup 2FA')}
                </button>
              </div>
            </div>

            {recoveryCodes.length > 0 && (
              <div className="cyber-card-accent p-4 space-y-3 animate-fade-in">
                <p className="text-sm font-semibold text-white">{t('profile.recTitle', 'Save your recovery codes now')}</p>
                <p className="text-xs text-zinc-400">{t('profile.recDesc', 'Displayed once. Each code works once.')}</p>
                <div className="grid sm:grid-cols-2 gap-2">
                  {recoveryCodes.map((item) => <code key={item} className="p-2 rounded-lg bg-black/30 text-cyan-100 text-xs text-center font-mono">{item}</code>)}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={downloadRecoveryCodes} className="cyber-button text-xs">{t('profile.download', 'Download')}</button>
                  <button onClick={() => setRecoveryCodes([])} className="cyber-button text-xs">{t('profile.savedThem', 'I saved them')}</button>
                </div>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <p className="text-sm font-semibold text-white flex items-center gap-2"><Monitor size={14} className="text-cyan-300" /> {t('profile.sessTitle', 'Active sessions')}</p>
                <div className="flex gap-1.5">
                  <button onClick={refreshSessions} className="cyber-icon-button !w-8 !h-8" aria-label={t('profile.refreshSess', 'Refresh sessions')}><RefreshCw size={13} /></button>
                </div>
              </div>
              {sessions.length === 0 ? (
                <EmptyState
                  icon={Monitor}
                  title={t('profile.noSess', 'No active sessions found')}
                  subtitle={t('profile.noSessSub', 'Session metadata appears after your next sign-in. If you expected devices here, refresh — the list may still be loading.')}
                  action={<button onClick={refreshSessions} className="cyber-button text-xs">{t('profile.refreshSess', 'Refresh sessions')}</button>}
                />
              ) : (
                <ul className="space-y-2">
                  {sessions.map((item) => (
                    <li key={item.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-cyan-300/25 transition-colors p-3.5 flex items-start gap-3">
                      <span className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-cyan-400/10 border border-cyan-400/20 text-cyan-200">
                        <Monitor size={15} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-zinc-100 font-medium truncate">
                          {item.device || t('profile.unknownBrowser', 'Unknown browser')}
                          {item.current && <span className="cyber-badge-cyan ml-2">{t('profile.thisDevice', 'This device')}</span>}
                        </p>
                        <p className="text-[11px] text-zinc-500 mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="inline-flex items-center gap-1"><MapPin size={11} /> {t('profile.unknownLoc', 'Unknown location')}</span>
                          <span className="inline-flex items-center gap-1" title={formatInZone(item.lastActiveAt, effectiveZone)}>
                            <Clock size={11} /> {ago(item.lastActiveAt)} · {formatInZone(item.lastActiveAt, effectiveZone)}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => revokeSession(item.id)}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg text-red-400 hover:text-red-200 hover:bg-red-500/10 border border-transparent hover:border-red-500/25 transition-all flex-shrink-0 disabled:opacity-40"
                      >
                        {t('profile.revokeAccess', 'Revoke Access')}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {sessions.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  <button onClick={revokeOthers} className="cyber-button text-xs inline-flex items-center gap-1.5"><LogOut size={13} /> {t('profile.logoutOthers', 'Log out other sessions')}</button>
                </div>
              )}
              {activity.length > 0 && (
                <details className="mt-3 rounded-2xl border border-white/[0.06] bg-black/20 px-4 py-3">
                  <summary className="text-xs font-semibold text-zinc-300 cursor-pointer">{t('profile.recentActivity', 'Recent security activity')} ({activity.length})</summary>
                  <ul className="mt-2 space-y-1.5 max-h-44 overflow-y-auto">
                    {activity.slice(0, 20).map((item, i) => (
                      <li key={`${item.at}-${i}`} className="flex items-center justify-between gap-3 text-[11px] border-b border-white/[0.05] pb-1.5">
                        <span className="text-zinc-400">{String(item.event).replaceAll('_', ' ')}</span>
                        <time className="text-zinc-600 tabular-nums">{formatInZone(item.at, effectiveZone)}</time>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          </Section>

          {/* 3 — Linked accounts */}
          <Section
            id="linked"
            icon={Link2}
            title={t('profile.linkedTitle', 'Linked accounts')}
            description={t('profile.linkedDesc', 'Discord authorizes your servers. GitHub and Google links are stored on this device until backend support lands.')}
          >
            <ul className="space-y-2.5">
              <li className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.04] p-4 flex items-center gap-3.5">
                <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-indigo-400/30 to-cyan-400/20 border border-white/10 text-indigo-100">
                  <Gamepad2 size={19} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">Discord</p>
                  {discord
                    ? <p className="text-xs text-zinc-400 truncate mt-0.5">@{discord.username || discord.tag}{discord.id ? <span className="text-zinc-600 font-mono"> · {discord.id}</span> : null}</p>
                    : <p className="text-xs text-zinc-500 mt-0.5">{t('profile.discordNc', 'Not connected — Link Discord for server access to manage your servers.')}</p>}
                </div>
                {discord
                  ? <>
                      <span className="cyber-badge-cyan hidden sm:inline-flex">{t('profile.connected', 'Connected')}</span>
                      <button onClick={() => setUnlinkTarget('discord')} className="cyber-button-danger text-xs flex-shrink-0">{t('profile.disconnect', 'Disconnect')}</button>
                    </>
                  : <a href="/api/auth/discord" className="cyber-button-solid text-xs flex-shrink-0">{t('profile.linkAccount', 'Link Account')}</a>}
              </li>

              {[
                { provider: 'github', name: 'GitHub', icon: Code2, value: github, hint: t('profile.githubHint', 'Stars, gists and releases in your profile.') },
                { provider: 'google', name: 'Google', icon: Globe, value: google, hint: t('profile.googleHint', 'Calendar and Drive integrations when enabled.') },
              ].map(({ provider, name, icon: Icon, value, hint }) => (
                <li key={provider} className="rounded-2xl border border-white/[0.07] bg-white/[0.03] hover:border-white/[0.14] transition-colors p-4 flex items-center gap-3.5">
                  <span className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0 bg-white/[0.05] border border-white/10 text-zinc-200">
                    <Icon size={19} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white flex items-center gap-2">
                      {name}
                      <span className="cyber-badge !text-[9px]">{t('profile.onDevice', 'On this device')}</span>
                    </p>
                    <p className="text-xs text-zinc-500 truncate mt-0.5">{value ? `@${value}` : hint}</p>
                  </div>
                  {value
                    ? <>
                        <span className="cyber-badge-green hidden sm:inline-flex">{t('profile.connected', 'Connected')}</span>
                        <button onClick={() => setUnlinkTarget(provider)} className="cyber-button text-xs flex-shrink-0">{t('profile.disconnect', 'Disconnect')}</button>
                      </>
                    : <button onClick={() => setLinkDraft({ provider, username: '' })} className="cyber-button text-xs flex-shrink-0">{t('profile.linkAccount', 'Link Account')}</button>}
                </li>
              ))}
            </ul>
          </Section>

          {/* 4 — Preferences */}
          <Section
            id="preferences"
            icon={Globe}
            title={t('profile.prefsTitle', 'Preferences')}
            description={t('profile.prefsDesc', 'Theme, language, region and notification defaults for this dashboard.')}
          >
            <div>
              <p className="eb-field-label">{t('profile.themeLabel', 'Theme selection')}</p>
              <div className="seg-tabs" role="radiogroup" aria-label={t('profile.themeAria', 'Theme')}>
                {[
                  { id: 'light', label: t('profile.themeLight', 'Light'), icon: Sun },
                  { id: 'dark', label: t('profile.themeDark', 'Dark'), icon: Moon },
                  { id: 'system', label: t('profile.themeSystem', 'System Default'), icon: Monitor },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={theme === id}
                    onClick={async () => {
                      setTheme(id);
                      if (await putPreferences({ ...currentPrefs(), theme: id })) toast.success(t('profile.toastTheme', 'Theme updated'));
                    }}
                    className={theme === id ? 'seg-tab-active' : 'seg-tab'}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="eb-field-label">{t('profile.langLabel', 'Language & region — language')}</span>
                <select value={locale} onChange={async (e) => { setLocale(e.target.value); if (await putPreferences({ ...currentPrefs(), language: e.target.value })) toast.success(t('profile.toastLang', 'Language updated')); }} className="cyber-select">
                  {(locales?.length ? locales : LOCALES).map((l) => (
                    <option key={l.id} value={l.id}>{l.native} · {l.name}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="eb-field-label">{t('profile.tzLabel', 'Timezone')}</span>
                <select
                  value={timeZone}
                  onChange={async (e) => {
                    setTimeZone(e.target.value);
                    if (await putPreferences({ ...currentPrefs(), timeZone: e.target.value })) toast.success(t('profile.toastTz', 'Timezone updated'));
                  }}
                  className="cyber-select"
                >
                  <option value="">{t('profile.tzSystem', 'System')} ({detectedZone})</option>
                  {TIMEZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                </select>
              </label>
            </div>

            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-1">
              <div className="eb-switch-row">
                <CyanToggle enabled={notifications.email} onChange={(v) => setNotif('email', v)} label={t('profile.emailNotif', 'Email notifications')} description={t('profile.emailNotifDesc', 'Security alerts, mentions and ticket updates.')} />
              </div>
              <div className="eb-switch-row">
                <CyanToggle enabled={notifications.push} onChange={(v) => setNotif('push', v)} label={t('profile.pushNotif', 'Push notifications')} description={t('profile.pushNotifDesc', 'Realtime moderation and giveaway events.')} />
              </div>
              <div className="eb-switch-row">
                <CyanToggle enabled={notifications.marketing} onChange={(v) => setNotif('marketing', v)} label={t('profile.mktNotif', 'Marketing emails')} description={t('profile.mktNotifDesc', 'Feature drops and community spotlights. Off by default.')} />
              </div>
            </div>
            <p className="text-[11px] text-zinc-600 flex items-center gap-1.5"><Bell size={11} /> {t('profile.prefsSync', 'Preferences sync to your account and follow you across devices.')}</p>
          </Section>

          {/* 5 — Danger zone */}
          <Section
            id="danger"
            icon={AlertTriangle}
            title={t('profile.dangerTitle', 'Danger Zone')}
            description={t('profile.dangerDesc', 'Irreversible account actions. Everything here requires recent reauthentication.')}
          >
            <div className="rounded-2xl border border-red-500/25 bg-red-500/[0.05] p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-red-200">{t('profile.delTitle', 'Delete account')}</p>
                  <p className="text-xs text-zinc-400 mt-1 leading-relaxed max-w-lg">
                    {t('profile.delDesc', 'Deactivation signs out every session immediately. Security and moderation records are retained per policy.')}
                    {' '}{account.mfaEnabled ? t('profile.delHowMfa', 'Type DELETE plus your password and a 2FA code to confirm.') : t('profile.delHow', 'Type DELETE plus your password to confirm.')}
                  </p>
                </div>
                <button onClick={() => setDeleteOpen(true)} className="cyber-button-danger font-semibold shadow-[0_0_20px_rgba(239,68,68,0.15)]">{t('profile.deleteAccount', 'Delete Account')}</button>
              </div>
              <div className="mt-3 flex items-center gap-2 text-[11px]">
                <span className={reauthenticated ? 'cyber-badge-green' : 'cyber-badge-yellow'}>
                  {reauthenticated ? t('profile.reauthOk', 'Identity confirmed (10 min)') : t('profile.reauthNeeded', 'Reauthentication required')}
                </span>
                <a href="/settings/security" className="text-cyan-300 hover:text-cyan-100 inline-flex items-center gap-1">
                  {t('profile.manageSec', 'Manage in Security')} <ChevronRight size={11} />
                </a>
              </div>
            </div>
          </Section>
        </div>
      </div>

      {/* ---- Change password modal ---- */}
      <Modal open={passwordModal} title={t('profile.pwModalTitle', 'Change password')} subtitle={t('profile.pwModalSub', 'Minimum 15 characters. Other sessions are signed out when the box below is checked.')} onClose={() => setPasswordModal(false)}>
        <form onSubmit={changePassword} className="space-y-4">
          <PasswordField label={t('profile.currentPw', 'Current password')} required autoComplete="current-password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })} />
          {account.mfaEnabled && (
            <label className="block">
              <span className="cyber-label">{t('profile.codeLabel', 'Current 2FA or recovery code')}</span>
              <input required value={passwordForm.code} onChange={(e) => setPasswordForm({ ...passwordForm, code: e.target.value })} placeholder="123456 or EB-XXXX" autoComplete="one-time-code" className="cyber-input mt-1.5 font-mono" />
            </label>
          )}
          <div>
            <PasswordField label={t('profile.newPw', 'New password')} required minLength={15} autoComplete="new-password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} />
            <PasswordStrength password={passwordForm.newPassword} />
          </div>
          <PasswordField label={t('profile.confirmPw', 'Confirm new password')} required minLength={15} autoComplete="new-password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })} />
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
            <input type="checkbox" checked={passwordForm.revokeOtherSessions} onChange={(e) => setPasswordForm({ ...passwordForm, revokeOtherSessions: e.target.checked })} className="accent-cyan-300 w-4 h-4" />
            {t('profile.signOutOthers', 'Sign out all other sessions')}
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPasswordModal(false)} className="cyber-button flex-1">{t('profile.cancel', 'Cancel')}</button>
            <button disabled={busy === 'password'} className="cyber-button-solid flex-1 disabled:opacity-50">{busy === 'password' ? t('profile.changing', 'Changing…') : t('profile.pwModalTitle', 'Change password')}</button>
          </div>
        </form>
      </Modal>

      {/* ---- 2FA setup modal ---- */}
      <Modal open={mfaSetupOpen} wide title={t('profile.mfaTitle', 'Set up two-factor authentication')} subtitle={t('profile.mfaSub', 'Scan the QR code with any TOTP authenticator app, then confirm with a 6-digit code.')} onClose={() => { setMfaSetupOpen(false); setEnrollment(null); }}>
        {!account.mfaEnabled && !enrollment && (
          <form onSubmit={beginMfaEnroll} className="space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">{t('profile.enrollHint', 'Re-enter your password to begin enrollment. The QR code expires after ten minutes.')}</p>
            <PasswordField label={t('profile.currentPw', 'Current password')} required value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />
            <button disabled={busy === 'enroll'} className="cyber-button-solid w-full disabled:opacity-50">{busy === 'enroll' ? t('profile.preparing', 'Preparing…') : t('profile.toQr', 'Continue to QR code')}</button>
          </form>
        )}
        {enrollment && (
          <form onSubmit={confirmMfaEnroll} className="space-y-4">
            <div className="flex justify-center">
              <img src={enrollment.qrDataUrl} alt={t('profile.qrAlt', 'Authenticator QR code')} className="w-52 h-52 rounded-2xl bg-white p-2 shadow-[0_0_32px_rgba(34,211,238,0.2)]" />
            </div>
            <div>
              <p className="cyber-label">{t('profile.manualKey', 'Manual setup key')}</p>
              <code className="block mt-1.5 p-3 rounded-xl bg-black/40 border border-white/10 text-cyan-200 break-all text-xs font-mono">{enrollment.secret}</code>
            </div>
            <label className="block">
              <span className="cyber-label">{t('profile.firstCode', 'First 6-digit code')}</span>
              <input required inputMode="numeric" autoComplete="one-time-code" value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="123456" className="cyber-input mt-1.5 font-mono tracking-[0.3em] text-center" />
            </label>
            <button disabled={busy === 'confirm'} className="cyber-button-solid w-full disabled:opacity-50">{busy === 'confirm' ? t('profile.confirming', 'Confirming…') : t('profile.confirmEnable', 'Confirm and enable 2FA')}</button>
          </form>
        )}
        {account.mfaEnabled && !enrollment && (
          <div className="space-y-3">
            <p className="text-sm text-emerald-300 flex items-center gap-2"><CheckCircle2 size={15} /> {t('profile.mfaProtecting', '2FA is protecting this account.')}</p>
            <p className="text-xs text-zinc-500 leading-relaxed">{t('profile.lostCodes', 'Lost your codes? Regenerate recovery codes — your password plus a current code is required, and other sessions are signed out.')}</p>
            <PasswordField label={t('profile.currentPw', 'Current password')} required value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />
            <label className="block">
              <span className="cyber-label">{t('profile.currentCode', 'Current code')}</span>
              <input required value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="123456 or EB-XXXX" className="cyber-input mt-1.5 font-mono" />
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  try {
                    const result = await api.post('/api/account/recovery-codes/regenerate', { currentPassword: mfaPassword, code: mfaCode });
                    setRecoveryCodes(result.recoveryCodes || []);
                    setMfaPassword(''); setMfaCode('');
                    toast.success(t('profile.toastCodesRegen', 'Recovery codes regenerated'));
                  } catch (err) { toast.error(err.message); }
                }}
                className="cyber-button text-xs inline-flex items-center gap-1.5"
              >
                <KeyRound size={13} /> {t('profile.regenCodes', 'Regenerate recovery codes')}
              </button>
              <button onClick={() => { setMfaSetupOpen(false); setMfaDisableOpen(true); }} className="cyber-button-danger text-xs">{t('profile.disable2fa', 'Disable 2FA')}</button>
            </div>
          </div>
        )}
      </Modal>

      {/* ---- 2FA disable modal ---- */}
      <Modal open={mfaDisableOpen} title={t('profile.disableTitle', 'Disable two-factor authentication')} subtitle={t('profile.disableSub', 'Your password plus a current authenticator or recovery code is required.')} onClose={() => setMfaDisableOpen(false)}>
        <form onSubmit={disableMfa} className="space-y-4">
          <PasswordField label={t('profile.currentPw', 'Current password')} required value={mfaPassword} onChange={(e) => setMfaPassword(e.target.value)} />
          <label className="block">
            <span className="cyber-label">{t('profile.currentCode', 'Current code')}</span>
            <input required value={mfaCode} onChange={(e) => setMfaCode(e.target.value)} placeholder="123456 or EB-XXXX" className="cyber-input mt-1.5 font-mono" />
          </label>
          <div className="flex gap-2">
            <button type="button" onClick={() => setMfaDisableOpen(false)} className="cyber-button flex-1">{t('profile.keep2fa', 'Keep 2FA')}</button>
            <button disabled={busy === 'disable'} className="cyber-button-danger flex-1 disabled:opacity-50">{busy === 'disable' ? t('profile.disabling', 'Disabling…') : t('profile.disable2fa', 'Disable 2FA')}</button>
          </div>
        </form>
      </Modal>

      {/* ---- Link provider modal (device-scoped providers) ---- */}
      <Modal open={Boolean(linkDraft.provider) && linkDraft.provider !== null} title={linkDraft.provider === 'github' ? t('profile.linkGithub', 'Link GitHub account') : t('profile.linkGoogle', 'Link Google account')} subtitle={t('profile.linkModalSub', 'Stored on this device until backend OAuth lands. Use your public username.')} onClose={() => setLinkDraft({ provider: null, username: '' })}>
        <div className="space-y-4">
          <label className="block">
            <span className="cyber-label">{t('profile.usernameLabel', 'Username')}</span>
            <input value={linkDraft.username} onChange={(e) => setLinkDraft({ ...linkDraft, username: e.target.value })} placeholder={linkDraft.provider === 'github' ? 'octocat' : 'you@gmail.com'} className="cyber-input mt-1.5" />
          </label>
          <div className="flex gap-2">
            <button onClick={() => setLinkDraft({ provider: null, username: '' })} className="cyber-button flex-1">{t('profile.cancel', 'Cancel')}</button>
            <button onClick={confirmLink} className="cyber-button-solid flex-1">{t('profile.linkAccount', 'Link Account')}</button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(unlinkTarget)}
        title={unlinkTarget === 'discord' ? t('profile.unlinkDiscordTitle', 'Switch Discord identity?') : unlinkTarget === 'github' ? t('profile.unlinkGithub', 'Disconnect GitHub?') : t('profile.unlinkGoogle', 'Disconnect Google?')}
        message={unlinkTarget === 'discord'
          ? t('profile.unlinkDiscordMsg', 'Discord authorizes your servers — there is no standalone unlink. Continue to Discord OAuth to switch identities, or stay linked.')
          : t('profile.unlinkOtherMsg', 'This removes the device-scoped link. You can reconnect at any time.')}
        confirmLabel={unlinkTarget === 'discord' ? t('profile.openOauth', 'Open Discord OAuth') : t('profile.disconnect', 'Disconnect')}
        onCancel={() => setUnlinkTarget(null)}
        onConfirm={() => {
          if (unlinkTarget === 'discord') { window.location.href = '/api/auth/discord'; return; }
          confirmUnlink();
        }}
      />

      {/* ---- Delete account flow ---- */}
      <Modal open={deleteOpen} title={t('profile.delModalTitle', 'Delete account?')} subtitle={t('profile.delModalSub', 'This permanently deactivates your EB account and signs out every session.')} onClose={() => setDeleteOpen(false)}>
        <div className="space-y-4">
          <div className="cyber-warning text-xs">
            <AlertTriangle size={14} className="text-amber-300 flex-shrink-0 mt-0.5" />
            <p className="text-amber-100/90 leading-relaxed">{t('profile.delWarn', 'Security and moderation records are retained per policy. This cannot be undone from the dashboard.')}</p>
          </div>
          {!reauthenticated ? (
            <form onSubmit={performReauth} className="space-y-4">
              <PasswordField label={t('profile.currentPw', 'Current password')} required value={reauth.currentPassword} onChange={(e) => setReauth({ ...reauth, currentPassword: e.target.value })} />
              {account.mfaEnabled && (
                <label className="block">
                  <span className="cyber-label">{t('profile.codeLabel', 'Current 2FA or recovery code')}</span>
                  <input required value={reauth.code} onChange={(e) => setReauth({ ...reauth, code: e.target.value })} className="cyber-input mt-1.5 font-mono" />
                </label>
              )}
              <button disabled={busy === 'reauth'} className="cyber-button w-full disabled:opacity-50">{busy === 'reauth' ? t('profile.confirming', 'Confirming…') : t('profile.confirmIdentity', 'Confirm identity (valid 10 min)')}</button>
            </form>
          ) : (
            <div className="space-y-4">
              <p className="text-xs text-emerald-300 flex items-center gap-1.5"><Check size={13} /> {t('profile.identityOkStep', 'Identity confirmed — final step below.')}</p>
              <label className="block">
                <span className="cyber-label">{t('profile.typeDelete', 'Type DELETE to confirm')}</span>
                <input value={reauth.confirmation} onChange={(e) => setReauth({ ...reauth, confirmation: e.target.value })} placeholder="DELETE" autoComplete="off" className="cyber-input mt-1.5 font-mono tracking-widest" />
              </label>
              <div className="flex gap-2">
                <button onClick={() => setDeleteOpen(false)} className="cyber-button flex-1">{t('profile.keepAccount', 'Keep my account')}</button>
                <button onClick={() => setDeleteOpenConfirm(true)} disabled={reauth.confirmation !== 'DELETE'} className="cyber-button-danger flex-1 disabled:opacity-40 disabled:cursor-not-allowed">{t('profile.continueBtn', 'Continue')}</button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      <ConfirmModal
        open={deleteConfirm}
        title={t('profile.finalTitle', 'Permanently delete your account?')}
        message={t('profile.finalMsg', 'This signs out every session immediately. Typed DELETE was already verified — this is the final gate.')}
        confirmLabel={t('profile.deleteMyAccount', 'Delete my account')}
        onCancel={() => setDeleteOpenConfirm(false)}
        onConfirm={deactivate}
      />
    </div>
  );
}
