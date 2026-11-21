import { useState, useMemo } from 'react';
import {
  Mic,
  Printer,
  Download,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Play,
  Volume2,
  X,
  Plus,
  Trash2,
  BookOpen,
  QrCode,
  Banknote,
  BarChart2,
} from 'lucide-react';
import type { DashboardSnapshot, NavTab } from '../types';

interface SalesPosViewProps {
  snapshot: DashboardSnapshot;
  onCreateSale: (payload: {
    customer_name: string;
    payment_mode: string;
    items: { product_id: number; quantity: number }[];
  }) => Promise<void>;
  onPlayTranscriptAudio: (text: string) => Promise<void>;
  onNavigate: (tab: NavTab) => void;
  onTriggerVoicePrompt: (prompt: string) => Promise<void>;
}

export function SalesPosView({
  snapshot,
  onCreateSale,
  onPlayTranscriptAudio,
  onNavigate,
  onTriggerVoicePrompt,
}: SalesPosViewProps) {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('ALL');
  const [showNewBillModal, setShowNewBillModal] = useState(false);
  const [playingId, setPlayingId] = useState<number | null>(null);

  // New POS Bill Modal State
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [paymentMode, setPaymentMode] = useState('UPI PhonePe');
  const [billLines, setBillLines] = useState<{ product_id: number; quantity: number }[]>([
    { product_id: snapshot.products[1]?.id || 2, quantity: 2 },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const multiplier = period === 'today' ? 1 : period === 'week' ? 6.15 : 24.4;
  const rev = Math.round(snapshot.salesSummary.totalRevenue * multiplier);
  const cash = Math.round(snapshot.salesSummary.cashTotal * multiplier);
  const upi = Math.round(snapshot.salesSummary.upiTotal * multiplier);
  const khata = Math.round(snapshot.salesSummary.khataTotal * multiplier);

  const filteredSales = useMemo(() => {
    return snapshot.recentSales.filter((s) => {
      const matchSearch =
        !searchQuery.trim() ||
        s.bill_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.cart_summary.toLowerCase().includes(searchQuery.toLowerCase());
      const matchMode =
        paymentFilter === 'ALL' ||
        s.payment_mode.toLowerCase().includes(paymentFilter.toLowerCase());
      return matchSearch && matchMode;
    });
  }, [snapshot.recentSales, searchQuery, paymentFilter]);

  // SVG 7-Day Trend Geometry
  const chartData = snapshot.dailyHistory;
  const maxVal = Math.max(...chartData.map((d) => d.total_revenue), 20000);
  const minVal = 5000;
  const svgW = 540;
  const svgH = 165;
  const padX = 36;
  const padY = 26;
  const plotW = svgW - padX * 2;
  const plotH = svgH - padY * 2;

  const points = chartData.map((d, idx) => {
    const x = padX + (idx / Math.max(chartData.length - 1, 1)) * plotW;
    const norm = Math.max(0, Math.min(1, (d.total_revenue - minVal) / (maxVal - minVal)));
    const y = padY + (1 - norm) * plotH;
    return { x, y, ...d };
  });

  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${svgH - 20} L ${points[0].x.toFixed(1)} ${svgH - 20} Z`;

  const handleExportCsv = () => {
    const headers = ['Bill ID', 'Customer', 'Payment Mode', 'Cart Summary', 'Amount (INR)', 'Time'];
    const rows = snapshot.recentSales.map((s) => [
      s.bill_no,
      `"${s.customer_name}"`,
      s.payment_mode,
      `"${s.cart_summary}"`,
      s.total_amount,
      new Date(s.created_at).toLocaleString('en-IN'),
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vaanibiz-sales-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePlayVoiceLog = async (id: number, transcript: string) => {
    if (!transcript) return;
    setPlayingId(id);
    try {
      await onPlayTranscriptAudio(transcript);
    } finally {
      setPlayingId(null);
    }
  };

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (billLines.length === 0 || submitting) return;
    setSubmitting(true);
    try {
      await onCreateSale({ customer_name: customerName || 'Walk-in Customer', payment_mode: paymentMode, items: billLines });
      setShowNewBillModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const modalTotal = billLines.reduce((sum, l) => {
    const prod = snapshot.products.find((p) => p.id === l.product_id);
    return sum + (prod ? prod.price * l.quantity : 0);
  }, 0);

  return (
    <div className="space-y-5">
      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex items-center p-1 rounded-xl bg-white border border-slate-200">
            <button
              type="button"
              onClick={() => setPeriod('today')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                period === 'today' ? 'bg-[#141B2D] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today <span className="opacity-75">(आज)</span>
            </button>
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                period === 'week' ? 'bg-[#141B2D] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Week <span className="opacity-75">(इस हफ्ते)</span>
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                period === 'month' ? 'bg-[#141B2D] text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              This Month <span className="opacity-75">(इस महीने)</span>
            </button>
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600">
            <RefreshCw className="w-3.5 h-3.5 text-emerald-600" />
            <span className="tabular-nums">
              Live Sync: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} IST
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowNewBillModal(true)}
            className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition-colors whitespace-nowrap"
          >
            <span className="w-6 h-6 rounded-lg bg-[#F5D061] text-slate-950 flex items-center justify-center">
              <Mic className="w-3.5 h-3.5" />
            </span>
            <span>New Voice Bill</span>
            <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300">
              Alt + V
            </kbd>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 whitespace-nowrap"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Day Summary</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] text-amber-800 flex items-center justify-center font-bold">
                ₹
              </div>
              <div>
                <div className="text-xs font-medium text-slate-700">
                  {period === 'today' ? "Today's Revenue" : period === 'week' ? 'Weekly Revenue' : 'Monthly Revenue'}
                </div>
                <div className="text-[11px] text-slate-400">कुल बिक्री</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[11px] font-bold text-amber-900">
              +8.4%
            </span>
          </div>
          <div className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
            ₹ {rev.toLocaleString('en-IN')}
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 tabular-nums">
              {Math.round(snapshot.salesSummary.invoiceCount * multiplier)} Invoices Generated
            </span>
            <span className="font-bold text-slate-900 tabular-nums">
              Avg ₹{snapshot.salesSummary.avgBill} / bill
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-700">Cash Collected</div>
                <div className="text-[11px] text-slate-400">नकद प्राप्ति</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700 tabular-nums">
              {snapshot.salesSummary.cashSharePct}% Share
            </span>
          </div>
          <div className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
            ₹ {cash.toLocaleString('en-IN')}
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 tabular-nums">
              {Math.round(snapshot.salesSummary.cashCount * multiplier)} Cash Receipts
            </span>
            <span className="font-bold text-amber-700">Verified Drawer</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#EEF2FF] text-[#4338CA] flex items-center justify-center">
                <QrCode className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-700">UPI & Digital</div>
                <div className="text-[11px] text-slate-400">डिजिटल भुगतान</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-[#EEF2FF] text-[11px] font-semibold text-[#3730A3] tabular-nums">
              {snapshot.salesSummary.upiSharePct}% Share
            </span>
          </div>
          <div className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
            ₹ {upi.toLocaleString('en-IN')}
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 tabular-nums">
              {Math.round(snapshot.salesSummary.upiCount * multiplier)} PhonePe/GPay QR
            </span>
            <span className="font-bold text-slate-900">Instant Settlement</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-[#FEF3C7] text-amber-800 flex items-center justify-center">
                <BookOpen className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-medium text-slate-700">Khata / Credit</div>
                <div className="text-[11px] text-slate-400">आज का उधारी खाता</div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-[#FEF3C7] text-[11px] font-semibold text-amber-900 tabular-nums">
              {snapshot.salesSummary.khataSharePct}% Total
            </span>
          </div>
          <div className="font-display text-3xl font-extrabold text-slate-900 tabular-nums">
            ₹ {khata.toLocaleString('en-IN')}
          </div>
          <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-500 tabular-nums">
              {snapshot.salesSummary.khataCount} Khata Customers
            </span>
            <span className="font-bold text-amber-700">Voice Logged</span>
          </div>
        </div>
      </div>

      {/* Middle Analytics Row */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* 7-Day Sales Trend + Hourly Footfall */}
        <div className="xl:col-span-7 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-display text-base font-bold text-slate-900">7-Day Sales Trend</h2>
                <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-600">
                  सात दिवसीय ग्राफ
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Daily gross collections comparison & peak volume points
              </p>
            </div>
            <div className="px-3.5 py-2 rounded-xl bg-[#F4F7FC] border border-slate-200/70 text-right">
              <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                7-Day Daily Avg
              </div>
              <div className="font-display text-sm font-bold text-slate-900 tabular-nums">
                ₹ {snapshot.salesSummary.sevenDayAvg.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Crisp SVG Trend Chart */}
          <div className="w-full overflow-x-auto">
            <svg viewBox={`0 0 ${svgW} ${svgH + 34}`} className="w-full min-w-[420px] h-auto">
              <defs>
                <linearGradient id="vaaniTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#141B2D" stopOpacity="0.14" />
                  <stop offset="100%" stopColor="#141B2D" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {/* Horizontal Gridlines */}
              {[10000, 15000, 20000].map((val) => {
                const norm = Math.max(0, Math.min(1, (val - minVal) / (maxVal - minVal)));
                const y = padY + (1 - norm) * plotH;
                return (
                  <g key={val}>
                    <line
                      x1={padX}
                      x2={svgW - padX}
                      y1={y}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                    />
                    <text x={4} y={y + 4} fontSize="10" fill="#94A3B8" fontFamily="JetBrains Mono">
                      ₹{val / 1000}k
                    </text>
                  </g>
                );
              })}

              <path d={areaPath} fill="url(#vaaniTrendGrad)" />
              <path d={linePath} fill="none" stroke="#141B2D" strokeWidth="2.2" />

              {points.map((p, idx) => {
                const isToday = idx === points.length - 1;
                return (
                  <g key={p.day_key}>
                    {isToday && (
                      <g>
                        <rect
                          x={p.x - 16}
                          y={p.y - 26}
                          width="32"
                          height="16"
                          rx="4"
                          fill="#F5D061"
                        />
                        <text
                          x={p.x}
                          y={p.y - 15}
                          textAnchor="middle"
                          fontSize="9"
                          fontWeight="700"
                          fill="#0F172A"
                        >
                          PEAK
                        </text>
                      </g>
                    )}
                    <text
                      x={p.x}
                      y={p.y - (isToday ? 31 : 10)}
                      textAnchor="middle"
                      fontSize="10"
                      fontWeight={isToday ? '700' : '600'}
                      fill="#1E293B"
                      fontFamily="JetBrains Mono"
                    >
                      {(p.total_revenue / 1000).toFixed(1)}k
                    </text>
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isToday ? 5.5 : 4}
                      fill={isToday ? '#F5D061' : '#FFFFFF'}
                      stroke="#141B2D"
                      strokeWidth="2.2"
                    />
                    <text
                      x={p.x}
                      y={svgH + 6}
                      textAnchor="middle"
                      fontSize="10.5"
                      fontWeight={isToday ? '700' : '500'}
                      fill={isToday ? '#0F172A' : '#64748B'}
                    >
                      {p.day_label}
                    </text>
                    <text
                      x={p.x}
                      y={svgH + 20}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill="#94A3B8"
                    >
                      {p.sub_label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Hourly Footfall */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="font-semibold text-slate-800">
                Hourly Footfall & Rush Window <span className="text-slate-500 font-normal">(आज के व्यस्त घंटे)</span>
              </div>
              <span className="font-semibold text-amber-700">Peak: 7 PM – 9 PM</span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {snapshot.hourlyFootfall.map((h) => (
                <div
                  key={h.hour_slot}
                  className={`p-2 rounded-xl border text-center ${
                    h.hour_slot === 19
                      ? 'bg-[#FEF3C7] border-amber-400'
                      : 'bg-[#F8FAFC] border-slate-200/80'
                  }`}
                >
                  <div className="text-[10px] text-slate-500">{h.hour_label}</div>
                  <div className="mt-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        h.is_rush ? 'bg-amber-600' : 'bg-slate-600'
                      }`}
                      style={{ width: `${Math.min(100, Math.round((h.bill_count / 12) * 100))}%` }}
                    />
                  </div>
                  <div className="text-xs font-bold text-slate-900 mt-1 tabular-nums">
                    {h.bill_count}
                    {h.hour_slot === 19 ? '*' : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Selling Items */}
        <div className="xl:col-span-5 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between space-y-4">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-base font-bold text-slate-900">Top Selling Items</h2>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-600">
                    आज सबसे ज़्यादा बिके
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">Ranked by daily revenue & gross margin</p>
              </div>
              <BarChart2 className="w-4 h-4 text-amber-600 shrink-0 mt-1" />
            </div>

            <div className="space-y-3">
              {snapshot.topSelling.map((item) => (
                <div
                  key={item.rank}
                  className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200/70 space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                          item.rank === 1
                            ? 'bg-[#141B2D] text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {item.rank}
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {item.unitsText} • {item.stockText}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-sm font-bold text-slate-900 tabular-nums">
                        ₹ {item.revenue.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px] text-amber-700 font-medium tabular-nums">
                        Margin: {item.margin}%
                      </div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        item.rank <= 2 ? 'bg-[#141B2D]' : 'bg-amber-500'
                      }`}
                      style={{ width: `${item.pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-[#FFFBEB] border border-amber-200 flex items-center justify-between gap-2 text-xs">
            <span className="text-slate-700">
              Low Stock Warning: <strong>Aashirvaad 10kg</strong> ({snapshot.products.find((p) => p.sku === 'STPL-ATT-10K')?.stock_qty ?? 3} remaining)
            </span>
            <button
              type="button"
              onClick={() => {
                onNavigate('voice');
                onTriggerVoicePrompt('Draft purchase order for 10 bags Aashirvaad Atta 10kg from Sri Ganesh Traders');
              }}
              className="font-bold text-amber-800 hover:text-amber-950 whitespace-nowrap"
            >
              Reorder Voice AI →
            </button>
          </div>
        </div>
      </div>

      {/* Live Transaction Stream & Voice Logs Table */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-base font-bold text-slate-900">
                Live Transaction Stream & Voice Logs
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-[11px] text-slate-600">
                ताज़ा बिल और वॉइस ऑडिट
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Real-time counter entries, payment status, and verbal input transcripts
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search bill, phone or item..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl w-52 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
              />
            </div>

            <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-xs">
              <SlidersHorizontal className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="bg-transparent text-xs font-medium text-slate-700 focus:outline-none"
              >
                <option value="ALL">All Modes</option>
                <option value="UPI">UPI / GPay</option>
                <option value="Cash">Cash</option>
                <option value="Udhaar">Udhaar / Khata</option>
              </select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="py-3 pr-3">Bill ID</th>
                <th className="py-3 px-3">Time</th>
                <th className="py-3 px-3">Customer Name / Type</th>
                <th className="py-3 px-3">Cart Summary (सामग्री)</th>
                <th className="py-3 px-3 text-right">Amount</th>
                <th className="py-3 px-3">Payment Mode</th>
                <th className="py-3 pl-3">Voice Input Audio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {filteredSales.slice(0, 8).map((sale) => (
                <tr key={sale.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 pr-3 font-mono font-bold text-slate-900 whitespace-nowrap">
                    {sale.bill_no}
                  </td>
                  <td className="py-3.5 px-3 text-xs text-slate-500 tabular-nums whitespace-nowrap">
                    {new Date(sale.created_at).toLocaleTimeString('en-IN', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="py-3.5 px-3">
                    <div className="font-semibold text-slate-900">{sale.customer_name}</div>
                    <div className="text-[11px] text-slate-500">{sale.customer_sublabel}</div>
                  </td>
                  <td className="py-3.5 px-3 text-xs text-slate-700 max-w-xs truncate">
                    {sale.cart_summary}
                  </td>
                  <td className="py-3.5 px-3 text-right font-display font-bold text-slate-900 tabular-nums whitespace-nowrap">
                    ₹ {sale.total_amount.toLocaleString('en-IN')}
                  </td>
                  <td className="py-3.5 px-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold ${
                        sale.payment_mode.toLowerCase().includes('udhaar')
                          ? 'bg-[#FEF3C7] text-amber-900'
                          : sale.payment_mode.toLowerCase().includes('cash')
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-[#EEF2FF] text-[#3730A3]'
                      }`}
                    >
                      {sale.payment_mode}
                    </span>
                  </td>
                  <td className="py-3.5 pl-3">
                    {sale.voice_transcript ? (
                      <button
                        type="button"
                        onClick={() => handlePlayVoiceLog(sale.id, sale.voice_transcript)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#FEF9C3] hover:bg-[#FEF08A] text-amber-950 text-[11px] font-medium max-w-[200px] transition-colors"
                      >
                        {playingId === sale.id ? (
                          <Volume2 className="w-3.5 h-3.5 shrink-0 animate-pulse" />
                        ) : (
                          <Play className="w-3.5 h-3.5 shrink-0 fill-current" />
                        )}
                        <span className="truncate">“{sale.voice_transcript}”</span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">Manual POS Entry</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* New POS Bill Modal */}
      {showNewBillModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">Create New Counter Bill</h3>
                <p className="text-xs text-slate-500">Deducts inventory atomically & syncs Khata if Udhaar</p>
              </div>
              <button
                type="button"
                onClick={() => setShowNewBillModal(false)}
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitBill} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Customer Name</label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Payment Mode</label>
                  <select
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="UPI PhonePe">UPI PhonePe</option>
                    <option value="GPay QR">GPay QR</option>
                    <option value="Cash">Cash</option>
                    <option value="Udhaar">Udhaar (Khata)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">Line Items</label>
                  <button
                    type="button"
                    onClick={() =>
                      setBillLines((prev) => [
                        ...prev,
                        { product_id: snapshot.products[0]?.id || 1, quantity: 1 },
                      ])
                    }
                    className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Item
                  </button>
                </div>

                {billLines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={line.product_id}
                      onChange={(e) =>
                        setBillLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, product_id: Number(e.target.value) } : l))
                        )
                      }
                      className="flex-1 px-3 py-2 text-xs border border-slate-200 rounded-xl bg-white"
                    >
                      {snapshot.products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (₹{p.price} · {p.stock_qty} {p.unit} left)
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        setBillLines((prev) =>
                          prev.map((l, i) => (i === idx ? { ...l, quantity: Math.max(1, Number(e.target.value)) } : l))
                        )
                      }
                      className="w-20 px-3 py-2 text-xs border border-slate-200 rounded-xl tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => setBillLines((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500">Bill Total</div>
                  <div className="font-display text-xl font-bold text-slate-900 tabular-nums">
                    ₹ {modalTotal.toLocaleString('en-IN')}
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {submitting ? 'Saving Bill...' : 'Complete & Deduct Stock'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
