export type NavTab =
  | 'voice'
  | 'sales'
  | 'inventory'
  | 'suppliers'
  | 'reminders'
  | 'settings';

export type LanguageCode = 'en' | 'hi' | 'kn';

export interface MerchantProfile {
  id: number;
  store_code: string;
  shop_name: string;
  location: string;
  owner_name: string;
  preferred_language: LanguageCode;
  currency: string;
  timezone: string;
  approval_qty_threshold: number;
  approval_value_threshold: number;
}

export interface ProductRow {
  id: number;
  sku: string;
  hsn: string;
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
  daily_velocity: number;
  stock_qty: number;
  stock_updated_at: string;
}

export interface SaleRow {
  id: number;
  bill_no: string;
  customer_name: string;
  customer_sublabel: string;
  payment_mode: string;
  total_amount: number;
  cart_summary: string;
  voice_transcript: string;
  created_at: string;
}

export interface SupplierRow {
  id: number;
  code: string;
  name: string;
  location: string;
  phone: string;
  rating: number;
  on_time_pct: number;
  delivery_speed: string;
  payment_terms: string;
  min_order_amount: number;
  gst_note: string;
}

export interface SupplierPriceRow {
  id: number;
  supplier_id: number;
  product_id: number;
  unit_price: number;
  stock_note: string;
  is_best: number;
  supplier_name: string;
  supplier_code: string;
  supplier_location: string;
  rating: number;
  on_time_pct: number;
  delivery_speed: string;
  payment_terms: string;
  min_order_amount: number;
  gst_note: string;
  product_name: string;
  product_unit: string;
  pack_size: string;
}

export interface PurchaseOrderRow {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  supplier_location: string;
  line_summary: string;
  gst_hsn_note: string;
  total_amount: number;
  status: string;
  delivery_note: string;
  created_via: string;
  created_at: string;
}

export interface KhataCustomerRow {
  id: number;
  book_no: string;
  name: string;
  phone: string;
  balance_due: number;
  last_activity: string;
}

export interface ReminderRow {
  id: number;
  type: string;
  title: string;
  description: string;
  party_name: string;
  amount: number;
  due_at: string;
  status: string;
  channel: string;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  tool_name: string;
  summary: string;
  payload_json: string;
  related_po_id: number | null;
  status: string;
  expires_at: string;
  created_at: string;
}

export interface AgentRunRow {
  id: number;
  session_id: string;
  language: string;
  utterance: string;
  rpc_label: string;
  tool_name: string;
  args_json: string;
  result_summary: string;
  financial_delta: string;
  status: string;
  latency_ms: number;
  created_at: string;
}

export interface IntegrationHealthRow {
  service: string;
  status: string;
  detail: string;
  latency_ms: number;
  last_success_at: string | null;
}

export interface DashboardSnapshot {
  profile: MerchantProfile;
  products: ProductRow[];
  lowStockItems: ProductRow[];
  replenishmentCapital: number;
  salesSummary: {
    totalRevenue: number;
    cashTotal: number;
    upiTotal: number;
    khataTotal: number;
    invoiceCount: number;
    avgBill: number;
    cashSharePct: number;
    upiSharePct: number;
    khataSharePct: number;
    cashCount: number;
    upiCount: number;
    khataCount: number;
    sevenDayAvg: number;
  };
  dailyHistory: {
    day_key: string;
    day_label: string;
    sub_label: string;
    total_revenue: number;
    sort_order: number;
  }[];
  hourlyFootfall: {
    hour_slot: number;
    hour_label: string;
    bill_count: number;
    is_rush: number;
  }[];
  topSelling: {
    rank: number;
    name: string;
    unitsText: string;
    stockText: string;
    revenue: number;
    margin: number;
    pct: number;
  }[];
  recentSales: SaleRow[];
  suppliers: SupplierRow[];
  supplierPrices: SupplierPriceRow[];
  purchaseOrders: PurchaseOrderRow[];
  khataCustomers: KhataCustomerRow[];
  totalKhataDue: number;
  pendingKhataCount: number;
  reminders: ReminderRow[];
  pendingApprovals: ApprovalRow[];
  recentRuns: AgentRunRow[];
  health: IntegrationHealthRow[];
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  speakerLabel: string;
  languageTag: string;
  timestamp: string;
  text: string;
  subText?: string;
  ttsProvider?: string | null;
  audioBase64?: string | null;
  audioMimeType?: string | null;
  suggestionAction?: {
    label: string;
    secondaryLabel?: string;
    approvalId?: string;
    supplierId?: number;
    productId?: number;
    quantity?: number;
  };
}
