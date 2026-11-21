import { useState, useRef, useEffect } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  User,
  ShoppingCart,
  ArrowLeftRight,
  ArrowRight,
  X,
  Volume2,
  Send,
  History,
  CheckCircle2,
  AlertTriangle,
  BookOpen,
  Wallet,
  ShieldCheck,
} from 'lucide-react';
import type { DashboardSnapshot, ConversationMessage, NavTab } from '../types';
import { AcousticWaveform } from './AcousticWaveform';

interface VoiceConsoleViewProps {
  snapshot: DashboardSnapshot;
  messages: ConversationMessage[];
  isListening: boolean;
  isProcessing: boolean;
  isSpeaking: boolean;
  audioLevel: number;
  lastLatencyMs: number;
  agoraConnected: boolean;
  onToggleListening: () => void;
  onSendCommand: (text: string) => Promise<void>;
  onPlayAudio: (msg: ConversationMessage) => void;
  onDraftPoFromSuggestion: (supplierId?: number, productId?: number, quantity?: number) => Promise<void>;
  onConfirmApproval: (approvalId: string) => Promise<void>;
  onCancelApproval: (approvalId: string) => Promise<void>;
  onNavigate: (tab: NavTab) => void;
}

const QUICK_PROMPTS = [
  {
    title: '“Aaj ki kul bikri?”',
    subtitle: 'Total revenue & cash split today',
    command: 'Aaj ki kul bikri aur cash UPI split batao?',
  },
  {
    title: '“Atta stock check”',
    subtitle: 'Aashirvaad 5kg & 10kg availability',
    command: 'Check Aashirvaad atta 5kg and 10kg stock levels',
  },
  {
    title: '“Remind Ramesh ₹ 2,500”',
    subtitle: 'Send WhatsApp Khata note with UPI',
    command: 'Create a WhatsApp payment reminder for Ramesh Kumar for 2500 rupees',
  },
  {
    title: '“Top 5 fast moving items”',
    subtitle: 'Velocity report for reorder planning',
    command: 'Show top 5 fast moving items and low stock alerts',
  },
];

