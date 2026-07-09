import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { getAllAdminConfig, setAdminConfig, isAdmin, type AdminConfigKey } from '../services/adminConfigService';
import { supabase } from '../lib/supabase';
import {
  Shield,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Save,
  ClipboardList,
  ChevronDown,
  Clock,
  User,
  Mail,
} from 'lucide-react';

interface ApiKeyField {
  key: AdminConfigKey;
  label: string;
  placeholder: string;
  description: string;
}

const API_KEY_FIELDS: ApiKeyField[] = [
  {
    key: 'gemini_api_key',
    label: 'Gemini API Key',
    placeholder: 'AIza...',
    description: '',
  },
  {
    key: 'kling_access_key_id',
    label: 'Kling Access Key ID',
    placeholder: 'ak-...',
    description: '',
  },
  {
    key: 'kling_access_key_secret',
    label: 'Kling Access Key Secret',
    placeholder: 'sk-...',
    description: '',
  },
];

type RequestStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';

interface ProductionRequest {
  id: string;
  project_title: string;
  requester_name: string;
  requester_email: string;
  purpose: string;
  aspect_ratio: string;
  scene_count: number;
  status: string;
  additional_notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS_KR: Record<RequestStatus, string> = {
  pending: '대기 중',
  in_progress: '진행 중',
  completed: '완료',
  cancelled: '취소됨',
};

const STATUS_COLORS: Record<RequestStatus, string> = {
  pending: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  in_progress: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  completed: 'bg-green-500/15 text-green-400 border-green-500/30',
  cancelled: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

type AdminTab = 'api-keys' | 'requests';

export const AdminPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('api-keys');

  // API Keys state
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<Record<string, 'success' | 'error'>>({});

  // Requests state
  const [requests, setRequests] = useState<ProductionRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const userIsAdmin = isAdmin(user?.email ?? undefined);

  useEffect(() => {
    if (!userIsAdmin) {
      setLoading(false);
      return;
    }
    loadConfig();
  }, [userIsAdmin]);

  useEffect(() => {
    if (userIsAdmin && activeTab === 'requests') {
      loadRequests();
    }
  }, [userIsAdmin, activeTab]);

  const loadConfig = async () => {
    setLoading(true);
    const config = await getAllAdminConfig();
    setValues(config);
    setLoading(false);
  };

  const loadRequests = async () => {
    setRequestsLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_all_requests');
      if (error) throw error;
      setRequests((data as ProductionRequest[]) || []);
    } catch (err) {
      console.error('Failed to load production requests:', err);
    } finally {
      setRequestsLoading(false);
    }
  };

