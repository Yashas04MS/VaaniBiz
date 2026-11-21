import { useState } from 'react';
import {
  BookOpen,
  Bell,
  MessageSquare,
  CheckCircle2,
  Clock,
  Plus,
  Mic,
  IndianRupee,
  X,
} from 'lucide-react';
import type { DashboardSnapshot } from '../types';

interface RemindersKhataViewProps {
  snapshot: DashboardSnapshot;
  onCollectKhata: (customerId: number, amount: number) => Promise<void>;
  onCreateReminder: (payload: {
    type: 'payment' | 'delivery' | 'restock' | 'task';
    title: string;
    description: string;
    party_name: string;
    amount: number;
    channel: 'whatsapp' | 'voice' | 'app';
  }) => Promise<void>;
  onReminderAction: (id: number, action: 'complete' | 'snooze') => Promise<void>;
  onTriggerVoicePrompt: (prompt: string) => Promise<void>;
}

export function RemindersKhataView({
  snapshot,
  onCollectKhata,
  onCreateReminder,
  onReminderAction,
  onTriggerVoicePrompt,
}: RemindersKhataViewProps) {
  const [showNewModal, setShowNewModal] = useState(false);
  const [collectTarget, setCollectTarget] = useState<{ id: number; name: string; max: number } | null>(null);
  const [collectAmt, setCollectAmt] = useState(500);
  const [whatsappPreview, setWhatsappPreview] = useState<string | null>(null);

  const [remType, setRemType] = useState<'payment' | 'delivery' | 'restock' | 'task'>('payment');
  const [remTitle, setRemTitle] = useState('');
  const [remParty, setRemParty] = useState('');
  const [remAmount, setRemAmount] = useState(0);
  const [remDesc, setRemDesc] = useState('');

  const handleSubmitReminder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remTitle.trim() || !remParty.trim()) return;
    await onCreateReminder({
      type: remType,
      title: remTitle,
      description: remDesc || `${remType} follow-up with ${remParty}`,
      party_name: remParty,
      amount: remAmount,
      channel: 'whatsapp',
    });
    setRemTitle('');
    setRemParty('');
    setRemAmount(0);
    setRemDesc('');
    setShowNewModal(false);
  };

  return (
    <div className="space-y-5">
      {/* Top Action Strip */}
      <div className="bg-[#0B1120] rounded-2xl p-5 sm:p-6 text-white flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
            Udhar Khata & Voice Reminders • ಜ್ಞಾಪನೆ / उधारी खाता
          </div>
          <h2 className="font-display text-lg sm:text-xl font-bold">
            ₹{snapshot.totalKhataDue.toLocaleString('en-IN')} Total Pending Across{' '}
            {snapshot.pendingKhataCount} Khata Accounts
          </h2>
          <p className="text-xs text-slate-300">
            Say “Ramesh ji ke khate me 500 rupaye jama karo” or send instant WhatsApp UPI reminders.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => onTriggerVoicePrompt('Ramesh ji ke khate me 500 rupaye jama karo')}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-amber-300"
          >
            <Mic className="w-4 h-4" />
            <span>Voice Khata Entry</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNewModal(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F5D061] hover:bg-[#F2C338] text-slate-950 text-xs font-bold"
          >
            <Plus className="w-4 h-4" />
            <span>New Reminder</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Khata Customer Ledger */}
        <div className="xl:col-span-6 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-600" />
              <h3 className="font-display text-base font-bold text-slate-900">
                Customer Udhar Khata Ledger
              </h3>
            </div>
            <span className="text-xs text-slate-500">Live Balances</span>
          </div>

          <div className="space-y-3">
            {snapshot.khataCustomers.map((cust) => (
              <div
                key={cust.id}
                className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/80 flex flex-wrap items-center justify-between gap-3"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-sm font-bold text-slate-900">{cust.name}</span>
                    <span className="text-[11px] font-mono text-slate-500">{cust.book_no}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {cust.phone} • {cust.last_activity}
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="text-right mr-2">
                    <div className="text-[10px] uppercase font-bold text-slate-400">Due</div>
                    <div
                      className={`font-display text-base font-extrabold tabular-nums ${
                        cust.balance_due > 0 ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      ₹{cust.balance_due.toLocaleString('en-IN')}
                    </div>
                  </div>

                  {cust.balance_due > 0 && (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setWhatsappPreview(
                            `Namaste ${cust.name}, your Sri Lakshmi Kirana Khata balance is ₹${cust.balance_due.toLocaleString('en-IN')}. Please pay via UPI to srilakshmi.kirana@okaxis. Thank you!`
                          )
                        }
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200"
                        title="Preview WhatsApp UPI Reminder"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCollectTarget({ id: cust.id, name: cust.name, max: cust.balance_due });
                          setCollectAmt(Math.min(500, cust.balance_due));
                        }}
                        className="px-3 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold"
                      >
                        Collect
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scheduled Reminders Queue */}
        <div className="xl:col-span-6 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-600" />
              <h3 className="font-display text-base font-bold text-slate-900">
                Payment, Delivery & Restock Reminders
              </h3>
            </div>
            <span className="text-xs text-slate-500">
              {snapshot.reminders.filter((r) => r.status === 'pending').length} Pending
            </span>
          </div>

          <div className="space-y-3">
            {snapshot.reminders.map((rem) => {
              const isDone = rem.status === 'completed';
              return (
                <div
                  key={rem.id}
                  className={`p-4 rounded-xl border space-y-2.5 ${
                    isDone ? 'bg-slate-50 border-slate-200/60 opacity-65' : 'bg-[#F8FAFC] border-slate-200/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            rem.type === 'payment'
                              ? 'bg-[#FEF3C7] text-amber-900'
                              : rem.type === 'restock'
                              ? 'bg-[#FEE2E2] text-rose-800'
                              : 'bg-[#EEF2FF] text-[#3730A3]'
                          }`}
                        >
                          {rem.type}
                        </span>
                        <span className="text-xs font-bold text-slate-900">{rem.title}</span>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{rem.description}</p>
                    </div>
                    {rem.amount > 0 && (
                      <span className="font-mono font-bold text-xs text-slate-900 tabular-nums whitespace-nowrap">
                        ₹{rem.amount.toLocaleString('en-IN')}
                      </span>
                    )}
                  </div>

                  {!isDone && (
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400">
                        Channel: {rem.channel} • Due {new Date(rem.due_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onReminderAction(rem.id, 'snooze')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-[11px] font-medium text-slate-700"
                        >
                          <Clock className="w-3 h-3" /> Snooze 1d
                        </button>
                        <button
                          type="button"
                          onClick={() => onReminderAction(rem.id, 'complete')}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-[11px] font-semibold text-white"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Collect Payment Modal */}
      {collectTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Record Khata Payment</h3>
              <button type="button" onClick={() => setCollectTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-600">
              Customer: <strong className="text-slate-900">{collectTarget.name}</strong> (Pending ₹{collectTarget.max})
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Amount Received (₹)</label>
              <div className="relative">
                <IndianRupee className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min={1}
                  max={collectTarget.max}
                  value={collectAmt}
                  onChange={(e) => setCollectAmt(Number(e.target.value))}
                  className="w-full pl-8 pr-3 py-2 text-sm border border-slate-200 rounded-xl tabular-nums"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={async () => {
                await onCollectKhata(collectTarget.id, collectAmt);
                setCollectTarget(null);
              }}
              className="w-full py-2.5 rounded-xl bg-[#0B1120] text-white text-xs font-semibold"
            >
              Credit Khata Ledger
            </button>
          </div>
        </div>
      )}

      {/* WhatsApp Preview Modal */}
      {whatsappPreview && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">WhatsApp UPI Payment Note</h3>
              <button type="button" onClick={() => setWhatsappPreview(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-slate-800 leading-relaxed">
              {whatsappPreview}
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(whatsappPreview);
                setWhatsappPreview(null);
              }}
              className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
            >
              Copy Message for WhatsApp
            </button>
          </div>
        </div>
      )}

      {/* Create Reminder Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Schedule Store Reminder</h3>
              <button type="button" onClick={() => setShowNewModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSubmitReminder} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Type</label>
                  <select
                    value={remType}
                    onChange={(e) => setRemType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="payment">Payment</option>
                    <option value="delivery">Delivery</option>
                    <option value="restock">Restock</option>
                    <option value="task">Task</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Amount (₹ optional)</label>
                  <input
                    type="number"
                    min={0}
                    value={remAmount}
                    onChange={(e) => setRemAmount(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Party / Customer / Supplier</label>
                <input
                  required
                  value={remParty}
                  onChange={(e) => setRemParty(e.target.value)}
                  placeholder="e.g. Ramesh Kumar"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Title</label>
                <input
                  required
                  value={remTitle}
                  onChange={(e) => setRemTitle(e.target.value)}
                  placeholder="e.g. Collect Udhar balance"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Note</label>
                <input
                  value={remDesc}
                  onChange={(e) => setRemDesc(e.target.value)}
                  placeholder="Optional details"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-[#0B1120] text-white font-semibold">
                Save Reminder
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