export function VoiceConsoleView({
  snapshot,
  messages,
  isListening,
  isProcessing,
  isSpeaking,
  audioLevel,
  lastLatencyMs,
  agoraConnected,
  onToggleListening,
  onSendCommand,
  onPlayAudio,
  onDraftPoFromSuggestion,
  onConfirmApproval,
  onCancelApproval,
  onNavigate,
}: VoiceConsoleViewProps) {
  const [typedInput, setTypedInput] = useState('');
  const [dismissedActions, setDismissedActions] = useState<Record<string, boolean>>({});
  const [showAuditModal, setShowAuditModal] = useState(false);
  const feedEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, isProcessing]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = typedInput.trim();
    if (!trimmed || isProcessing) return;
    setTypedInput('');
    await onSendCommand(trimmed);
  };

  const urgentNames = snapshot.lowStockItems.slice(0, 2).map((i) => i.name.split(' ').slice(0, 2).join(' ')).join(', ');
  const dbLevel = isListening ? Math.round(-22 + audioLevel * 18) : -12;

  return (
    <div className="space-y-4">
      {/* Top Engine & Channel Chips Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#EEF2FF] text-[#3730A3] text-xs font-medium border border-[#E0E7FF]">
            <span className={`w-2 h-2 rounded-full ${agoraConnected ? 'bg-emerald-500' : 'bg-[#6366F1]'}`} />
            <span>Agora Voice Channel {snapshot.profile.store_code}</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-slate-700 text-xs font-medium border border-slate-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
            <span>Dual-Engine Active: Gemini 4 + Murf Falcon</span>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white text-slate-600 text-xs border border-slate-200">
            <span>Hold</span>
            <kbd className="px-1.5 py-0.5 text-[11px] font-mono bg-slate-100 border border-slate-300 rounded text-slate-800">
              Spacebar
            </kbd>
            <span>anywhere to talk</span>
          </div>
        </div>

        {/* Direct Voice / Text Bar for testing or quick commands */}
        <form onSubmit={handleSubmit} className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <input
              type="text"
              value={typedInput}
              onChange={(e) => setTypedInput(e.target.value)}
              placeholder="Or type Hinglish / Kannada / EN..."
              className="w-full pl-3.5 pr-9 py-1.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
            <button
              type="submit"
              disabled={!typedInput.trim() || isProcessing}
              aria-label="Send voice text command"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-500 hover:text-slate-900 disabled:opacity-40"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={onToggleListening}
            className={`p-2 rounded-xl border transition-colors ${
              isListening
                ? 'bg-rose-50 border-rose-300 text-rose-600'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
            title={isListening ? 'Stop listening' : 'Tap to speak'}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>
        </form>
      </div>

      {/* Main 2-Column Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left/Center Column: Dark Voice Console + Quick Spoken Prompts */}
        <div className="xl:col-span-8 space-y-5">
          {/* Dark Midnight Voice Stage */}
          <div className="bg-[#0B1120] rounded-2xl p-5 sm:p-6 text-white shadow-lg border border-slate-800/80">
            {/* Console Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                    isListening
                      ? 'bg-rose-400 animate-pulse'
                      : isProcessing
                      ? 'bg-amber-300 animate-pulse'
                      : isSpeaking
                      ? 'bg-emerald-400'
                      : 'bg-amber-400'
                  }`}
                />
                <div>
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-amber-400">
                    {isListening
                      ? 'LISTENING LIVE — SPEAK NOW'
                      : isProcessing
                      ? 'GEMINI TOOL LOOP PROCESSING...'
                      : isSpeaking
                      ? 'MURF FALCON SPEAKING (EN-IN-ANISHA)'
                      : 'LISTENING LIVE'}
                  </div>
                  <div className="text-xs text-slate-300 mt-0.5">
                    boliye, naanu kelthiddene • बोलिए, मैं सुन रही हूँ
                  </div>
                </div>
              </div>
              <div className="px-3 py-1 rounded-full bg-slate-800/90 border border-slate-700 text-[11px] font-medium text-slate-200 tabular-nums">
                {lastLatencyMs || 180}ms Low Latency RTC
              </div>
            </div>

            {/* Acoustic Beam Waveform Card */}
            <div className="bg-[#131C31] border border-slate-700/60 rounded-2xl p-3.5 mb-5 flex items-center gap-4">
              <button
                type="button"
                onClick={onToggleListening}
                className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 border ${
                  isListening
                    ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.45)]'
                    : 'bg-[#1D2842] text-amber-300 border-slate-600/80 hover:border-amber-400/60'
                }`}
                title="Toggle microphone"
              >
                <Mic className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                  <span className="text-slate-300 truncate">Acoustic Beam • Omnidirectional Array</span>
                  <span className="text-amber-300 font-mono tabular-nums whitespace-nowrap">
                    Level: {dbLevel} dB ({isListening ? 'Active' : 'Optimal'})
                  </span>
                </div>
                <AcousticWaveform isListening={isListening} isSpeaking={isSpeaking} audioLevel={audioLevel} />
              </div>
            </div>

            {/* Pending Voice Guard Approval Banner inside console if any */}
            {snapshot.pendingApprovals.length > 0 && (
              <div className="mb-4 rounded-xl bg-amber-500/10 border border-amber-400/30 p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-amber-300 mt-0.5 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold text-amber-300">
                      Voice Guard Approval Pending
                    </div>
                    <div className="text-xs text-slate-200 mt-0.5">
                      {snapshot.pendingApprovals[0].summary}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onConfirmApproval(snapshot.pendingApprovals[0].id)}
                    className="px-3 py-1.5 rounded-lg bg-[#F5D061] hover:bg-[#F3C542] text-slate-950 text-xs font-semibold whitespace-nowrap"
                  >
                    Confirm & Dispatch
                  </button>
                  <button
                    type="button"
                    onClick={() => onCancelApproval(snapshot.pendingApprovals[0].id)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Conversation Stream Card */}
            <div className="bg-white text-slate-900 rounded-2xl p-4 sm:p-5 space-y-5 max-h-[470px] overflow-y-auto">
              {messages.map((msg) => (
                <div key={msg.id} className="space-y-2.5">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        msg.role === 'user'
                          ? 'bg-[#EEF2FF] text-[#4F46E5]'
                          : 'bg-[#FEF3C7] text-[#B45309]'
                      }`}
                    >
                      {msg.role === 'user' ? <User className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 text-xs mb-1">
                        <span
                          className={`font-medium ${
                            msg.role === 'user' ? 'text-slate-500' : 'text-[#A16207]'
                          }`}
                        >
                          {msg.speakerLabel} • {msg.languageTag}
                        </span>
                        <div className="flex items-center gap-2">
                          {msg.role === 'assistant' && (
                            <button
                              type="button"
                              onClick={() => onPlayAudio(msg)}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 text-amber-800 text-[11px] font-medium transition-colors"
                              title="Play Murf Falcon speech"
                            >
                              <Volume2 className="w-3 h-3" />
                              <span>Speak</span>
                            </button>
                          )}
                          <span className="text-slate-400 font-mono text-[11px] tabular-nums">{msg.timestamp}</span>
                        </div>
                      </div>

                      {msg.role === 'user' ? (
                        <div>
                          <p className="font-display text-base sm:text-lg font-bold text-slate-900 leading-snug">
                            “{msg.text}”
                          </p>
                          {msg.subText && (
                            <p className="text-xs italic text-slate-500 mt-1">“{msg.subText}”</p>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-sm sm:text-[15px] text-slate-800 leading-relaxed">{msg.text}</p>

                          {msg.suggestionAction && !dismissedActions[msg.id] && (
                            <div className="space-y-3 pt-1">
                              <div className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs sm:text-sm text-slate-700">
                                <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
                                <span>{msg.subText || 'Should I draft a purchase order for 2 bags (100 kg) for ₹ 3,800?'}</span>
                              </div>

                              <div className="flex flex-wrap items-center gap-2.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onDraftPoFromSuggestion(
                                      msg.suggestionAction?.supplierId,
                                      msg.suggestionAction?.productId,
                                      msg.suggestionAction?.quantity
                                    )
                                  }
                                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F5D061] hover:bg-[#F1C43D] text-slate-950 text-xs sm:text-sm font-semibold shadow-sm transition-colors"
                                >
                                  <ShoppingCart className="w-4 h-4" />
                                  <span>{msg.suggestionAction.label}</span>
                                </button>

                                {msg.suggestionAction.secondaryLabel && (
                                  <button
                                    type="button"
                                    onClick={() => onNavigate('suppliers')}
                                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-medium transition-colors"
                                  >
                                    <ArrowLeftRight className="w-4 h-4 text-slate-500" />
                                    <span>{msg.suggestionAction.secondaryLabel}</span>
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => setDismissedActions((prev) => ({ ...prev, [msg.id]: true }))}
                                  className="p-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-500"
                                  aria-label="Dismiss suggestion"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {isProcessing && (
                <div className="flex items-center gap-3 text-xs text-slate-500 pt-2 border-t border-slate-100">
                  <Sparkles className="w-4 h-4 text-amber-500 animate-spin" />
                  <span>Gemini 4 Hydrogen is executing store tools & Murf Falcon is synthesizing reply...</span>
                </div>
              )}
              <div ref={feedEndRef} />
            </div>
          </div>

          {/* Quick Spoken Prompts */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs">
            <div className="flex items-center justify-between gap-2 mb-3.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-600" />
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900">
                  Quick Spoken Prompts
                </h2>
              </div>
              <span className="text-xs text-slate-500">Click to emulate verbal order</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {QUICK_PROMPTS.map((item) => (
                <button
                  key={item.title}
                  type="button"
                  disabled={isProcessing}
                  onClick={() => onSendCommand(item.command)}
                  className="group flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#F4F7FC] hover:bg-[#EBF0FA] border border-slate-200/60 text-left transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">{item.title}</div>
                    <div className="text-xs text-slate-500 mt-0.5 truncate">{item.subtitle}</div>
                  </div>
                  <span className="w-7 h-7 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 text-slate-600 group-hover:text-slate-900 group-hover:translate-x-0.5 transition-all">
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Store Pulse Today + Live Speech Activity Log */}
        <div className="xl:col-span-4 space-y-5">
          {/* Store Pulse Today */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-amber-600" />
                <h2 className="font-display text-sm font-bold text-slate-900">Store Pulse Today</h2>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] font-medium text-slate-600">
                Live Sync
              </span>
            </div>

            {/* Today's Counter Sales */}
            <button
              type="button"
              onClick={() => onNavigate('sales')}
              className="w-full text-left p-3.5 rounded-xl bg-[#F4F7FC] hover:bg-[#ECF1FA] border border-slate-200/70 flex items-center justify-between gap-3 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#FDE68A] text-amber-900 flex items-center justify-center shrink-0 font-bold">
                  ₹
                </div>
                <div>
                  <div className="text-xs text-slate-500">Today&apos;s Counter Sales</div>
                  <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
                    ₹ {snapshot.salesSummary.totalRevenue.toLocaleString('en-IN')}
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-2 py-0.5 rounded-md bg-[#FDE68A] text-[11px] font-bold text-amber-900">
                  +8.4%
                </span>
                <div className="text-[11px] text-slate-500 mt-1 tabular-nums">
                  {snapshot.salesSummary.invoiceCount} bills settled
                </div>
              </div>
            </button>

            {/* 2 Mini Cards: Urgent + Udhar Khata */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onNavigate('inventory')}
                className="text-left p-3.5 rounded-xl bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-rose-200/80 transition-colors"
              >
                <div className="flex items-center justify-between gap-1 mb-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span className="px-1.5 py-0.5 rounded bg-rose-600 text-[10px] font-bold text-white uppercase">
                    Urgent
                  </span>
                </div>
                <div className="font-display text-lg font-bold text-rose-700 tabular-nums">
                  {snapshot.lowStockItems.length} Items
                </div>
                <div className="text-[11px] text-rose-600 mt-0.5 truncate">
                  {urgentNames || 'All stock healthy'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('reminders')}
                className="text-left p-3.5 rounded-xl bg-[#F4F7FC] hover:bg-[#ECF1FA] border border-slate-200/70 transition-colors"
              >
                <div className="flex items-center gap-1.5 text-xs text-slate-600 mb-2">
                  <BookOpen className="w-3.5 h-3.5 text-amber-600" />
                  <span>Udhar Khata</span>
                </div>
                <div className="font-display text-lg font-bold text-slate-900 tabular-nums">
                  ₹ {snapshot.totalKhataDue.toLocaleString('en-IN')}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                  {snapshot.pendingKhataCount} dues pending today
                </div>
              </button>
            </div>
          </div>

          {/* Live Speech Activity Log */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-700" />
                <h2 className="font-display text-sm font-bold text-slate-900">
                  Live Speech Activity Log
                </h2>
              </div>
              <span className="text-[11px] text-slate-500">Real-time RPC</span>
            </div>

            <div className="space-y-3">
              {snapshot.recentRuns.slice(0, 3).map((run) => (
                <div
                  key={run.id}
                  className="p-3.5 rounded-xl bg-[#F4F7FC] border border-slate-200/70 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[#E0E7FF] text-[#3730A3] font-semibold">
                        {run.language}
                      </span>
                      <span className="text-slate-500 font-mono tabular-nums">
                        {new Date(run.created_at).toLocaleTimeString('en-IN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <CheckCircle2 className="w-3 h-3 text-amber-500" />
                      {run.status}
                    </span>
                  </div>

                  <p className="text-xs font-medium text-slate-800">{run.utterance}</p>

                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <code className="px-2 py-1 rounded bg-[#E2E8F0]/70 text-[10px] font-mono text-slate-600 truncate max-w-[190px]">
                      {run.rpc_label}
                    </code>
                    {run.financial_delta && (
                      <span className="text-xs font-semibold text-slate-900 font-mono tabular-nums whitespace-nowrap">
                        {run.financial_delta}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowAuditModal(true)}
              className="w-full py-2.5 rounded-xl bg-[#F4F7FC] hover:bg-slate-200/70 text-xs font-semibold text-slate-700 border border-slate-200/80 transition-colors"
            >
              View Complete 24h Audio Transaction Audit
            </button>
          </div>
        </div>
      </div>

      {/* 24h Audio Transaction Audit Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full max-h-[82vh] flex flex-col border border-slate-200 shadow-2xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  24h Audio Transaction Audit Log
                </h3>
                <p className="text-xs text-slate-500">
                  Every Gemini tool call and database mutation recorded with latency
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAuditModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-2.5">
              {snapshot.recentRuns.map((run) => (
                <div key={run.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-900">{run.utterance}</span>
                    <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                      {run.latency_ms}ms · {new Date(run.created_at).toLocaleTimeString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] font-mono text-indigo-700">{run.rpc_label}</code>
                    <span className="text-emerald-700 font-medium">{run.financial_delta || run.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