  const handleSave = async (key: AdminConfigKey) => {
    const value = values[key];
    if (!value?.trim()) return;

    setSaving(key);
    const success = await setAdminConfig(key, value.trim());
    setSaveStatus((prev) => ({ ...prev, [key]: success ? 'success' : 'error' }));
    setSaving(null);

    setTimeout(() => {
      setSaveStatus((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }, 3000);
  };

  const handleStatusChange = async (requestId: string, newStatus: RequestStatus) => {
    setUpdatingStatus(requestId);
    try {
      const { error } = await supabase.rpc('admin_update_request_status', {
        p_request_id: requestId,
        p_status: newStatus,
      });
      if (error) throw error;
      setRequests((prev) =>
        prev.map((r) =>
          r.id === requestId ? { ...r, status: newStatus, updated_at: new Date().toISOString() } : r
        )
      );
    } catch (err) {
      console.error('Failed to update request status:', err);
    } finally {
      setUpdatingStatus(null);
    }
  };

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (!userIsAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-white">{t('admin.unauthorized')}</h2>
          <p className="text-gray-400 text-sm">{t('admin.unauthorizedDesc')}</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
          <p className="text-sm text-gray-500">{t('admin.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-gradient-to-r from-primary/10 to-accent/5 border border-primary/20 rounded-[2rem] p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black italic uppercase tracking-tighter">
                {t('admin.title')}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {t('admin.subtitle')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-green-500/10 text-green-400 rounded-full font-bold">ADMIN</span>
            <span>{user?.email}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-white/5 pb-0">
          <button
            onClick={() => setActiveTab('api-keys')}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-bold text-sm transition-all ${
              activeTab === 'api-keys'
                ? 'bg-[#0A0A0A] border border-b-[#0A0A0A] border-white/5 text-white -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Key className="w-4 h-4" />
            {t('admin.tabApiKeys')}
          </button>
          <button
            onClick={() => setActiveTab('requests')}
            className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-bold text-sm transition-all ${
              activeTab === 'requests'
                ? 'bg-[#0A0A0A] border border-b-[#0A0A0A] border-white/5 text-white -mb-px'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            {t('admin.tabRequests')}
            {requests.filter((r) => r.status === 'pending').length > 0 && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-black text-[10px] font-black rounded-full">
                {requests.filter((r) => r.status === 'pending').length}
              </span>
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'api-keys' && (
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
            <div className="flex items-center gap-3 mb-8">
              <Key className="w-7 h-7 text-primary" />
              <h2 className="text-2xl font-black italic uppercase tracking-tighter">
                {t('admin.apiKeysTitle')}
              </h2>
            </div>

            <div className="space-y-6">
              {API_KEY_FIELDS.map((field) => (
                <div key={field.key} className="bg-black/40 rounded-xl p-5 border border-white/5">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-semibold text-gray-300">
                      {field.label}
                    </label>
                    <div className="flex items-center gap-2">
                      {saveStatus[field.key] === 'success' && (
                        <span className="flex items-center gap-1 text-xs text-green-400 font-bold">
                          <CheckCircle2 className="w-3 h-3" /> {t('common.savedStatus')}
                        </span>
                      )}
                      {saveStatus[field.key] === 'error' && (
                        <span className="flex items-center gap-1 text-xs text-red-400 font-bold">
                          <AlertCircle className="w-3 h-3" /> {t('common.failed')}
                        </span>
                      )}
                      {values[field.key] && !saveStatus[field.key] && (
                        <span className="flex items-center gap-1 text-xs text-green-500">
                          <CheckCircle2 className="w-3 h-3" /> {t('common.configured')}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{field.key === 'gemini_api_key' ? t('admin.geminiDesc') : field.key === 'kling_access_key_id' ? t('admin.klingAccessDesc') : t('admin.klingSecretDesc')}</p>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <input
                        type={visibility[field.key] ? 'text' : 'password'}
                        value={values[field.key] || ''}
                        onChange={(e) => setValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full bg-[#0A0A0A] border border-white/10 rounded-xl px-4 py-3 text-white font-mono text-sm focus:outline-none focus:border-primary/50 transition-colors pr-12"
                      />
                      <button
                        onClick={() => setVisibility((prev) => ({ ...prev, [field.key]: !prev[field.key] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                      >
                        {visibility[field.key] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    <button
                      onClick={() => handleSave(field.key)}
                      disabled={saving === field.key || !values[field.key]?.trim()}
                      className="px-5 py-3 bg-primary hover:bg-primary/80 disabled:bg-white/5 disabled:text-gray-600 text-white rounded-xl font-semibold transition-all flex items-center gap-2 shrink-0"
                    >
                      {saving === field.key ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {t('common.save')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'requests' && (
          <div className="bg-[#0A0A0A] border border-white/5 rounded-[2rem] p-8">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <ClipboardList className="w-7 h-7 text-primary" />
                <h2 className="text-2xl font-black italic uppercase tracking-tighter">
                  {t('admin.requestsTitle')}
                </h2>
              </div>
              <button
                onClick={loadRequests}
                disabled={requestsLoading}
                className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm font-semibold text-gray-300 transition-all"
              >
                {requestsLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                {t('common.refresh')}
              </button>
            </div>

            {requestsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : requests.length === 0 ? (
              <div className="text-center py-20 space-y-3">
                <ClipboardList className="w-12 h-12 text-gray-600 mx-auto" />
                <p className="text-gray-500 font-semibold">{t('admin.noRequests')}</p>
              </div>
            ) : (
              <div className="space-y-4">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-black/40 border border-white/5 rounded-2xl p-5 space-y-4"
                  >
                    {/* Header row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-black text-white truncate">{req.project_title}</h3>
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{req.purpose}</p>
                      </div>
                      {/* Status selector */}
                      <div className="relative shrink-0">
                        {updatingStatus === req.id ? (
                          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold ${STATUS_COLORS[(req.status as RequestStatus) || 'pending']}`}>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {t('common.updating')}
                          </div>
                        ) : (
                          <div className="relative">
                            <select
                              value={req.status}
                              onChange={(e) => handleStatusChange(req.id, e.target.value as RequestStatus)}
                              className={`appearance-none pl-3 pr-8 py-1.5 rounded-lg border text-xs font-bold cursor-pointer focus:outline-none transition-all ${STATUS_COLORS[(req.status as RequestStatus) || 'pending']} bg-transparent`}
                            >
                              <option value="pending" className="bg-[#1A1A1A] text-white">{t('status.pending')}</option>
                              <option value="in_progress" className="bg-[#1A1A1A] text-white">{t('status.inProgress')}</option>
                              <option value="completed" className="bg-[#1A1A1A] text-white">{t('status.completed')}</option>
                              <option value="cancelled" className="bg-[#1A1A1A] text-white">{t('status.cancelled')}</option>
                            </select>
                            <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Requester info */}
                    <div className="flex items-center gap-4 flex-wrap text-xs text-gray-400">
                      <span className="flex items-center gap-1.5">
                        <User className="w-3 h-3" />
                        {req.requester_name}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <Mail className="w-3 h-3" />
                        {req.requester_email}
                      </span>
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Clock className="w-3 h-3" />
                        {formatDate(req.created_at)}
                      </span>
                    </div>

                    {/* Meta tags */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-gray-400 uppercase">
                        {req.aspect_ratio}
                      </span>
                      <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded-full text-[10px] font-bold text-gray-400 uppercase">
                        {req.scene_count}컷
                      </span>
                      <span className={`px-2 py-0.5 border rounded-full text-[10px] font-bold uppercase ${STATUS_COLORS[(req.status as RequestStatus) || 'pending']}`}>
                        {t(`status.${req.status === 'in_progress' ? 'inProgress' : (req.status || 'pending')}`)}
                      </span>
                    </div>

                    {/* Additional notes */}
                    {req.additional_notes && (
                      <p className="text-xs text-gray-500 bg-white/3 border border-white/5 rounded-xl px-3 py-2 italic">
                        {req.additional_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
