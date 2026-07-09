import React, { useEffect, useRef, useState } from 'react';
import {
  PenTool,
  Layers,
  LayoutDashboard,
  Video,
  Sparkles,
  Zap,
  Image as ImageIcon,
  Film,
  ArrowRight,
  ChevronDown,
  Bot,
  Cpu,
  Wand2,
  Clock,
  Target,
  Users,
  UserCircle,
  BookOpen,
  X,
  Check,
  Crown,
  Building2,
  Mail,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '../store/settingsStore';

interface LandingPageProps {}

/* ------------------------------------------------------------------ */
/*  Keyframe animations injected once via <style>                      */
/* ------------------------------------------------------------------ */
const animationStyles = `
  @keyframes lp-float {
    0%, 100% { transform: translateY(0px) rotate(0deg); }
    33% { transform: translateY(-18px) rotate(1deg); }
    66% { transform: translateY(8px) rotate(-1deg); }
  }
  @keyframes lp-pulse-glow {
    0%, 100% { opacity: 0.35; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.08); }
  }
  @keyframes lp-gradient-shift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  @keyframes lp-fade-up {
    from { opacity: 0; transform: translateY(40px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes lp-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes lp-scale-in {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: scale(1); }
  }
  @keyframes lp-line-grow {
    from { transform: scaleX(0); }
    to { transform: scaleX(1); }
  }
  @keyframes lp-shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
  @keyframes lp-orbit {
    0% { transform: rotate(0deg) translateX(120px) rotate(0deg); }
    100% { transform: rotate(360deg) translateX(120px) rotate(-360deg); }
  }
  @keyframes lp-orbit-lg {
    0% { transform: rotate(0deg) translateX(200px) rotate(0deg); }
    100% { transform: rotate(360deg) translateX(200px) rotate(-360deg); }
  }
  @keyframes lp-count-pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
  @keyframes lp-dash {
    to { stroke-dashoffset: 0; }
  }
  @keyframes lp-badge-pulse {
    0%, 100% { opacity: 1; box-shadow: 0 0 8px rgba(124,58,237,0.3); }
    50% { opacity: 0.85; box-shadow: 0 0 20px rgba(236,72,153,0.5); }
  }
  @keyframes lp-modal-in {
    from { opacity: 0; transform: scale(0.95) translateY(10px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .lp-modal-enter {
    animation: lp-modal-in 0.3s ease-out both;
  }

  .lp-stagger-1 { animation: lp-fade-up 0.8s ease-out 0.1s both; }
  .lp-stagger-2 { animation: lp-fade-up 0.8s ease-out 0.25s both; }
  .lp-stagger-3 { animation: lp-fade-up 0.8s ease-out 0.4s both; }
  .lp-stagger-4 { animation: lp-fade-up 0.8s ease-out 0.55s both; }
  .lp-stagger-5 { animation: lp-fade-up 0.8s ease-out 0.7s both; }
  .lp-stagger-6 { animation: lp-fade-up 0.8s ease-out 0.85s both; }

  .lp-visible { animation: lp-fade-up 0.7s ease-out both; }
  .lp-visible-delay-1 { animation: lp-fade-up 0.7s ease-out 0.15s both; }
  .lp-visible-delay-2 { animation: lp-fade-up 0.7s ease-out 0.3s both; }
  .lp-visible-delay-3 { animation: lp-fade-up 0.7s ease-out 0.45s both; }
  .lp-visible-delay-4 { animation: lp-fade-up 0.7s ease-out 0.6s both; }

  .lp-scroll-reveal {
    opacity: 0;
    transform: translateY(40px);
    transition: opacity 0.7s ease-out, transform 0.7s ease-out;
  }
  .lp-scroll-reveal.lp-revealed {
    opacity: 1;
    transform: translateY(0);
  }
  .lp-scroll-reveal.lp-delay-1 { transition-delay: 0.1s; }
  .lp-scroll-reveal.lp-delay-2 { transition-delay: 0.2s; }
  .lp-scroll-reveal.lp-delay-3 { transition-delay: 0.3s; }
  .lp-scroll-reveal.lp-delay-4 { transition-delay: 0.4s; }

  .lp-line-connector {
    transform-origin: left center;
    animation: lp-line-grow 1s ease-out 0.5s both;
  }
`;

/* ------------------------------------------------------------------ */
/*  Intersection Observer hook for scroll-triggered reveals            */
/* ------------------------------------------------------------------ */
function useScrollReveal() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Reveal this element and all children with lp-scroll-reveal
            const targets = el.querySelectorAll('.lp-scroll-reveal');
            targets.forEach((t) => t.classList.add('lp-revealed'));
            el.classList.add('lp-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}

/* ------------------------------------------------------------------ */
/*  Animated counter component                                         */
/* ------------------------------------------------------------------ */
function AnimatedCounter({ end, suffix = '', duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const hasAnimated = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !hasAnimated.current) {
          hasAnimated.current = true;
          const startTime = Date.now();
          const tick = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3);
            setCount(Math.round(eased * end));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count}{suffix}</span>;
}

/* ------------------------------------------------------------------ */
/*  Workflow step data                                                  */
/* ------------------------------------------------------------------ */
const workflowSteps = [
  {
    icon: PenTool,
    number: '01',
    title: 'Planning',
    titleKr: 'AI 스크립트 생성',
    description: '브리프를 입력하면 Gemini AI가 장면별 스크립트, 나레이션, 이미지 프롬프트를 자동으로 생성합니다.',
    color: '#0057FF',
  },
  {
    icon: Layers,
    number: '02',
    title: 'Visualizing',
    titleKr: 'AI 이미지 생성',
    description: 'Gemini Imagen이 각 장면의 이미지를 생성합니다. 스타일과 분위기를 자유롭게 제어할 수 있습니다.',
    color: '#00D1FF',
  },
  {
    icon: LayoutDashboard,
    number: '03',
    title: 'Assembly',
    titleKr: '스토리보드 조립',
    description: '생성된 장면들을 그리드 매트릭스로 배열하고 A4 규격의 프로 스토리보드로 조립합니다.',
    color: '#7C3AED',
  },
  {
    icon: Video,
    number: '04',
    title: 'Production',
    titleKr: 'AI 영상 생성',
    description: 'Gemini VEO와 Kling AI가 각 장면을 영상으로 변환합니다. 모션과 카메라 워크를 AI가 제어합니다.',
    color: '#F59E0B',
  },
];

/* ------------------------------------------------------------------ */
/*  AI capability data                                                 */
/* ------------------------------------------------------------------ */
const aiCapabilities = [
  {
    icon: Bot,
    title: 'Gemini AI',
    subtitle: 'Script Engine',
    description: '광고 기획 의도를 이해하고 장면별 스크립트, 나레이션, 이미지 프롬프트를 한번에 생성하는 AI 엔진',
    tag: 'Text Generation',
    gradient: 'from-[#0057FF] to-[#00D1FF]',
  },
  {
    icon: ImageIcon,
    title: 'Gemini Imagen',
    subtitle: 'Image Generation',
    description: '프롬프트 기반 고품질 이미지 생성. 광고 스타일에 최적화된 비주얼을 즉시 만들어냅니다.',
    tag: 'Image AI',
    gradient: 'from-[#00D1FF] to-[#7C3AED]',
  },
  {
    icon: Film,
    title: 'Gemini VEO',
    subtitle: 'Video Generation',
    description: 'Google의 최신 비디오 생성 AI. 이미지를 기반으로 자연스러운 모션의 영상 클립을 생성합니다.',
    tag: 'Video AI',
    gradient: 'from-[#7C3AED] to-[#F59E0B]',
  },
  {
    icon: Wand2,
    title: 'Kling AI',
    subtitle: 'Video Production',
    description: '고급 영상 생성 AI. 이미지-to-비디오 변환으로 역동적인 카메라 워크와 모션을 구현합니다.',
    tag: 'Video AI',
    gradient: 'from-[#F59E0B] to-[#EF4444]',
  },
];

/* ------------------------------------------------------------------ */
/*  Stats data                                                         */
/* ------------------------------------------------------------------ */
const stats: Array<{ value: number | null; displayValue?: string; suffix: string; label: string; icon: typeof Clock; description: string }> = [
  { value: 10, suffix: '초', label: '스토리보드 생성 속도', icon: Clock, description: '브리프 하나로 완성' },
  { value: 4, suffix: '단계', label: '워크플로우 자동화', icon: Zap, description: '기획부터 영상까지' },
  { value: 3, suffix: '종', label: 'AI 모델 통합', icon: Cpu, description: 'Gemini + Kling AI' },
  { value: null, displayValue: '\u221E', suffix: '', label: '무한한 가능성', icon: Target, description: '일반\u00B7캐릭터\u00B7모델\u00B7시리즈' },
];

const useCaseTemplates = [
  {
    icon: Target,
    titleKey: 'landing.useCases.marketingTitle',
    descKey: 'landing.useCases.marketingDesc',
    chips: ['landing.useCases.marketingChip1', 'landing.useCases.marketingChip2', 'landing.useCases.marketingChip3'],
    gradient: 'from-[#0057FF] to-[#00D1FF]',
  },
  {
    icon: Users,
    titleKey: 'landing.useCases.creatorTitle',
    descKey: 'landing.useCases.creatorDesc',
    chips: ['landing.useCases.creatorChip1', 'landing.useCases.creatorChip2', 'landing.useCases.creatorChip3'],
    gradient: 'from-[#7C3AED] to-[#EC4899]',
  },
  {
    icon: Building2,
    titleKey: 'landing.useCases.localTitle',
    descKey: 'landing.useCases.localDesc',
    chips: ['landing.useCases.localChip1', 'landing.useCases.localChip2', 'landing.useCases.localChip3'],
    gradient: 'from-[#F59E0B] to-[#EF4444]',
  },
  {
    icon: UserCircle,
    titleKey: 'landing.useCases.freelanceTitle',
    descKey: 'landing.useCases.freelanceDesc',
    chips: ['landing.useCases.freelanceChip1', 'landing.useCases.freelanceChip2', 'landing.useCases.freelanceChip3'],
    gradient: 'from-[#10B981] to-[#00D1FF]',
  },
];

/* ================================================================== */
/*  LANDING PAGE COMPONENT                                             */
/* ================================================================== */
export const LandingPage: React.FC<LandingPageProps> = () => {
  const useCasesRef = useScrollReveal();
  const workflowRef = useScrollReveal();
  const aiRef = useScrollReveal();
  const pricingRef = useScrollReveal();
  const roadmapRef = useScrollReveal();
  const statsRef = useScrollReveal();
  const ctaRef = useScrollReveal();
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isYearly, setIsYearly] = useState(false);
  const [activeSection, setActiveSection] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const { signInWithGoogle, isAuthLoading } = useAuthStore();
  const { t, i18n } = useTranslation();
  const { setLanguage, defaultLanguage } = useSettingsStore();

  const scrollToFeatures = () => {
    document.getElementById('lp-workflow')?.scrollIntoView({ behavior: 'smooth' });
  };

  const onGetStarted = () => {
    setShowLoginModal(true);
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowLoginModal(false);
      }
    };
    if (showLoginModal) {
      document.addEventListener('keydown', handleEsc);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [showLoginModal]);

  // Scroll spy for nav active state + nav background
  useEffect(() => {
    const handleScroll = () => {
      setNavScrolled(window.scrollY > 50);

      const sections = ['lp-use-cases', 'lp-workflow', 'lp-ai', 'lp-roadmap'];
      let current = '';
      for (const id of sections) {
        const el = document.getElementById(id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= 120) current = id;
        }
      }
      setActiveSection(current);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Inject keyframes */}
      <style>{animationStyles}</style>

      <div className="min-h-screen bg-[#050505] text-white overflow-x-hidden" style={{ scrollBehavior: 'smooth' }}>

        {/* ============================================================ */}
        {/*  NAVIGATION BAR                                               */}
        {/* ============================================================ */}
        <nav
          className={`fixed top-0 left-0 right-0 z-50 px-6 transition-all duration-500 lp-stagger-1 ${
            navScrolled ? 'py-3' : 'py-5'
          }`}
          style={{
            backdropFilter: 'blur(20px)',
            background: navScrolled ? 'rgba(5,5,5,0.85)' : 'rgba(5,5,5,0.4)',
            borderBottom: navScrolled ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
          }}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="REMO AI Studio" className="w-8 h-8 rounded-lg shrink-0 object-cover" />
              <span className="text-lg font-extrabold tracking-tighter uppercase hidden sm:block">
                REMO AI Studio
              </span>
            </div>

            {/* Desktop nav links */}
            <div className="hidden md:flex items-center gap-1">
              {[
                { id: 'lp-use-cases', label: 'Templates' },
                { id: 'lp-workflow', label: 'Workflow' },
                { id: 'lp-ai', label: 'Studio' },
                { id: 'lp-roadmap', label: 'Roadmap' },
              ].map((link) => (
                <button
                  key={link.id}
                  onClick={() => {
                    document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth' });
                    setMobileMenuOpen(false);
                  }}
                  className={`relative px-4 py-2 text-[11px] font-bold uppercase tracking-[0.15em] rounded-lg transition-all duration-300 ${
                    activeSection === link.id
                      ? 'text-white bg-white/[0.06]'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-white/[0.03]'
                  }`}
                >
                  {link.label}
                  {activeSection === link.id && (
                    <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-[2px] bg-primary rounded-full" />
                  )}
                </button>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {/* Language toggle */}
              <button
                onClick={() => setLanguage(defaultLanguage === 'ko' ? 'en' : 'ko')}
                className="px-3 py-2 bg-white/[0.03] border border-white/[0.08] rounded-lg text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:border-white/20 transition-all duration-300"
              >
                {defaultLanguage === 'ko' ? 'EN' : 'KO'}
              </button>
              <button
                onClick={onGetStarted}
                className="px-6 py-2.5 bg-primary/10 border border-primary/30 rounded-xl text-sm font-bold uppercase tracking-wider text-primary hover:bg-primary hover:text-white transition-all duration-300 active:scale-95 hidden sm:block"
              >
                {t('landing.nav.getStarted')}
              </button>
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 text-gray-400 hover:text-white transition-colors"
              >
                {mobileMenuOpen ? <X size={22} /> : (
                  <div className="flex flex-col gap-1.5">
                    <span className="w-5 h-[2px] bg-current rounded-full" />
                    <span className="w-4 h-[2px] bg-current rounded-full" />
                    <span className="w-5 h-[2px] bg-current rounded-full" />
                  </div>
                )}
              </button>
            </div>
          </div>

          {/* Mobile menu dropdown */}
          {mobileMenuOpen && (
            <div
              className="md:hidden mt-4 pb-4 border-t border-white/5 pt-4 space-y-1"
              style={{ animation: 'lp-fade-up 0.3s ease-out both' }}
            >
              {[
                { id: 'lp-use-cases', label: 'Templates' },
                { id: 'lp-workflow', label: 'Workflow' },
                { id: 'lp-ai', label: 'Studio' },
                { id: 'lp-roadmap', label: 'Roadmap' },
              ].map((link) => (
                <button
                  key={link.id}
                  onClick={() => {
                    document.getElementById(link.id)?.scrollIntoView({ behavior: 'smooth' });
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left px-4 py-3 text-sm font-bold uppercase tracking-wider text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-all"
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={() => { onGetStarted(); setMobileMenuOpen(false); }}
                className="w-full mt-2 px-4 py-3 bg-primary rounded-xl text-sm font-bold uppercase tracking-wider text-white text-center"
              >
                {t('landing.nav.getStarted')}
              </button>
            </div>
          )}
        </nav>

        {/* ============================================================ */}
        {/*  HERO SECTION                                                 */}
        {/* ============================================================ */}
        <section className="relative min-h-screen flex items-center justify-center px-6 pt-20 overflow-hidden">

          {/* Animated gradient blob backgrounds */}
          <div
            className="absolute w-[500px] h-[500px] sm:w-[700px] sm:h-[700px] rounded-full pointer-events-none"
            style={{
              top: '20%', left: '15%',
              background: 'radial-gradient(circle, rgba(0,87,255,0.18) 0%, rgba(0,87,255,0.04) 50%, transparent 70%)',
              filter: 'blur(100px)',
              animation: 'blob-move-1 20s ease-in-out infinite',
            }}
          />
          <div
            className="absolute w-[400px] h-[400px] sm:w-[600px] sm:h-[600px] rounded-full pointer-events-none"
            style={{
              top: '40%', right: '10%',
              background: 'radial-gradient(circle, rgba(124,58,237,0.15) 0%, rgba(124,58,237,0.03) 50%, transparent 70%)',
              filter: 'blur(120px)',
              animation: 'blob-move-2 25s ease-in-out infinite',
            }}
          />
          <div
            className="absolute w-[350px] h-[350px] sm:w-[500px] sm:h-[500px] rounded-full pointer-events-none"
            style={{
              bottom: '15%', left: '30%',
              background: 'radial-gradient(circle, rgba(0,209,255,0.12) 0%, rgba(0,209,255,0.03) 50%, transparent 70%)',
              filter: 'blur(100px)',
              animation: 'blob-move-3 22s ease-in-out infinite',
            }}
          />

          {/* Gradient mesh overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(ellipse at 30% 20%, rgba(0,87,255,0.06) 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, rgba(124,58,237,0.05) 0%, transparent 50%)',
            }}
          />

          {/* Subtle grid pattern overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.02]"
            style={{
              backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
              backgroundSize: '80px 80px',
            }}
          />

          {/* Noise texture overlay */}
          <div
            className="absolute inset-0 pointer-events-none opacity-[0.03]"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
            }}
          />

          {/* Hero content */}
          <div className="relative z-10 max-w-5xl mx-auto text-center space-y-10">

            {/* Badge */}
            <div className="lp-stagger-1">
              <div
                className="inline-flex items-center gap-2 px-5 py-2 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, rgba(0,87,255,0.08), rgba(0,209,255,0.04))',
                  border: '1px solid rgba(0,87,255,0.15)',
                }}
              >
                <Sparkles size={14} className="text-primary" />
                <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">{t('landing.hero.badge')}</span>
              </div>
            </div>

            {/* Headline */}
            <h1 className="lp-stagger-2" style={{ fontSize: 'clamp(2.5rem, 8vw, 7rem)', fontStyle: 'italic', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.05em', lineHeight: 0.95 }}>
              <span className="block">{t('landing.hero.headline1')}</span>
              <span
                className="block mt-3 whitespace-nowrap"
                style={{
                  background: 'linear-gradient(135deg, #0057FF 0%, #00D1FF 50%, #7C3AED 100%)',
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundSize: '200% 200%',
                  animation: 'lp-gradient-shift 6s ease infinite',
                  fontSize: 'clamp(1.6rem, 5.5vw, 5rem)',
                }}
              >
                {t('landing.hero.headline2')}
              </span>
            </h1>

            {/* Subtext */}
            <p className="lp-stagger-3 text-lg sm:text-xl text-gray-400 max-w-xl mx-auto leading-relaxed font-medium">
              {t('landing.hero.subtext1')}
              <br />
              {t('landing.hero.subtext2')}
            </p>

            {/* CTAs */}
            <div className="lp-stagger-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={onGetStarted}
                className="group px-10 py-4 rounded-2xl font-black text-lg uppercase tracking-wider flex items-center gap-3 text-white hover:shadow-[0_15px_50px_rgba(0,87,255,0.5)] transition-all duration-500 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #0057FF, #00D1FF)', boxShadow: '0 10px 40px rgba(0,87,255,0.35), 0 4px 12px rgba(0,87,255,0.2)' }}
              >
                {t('landing.hero.ctaStart')}
                <ArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1" />
              </button>
              <button
                onClick={scrollToFeatures}
                className="px-8 py-4 bg-white/[0.03] border border-white/10 rounded-2xl font-bold text-base uppercase tracking-wider text-gray-300 hover:bg-white/[0.06] hover:border-white/20 hover:text-white transition-all duration-300 flex items-center gap-2"
              >
                {t('landing.hero.ctaLearn')}
                <ChevronDown size={18} />
              </button>
            </div>

            {/* Floating tech pills */}
            <div className="lp-stagger-5 flex items-center justify-center gap-4 flex-wrap pt-4">
              {[
                { name: t('landing.hero.pill1'), color: '#0057FF' },
                { name: t('landing.hero.pill2'), color: '#00D1FF' },
                { name: t('landing.hero.pill3'), color: '#7C3AED' },
                { name: t('landing.hero.pill4'), color: '#F59E0B' },
              ].map((tech) => (
                <span
                  key={tech.name}
                  className="px-4 py-1.5 rounded-full text-[11px] font-bold uppercase tracking-widest transition-all duration-300 hover:scale-105"
                  style={{
                    background: `${tech.color}08`,
                    border: `1px solid ${tech.color}20`,
                    color: `${tech.color}99`,
                  }}
                >
                  {tech.name}
                </span>
              ))}
            </div>
          </div>

          {/* Scroll indicator */}
          <div
            className="absolute bottom-8 left-1/2 -translate-x-1/2"
            style={{ animation: 'lp-float 3s ease-in-out infinite' }}
          >
            <ChevronDown size={24} className="text-gray-600" />
          </div>
        </section>

        {/* ============================================================ */}
        {/*  USE CASE TEMPLATES SECTION                                     */}
        {/* ============================================================ */}
        <section id="lp-use-cases" className="relative py-28 px-6" ref={useCasesRef} style={{ background: 'linear-gradient(180deg, #050505 0%, #07070C 100%)' }}>
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-14 space-y-4">
              <div className="lp-scroll-reveal">
                <span className="text-xs font-bold text-[#00D1FF] uppercase tracking-[0.3em]">{t('landing.useCases.sectionTag')}</span>
              </div>
              <h2 className="lp-scroll-reveal lp-delay-1 text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter">
                {t('landing.useCases.title')}{' '}
                <span className="text-primary">{t('landing.useCases.titleHighlight')}</span>
              </h2>
              <p className="lp-scroll-reveal lp-delay-2 text-gray-400 max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
                {t('landing.useCases.subtitle')}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {useCaseTemplates.map((item, i) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.titleKey}
                    onClick={onGetStarted}
                    className={`lp-scroll-reveal lp-delay-${i + 1} group text-left relative bg-[#0A0A0A] border border-white/[0.06] rounded-[2rem] p-7 overflow-hidden transition-all duration-500 hover:-translate-y-1 hover:border-white/20`}
                    style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                  >
                    <div className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${item.gradient} opacity-40`} />
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-6 shadow-lg shadow-black/30`}>
                      <Icon size={22} className="text-white" />
                    </div>
                    <h3 className="text-xl font-black italic uppercase tracking-tighter mb-3 text-white">
                      {t(item.titleKey)}
                    </h3>
                    <p className="text-sm text-gray-400 leading-relaxed mb-5 min-h-[72px]">
                      {t(item.descKey)}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {item.chips.map((chip) => (
                        <span key={chip} className="px-3 py-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-[11px] font-bold text-gray-400">
                          {t(chip)}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  WORKFLOW SECTION                                              */}
        {/* ============================================================ */}
        <section id="lp-workflow" className="relative py-32 px-6" ref={workflowRef} style={{ background: 'linear-gradient(180deg, #050505 0%, #080810 50%, #050505 100%)' }}>
          {/* Section background accent */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,87,255,0.2) 50%, transparent 100%)' }}
          />

          <div className="max-w-7xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-20 space-y-4">
              <div className="lp-scroll-reveal">
                <span className="text-xs font-bold text-primary uppercase tracking-[0.3em]">{t('landing.workflow.sectionTag')}</span>
              </div>
              <h2 className="lp-scroll-reveal lp-delay-1 text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter">
                {t('landing.workflow.title')}{' '}
                <span className="text-primary">{t('landing.workflow.titleHighlight')}</span>
              </h2>
              <p className="lp-scroll-reveal lp-delay-2 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
                {t('landing.workflow.subtitle')}
              </p>
            </div>

            {/* Workflow steps */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-4 relative">

              {/* Connector line (desktop only) */}
              <div className="hidden lg:block absolute top-[72px] left-[12.5%] right-[12.5%] h-[2px] z-0">
                <div
                  className="w-full h-full lp-line-connector"
                  style={{
                    background: 'linear-gradient(90deg, #0057FF, #00D1FF, #7C3AED, #F59E0B)',
                    opacity: 0.2,
                  }}
                />
              </div>

              {workflowSteps.map((step, i) => {
                const Icon = step.icon;
                return (
                  <div
                    key={step.number}
                    className={`lp-scroll-reveal lp-delay-${i + 1} relative z-10 group`}
                  >
                    <div
                      className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-8 h-full transition-all duration-500 hover:border-white/[0.12] hover:-translate-y-1"
                      style={{
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)',
                      }}
                    >
                      {/* Hover glow */}
                      <div
                        className="absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{
                          background: `radial-gradient(ellipse at 50% 0%, ${step.color}08 0%, transparent 70%)`,
                        }}
                      />

                      {/* Step number */}
                      <div className="flex items-center gap-4 mb-6">
                        <div
                          className="w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300"
                          style={{
                            background: `${step.color}10`,
                            border: `1px solid ${step.color}20`,
                          }}
                        >
                          <Icon size={24} style={{ color: step.color }} />
                        </div>
                        <span
                          className="text-6xl font-black italic leading-none"
                          style={{ color: `${step.color}15` }}
                        >
                          {step.number}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-xl font-black italic uppercase tracking-tighter mb-1">
                        {step.title}
                      </h3>
                      <p className="text-sm font-bold mb-4" style={{ color: step.color }}>
                        {t(`landing.workflow.step${i + 1}Subtitle`)}
                      </p>

                      {/* Description */}
                      <p className="text-sm text-gray-500 leading-relaxed">
                        {t(`landing.workflow.step${i + 1}Desc`)}
                      </p>

                      {/* Arrow connector (mobile) */}
                      {i < 3 && (
                        <div className="flex justify-center mt-6 lg:hidden">
                          <ChevronDown size={20} className="text-gray-700" />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  AI CAPABILITIES SECTION                                       */}
        {/* ============================================================ */}
        <section id="lp-ai" className="relative py-32 px-6" ref={aiRef}>
          {/* Background accent */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 w-[500px] h-[500px] rounded-full"
              style={{
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, rgba(0,209,255,0.04) 0%, transparent 60%)',
                filter: 'blur(80px)',
              }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-20 space-y-4">
              <div className="lp-scroll-reveal">
                <span className="text-xs font-bold text-[#00D1FF] uppercase tracking-[0.3em]">{t('landing.ai.sectionTag')}</span>
              </div>
              <h2 className="lp-scroll-reveal lp-delay-1 text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter">
                {t('landing.ai.title')}{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #00D1FF, #7C3AED)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {t('landing.ai.titleHighlight')}
                </span>
              </h2>
              <p className="lp-scroll-reveal lp-delay-2 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
                {t('landing.ai.subtitle1')}
                <br className="hidden sm:block" />
                {t('landing.ai.subtitle2')}
              </p>
            </div>

            {/* AI capability cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {aiCapabilities.map((cap, i) => {
                const Icon = cap.icon;
                const descKeys = ['geminiDesc', 'imagenDesc', 'veoDesc', 'klingDesc'] as const;
                return (
                  <div
                    key={cap.title}
                    className={`lp-scroll-reveal lp-delay-${i + 1} group`}
                  >
                    <div
                      className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-8 h-full transition-all duration-500 hover:border-white/[0.1] overflow-hidden"
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                    >
                      {/* Top gradient accent line */}
                      <div
                        className={`absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r ${cap.gradient} opacity-0 group-hover:opacity-40 transition-opacity duration-500`}
                      />

                      <div className="flex items-start gap-5">
                        {/* Icon */}
                        <div
                          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${cap.gradient} flex items-center justify-center shrink-0 opacity-80 group-hover:opacity-100 transition-opacity`}
                        >
                          <Icon size={22} className="text-white" />
                        </div>

                        <div className="flex-1 min-w-0">
                          {/* Title row */}
                          <div className="flex items-center gap-3 flex-wrap mb-1">
                            <h3 className="text-lg font-black italic uppercase tracking-tighter">
                              {cap.title}
                            </h3>
                            <span className="px-3 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded-full text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                              {cap.tag}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3">
                            {cap.subtitle}
                          </p>

                          {/* Description */}
                          <p className="text-sm text-gray-400 leading-relaxed">
                            {t(`landing.ai.${descKeys[i]}`)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  PRICING SECTION (hidden)                                      */}
        {/* ============================================================ */}
        {false && (
        <section id="lp-pricing" className="relative py-32 px-6" ref={pricingRef}>
          {/* Top line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,87,255,0.2) 50%, transparent 100%)' }}
          />

          {/* Background accent */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full"
              style={{
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, rgba(0,87,255,0.06) 0%, rgba(0,209,255,0.03) 40%, transparent 60%)',
                filter: 'blur(80px)',
              }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-16 space-y-4">
              <div className="lp-scroll-reveal">
                <span className="text-xs font-bold text-primary uppercase tracking-[0.3em]">{t('landing.pricing.sectionTag')}</span>
              </div>
              <h2 className="lp-scroll-reveal lp-delay-1 text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter">
                {t('landing.pricing.title')}{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #0057FF, #00D1FF)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {t('landing.pricing.titleHighlight')}
                </span>
              </h2>
              <p className="lp-scroll-reveal lp-delay-2 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
                {t('landing.pricing.subtitle1')}
                <br className="hidden sm:block" />
                {t('landing.pricing.subtitle2')}
              </p>

              {/* Monthly / Yearly toggle */}
              <div className="lp-scroll-reveal lp-delay-3 flex items-center justify-center gap-3 pt-4">
                <span className={`text-sm font-bold transition-colors duration-300 ${!isYearly ? 'text-white' : 'text-gray-500'}`}>
                  {t('landing.pricing.monthly')}
                </span>
                <button
                  onClick={() => setIsYearly(!isYearly)}
                  className="relative w-14 h-7 rounded-full transition-all duration-300 focus:outline-none"
                  style={{
                    background: isYearly ? '#0057FF' : 'rgba(255,255,255,0.1)',
                    border: `1px solid ${isYearly ? 'rgba(0,87,255,0.5)' : 'rgba(255,255,255,0.1)'}`,
                  }}
                  aria-label="연간 결제 토글"
                >
                  <div
                    className="absolute top-[3px] w-5 h-5 bg-white rounded-full transition-all duration-300"
                    style={{
                      left: isYearly ? 'calc(100% - 23px)' : '3px',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                    }}
                  />
                </button>
                <span className={`text-sm font-bold transition-colors duration-300 ${isYearly ? 'text-white' : 'text-gray-500'}`}>
                  {t('landing.pricing.yearly')}
                </span>
                {isYearly && (
                  <span
                    className="ml-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider text-white"
                    style={{ background: 'linear-gradient(135deg, #0057FF, #00D1FF)' }}
                  >
                    {t('landing.pricing.yearlyDiscount')}
                  </span>
                )}
              </div>
            </div>

            {/* Pricing cards: Free / Starter / Pro */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto mb-8">

              {/* FREE */}
              <div className="lp-scroll-reveal lp-delay-1 group">
                <div
                  className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-8 h-full transition-all duration-500 hover:border-white/[0.12] hover:-translate-y-1 overflow-hidden"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                >
                  {/* Hover glow */}
                  <div
                    className="absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,87,255,0.04) 0%, transparent 70%)' }}
                  />

                  <div className="relative z-10">
                    {/* Plan name */}
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em] mb-2">{t('landing.pricing.freePlan')}</p>
                    <h3 className="text-3xl font-black italic tracking-tighter mb-1">
                      {t('landing.pricing.freePrice')}
                    </h3>
                    <p className="text-xs text-gray-600 mb-6">{t('landing.pricing.freeLabel')}</p>

                    {/* Credits */}
                    <div className="flex items-center gap-2 mb-6">
                      <Zap size={14} className="text-primary" />
                      <span className="text-sm font-bold text-white">{t('landing.pricing.freeCredits')}</span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8">
                      {[
                        t('landing.pricing.freeFeature1'),
                        t('landing.pricing.freeFeature2'),
                        t('landing.pricing.freeFeature3'),
                        t('landing.pricing.freeFeature4'),
                      ].map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check size={14} className="text-gray-600 mt-0.5 shrink-0" />
                          <span className="text-sm text-gray-400 leading-snug">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="w-full py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl font-black text-sm uppercase tracking-wider text-gray-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:text-white transition-all duration-300 active:scale-[0.98]"
                    >
                      {t('landing.pricing.freeCta')}
                    </button>
                  </div>
                </div>
              </div>

              {/* STARTER */}
              <div className="lp-scroll-reveal lp-delay-2 group">
                <div
                  className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-8 h-full transition-all duration-500 hover:border-white/[0.12] hover:-translate-y-1 overflow-hidden"
                  style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                >
                  {/* Hover glow */}
                  <div
                    className="absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,209,255,0.04) 0%, transparent 70%)' }}
                  />

                  <div className="relative z-10">
                    {/* Plan name */}
                    <p className="text-xs font-bold text-[#00D1FF] uppercase tracking-[0.2em] mb-2">{t('landing.pricing.starterPlan')}</p>
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="text-3xl font-black italic tracking-tighter">
                        {isYearly ? t('landing.pricing.starterPriceYearly') : t('landing.pricing.starterPrice')}
                      </h3>
                      <span className="text-sm text-gray-500 font-bold">{t('common.perMonth')}</span>
                    </div>
                    {isYearly ? (
                      <p className="text-xs text-gray-600 mb-6">
                        <span className="line-through text-gray-700">{t('landing.pricing.starterPrice')}</span>
                        <span className="ml-2 text-[#00D1FF] font-bold">{t('landing.pricing.yearlyBilling')}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-600 mb-6">{t('landing.pricing.monthlyBilling')}</p>
                    )}

                    {/* Credits */}
                    <div className="flex items-center gap-2 mb-6">
                      <Zap size={14} className="text-[#00D1FF]" />
                      <span className="text-sm font-bold text-white">{t('landing.pricing.starterCredits')}</span>
                      <span className="text-[10px] text-gray-600">{t('common.perMonth')}</span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8">
                      {[
                        t('landing.pricing.starterFeature1'),
                        t('landing.pricing.starterFeature2'),
                        t('landing.pricing.starterFeature3'),
                        t('landing.pricing.starterFeature4'),
                        t('landing.pricing.starterFeature5'),
                      ].map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check size={14} className="text-[#00D1FF] mt-0.5 shrink-0" />
                          <span className="text-sm text-gray-400 leading-snug">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="w-full py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl font-black text-sm uppercase tracking-wider text-gray-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:text-white transition-all duration-300 active:scale-[0.98]"
                    >
                      {t('landing.pricing.starterCta')}
                    </button>
                  </div>
                </div>
              </div>

              {/* PRO (POPULAR) */}
              <div className="lp-scroll-reveal lp-delay-3 group">
                <div
                  className="relative bg-[#0A0A0A] border rounded-[2rem] p-8 h-full transition-all duration-500 hover:-translate-y-1 overflow-hidden"
                  style={{
                    borderColor: 'rgba(0,87,255,0.4)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03), 0 0 40px rgba(0,87,255,0.08), 0 0 80px rgba(0,87,255,0.04)',
                  }}
                >
                  {/* Top gradient accent line */}
                  <div
                    className="absolute top-0 left-0 right-0 h-[2px]"
                    style={{ background: 'linear-gradient(90deg, #0057FF, #00D1FF)' }}
                  />

                  {/* Background glow */}
                  <div
                    className="absolute inset-0 rounded-[2rem] pointer-events-none"
                    style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(0,87,255,0.06) 0%, transparent 60%)' }}
                  />

                  <div className="relative z-10">
                    {/* Popular badge */}
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-primary uppercase tracking-[0.2em]">{t('landing.pricing.proPlan')}</p>
                      <span
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white"
                        style={{ background: 'linear-gradient(135deg, #0057FF, #00D1FF)' }}
                      >
                        <Crown size={10} />
                        {t('common.popular')}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 mb-1">
                      <h3 className="text-3xl font-black italic tracking-tighter">
                        {isYearly ? t('landing.pricing.proPriceYearly') : t('landing.pricing.proPrice')}
                      </h3>
                      <span className="text-sm text-gray-500 font-bold">{t('common.perMonth')}</span>
                    </div>
                    {isYearly ? (
                      <p className="text-xs text-gray-600 mb-6">
                        <span className="line-through text-gray-700">{t('landing.pricing.proPrice')}</span>
                        <span className="ml-2 text-primary font-bold">{t('landing.pricing.yearlyBilling')}</span>
                      </p>
                    ) : (
                      <p className="text-xs text-gray-600 mb-6">{t('landing.pricing.monthlyBilling')}</p>
                    )}

                    {/* Credits */}
                    <div className="flex items-center gap-2 mb-6">
                      <Zap size={14} className="text-primary" />
                      <span className="text-sm font-bold text-white">{t('landing.pricing.proCredits')}</span>
                      <span className="text-[10px] text-gray-600">{t('common.perMonth')}</span>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8">
                      {[
                        t('landing.pricing.proFeature1'),
                        t('landing.pricing.proFeature2'),
                        t('landing.pricing.proFeature3'),
                        t('landing.pricing.proFeature4'),
                        t('landing.pricing.proFeature5'),
                        t('landing.pricing.proFeature6'),
                      ].map((feature) => (
                        <li key={feature} className="flex items-start gap-2.5">
                          <Check size={14} className="text-primary mt-0.5 shrink-0" />
                          <span className="text-sm text-gray-300 leading-snug">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA */}
                    <button
                      onClick={() => setShowLoginModal(true)}
                      className="w-full py-3.5 bg-primary rounded-2xl font-black text-sm uppercase tracking-wider text-white hover:bg-[#0066FF] hover:shadow-[0_10px_40px_rgba(0,87,255,0.4)] transition-all duration-500 active:scale-[0.98]"
                      style={{ boxShadow: '0 8px 30px rgba(0,87,255,0.3), 0 3px 10px rgba(0,87,255,0.15)' }}
                    >
                      {t('landing.pricing.proCta')}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* ENTERPRISE banner */}
            <div className="lp-scroll-reveal lp-delay-4 max-w-5xl mx-auto mb-16">
              <div
                className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-8 sm:p-10 overflow-hidden transition-all duration-500 hover:border-white/[0.1] group"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
              >
                {/* Top gradient accent line */}
                <div
                  className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-40 transition-opacity duration-500"
                  style={{ background: 'linear-gradient(90deg, #F59E0B, #EF4444)' }}
                />

                <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                  <div className="flex items-center gap-5">
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0"
                      style={{
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(239,68,68,0.15))',
                        border: '1px solid rgba(245,158,11,0.2)',
                      }}
                    >
                      <Building2 size={24} style={{ color: '#F59E0B' }} />
                    </div>
                    <div>
                      <h3 className="text-xl font-black italic uppercase tracking-tighter mb-1">{t('landing.pricing.enterprise')}</h3>
                      <p className="text-sm text-gray-400">{t('landing.pricing.enterpriseDesc')}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-gray-400">
                    {[
                      t('landing.pricing.enterpriseFeature1'),
                      t('landing.pricing.enterpriseFeature2'),
                      t('landing.pricing.enterpriseFeature3'),
                      t('landing.pricing.enterpriseFeature4'),
                    ].map((feat) => (
                      <span key={feat} className="flex items-center gap-1.5">
                        <Check size={12} className="text-[#F59E0B]" />
                        {feat}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowLoginModal(true)}
                    className="shrink-0 px-8 py-3.5 bg-white/[0.03] border border-white/[0.08] rounded-2xl font-black text-sm uppercase tracking-wider text-gray-300 hover:bg-white/[0.06] hover:border-white/[0.15] hover:text-white transition-all duration-300 active:scale-[0.98] flex items-center gap-2"
                  >
                    <Mail size={14} />
                    {t('landing.pricing.enterpriseCta')}
                  </button>
                </div>
              </div>
            </div>

            {/* Credit usage table */}
            <div className="lp-scroll-reveal lp-delay-4 max-w-3xl mx-auto">
              <div className="text-center mb-6">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-[0.2em]">{t('landing.pricing.creditGuide')}</p>
              </div>
              <div
                className="bg-[#0A0A0A] border border-white/[0.05] rounded-2xl overflow-hidden"
                style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
              >
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-px" style={{ background: 'rgba(255,255,255,0.03)' }}>
                  {[
                    { icon: PenTool, label: t('landing.pricing.creditScript'), credits: '1' },
                    { icon: ImageIcon, label: t('landing.pricing.creditImageFast'), credits: '2' },
                    { icon: ImageIcon, label: t('landing.pricing.creditImagePro'), credits: '5' },
                    { icon: Film, label: t('landing.pricing.creditStandard'), credits: '30' },
                    { icon: Film, label: t('landing.pricing.creditHD'), credits: '100' },
                    { icon: Film, label: t('landing.pricing.creditUltra'), credits: '250' },
                  ].map((item) => {
                    const CreditIcon = item.icon;
                    return (
                      <div
                        key={item.label}
                        className="flex flex-col items-center justify-center py-5 px-2 text-center bg-[#0A0A0A]"
                      >
                        <CreditIcon size={16} className="text-gray-600 mb-2" />
                        <p className="text-[10px] sm:text-[11px] text-gray-500 font-bold mb-1 leading-tight">{item.label}</p>
                        <p className="text-lg sm:text-xl font-black italic text-white">{item.credits}</p>
                        <p className="text-[9px] text-gray-700 uppercase tracking-widest font-bold">{t('landing.pricing.creditUnit')}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </section>
        )}

        {/* ============================================================ */}
        {/*  COMING SOON / ROADMAP SECTION                                 */}
        {/* ============================================================ */}
        <section id="lp-roadmap" className="relative py-32 px-6" ref={roadmapRef}>
          {/* Top line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(124,58,237,0.25) 50%, transparent 100%)' }}
          />

          {/* Background accent */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-1/2 left-1/2 w-[600px] h-[600px] rounded-full"
              style={{
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, rgba(124,58,237,0.05) 0%, rgba(236,72,153,0.03) 40%, transparent 60%)',
                filter: 'blur(80px)',
              }}
            />
          </div>

          <div className="relative max-w-7xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-20 space-y-4">
              <div className="lp-scroll-reveal">
                <span className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#EC4899' }}>{t('landing.roadmap.sectionTag')}</span>
              </div>
              <h2 className="lp-scroll-reveal lp-delay-1 text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter">
                {t('landing.roadmap.title')}{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {t('landing.roadmap.titleHighlight')}
                </span>
              </h2>
              <p className="lp-scroll-reveal lp-delay-2 text-gray-400 max-w-xl mx-auto text-base sm:text-lg">
                {t('landing.roadmap.subtitle1')}
                <br className="hidden sm:block" />
                {t('landing.roadmap.subtitle2')}
              </p>
            </div>

            {/* Roadmap cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  icon: Users,
                  titleKey: 'landing.roadmap.characterTitle',
                  descKey: 'landing.roadmap.characterDesc',
                },
                {
                  icon: UserCircle,
                  titleKey: 'landing.roadmap.modelTitle',
                  descKey: 'landing.roadmap.modelDesc',
                },
                {
                  icon: BookOpen,
                  titleKey: 'landing.roadmap.storyTitle',
                  descKey: 'landing.roadmap.storyDesc',
                },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.titleKey}
                    className={`lp-scroll-reveal lp-delay-${i + 1} group`}
                  >
                    <div
                      className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-8 h-full transition-all duration-500 hover:border-white/[0.12] hover:-translate-y-1 overflow-hidden"
                      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                    >
                      {/* Top gradient accent line */}
                      <div
                        className="absolute top-0 left-0 right-0 h-[2px] opacity-0 group-hover:opacity-50 transition-opacity duration-500"
                        style={{ background: 'linear-gradient(90deg, #7C3AED, #EC4899)' }}
                      />

                      {/* Hover glow */}
                      <div
                        className="absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                        style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(124,58,237,0.06) 0%, transparent 70%)' }}
                      />

                      {/* COMING SOON badge */}
                      <div className="mb-6">
                        <span
                          className="inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-white"
                          style={{
                            background: 'linear-gradient(135deg, #7C3AED, #EC4899)',
                            animation: 'lp-badge-pulse 2.5s ease-in-out infinite',
                          }}
                        >
                          Coming Soon
                        </span>
                      </div>

                      {/* Icon */}
                      <div
                        className="w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-all duration-300"
                        style={{
                          background: 'linear-gradient(135deg, rgba(124,58,237,0.15), rgba(236,72,153,0.15))',
                          border: '1px solid rgba(124,58,237,0.2)',
                        }}
                      >
                        <Icon size={26} style={{ color: '#EC4899' }} />
                      </div>

                      {/* Title */}
                      <h3 className="text-xl font-black italic uppercase tracking-tighter mb-3">
                        {t(item.titleKey)}
                      </h3>

                      {/* Description */}
                      <p className="text-sm text-gray-400 leading-relaxed">
                        {t(item.descKey)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  STATS SECTION                                                 */}
        {/* ============================================================ */}
        <section className="relative py-32 px-6" ref={statsRef}>
          {/* Top line */}
          <div
            className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(0,87,255,0.15) 50%, transparent 100%)' }}
          />

          <div className="max-w-6xl mx-auto">
            {/* Section header */}
            <div className="text-center mb-16 space-y-4">
              <div className="lp-scroll-reveal">
                <span className="text-xs font-bold text-[#F59E0B] uppercase tracking-[0.3em]">{t('landing.stats.sectionTag')}</span>
              </div>
              <h2 className="lp-scroll-reveal lp-delay-1 text-4xl sm:text-5xl font-black italic uppercase tracking-tighter">
                {t('landing.stats.title')}{' '}
                <span
                  style={{
                    background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  {t('landing.stats.titleHighlight')}
                </span>
              </h2>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              {(() => {
                const statKeys = ['speed', 'automation', 'models', 'possibilities'] as const;
                return stats.map((stat, i) => {
                  const Icon = stat.icon;
                  const key = statKeys[i];
                  return (
                    <div key={key} className={`lp-scroll-reveal lp-delay-${i + 1}`}>
                      <div
                        className="relative bg-[#0A0A0A] border border-white/[0.05] rounded-[2rem] p-6 sm:p-8 text-center h-full transition-all duration-500 hover:border-white/[0.1] group overflow-hidden"
                        style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }}
                      >
                        {/* Background glow on hover */}
                        <div
                          className="absolute inset-0 rounded-[2rem] opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
                          style={{ background: 'radial-gradient(ellipse at 50% 100%, rgba(0,87,255,0.04) 0%, transparent 60%)' }}
                        />

                        <div className="relative z-10 space-y-3">
                          <Icon size={22} className="text-gray-600 mx-auto" />
                          <div className="text-4xl sm:text-5xl font-black italic text-white leading-none">
                            {stat.value !== null ? (
                              <AnimatedCounter end={stat.value} suffix={t(`landing.stats.${key}Suffix`)} />
                            ) : (
                              <span>{stat.displayValue}</span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                            {t(`landing.stats.${key}`)}
                          </p>
                          <p className="text-[11px] text-gray-600">
                            {t(`landing.stats.${key}Desc`)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  FINAL CTA SECTION                                             */}
        {/* ============================================================ */}
        <section className="relative py-32 px-6" ref={ctaRef}>
          <div className="max-w-4xl mx-auto text-center relative">
            {/* Background orb */}
            <div
              className="absolute top-1/2 left-1/2 w-[400px] h-[400px] rounded-full pointer-events-none"
              style={{
                transform: 'translate(-50%, -50%)',
                background: 'radial-gradient(circle, rgba(0,87,255,0.1) 0%, transparent 60%)',
                filter: 'blur(60px)',
                animation: 'lp-pulse-glow 5s ease-in-out infinite',
              }}
            />

            <div className="relative z-10 space-y-10">
              <div className="lp-scroll-reveal space-y-6">
                <h2 className="text-4xl sm:text-5xl md:text-6xl font-black italic uppercase tracking-tighter leading-[0.95]">
                  {t('landing.cta.title1')}{' '}
                  <span
                    style={{
                      background: 'linear-gradient(135deg, #0057FF, #00D1FF)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                    }}
                  >
                    {t('landing.cta.title2')}
                  </span>
                </h2>
                <p className="lp-scroll-reveal lp-delay-1 text-lg text-gray-400 max-w-lg mx-auto leading-relaxed">
                  {t('landing.cta.subtitle1')}
                  <br />
                  {t('landing.cta.subtitle2')}
                </p>
              </div>

              <div className="lp-scroll-reveal lp-delay-2 flex flex-col sm:flex-row items-center justify-center gap-4">
                <button
                  onClick={onGetStarted}
                  className="group px-14 py-5 bg-primary rounded-2xl font-black text-xl uppercase tracking-wider flex items-center gap-3 hover:bg-[#0066FF] transition-all duration-300 active:scale-95"
                  style={{ boxShadow: '0 15px 50px rgba(0,87,255,0.4), 0 5px 15px rgba(0,87,255,0.25)' }}
                >
                  {t('landing.cta.button')}
                  <ArrowRight size={22} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                </button>
              </div>

              <p className="lp-scroll-reveal lp-delay-3 text-[11px] text-gray-600 uppercase tracking-widest font-bold">
                {t('landing.cta.note1')} <span className="mx-2 text-gray-700">|</span> {t('landing.cta.note2')}
              </p>
            </div>
          </div>
        </section>

        {/* ============================================================ */}
        {/*  FOOTER                                                        */}
        {/* ============================================================ */}
        <footer className="border-t border-white/[0.04] px-6 py-8">
          <div className="max-w-7xl mx-auto flex items-center justify-center">
            <p className="text-[11px] text-gray-600 font-bold uppercase tracking-widest">
              {t('landing.footer.copyright', { year: new Date().getFullYear() })}
            </p>
          </div>
        </footer>

        {/* ============================================================ */}
        {/*  LOGIN MODAL                                                   */}
        {/* ============================================================ */}
        {showLoginModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('landing.login.ariaLabel')}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowLoginModal(false); }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setShowLoginModal(false);
              if (e.key === 'Tab') {
                const modal = e.currentTarget;
                const focusable = modal.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
                if (focusable.length === 0) return;
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (e.shiftKey) { if (document.activeElement === first) { e.preventDefault(); last.focus(); } }
                else { if (document.activeElement === last) { e.preventDefault(); first.focus(); } }
              }
            }}
            ref={(el) => { if (el) { const btn = el.querySelector<HTMLElement>('button'); btn?.focus(); } }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

            {/* Modal Card */}
            <div className="relative z-10 w-full max-w-md bg-[#0A0A0A] border border-white/10 rounded-[2rem] p-10 shadow-2xl lp-modal-enter"
                 style={{ boxShadow: '0 25px 80px rgba(0,0,0,0.8), 0 0 60px rgba(0,87,255,0.1)' }}>

              {/* Close button */}
              <button
                onClick={() => setShowLoginModal(false)}
                className="absolute top-5 right-5 p-2 text-gray-500 hover:text-white hover:bg-white/5 rounded-xl transition-all"
              >
                <X size={20} />
              </button>

              {/* Logo */}
              <div className="text-center space-y-5 mb-8">
                <img
                  src="/logo.png"
                  alt="REMO AI Studio"
                  className="w-24 h-24 rounded-3xl object-cover mx-auto"
                  style={{ boxShadow: '0 0 50px rgba(0,87,255,0.25)' }}
                />
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">
                  REMO AI STUDIO
                </h2>
                <div className="space-y-1">
                  <p className="text-gray-300 text-sm font-medium">
                    {t('landing.login.subtitle')}
                  </p>
                  <p className="text-gray-500 text-xs">
                    {t('landing.login.flow')}
                  </p>
                </div>
              </div>

              {/* Credit Offer */}
              <p className="text-center text-sm font-black mb-5" style={{ color: '#00D1FF' }}>
                {t('landing.login.creditOffer')}
              </p>

              {/* Google Login Button */}
              <button
                onClick={signInWithGoogle}
                disabled={isAuthLoading}
                className="w-full py-4 bg-white text-black rounded-2xl font-black text-base flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50"
                style={{ boxShadow: '0 10px 30px rgba(255,255,255,0.08)' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                {t('landing.login.googleLogin')}
              </button>

              {/* Privacy & Terms Consent */}
              <p className="text-center text-[11px] text-gray-500 mt-4 leading-relaxed">
                {t('landing.login.consent1')}{' '}
                <button type="button" onClick={() => setShowPrivacyModal(true)} className="text-gray-400 underline underline-offset-2 hover:text-white transition-colors">
                  {t('landing.login.privacyPolicy')}
                </button>
                {' '}{t('landing.login.consent2')}{' '}
                <button type="button" onClick={() => setShowTermsModal(true)} className="text-gray-400 underline underline-offset-2 hover:text-white transition-colors">
                  {t('landing.login.termsOfService')}
                </button>
                {t('landing.login.consent3')}
              </p>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  PRIVACY POLICY MODAL                                         */}
        {/* ============================================================ */}
        {showPrivacyModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('landing.privacy.title')}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPrivacyModal(false); }}
          >
            <div className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
            <div className="relative bg-[#111] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
                <h3 className="text-lg font-black italic uppercase tracking-tighter">{t('landing.privacy.title')}</h3>
                <button onClick={() => setShowPrivacyModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-gray-300 leading-relaxed space-y-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('landing.privacy.lastModified')}</p>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section1Title')}</h4>
                <p>{t('landing.privacy.section1Intro')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.privacy.section1Item1')}</li>
                  <li>{t('landing.privacy.section1Item2')}</li>
                  <li>{t('landing.privacy.section1Item3')}</li>
                  <li>{t('landing.privacy.section1Item4')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section2Title')}</h4>
                <p>{t('landing.privacy.section2Intro')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li><strong className="text-gray-300">{t('landing.privacy.section2Required')}</strong> {t('landing.privacy.section2RequiredItems')}</li>
                  <li><strong className="text-gray-300">{t('landing.privacy.section2Auto')}</strong> {t('landing.privacy.section2AutoItems')}</li>
                  <li><strong className="text-gray-300">{t('landing.privacy.section2Usage')}</strong> {t('landing.privacy.section2UsageItems')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section3Title')}</h4>
                <p>{t('landing.privacy.section3Text')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.privacy.section3Item1')}</li>
                  <li>{t('landing.privacy.section3Item2')}</li>
                  <li>{t('landing.privacy.section3Item3')}</li>
                  <li>{t('landing.privacy.section3Item4')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section4Title')}</h4>
                <p>{t('landing.privacy.section4Text')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.privacy.section4Item1')}</li>
                  <li>{t('landing.privacy.section4Item2')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section5Title')}</h4>
                <p>{t('landing.privacy.section5Text')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.privacy.section5Item1')}</li>
                  <li>{t('landing.privacy.section5Item2')}</li>
                  <li>{t('landing.privacy.section5Item3')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section6Title')}</h4>
                <p>{t('landing.privacy.section6Text')}</p>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.privacy.section7Title')}</h4>
                <p>{t('landing.privacy.section7Text')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.privacy.section7Email')}</li>
                </ul>
              </div>
              <div className="p-4 border-t border-white/5 shrink-0">
                <button onClick={() => setShowPrivacyModal(false)} className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold text-sm transition-all">
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/*  TERMS OF SERVICE MODAL                                       */}
        {/* ============================================================ */}
        {showTermsModal && (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('landing.terms.title')}
            className="fixed inset-0 z-[200] flex items-center justify-center p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowTermsModal(false); }}
          >
            <div className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />
            <div className="relative bg-[#111] border border-white/10 rounded-3xl w-full max-w-2xl max-h-[80vh] shadow-2xl flex flex-col overflow-hidden">
              <div className="flex items-center justify-between p-6 border-b border-white/5 shrink-0">
                <h3 className="text-lg font-black italic uppercase tracking-tighter">{t('landing.terms.title')}</h3>
                <button onClick={() => setShowTermsModal(false)} className="p-2 hover:bg-white/5 rounded-xl transition-all">
                  <X size={18} />
                </button>
              </div>
              <div className="p-6 overflow-y-auto custom-scrollbar text-sm text-gray-300 leading-relaxed space-y-4">
                <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{t('landing.terms.lastModified')}</p>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article1Title')}</h4>
                <p>{t('landing.terms.article1Text')}</p>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article2Title')}</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.terms.article2Item1')}</li>
                  <li>{t('landing.terms.article2Item2')}</li>
                  <li>{t('landing.terms.article2Item3')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article3Title')}</h4>
                <p>{t('landing.terms.article3Text')}</p>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article4Title')}</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.terms.article4Item1')}</li>
                  <li>{t('landing.terms.article4Item2')}</li>
                  <li>{t('landing.terms.article4Item3')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article5Title')}</h4>
                <p>{t('landing.terms.article5Text')}</p>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.terms.article5Item1')}</li>
                  <li>{t('landing.terms.article5Item2')}</li>
                  <li>{t('landing.terms.article5Item3')}</li>
                  <li>{t('landing.terms.article5Item4')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article6Title')}</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.terms.article6Item1')}</li>
                  <li>{t('landing.terms.article6Item2')}</li>
                  <li>{t('landing.terms.article6Item3')}</li>
                  <li>{t('landing.terms.article6Item4')}</li>
                </ul>

                <h4 className="text-white font-bold text-base mt-4">{t('landing.terms.article7Title')}</h4>
                <ul className="list-disc list-inside space-y-1 text-gray-400">
                  <li>{t('landing.terms.article7Item1')}</li>
                  <li>{t('landing.terms.article7Item2')}</li>
                  <li>{t('landing.terms.article7Item3')}</li>
                </ul>
              </div>
              <div className="p-4 border-t border-white/5 shrink-0">
                <button onClick={() => setShowTermsModal(false)} className="w-full py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl font-bold text-sm transition-all">
                  {t('common.close')}
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </>
  );
};

export default LandingPage;
