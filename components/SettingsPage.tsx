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
import { CustomStylesSection } from './CustomStylesSection';

export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const settings = useSettingsStore();
  const { defaultLanguage, setLanguage, resetOnboarding } = settings;
  const { setStep } = useStore();
  const { balance, maxCredits } = useCreditStore();

  const creditPercentage = (balance / maxCredits) * 100;

  return (
    <div className="min-h-screen bg-[#F4F7F6] text-zinc-900 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Section 1: Account */}
        <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <User className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black tracking-tight text-zinc-900">
              {t('settings.title')}
            </h2>
          </div>

          <div className="space-y-6">
            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary to-[#248B78] overflow-hidden">
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
                <div className="text-sm text-zinc-500">{user?.email || 'No email'}</div>
              </div>
            </div>

            {/* Plan Badge */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-500">{t('settings.currentPlan')}</span>
              <span className="px-4 py-1.5 bg-primary/20 text-primary border border-primary/30 rounded-full text-sm font-bold">
                {t('settings.freePlan')}
              </span>
            </div>

            {/* Credit Balance */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-zinc-500">{t('settings.creditBalance')}</span>
                <span className="text-lg font-bold">
                  {balance} / {maxCredits} {t('settings.creditUnit')}
                </span>
              </div>
              <div className="w-full h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-primary to-[#248B78] transition-all duration-300"
                  style={{ width: `${creditPercentage}%` }}
                />
              </div>
            </div>

            {/* Credit Usage Reference */}
            <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-100">
              <h3 className="text-xs uppercase tracking-wider text-zinc-400 mb-3 font-bold">
                {t('settings.creditUsageTitle')}
              </h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('settings.scriptGeneration')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.SCRIPT}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('settings.imagePro')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.IMAGE_PRO}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('settings.imageStandard')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.IMAGE_STANDARD}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('settings.videoStandard')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.VIDEO_STANDARD}cr</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">{t('settings.videoHD')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.VIDEO_HD}cr</span>
                </div>
                <div className="flex justify-between col-span-2">
                  <span className="text-zinc-500">{t('settings.videoUltra')}</span>
                  <span className="font-mono font-semibold">{CREDIT_COSTS.VIDEO_ULTRA}cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Section: AI Engine */}
        <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <Cpu className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black tracking-tight text-zinc-900">
              {t('settings.aiEngine')}
            </h2>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold mb-3 text-zinc-600">
                {t('settings.defaultVideoEngine')}
              </label>
              <div className="flex gap-3">
                <button
                  onClick={() => settings.update({ defaultVideoEngine: 'kling' })}
                  className={`flex-1 px-6 py-3 rounded-full font-semibold transition-all ${
                    settings.defaultVideoEngine === 'kling'
                      ? 'bg-primary text-white shadow-[0_8px_20px_rgba(0,117,104,0.25)]'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {t('settings.engineKling')}
                </button>
                <button
                  onClick={() => settings.update({ defaultVideoEngine: 'veo31' })}
                  className={`flex-1 px-6 py-3 rounded-full font-semibold transition-all ${
                    settings.defaultVideoEngine === 'veo31'
                      ? 'bg-primary text-white shadow-[0_8px_20px_rgba(0,117,104,0.25)]'
                      : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {t('settings.engineVeo31')}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Project Defaults */}
        <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <SettingsIcon className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black tracking-tight text-zinc-900">
              {t('settings.projectDefaults')}
            </h2>
          </div>

          <div className="space-y-6">
            {/* Default Duration */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-zinc-600">
                {t('settings.defaultDuration')}
              </label>
              <div className="grid grid-cols-4 gap-3">
                {[AdDuration.S15, AdDuration.S30, AdDuration.S45, AdDuration.S60].map((duration) => (
                  <button
                    key={duration}
                    onClick={() => settings.update({ defaultDuration: duration })}
                    className={`px-6 py-3 rounded-full font-semibold transition-all ${
                      settings.defaultDuration === duration
                        ? 'bg-primary text-white shadow-[0_8px_20px_rgba(0,117,104,0.25)]'
                        : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {duration}s
                  </button>
                ))}
              </div>
            </div>

            {/* Default Visual Style */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-zinc-600">
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
                    className={`px-6 py-3 rounded-full font-semibold transition-all ${
                      settings.defaultStyle === style
                        ? 'bg-primary text-white shadow-[0_8px_20px_rgba(0,117,104,0.25)]'
                        : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {style}
                  </button>
                ))}
              </div>
            </div>

            {/* Default Storyboard Layout */}
            <div>
              <label className="block text-sm font-semibold mb-3 text-zinc-600">
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
                    className={`px-6 py-3 rounded-full font-semibold transition-all ${
                      settings.defaultLayout === layout
                        ? 'bg-primary text-white shadow-[0_8px_20px_rgba(0,117,104,0.25)]'
                        : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Section: My Custom Styles */}
        <CustomStylesSection />

        {/* Section 2: Language Settings */}
        <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <Globe className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black tracking-tight text-zinc-900">
              {t('settings.language')}
            </h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-zinc-500">{t('settings.languageDesc')}</p>
            <div className="flex gap-4">
              <button
                onClick={() => setLanguage('ko')}
                className={`flex-1 p-4 rounded-2xl border-2 text-center transition-all ${
                  defaultLanguage === 'ko'
                    ? 'border-primary bg-[#F0F7F4] text-primary'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                <span className="text-2xl mb-2 block">🇰🇷</span>
                <span className="font-black text-sm">{t('settings.korean')}</span>
              </button>
              <button
                onClick={() => setLanguage('en')}
                className={`flex-1 p-4 rounded-2xl border-2 text-center transition-all ${
                  defaultLanguage === 'en'
                    ? 'border-primary bg-[#F0F7F4] text-primary'
                    : 'border-zinc-200 text-zinc-500 hover:border-zinc-300'
                }`}
              >
                <span className="text-2xl mb-2 block">🇺🇸</span>
                <span className="font-black text-sm">{t('settings.english')}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Section 3: Onboarding Guide */}
        <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
          <div className="flex items-center gap-3 mb-8">
            <BookOpen className="w-7 h-7 text-primary" />
            <h2 className="text-2xl font-black tracking-tight text-zinc-900">
              {t('onboarding.replay.title')}
            </h2>
          </div>

          <div className="space-y-4">
            <p className="text-sm text-zinc-500">{t('onboarding.replay.desc')}</p>
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
                <div className="text-[11px] text-zinc-400 mt-0.5">{t('onboarding.replay.replayAllDesc')}</div>
              </div>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
