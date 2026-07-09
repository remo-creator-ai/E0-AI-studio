import React from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { useSettingsStore } from '../store/settingsStore';
import { useStore } from '../store';
import { ProjectStep, AdDuration, VisualStyle, StoryboardLayout } from '../types';
import { useCreditStore, CREDIT_COSTS } from '../store/creditStore';
import {
  User,
  Globe,
  BookOpen,
  RotateCcw,
  Cpu,
  Settings as SettingsIcon,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const settings = useSettingsStore();
  const { defaultLanguage, setLanguage, resetOnboarding } = settings;
  const { setStep } = useStore();
  const { balance, maxCredits } = useCreditStore();

  const creditPercentage = (balance / maxCredits) * 100;

  return (
    <div className="min-h-screen bg-[#050505] text-white p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Section 1: Account */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <User className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">
              {t('settings.title')}
            </h2>
          </div>

          <div className="space-y-6">
            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-accent overflow-hidden">
                {user?.user_metadata?.avatar_url ? (
                  <img
                    src={user.user_metadata.avatar_url}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-2xl font-bold">
                    {user?.email?.[0].toUpperCase() || 'U'}
                  </div>
                )}
              </div>
              <div>
                <div className="text-lg font-semibold">
                  {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'User'}
                </div>
                <div className="text-sm text-gray-400">{user?.email || 'No email'}</div>
              </div>
            </div>

            {/* Plan Badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400">{t('settings.currentPlan')}</span>
              <span className="px-4 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full text-sm font-bold">
                {t('settings.freePlan')}
              </span>
            </div>

            {/* Credit Balance */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-400">{t('settings.creditBalance')}</span>
                <span className="text-lg font-bold">
                  {balance} / {maxCredits} {t('settings.creditUnit')}
                </span>
              </div>
              <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-accent transition-all duration-300"
                  style={{ width: `${creditPercentage}%` }}
                />
              </div>
            </div>

            {/* Credit Usage Reference */}
            <div className="bg-black/40 rounded-xl p-4 border border-white/5">
              <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-3 font-bold">
                {t('settings.creditUsageTitle')}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.scriptGeneration')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.SCRIPT}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.imagePro')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.IMAGE_PRO}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.imageStandard')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.IMAGE_STANDARD}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.videoStandard')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.VIDEO_STANDARD}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">{t('settings.videoHD')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.VIDEO_HD}cr</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-gray-400">{t('settings.videoUltra')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.VIDEO_ULTRA}cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section: AI Engine */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <Cpu className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">
              {t('settings.aiEngine')}
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-3 text-gray-300">
                {t('settings.defaultVideoEngine')}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => settings.update({ defaultVideoEngine: 'kling' })}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                    settings.defaultVideoEngine === 'kling'
                      ? 'bg-primary text-white shadow-[0_0_20px_rgba(0,87,255,0.3)]'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {t('settings.engineKling')}
                </button>
                <button
                  onClick={() => settings.update({ defaultVideoEngine: 'veo31' })}
                  className={`flex-1 px-6 py-3 rounded-xl font-semibold transition-all ${
                    settings.defaultVideoEngine === 'veo31'
                      ? 'bg-primary text-white shadow-[0_0_20px_rgba(0,87,255,0.3)]'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                  }`}
                >
                  {t('settings.engineVeo31')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Project Defaults */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <SettingsIcon className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">
              {t('settings.projectDefaults')}
            </h2>
          </div>

          <div className="space-y-6">
            {/* Default Duration */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-gray-300">
                {t('settings.defaultDuration')}
              </label>
              <div className="grid grid-cols-4 gap-3">
                {[AdDuration.S15, AdDuration.S30, AdDuration.S45, AdDuration.S60].map((duration) => (
                  <button
                    key={duration}
                    onClick={() => settings.update({ defaultDuration: duration })}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      settings.defaultDuration === duration
                        ? 'bg-primary text-white shadow-[0_0_20px_rgba(0,87,255,0.3)]'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {duration}s
                  </button>
                ))}
              </div>
            </div>

            {/* Default Visual Style */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-gray-300">
                {t('settings.defaultStyle')}
              </label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  VisualStyle.MOTION_GRAPHICS,
                  VisualStyle.CINEMATIC,
                  VisualStyle.TOSS_3D,
                  VisualStyle.REALISTIC,
                ].map((style) => (
                  <button
                    key={style}
                    onClick={() => settings.update({ defaultStyle: style })}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      settings.defaultStyle === style
                        ? 'bg-primary text-white shadow-[0_0_20px_rgba(0,87,255,0.3)]'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Storyboard Layout */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-gray-300">
                {t('settings.defaultLayout')}
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { layout: StoryboardLayout.GRID_2X5, label: t('settings.layout2x5') },
                  { layout: StoryboardLayout.GRID_2X4, label: t('settings.layout2x4') },
                  { layout: StoryboardLayout.GRID_1X4, label: t('settings.layout1x4') },
                ].map(({ layout, label }) => (
                  <button
                    key={layout}
                    onClick={() => settings.update({ defaultLayout: layout })}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all ${
                      settings.defaultLayout === layout
                        ? 'bg-primary text-white shadow-[0_0_20px_rgba(0,87,255,0.3)]'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10 border border-white/10'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section 2: Language Settings */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <Globe className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">
              {t('settings.language')}
            </h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-400">{t('settings.languageDesc')}</p>
            <div className="flex gap-4">
              <button
                onClick={() => setLanguage('ko')}
                className={`flex-1 p-4 rounded-2xl border-2 text-center transition-all ${
                  defaultLanguage === 'ko'
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                <span className="text-2xl mb-2 block">🇰🇷</span>
                <span className="font-black text-sm">{t('settings.korean')}</span>
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`flex-1 p-4 rounded-2xl border-2 text-center transition-all ${
                  defaultLanguage === 'en'
                    ? 'border-primary bg-primary/10 text-white'
                    : 'border-white/10 text-gray-500 hover:border-white/20'
                }`}
              >
                <span className="text-2xl mb-2 block">🇺🇸</span>
                <span className="font-black text-sm">{t('settings.english')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Onboarding Guide */}
        <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black italic uppercase tracking-tighter">
              {t('onboarding.replay.title')}
            </h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-gray-400">{t('onboarding.replay.desc')}</p>
            <button
              onClick={() => {
                resetOnboarding();
                setStep(ProjectStep.DASHBOARD);
              }}
              className="flex items-center gap-3 px-6 py-4 bg-primary/10 border border-primary/20 rounded-2xl hover:bg-primary/20 transition-all group w-full"
            >
              <RotateCcw size={20} className="text-primary group-hover:rotate-[-360deg] transition-transform duration-500" />
              <div className="text-left">
                <div className="font-black text-sm">{t('onboarding.replay.replayAll')}</div>
                <div className="text-[11px] text-gray-500 mt-0.5">{t('onboarding.replay.replayAllDesc')}</div>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
