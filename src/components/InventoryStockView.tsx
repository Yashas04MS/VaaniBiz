import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  Zap,
  Mic,
  Search,
  SlidersHorizontal,
  Download,
  ShoppingCart,
  ClipboardList,
  CheckCircle2,
  Coffee,
  X,
} from 'lucide-react';
import type { DashboardSnapshot, ProductRow } from '../types';

interface InventoryStockViewProps {
  snapshot: DashboardSnapshot;
  onAutoDraftLowStock: () => Promise<void>;
  onDraftPO: (supplierId: number, productId: number, quantity: number) => Promise<void>;
  onAddProduct: (payload: {
    name: string;
    hindi_alias: string;
    kannada_alias: string;
    unit: string;
    pack_size: string;
    price: number;
    cost: number;
    mrp: number;
    reorder_level: number;
    category: string;
    initial_qty: number;
  }) => Promise<void>;
  onAdjustStock: (productId: number, delta: number, reason: string) => Promise<void>;
  onTriggerVoicePrompt: (prompt: string) => Promise<void>;
}

export function InventoryStockView({
  snapshot,
  onAutoDraftLowStock,
  onDraftPO,
  onAddProduct,
  onAdjustStock,
  onTriggerVoicePrompt,
}: InventoryStockViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'IN'>('ALL');
  const [selectedId, setSelectedId] = useState<number>(snapshot.products[1]?.id || snapshot.products[0]?.id || 1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);

  // Add Product Form State
  const [newName, setNewName] = useState('');
  const [newHindi, setNewHindi] = useState('');
  const [newKannada, setNewKannada] = useState('');
  const [newCategory, setNewCategory] = useState('Staples & Grains');
  const [newUnit, setNewUnit] = useState('pkts');
  const [newPack, setNewPack] = useState('1kg Pack');
  const [newPrice, setNewPrice] = useState(65);
  const [newCost, setNewCost] = useState(54);
  const [newQty, setNewQty] = useState(25);
  const [newReorder, setNewReorder] = useState(10);

  // Adjust Stock State
  const [adjDelta, setAdjDelta] = useState(10);
  const [adjReason, setAdjReason] = useState('Physical stock count reconciliation');

  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of snapshot.products) {
      counts[p.category] = (counts[p.category] || 0) + 1;
    }
    return counts;
  }, [snapshot.products]);

  const statusCounts = useMemo(() => {
    let low = 0;
    let out = 0;
    let healthy = 0;
    for (const p of snapshot.products) {
      if (p.stock_qty <= 0) out++;
      else if (p.stock_qty <= p.reorder_level) low++;
      else healthy++;
    }
    return { total: snapshot.products.length, low, out, healthy };
  }, [snapshot.products]);

  const filteredProducts = useMemo(() => {
    return snapshot.products.filter((p) => {
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.hindi_alias.toLowerCase().includes(q) ||
        p.kannada_alias.toLowerCase().includes(q);
      const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter;
      const matchStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'OUT' && p.stock_qty <= 0) ||
        (statusFilter === 'LOW' && p.stock_qty > 0 && p.stock_qty <= p.reorder_level) ||
        (statusFilter === 'IN' && p.stock_qty > p.reorder_level);
      return matchSearch && matchCat && matchStatus;
    });
  }, [snapshot.products, searchQuery, categoryFilter, statusFilter]);

  const selectedProduct: ProductRow | undefined =
    snapshot.products.find((p) => p.id === selectedId) || filteredProducts[0] || snapshot.products[0];

  const matchingSuppliers = useMemo(() => {
    if (!selectedProduct) return [];
    const exact = snapshot.supplierPrices.filter((sp) => sp.product_id === selectedProduct.id);
    if (exact.length > 0) return exact.slice(0, 2);
    return snapshot.suppliers.slice(0, 2).map((s, idx) => ({
      id: idx,
      supplier_id: s.id,
      product_id: selectedProduct.id,
      unit_price: selectedProduct.cost,
      stock_note: s.delivery_speed,
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
      product_name: selectedProduct.name,
      product_unit: selectedProduct.unit,
      pack_size: selectedProduct.pack_size,
    }));
  }, [selectedProduct, snapshot.supplierPrices, snapshot.suppliers]);

  const handleExportCsv = () => {
    const headers = ['SKU', 'Name', 'Category', 'Stock Qty', 'Unit', 'Reorder Level', 'Cost', 'MRP'];
    const rows = snapshot.products.map((p) => [
      p.sku,
      `"${p.name}"`,
      `"${p.category}"`,
      p.stock_qty,
      p.unit,
      p.reorder_level,
      p.cost,
      p.mrp,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vaanibiz-inventory.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await onAddProduct({
      name: newName,
      hindi_alias: newHindi,
      kannada_alias: newKannada,
      unit: newUnit,
      pack_size: newPack,
      price: newPrice,
      cost: newCost,
      mrp: newPrice,
      reorder_level: newReorder,
      category: newCategory,
      initial_qty: newQty,
    });
    setNewName('');
    setNewHindi('');
    setNewKannada('');
    setShowAddModal(false);
  };

  const runoutDays =
    selectedProduct && selectedProduct.daily_velocity > 0
      ? Number((selectedProduct.stock_qty / selectedProduct.daily_velocity).toFixed(1))
      : 14;

  return (
    <div className="space-y-5">
      {/* Dark Critical Reorder Alert Banner */}
      <div className="bg-[#0B1120] rounded-2xl p-5 sm:p-6 text-white shadow-md flex flex-wrap items-center justify-between gap-4 border border-slate-800">
        <div className="flex items-start gap-4 max-w-2xl">
          <div className="w-11 h-11 rounded-2xl bg-[#7F1D1D]/40 border border-rose-500/40 flex items-center justify-center shrink-0 text-amber-300">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="font-display text-base sm:text-lg font-bold text-white">
                Critical Reorder Alert
              </h2>
              <span className="px-2.5 py-0.5 rounded-full bg-[#B91C1C] text-[10px] font-bold tracking-wide uppercase text-white">
                {snapshot.lowStockItems.length} ITEMS URGENT
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300">
              {snapshot.lowStockItems.length} critical staples below safety threshold. Estimated replenishment capital:{' '}
              <strong className="text-[#FDE047] font-mono tabular-nums">
                ₹{snapshot.replenishmentCapital.toLocaleString('en-IN')}
              </strong>
            </p>
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 pt-1">
              {snapshot.lowStockItems.slice(0, 3).map((item) => (
                <span key={item.id} className="inline-flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      item.stock_qty <= 0 ? 'bg-rose-400' : 'bg-amber-400'
                    }`}
                  />
                  <span>
                    {item.name.split(' ').slice(0, 3).join(' ')} ({item.stock_qty} {item.unit})
                  </span>
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onAutoDraftLowStock}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#F5D061] hover:bg-[#F2C338] text-slate-950 text-xs sm:text-sm font-bold shadow-sm transition-colors whitespace-nowrap"
          >
            <Zap className="w-4 h-4 fill-current" />
            <span>Auto-Draft All POs with Best Suppliers</span>
          </button>
          <button
            type="button"
            onClick={() => onTriggerVoicePrompt('List low stock items and draft reorders')}
            className="p-2.5 rounded-xl bg-[#1E293B] hover:bg-slate-700 text-amber-300 border border-slate-700"
            title="Ask Vaani to reorder low stock"
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Search & Category Controls */}
      <div className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-xs space-y-3.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search items by English, Hindi, or Kannada alias..."
              className="w-full pl-10 pr-24 py-2 text-xs sm:text-sm bg-[#F8FAFC] border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400/50"
            />
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-200/80 text-[10px] font-mono text-slate-600">
                CTRL+K
              </kbd>
              <button
                type="button"
                onClick={() => onTriggerVoicePrompt('Check Madhur sugar and Tata salt stock')}
                className="p-1.5 rounded-lg bg-[#FEF3C7] text-amber-800 hover:bg-amber-200"
                title="Voice Search"
              >
                <Mic className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold whitespace-nowrap"
            >
              <Mic className="w-3.5 h-3.5 text-amber-300" />
              <span>+ Voice Add Product</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAdjustModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Adjust Stock</span>
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-700 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Sheet</span>
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryFilter('ALL')}
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
              categoryFilter === 'ALL'
                ? 'bg-[#141B2D] text-white'
                : 'bg-[#F4F7FC] text-slate-700 hover:bg-slate-200/70'
            }`}
          >
            <span>All Items</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-700/40 text-[10px] tabular-nums">
              {snapshot.products.length}
            </span>
          </button>

          {Object.entries(categories).map(([cat, count]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                categoryFilter === cat
                  ? 'bg-[#141B2D] text-white'
                  : 'bg-[#F4F7FC] text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              <span>{cat}</span>
              <span className="px-1.5 py-0.5 rounded bg-white text-slate-600 text-[10px] tabular-nums">
                {count}
              </span>
            </button>
          ))}
        </div>

        {/* Status Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Status Filter:
            </span>
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-1 rounded-lg font-semibold ${
                statusFilter === 'ALL' ? 'bg-[#141B2D] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              All ({statusCounts.total})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('LOW')}
              className={`px-3 py-1 rounded-lg font-semibold ${
                statusFilter === 'LOW' ? 'bg-[#FEF3C7] text-amber-900 ring-1 ring-amber-400' : 'bg-[#FEF3C7]/60 text-amber-800'
              }`}
            >
              Low Stock ({statusCounts.low})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('OUT')}
              className={`px-3 py-1 rounded-lg font-semibold ${
                statusFilter === 'OUT' ? 'bg-[#FEE2E2] text-rose-800 ring-1 ring-rose-400' : 'bg-[#FEE2E2]/60 text-rose-700'
              }`}
            >
              Out of Stock ({statusCounts.out})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('IN')}
              className={`px-3 py-1 rounded-lg font-semibold ${
                statusFilter === 'IN' ? 'bg-[#DCFCE7] text-emerald-800 ring-1 ring-emerald-400' : 'bg-[#DCFCE7]/60 text-emerald-700'
              }`}
            >
              In Stock ({statusCounts.healthy})
            </button>
          </div>
          <span className="text-slate-500">
            Sorted by: <strong className="text-slate-800">Urgent Stock Deficit ↓</strong>
          </span>
        </div>
      </div>

      {/* Main 2-Column Inventory Table + Inspector */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Inventory Table */}
        <div className="xl:col-span-8 bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-[#F8FAFC] text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  <th className="py-3.5 px-4">Product Name & Local Aliases</th>
                  <th className="py-3.5 px-3">Category</th>
                  <th className="py-3.5 px-3 text-right">Current Stock</th>
                  <th className="py-3.5 px-3 text-right">Min Threshold</th>
                  <th className="py-3.5 px-3 text-right">Cost / Sale</th>
                  <th className="py-3.5 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredProducts.map((p) => {
                  const isOut = p.stock_qty <= 0;
                  const isLow = p.stock_qty > 0 && p.stock_qty <= p.reorder_level;
                  const isSelected = selectedProduct?.id === p.id;
                  const diff = p.stock_qty - p.reorder_level;

                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#FEF9C3]/45'
                          : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-start gap-3">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                              isOut
                                ? 'bg-rose-50 text-rose-600'
                                : isLow
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {isOut ? (
                              <ShoppingCart className="w-4 h-4" />
                            ) : isLow ? (
                              <ClipboardList className="w-4 h-4" />
                            ) : p.category.includes('Dairy') ? (
                              <Coffee className="w-4 h-4" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4" />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 text-xs sm:text-sm">{p.name}</div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {[p.hindi_alias, p.kannada_alias, p.pack_size].filter(Boolean).join(' • ')}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-1 rounded-md bg-slate-100 text-[11px] text-slate-700 whitespace-nowrap">
                          {p.category.split(' ')[0]}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div
                          className={`font-display text-sm font-extrabold tabular-nums ${
                            isOut ? 'text-rose-600' : isLow ? 'text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {p.stock_qty} {p.unit}
                        </div>
                        <div
                          className={`text-[10px] font-medium tabular-nums ${
                            isOut ? 'text-rose-500 uppercase' : isLow ? 'text-amber-600' : 'text-emerald-600'
                          }`}
                        >
                          {isOut
                            ? 'STOCK DEPLETED'
                            : diff < 0
                            ? `${Math.abs(diff)} ${p.unit} deficit`
                            : `+${diff} buffer`}
                        </div>
                      </td>
                      <td className="py-3.5 px-3 text-right font-mono text-slate-700 tabular-nums whitespace-nowrap">
                        {p.reorder_level} {p.unit}
                      </td>
                      <td className="py-3.5 px-3 text-right whitespace-nowrap">
                        <div className="font-semibold text-slate-900 font-mono tabular-nums">
                          ₹{p.cost.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                          MRP: ₹{p.mrp.toFixed(2)}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isOut
                              ? 'bg-[#FEE2E2] text-rose-700'
                              : isLow
                              ? 'bg-[#FEF3C7] text-amber-800'
                              : 'bg-[#DCFCE7] text-emerald-700'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              isOut ? 'bg-rose-600' : isLow ? 'bg-amber-600' : 'bg-emerald-600'
                            }`}
                          />
                          {isOut ? 'Out of Stock' : isLow ? 'Low Stock' : 'In Stock'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right-hand Inspector + Kirana Voice Shortcuts */}
        <div className="xl:col-span-4 space-y-4">
          {selectedProduct && (
            <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                    Inspector • Selected Item
                  </div>
                  <h3 className="font-display text-lg font-bold text-slate-900 mt-0.5">
                    {selectedProduct.name}
                  </h3>
                  <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                    SKU: {selectedProduct.sku} • HSN: {selectedProduct.hsn}
                  </div>
                </div>
                {selectedProduct.stock_qty <= selectedProduct.reorder_level && (
                  <span className="px-2.5 py-1 rounded-lg bg-[#FEF3C7] text-[11px] font-bold text-amber-900 whitespace-nowrap">
                    Urgent Refill
                  </span>
                )}
              </div>

              {/* Velocity Card */}
              <div className="p-3.5 rounded-xl bg-[#F8FAFC] border border-slate-200/70 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Daily Sales Velocity</span>
                  <span className="font-display text-base font-bold text-slate-900 tabular-nums">
                    {selectedProduct.daily_velocity} {selectedProduct.unit} / day
                  </span>
                </div>
                <div className="grid grid-cols-7 gap-1.5 items-end h-10">
                  {[0.55, 0.72, 0.64, 0.85, 0.7, 0.95, 0.8].map((h, i) => (
                    <div
                      key={i}
                      className={`rounded-sm ${i === 5 ? 'bg-[#0B1120]' : 'bg-slate-200'}`}
                      style={{ height: `${Math.round(h * 100)}%` }}
                    />
                  ))}
                </div>
                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs">
                  <span className="text-slate-500">Stock Runout Est.</span>
                  <span className="font-bold text-rose-600 tabular-nums">
                    ~{runoutDays} Days Remaining
                  </span>
                </div>
              </div>

              {/* Best Supplier Match */}
              <div className="space-y-2.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Best Supplier Match
                </div>
                {matchingSuppliers.map((sup, idx) => (
                  <div
                    key={sup.supplier_id}
                    className={`p-3 rounded-xl border ${
                      idx === 0
                        ? 'bg-[#EEF2FF]/60 border-indigo-200'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-900">{sup.supplier_name}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                          idx === 0
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {sup.delivery_speed}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs mt-1.5">
                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                        Rate: ₹{sup.unit_price.toFixed(2)}/{selectedProduct.unit}
                      </span>
                      <span className="text-[11px] font-medium text-amber-800">{sup.payment_terms}</span>
                    </div>
                  </div>
                ))}
              </div>

              {matchingSuppliers[0] && (
                <button
                  type="button"
                  onClick={() =>
                    onDraftPO(
                      matchingSuppliers[0].supplier_id,
                      selectedProduct.id,
                      Math.max(selectedProduct.reorder_level * 2 - selectedProduct.stock_qty, 10)
                    )
                  }
                  className="w-full py-2.5 px-4 rounded-xl bg-[#0B1120] hover:bg-slate-800 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <ShoppingCart className="w-4 h-4 text-amber-300" />
                  <span>Draft PO for {matchingSuppliers[0].supplier_name.split(' ').slice(0, 2).join(' ')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() =>
                  onTriggerVoicePrompt(
                    `Draft purchase order for 20 ${selectedProduct.unit} ${selectedProduct.name} from ${matchingSuppliers[0]?.supplier_name || 'Sri Ganesh Traders'}`
                  )
                }
                className="w-full py-2 px-3 rounded-xl bg-[#FEF9C3]/60 hover:bg-[#FEF3C7] border border-amber-200 text-xs text-amber-950 font-medium flex items-center justify-center gap-1.5"
              >
                <Mic className="w-3.5 h-3.5 text-amber-700" />
                <span>“Tell {matchingSuppliers[0]?.supplier_name.split(' ')[0] || 'Supplier'} to bring stock”</span>
              </button>
            </div>
          )}

          {/* Voice OS Kirana Shortcuts */}
          <div className="bg-[#0B1120] rounded-2xl p-5 text-white space-y-3 border border-slate-800">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              <h4 className="font-display text-sm font-bold">Voice OS Kirana Shortcuts</h4>
            </div>
            <p className="text-xs text-slate-300">
              Hold <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-amber-300 font-mono text-[10px]">Space</kbd> and speak in your preferred tongue:
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => onTriggerVoicePrompt('Sakkare 10 kg kadime aagide nodu (Check sugar stock)')}
                className="w-full text-left p-2.5 rounded-xl bg-[#131C31] hover:bg-[#1A2540] border border-slate-700/70 text-[11px] text-slate-200 transition-colors"
              >
                “ಶಕ್ಕರ್ 10 ಕೆಜಿ ಕಡಿಮೆ ಆಗಿದೆ ನೋಡು” (Check sugar stock)
              </button>
              <button
                type="button"
                onClick={() => onTriggerVoicePrompt('Tata namak ka 20 packet PO bana do')}
                className="w-full text-left p-2.5 rounded-xl bg-[#131C31] hover:bg-[#1A2540] border border-slate-700/70 text-[11px] text-slate-200 transition-colors"
              >
                “टाटा नमक का 20 पैकेट पीओ बना दो” (Draft Tata Salt PO)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Add New Product SKU</h3>
              <button type="button" onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateProduct} className="p-5 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Product Name (English)</label>
                <input
                  required
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Mysore Sandal Soap 150g"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Hindi Alias</label>
                  <input
                    value={newHindi}
                    onChange={(e) => setNewHindi(e.target.value)}
                    placeholder="मैसूर सैंडल साबुन"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kannada Alias</label>
                  <input
                    value={newKannada}
                    onChange={(e) => setNewKannada(e.target.value)}
                    placeholder="ಮೈಸೂರು ಸ್ಯಾಂಡಲ್"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className="w-full px-2 py-2 border border-slate-200 rounded-xl bg-white">
                    <option>Staples & Grains</option>
                    <option>Dairy & Bakery</option>
                    <option>Edible Oils</option>
                    <option>Spices & Masala</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Unit</label>
                  <input value={newUnit} onChange={(e) => setNewUnit(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Pack Size</label>
                  <input value={newPack} onChange={(e) => setNewPack(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-xl" />
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cost ₹</label>
                  <input type="number" value={newCost} onChange={(e) => setNewCost(Number(e.target.value))} className="w-full px-2.5 py-2 border border-slate-200 rounded-xl" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Sale ₹</label>
                  <input type="number" value={newPrice} onChange={(e) => setNewPrice(Number(e.target.value))} className="w-full px-2.5 py-2 border border-slate-200 rounded-xl" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stock</label>
                  <input type="number" value={newQty} onChange={(e) => setNewQty(Number(e.target.value))} className="w-full px-2.5 py-2 border border-slate-200 rounded-xl" />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Min</label>
                  <input type="number" value={newReorder} onChange={(e) => setNewReorder(Number(e.target.value))} className="w-full px-2.5 py-2 border border-slate-200 rounded-xl" />
                </div>
              </div>
              <button type="submit" className="w-full py-2.5 rounded-xl bg-[#0B1120] text-white font-semibold mt-2">
                Save SKU to Inventory
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Stock Modal */}
      {showAdjustModal && selectedProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-slate-900">Adjust Stock</h3>
              <button type="button" onClick={() => setShowAdjustModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="font-bold text-slate-900">{selectedProduct.name}</div>
              <div className="text-slate-500 mt-0.5">
                Current: {selectedProduct.stock_qty} {selectedProduct.unit}
              </div>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Quantity Delta (+ add / - deduct)</label>
              <input
                type="number"
                value={adjDelta}
                onChange={(e) => setAdjDelta(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Reason</label>
              <input
                value={adjReason}
                onChange={(e) => setAdjReason(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <button
              type="button"
              onClick={async () => {
                await onAdjustStock(selectedProduct.id, adjDelta, adjReason);
                setShowAdjustModal(false);
              }}
              className="w-full py-2.5 rounded-xl bg-[#0B1120] text-white font-semibold"
            >
              Apply Stock Movement
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
