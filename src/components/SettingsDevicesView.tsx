import { useState, useEffect } from 'react';
import {
  Store,
  Mic,
  Volume2,
  ShieldCheck,
  Activity,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import type { DashboardSnapshot, LanguageCode } from '../types';

interface SettingsDevicesViewProps {
  snapshot: DashboardSnapshot;
  selectedMicId: string;
  onSelectMicId: (deviceId: string) => void;
  onUpdateProfile: (payload: {
    shop_name: string;
    location: string;
    owner_name: string;
    preferred_language: LanguageCode;
    approval_qty_threshold: number;
    approval_value_threshold: number;
  }) => Promise<void>;
  onTestMurfVoice: () => Promise<void>;
  onRunHealthCheck: () => Promise<void>;
}

export function SettingsDevicesView({
  snapshot,
  selectedMicId,
  onSelectMicId,
  onUpdateProfile,
  onTestMurfVoice,
  onRunHealthCheck,
}: SettingsDevicesViewProps) {
  const [shopName, setShopName] = useState(snapshot.profile.shop_name);
  const [location, setLocation] = useState(snapshot.profile.location);
  const [ownerName, setOwnerName] = useState(snapshot.profile.owner_name);
  const [lang, setLang] = useState<LanguageCode>(snapshot.profile.preferred_language);
  const [qtyThresh, setQtyThresh] = useState(snapshot.profile.approval_qty_threshold);
  const [valThresh, setValThresh] = useState(snapshot.profile.approval_value_threshold);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);
  const [mics, setMics] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices
        .enumerateDevices()
        .then((devices) => setMics(devices.filter((d) => d.kind === 'audioinput')))
        .catch(() => setMics([]));
    }
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onUpdateProfile({
        shop_name: shopName,
        location,
        owner_name: ownerName,
        preferred_language: lang,
        approval_qty_threshold: qtyThresh,
        approval_value_threshold: valThresh,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Store & Voice Guard Settings */}
        <form
          onSubmit={handleSave}
          className="xl:col-span-6 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4"
        >
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-amber-600" />
            <h2 className="font-display text-base font-bold text-slate-900">
              Merchant Store & Voice Guard Preferences
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Shop Name</label>
              <input
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Neighborhood / City</label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Merchant Owner Name</label>
              <input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Primary Voice Language</label>
              <select
                value={lang}
                onChange={(e) => setLang(e.target.value as LanguageCode)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
              >
                <option value="en">English (Indian Kirana)</option>
                <option value="hi">Hindi / Hinglish (हिन्दी)</option>
                <option value="kn">Kannada / Kanglish (ಕನ್ನಡ)</option>
              </select>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/80 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>Voice Guard Safety Thresholds</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-slate-600 mb-1">Stock Approval Qty Limit</label>
                <input
                  type="number"
                  value={qtyThresh}
                  onChange={(e) => setQtyThresh(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white tabular-nums"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">PO Approval Value (₹)</label>
                <input
                  type="number"
                  value={valThresh}
                  onChange={(e) => setValThresh(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white tabular-nums"
                />
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving Preferences...' : 'Save Store Preferences'}
          </button>
        </form>

        {/* Audio Devices & Live Integration Health */}
        <div className="xl:col-span-6 space-y-5">
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mic className="w-4 h-4 text-amber-600" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Counter Audio & Murf Voice Output
                </h2>
              </div>
              <button
                type="button"
                disabled={testingVoice}
                onClick={async () => {
                  setTestingVoice(true);
                  try {
                    await onTestMurfVoice();
                  } finally {
                    setTestingVoice(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5D061] hover:bg-[#F2C338] text-slate-950 text-xs font-bold"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>{testingVoice ? 'Synthesizing...' : 'Test Murf Voice (en-IN-anisha)'}</span>
              </button>
            </div>

            <div className="text-xs space-y-2">
              <label className="block font-semibold text-slate-700">Active Microphone Input</label>
              <select
                value={selectedMicId}
                onChange={(e) => onSelectMicId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
              >
                <option value="">System Default Microphone</option>
                {mics.map((m, idx) => (
                  <option key={m.deviceId || idx} value={m.deviceId}>
                    {m.label || `Counter Microphone ${idx + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Real Engine Health Verification */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-amber-600" />
                <h2 className="font-display text-base font-bold text-slate-900">
                  Live Engine Health Verification
                </h2>
              </div>
              <button
                type="button"
                disabled={checking}
                onClick={async () => {
                  setChecking(true);
                  try {
                    await onRunHealthCheck();
                  } finally {
                    setChecking(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>{checking ? 'Verifying...' : 'Run Live Check'}</span>
              </button>
            </div>

            <div className="space-y-2.5">
              {snapshot.health.map((item) => {
                const isOk = item.status === 'healthy' || item.status === 'ready';
                return (
                  <div
                    key={item.service}
                    className="p-3 rounded-xl bg-[#F8FAFC] border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      {isOk ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <div>
                        <div className="font-bold text-slate-900 uppercase tracking-wide text-[11px]">
                          {item.service}
                        </div>
                        <div className="text-slate-600">{item.detail}</div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          item.status === 'healthy'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'ready'
                            ? 'bg-indigo-100 text-indigo-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {item.status}
                      </span>
                      {item.latency_ms > 0 && (
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5 tabular-nums">
                          {item.latency_ms}ms
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
