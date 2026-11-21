import { useState, useMemo } from 'react';
import {
  ShieldCheck,
  Mic,
  RefreshCw,
  Star,
  Truck,
  CheckCircle2,
  ClipboardList,
  Wallet,
  PiggyBank,
  Landmark,
  X,
  ThumbsUp,
} from 'lucide-react';
import type { DashboardSnapshot } from '../types';

interface SupplierOrdersViewProps {
  snapshot: DashboardSnapshot;
  onConfirmApproval: (approvalId: string) => Promise<void>;
  onCancelApproval: (approvalId: string) => Promise<void>;
  onDraftPO: (supplierId: number, productId: number, quantity: number) => Promise<void>;
  onReceivePO: (poId: number) => Promise<void>;
  onTriggerVoicePrompt: (prompt: string) => Promise<void>;
}

export function SupplierOrdersView({
  snapshot,
  onConfirmApproval,
  onCancelApproval,
  onDraftPO,
  onReceivePO,
  onTriggerVoicePrompt,
}: SupplierOrdersViewProps) {
  const [subTab, setSubTab] = useState<'compare' | 'orders'>('compare');
  const [selectedProductId, setSelectedProductId] = useState<number>(
    snapshot.products.find((p) => p.sku === 'STPL-SUG-50K')?.id || snapshot.products[0]?.id || 1
  );
  const [poFilter, setPoFilter] = useState<'ALL' | 'pending_approval' | 'dispatched' | 'received'>('ALL');
  const [reviewApprovalId, setReviewApprovalId] = useState<string | null>(null);

  const benchmarkProducts = useMemo(() => {
    const pricedIds = new Set(snapshot.supplierPrices.map((sp) => sp.product_id));
    return snapshot.products.filter((p) => pricedIds.has(p.id));
  }, [snapshot.products, snapshot.supplierPrices]);

  const activeProduct =
    snapshot.products.find((p) => p.id === selectedProductId) || benchmarkProducts[0] || snapshot.products[0];

  const supplierCards = useMemo(() => {
    if (!activeProduct) return [];
    const quotes = snapshot.supplierPrices.filter((sp) => sp.product_id === activeProduct.id);
    if (quotes.length > 0) return quotes;
    return snapshot.suppliers.slice(0, 3).map((s, idx) => ({
      id: idx,
      supplier_id: s.id,
      product_id: activeProduct.id,
      unit_price: activeProduct.cost + idx * 1.5,
      stock_note: 'In Stock',
      is_best: idx === 0 ? 1 : 0,
      supplier_name: s.name,
      supplier_code: s.code,
      supplier_location: s.location,
      rating: s.rating,
      on_time_pct: s.on_time_pct,
      delivery_speed: s.delivery_speed,
      payment_terms: s.payment_terms,
      min_order_amount: s.min_order_amount,
      gst_note: s.gst_note,
      product_name: activeProduct.name,
      product_unit: activeProduct.unit,
      pack_size: activeProduct.pack_size,
    }));
  }, [activeProduct, snapshot.supplierPrices, snapshot.suppliers]);

  const benchmarkQty = activeProduct?.unit === 'kg' ? 100 : 10;
  const lowestRate = supplierCards.length > 0 ? Math.min(...supplierCards.map((c) => c.unit_price)) : 0;

  const filteredPOs = useMemo(() => {
    if (poFilter === 'ALL') return snapshot.purchaseOrders;
    return snapshot.purchaseOrders.filter((po) => po.status === poFilter);
  }, [snapshot.purchaseOrders, poFilter]);

  const activeApproval = snapshot.pendingApprovals[0] || null;
  const approvalPayload = useMemo(() => {
    if (!activeApproval) return null;
    try {
      return JSON.parse(activeApproval.payload_json || '{}');
    } catch {
      return {};
    }
  }, [activeApproval]);

  const poCounts = useMemo(() => {
    return {
      all: snapshot.purchaseOrders.length,
      pending: snapshot.purchaseOrders.filter((p) => p.status === 'pending_approval').length,
      dispatched: snapshot.purchaseOrders.filter((p) => p.status === 'dispatched').length,
      received: snapshot.purchaseOrders.filter((p) => p.status === 'received').length,
    };
  }, [snapshot.purchaseOrders]);

  return (
    <div className="space-y-5">
      {/* Top Sub-Navigation & Voice PO Assistant */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-2xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setSubTab('compare')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              subTab === 'compare' ? 'bg-[#0B1120] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span>Supplier Comparison & Price Discovery</span>
            <span className="px-2 py-0.5 rounded bg-[#F5D061] text-slate-950 text-[10px] font-bold">
              Live Rates
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('orders')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-colors ${
              subTab === 'orders' ? 'bg-[#0B1120] text-white' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Purchase Orders & Invoices</span>
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-bold tabular-nums">
              {snapshot.purchaseOrders.length}
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => onTriggerVoicePrompt('Compare toor dal suppliers and draft an order for 20 kg')}
          className="inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs shadow-sm transition-colors"
        >
          <span className="w-7 h-7 rounded-xl bg-[#1E293B] border border-slate-700 text-amber-300 flex items-center justify-center shrink-0">
            <Mic className="w-3.5 h-3.5" />
          </span>
          <div className="text-left">
            <div className="text-[10px] font-bold uppercase tracking-wider text-amber-300">
              Voice PO Assistant • ಹೊಸ ಆದೇಶ
            </div>
            <div className="font-medium text-white">“Compare dal suppliers and make an order”</div>
          </div>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] font-mono text-slate-300">
            Alt + V
          </kbd>
        </button>
      </div>

      {/* VOICE GUARD SAFETY LOCK CARD */}
      {activeApproval && (
        <div className="bg-[#0B1120] rounded-2xl p-5 sm:p-6 text-white shadow-md border border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-4 max-w-2xl">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0 text-[#F5D061]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#F5D061]">
                Voice Guard Safety Lock
              </div>
              <h2 className="font-display text-base sm:text-lg font-bold text-white">
                {approvalPayload?.poNumber || 'Order'} Awaiting Final Merchant Approval
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                Draft order generated via voice command: <strong className="text-white">{activeApproval.summary}</strong>.
                Voice authorization protocol requires verbal or tap verification.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                <span>
                  Say:{' '}
                  <em className="text-amber-300 not-italic font-medium">
                    “Confirm {approvalPayload?.supplierName?.split(' ')[0] || 'Sri Ganesh'} Order”
                  </em>{' '}
                  or <em className="text-slate-200">“ಖಚಿತಪಡಿಸಿ”</em>
                </span>
                <span>•</span>
                <span>Hold expires in 18 mins</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setReviewApprovalId(activeApproval.id)}
              className="px-4 py-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-white whitespace-nowrap"
            >
              Review Line Items
            </button>
            <button
              type="button"
              onClick={() => onConfirmApproval(activeApproval.id)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F5D061] hover:bg-[#F2C338] text-slate-950 text-xs sm:text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
            >
              <ThumbsUp className="w-4 h-4" />
              <span>
                Approve Now (₹{(approvalPayload?.totalAmount || 7600).toLocaleString('en-IN')})
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Live Mandi & Supplier Discovery */}
      {subTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              <h2 className="font-display text-base font-bold text-slate-900">
                Live Mandi & Supplier Discovery
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs">
                <span className="text-[11px] font-semibold uppercase text-slate-400">
                  Comparing Product:
                </span>
                <select
                  value={activeProduct?.id}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="font-semibold text-slate-900 bg-transparent focus:outline-none"
                >
                  {benchmarkProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.pack_size} - {benchmarkQty} {p.unit} Benchmark)
                    </option>
                  ))}
                </select>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-700">
                Wholesale avg dropped <strong className="text-emerald-700">₹1.40/{activeProduct?.unit}</strong> this week
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {supplierCards.slice(0, 3).map((card, idx) => {
              const isBest = idx === 0;
              const orderTotal = Math.round(card.unit_price * benchmarkQty);
              const diffFromBest = Math.round((card.unit_price - lowestRate) * benchmarkQty);

              return (
                <div
                  key={card.supplier_id}
                  className={`rounded-2xl p-5 bg-white border flex flex-col justify-between space-y-4 ${
                    isBest
                      ? 'border-amber-400 ring-2 ring-amber-300/30 shadow-sm'
                      : 'border-slate-200/80 shadow-xs'
                  }`}
                >
                  <div className="space-y-4">
                    {isBest && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#FEF3C7] text-[10px] font-bold text-amber-900 uppercase tracking-wide">
                        <span>★ Best Price Rate • ಅತ್ಯುತ್ತಮ ದರ</span>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center font-display font-bold text-sm shrink-0 ${
                            isBest ? 'bg-[#0B1120] text-[#F5D061]' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {card.supplier_code}
                        </div>
                        <div>
                          <h3 className="font-display text-sm sm:text-base font-bold text-slate-900">
                            {card.supplier_name}
                          </h3>
                          <p className="text-[11px] text-slate-500">{card.supplier_location}</p>
                        </div>
                      </div>
                      <div className="px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-800 whitespace-nowrap flex items-center gap-1">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span>{card.rating}</span>
                        <span className="text-slate-400 font-normal">({card.on_time_pct}%)</span>
                      </div>
                    </div>

                    {/* Rate Box */}
                    <div className="p-4 rounded-xl bg-[#F8FAFC] border border-slate-200/70 flex items-center justify-between gap-2">
                      <div>
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Offered Unit Rate
                        </div>
                        <div className="font-display text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5">
                          ₹{card.unit_price.toFixed(2)}{' '}
                          <span className="text-xs font-normal text-slate-500">/{activeProduct?.unit}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          Order ({benchmarkQty} {activeProduct?.unit})
                        </div>
                        <div
                          className={`font-display text-lg font-bold tabular-nums mt-0.5 ${
                            isBest ? 'text-amber-700' : 'text-slate-900'
                          }`}
                        >
                          ₹{orderTotal.toLocaleString('en-IN')}
                        </div>
                      </div>
                    </div>

                    {/* Specs Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                        <div className="text-[10px] text-slate-400">Delivery Speed</div>
                        <div className="font-semibold text-slate-800 mt-0.5">{card.delivery_speed}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                        <div className="text-[10px] text-slate-400">Payment Terms</div>
                        <div className="font-semibold text-slate-800 mt-0.5">{card.payment_terms}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                        <div className="text-[10px] text-slate-400">Stock Availability</div>
                        <div className="font-semibold text-slate-800 mt-0.5">{card.stock_note}</div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-[#F8FAFC] border border-slate-100">
                        <div className="text-[10px] text-slate-400">GST / Quality</div>
                        <div className="font-semibold text-slate-800 mt-0.5">{card.gst_note}</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => activeProduct && onDraftPO(card.supplier_id, activeProduct.id, benchmarkQty)}
                      className={`w-full py-2.5 px-4 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                        isBest
                          ? 'bg-[#0B1120] hover:bg-slate-800 text-white'
                          : 'bg-[#F1F5F9] hover:bg-slate-200 text-slate-900'
                      }`}
                    >
                      Draft PO (₹{orderTotal.toLocaleString('en-IN')})
                    </button>
                    <div className="text-center text-[11px] text-slate-400">
                      {isBest
                        ? `Lowest rate • Saves ₹${Math.max(150, Math.round(orderTotal * 0.04))}`
                        : `₹${diffFromBest} higher than lowest offer`}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent Purchase Orders & Invoices */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900">
              Recent Purchase Orders & Invoices
            </h2>
            <p className="text-xs text-slate-500">FY 2025-26 · Voice Guard & Automated Stock Sync</p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setPoFilter('ALL')}
              className={`px-3 py-1.5 rounded-xl font-semibold ${
                poFilter === 'ALL' ? 'bg-[#0B1120] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              All Orders ({poCounts.all})
            </button>
            <button
              type="button"
              onClick={() => setPoFilter('pending_approval')}
              className={`px-3 py-1.5 rounded-xl font-semibold ${
                poFilter === 'pending_approval'
                  ? 'bg-[#FEF3C7] text-amber-900 ring-1 ring-amber-400'
                  : 'bg-[#FEF3C7]/60 text-amber-800'
              }`}
            >
              Pending Approval ({poCounts.pending})
            </button>
            <button
              type="button"
              onClick={() => setPoFilter('dispatched')}
              className={`px-3 py-1.5 rounded-xl font-semibold ${
                poFilter === 'dispatched' ? 'bg-[#0B1120] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Dispatched ({poCounts.dispatched})
            </button>
            <button
              type="button"
              onClick={() => setPoFilter('received')}
              className={`px-3 py-1.5 rounded-xl font-semibold ${
                poFilter === 'received' ? 'bg-[#0B1120] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              Received ({poCounts.received})
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {filteredPOs.map((po) => {
            const isPending = po.status === 'pending_approval';
            const isDispatched = po.status === 'dispatched';
            const isReceived = po.status === 'received';

            return (
              <div
                key={po.id}
                className="p-4 rounded-2xl bg-[#F8FAFC] border border-slate-200/80 flex flex-wrap items-center justify-between gap-4"
              >
                <div className="flex items-start gap-3.5 min-w-[220px]">
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      isPending
                        ? 'bg-[#FEF3C7] text-amber-800'
                        : isDispatched
                        ? 'bg-[#0B1120] text-white'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {isPending ? (
                      <ClipboardList className="w-4 h-4" />
                    ) : isDispatched ? (
                      <Truck className="w-4 h-4" />
                    ) : (
                      <CheckCircle2 className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-bold text-sm text-slate-900">{po.po_number}</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isPending
                            ? 'bg-[#FEF3C7] text-amber-900'
                            : isDispatched
                            ? 'bg-[#EEF2FF] text-[#3730A3]'
                            : isReceived
                            ? 'bg-[#DCFCE7] text-emerald-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {po.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {po.created_via} • {po.delivery_note}
                    </div>
                  </div>
                </div>

                <div className="min-w-[180px]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Supplier
                  </div>
                  <div className="text-xs sm:text-sm font-bold text-slate-900">{po.supplier_name}</div>
                  <div className="text-[11px] text-slate-500">{po.supplier_location}</div>
                </div>

                <div className="flex-1 min-w-[220px]">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Line Item Breakdown
                  </div>
                  <div className="text-xs font-medium text-slate-800">{po.line_summary}</div>
                  <div className="text-[11px] text-slate-500">{po.gst_hsn_note}</div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Total Amount
                    </div>
                    <div className="font-display text-base font-extrabold text-slate-900 tabular-nums">
                      ₹{po.total_amount.toLocaleString('en-IN')}
                    </div>
                  </div>

                  {isDispatched && (
                    <button
                      type="button"
                      onClick={() => onReceivePO(po.id)}
                      className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold whitespace-nowrap"
                    >
                      Mark Received
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Procurement KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Monthly Procurement
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              ₹1,84,300
            </div>
          </div>
          <Wallet className="w-5 h-5 text-amber-600" />
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Voice Orders Created
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              {27 + snapshot.purchaseOrders.length} POs (84%)
            </div>
          </div>
          <Mic className="w-5 h-5 text-amber-600" />
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Average Price Savings
            </div>
            <div className="font-display text-xl font-bold text-amber-700 tabular-nums mt-1">
              ₹4,200 / wk
            </div>
          </div>
          <PiggyBank className="w-5 h-5 text-amber-600" />
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200/80 flex items-center justify-between">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Active Supplier Khata
            </div>
            <div className="font-display text-xl font-bold text-slate-900 tabular-nums mt-1">
              ₹24,800 Credit
            </div>
          </div>
          <Landmark className="w-5 h-5 text-slate-700" />
        </div>
      </div>

      {/* Review Line Items Modal */}
      {reviewApprovalId && activeApproval && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">
                Review Voice Guard Order
              </h3>
              <button type="button" onClick={() => setReviewApprovalId(null)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
              <div className="font-bold text-slate-900">{approvalPayload?.poNumber}</div>
              <div className="text-slate-700">{activeApproval.summary}</div>
              <div className="text-slate-500">Supplier: {approvalPayload?.supplierName}</div>
            </div>
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={async () => {
                  await onConfirmApproval(activeApproval.id);
                  setReviewApprovalId(null);
                }}
                className="flex-1 py-2.5 rounded-xl bg-[#F5D061] hover:bg-[#F1C43D] text-slate-950 text-xs font-bold"
              >
                Confirm & Dispatch Order
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onCancelApproval(activeApproval.id);
                  setReviewApprovalId(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
