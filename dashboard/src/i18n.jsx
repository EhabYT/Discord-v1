import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AR = {
  'section.Core': 'الأساسيات', 'section.Features': 'الميزات', 'section.Config': 'الإعدادات',
  'section.Owner': 'المالك', 'section.Developer': 'المطور',
  'nav.overview': 'نظرة عامة', 'nav.analytics': 'التحليلات', 'nav.leaderboard': 'لوحة الصدارة',
  'nav.livefeed': 'النشاط المباشر', 'nav.members': 'الأعضاء', 'nav.music': 'الموسيقى',
  'nav.giveaways': 'الهدايا', 'nav.progression': 'النقاط والمستويات', 'nav.tickets': 'التذاكر',
  'nav.reactionroles': 'رتب التفاعل', 'nav.birthdays': 'أعياد الميلاد', 'nav.suggestions': 'الاقتراحات',
  'nav.polls': 'التصويتات', 'nav.tags': 'الوسوم', 'nav.confessions': 'الاعترافات',
  'nav.board': 'لوحة الطاقم', 'nav.welcome': 'الترحيب', 'nav.verification': 'التحقق',
  'nav.logs': 'السجلات', 'nav.security': 'الأمان', 'nav.commands': 'الأوامر',
  'nav.settings': 'إعدادات السيرفر', 'nav.botcontrols': 'تحكم البوت', 'nav.permissions': 'الصلاحيات',
  'nav.embedbuilder': 'منشئ الرسائل', 'nav.autoresponder': 'الرد التلقائي', 'nav.developer': 'المطور',
  'common.search': 'بحث', 'common.retry': 'إعادة المحاولة', 'common.online': 'متصل',
  'common.offline': 'غير متصل', 'common.dashboard': 'لوحة التحكم', 'common.access': 'الوصول', 'common.signOut': 'تسجيل الخروج',
  'common.loginDiscord': 'تسجيل الدخول عبر Discord', 'common.language': 'English',
  'shell.searchPlaceholder': 'ابحث في الصفحات والأوامر والموسيقى…',
  'shell.apiUnavailable': 'واجهة API غير متاحة. قد تكون الخدمة قيد إعادة التشغيل.',
  'shell.botOffline': 'البوت غير متصل. قد تتأخر الأوامر والبيانات المباشرة حتى يعاد الاتصال.',
  'shell.noConnection': 'لا يوجد اتصال',
  'shell.browserOffline': 'أنت غير متصل بالإنترنت. لن تُحفظ التغييرات حتى يعود الاتصال.',
  'shell.maintenance': 'وضع الصيانة مفعل — الأوامر متوقفة للجميع باستثناء المالك.',
  'shell.noServer': 'لم يتم اختيار سيرفر',
  'shell.loginToSee': 'سجّل الدخول عبر Discord لعرض السيرفرات التي يمكنك إدارتها.',
  'shell.inviteRefresh': 'أضف البوت إلى سيرفر ثم أعد تحميل الصفحة.',
  'oauth.welcome': 'مرحبًا بعودتك', 'oauth.success': 'تم تسجيل الدخول عبر Discord وأصبحت صلاحياتك جاهزة.',
  'oauth.attention': 'يتطلب تسجيل الدخول انتباهك', 'oauth.sessionError': 'تعذر حفظ جلسة الدخول. حاول مرة أخرى.',
  'oauth.codeError': 'لم يُرجع Discord رمز الدخول. ابدأ تسجيل الدخول من جديد.',
  'home.invite': 'أضف إلى Discord', 'home.openDashboard': 'فتح لوحة التحكم',
  'home.kicker': 'إدارة Discord المتكاملة', 'home.titleA': 'سيرفرك.', 'home.titleB': 'لوحة واحدة.',
  'home.subtitle': 'الإشراف والموسيقى والمستويات والتذاكر والتحليلات المباشرة — في مكان واحد.',
  'home.how': 'كيف يعمل', 'home.howTitle': 'ثلاث خطوات للبدء.',
  'step.01.title': 'أضف EB', 'step.01.text': 'أضف البوت إلى سيرفر Discord مع أوامر Slash.',
  'step.02.title': 'افتح لوحة التحكم', 'step.02.text': 'تحقق من الحالة وأدوات الطاقم والموسيقى والتذاكر.',
  'step.03.title': 'أدر مجتمعك', 'step.03.text': 'الإشراف والموسيقى والمستويات والدعم من مكان واحد.',
  'home.toolkit': 'الأدوات', 'home.toolkitTitle': 'كل ما يحتاجه فريق الإدارة',
  'home.preview': 'معاينة اللوحة', 'home.previewTitle': 'انتقل مباشرة إلى الأدوات.',
  'home.commandsTitle': '100 أمر. بوت واحد.', 'home.commandsSub': 'أوامر كاملة وميزات إضافية عبر الأوامر الفرعية.',
  'home.liveNote': 'يبقى النشاط المباشر والسجلات داخل لوحة التحكم.',
  'home.ready': 'جاهز عندما تكون.', 'home.readyText': 'أدر سيرفرك من لوحة واحدة سريعة وآمنة.',
  'feature.members': 'تحذيرات وملاحظات وحظر مؤقت ودائم في مساحة واحدة للطاقم.',
  'feature.music': 'قائمة تشغيل وفلاتر وكلمات وتحكم صوتي.',
  'feature.progression': 'رتب ومكافآت أدوار ومضاعفات قابلة للتخصيص.',
  'feature.tickets': 'لوحات دعم ونصوص محفوظة واستلام للتذاكر.',
  'feature.reactionroles': 'أدوار ذاتية بالأزرار أو الرموز مع مجموعات حصرية.',
  'feature.birthdays': 'تواريخ وقنوات إعلان وأدوار للاحتفال.',
  'feature.suggestions': 'صندوق اقتراحات مع قبول ورفض وملاحظات الطاقم.',
  'feature.polls': 'تصويتات ونتائج وإغلاق تلقائي.',
  'feature.tags': 'مقاطع وأسئلة شائعة قابلة لإعادة الاستخدام.',
  'feature.confessions': 'قنوات مجهولة مع مهلة وسجل اختياري.',
  'feature.board': 'إعلانات وقائمة غياب وتذكيرات للطاقم.',
  'feature.giveaways': 'إنشاء الهدايا وإعادة السحب وتتبع الفائزين.',
  'feature.analytics': 'رسوم 24 ساعة واستخدام الأوامر والنشاط المباشر.',
  'feature.commands': 'مئة أمر موزعة على اثنتي عشرة فئة.',
  'feature.verification': 'بوابات أعضاء وكابتشا وسجلات تحقق.',
  'feature.security': 'ترحيب وAutoMod ومقاومة الهجمات وردود تلقائية.',
};

const I18nContext = createContext({ locale: 'en', dir: 'ltr', t: (_key, fallback) => fallback || _key, toggleLocale: () => {} });

function initialLocale() {
  try {
    const stored = localStorage.getItem('eb.locale');
    if (stored === 'ar' || stored === 'en') return stored;
  } catch { /* ignore */ }
  return navigator.language?.toLowerCase().startsWith('ar') ? 'ar' : 'en';
}

export function LanguageProvider({ children }) {
  const [locale, setLocale] = useState(initialLocale);
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    try { localStorage.setItem('eb.locale', locale); } catch { /* ignore */ }
  }, [locale, dir]);

  const value = useMemo(() => ({
    locale,
    dir,
    t: (key, fallback) => locale === 'ar' ? (AR[key] || fallback || key) : (fallback || key),
    toggleLocale: () => setLocale((current) => current === 'ar' ? 'en' : 'ar'),
  }), [locale, dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
