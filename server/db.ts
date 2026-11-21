import crypto from 'crypto';
import { EventEmitter } from 'events';

// Pure TypeScript in-memory data store (replaces native better-sqlite3 for AI Studio Web runtime)
export const db = {
  prepare: () => ({
    get: () => null,
    all: () => [],
    run: () => ({ changes: 0, lastInsertRowid: 0 }),
  }),
  transaction: <T extends (...args: any[]) => any>(fn: T): T => fn,
};

const eventBus = new EventEmitter();
eventBus.setMaxListeners(100);

export interface ClientAction {
  type: 'download_invoice' | 'navigate' | 'set_language' | 'toast';
  url?: string;
  filename?: string;
  label?: string;
  tab?: 'voice' | 'sales' | 'inventory' | 'suppliers' | 'reminders' | 'settings';
  language?: 'en' | 'hi' | 'kn';
  message?: string;
  tone?: 'info' | 'success' | 'error';
}

export interface DashboardEvent {
  type: 'snapshot_updated' | 'agent_turn';
  turnId?: string;
  source?: 'agora_convo_ai' | 'browser_voice' | 'ui';
  utterance?: string;
  replyText?: string;
  detectedLanguage?: string;
  toolRuns?: { toolName: string; rpcLabel: string; summary: string; financialDelta: string }[];
  clientActions?: ClientAction[];
  snapshot: ReturnType<typeof getDashboardSnapshot>;
}

export function subscribeDashboardEvents(listener: (event: DashboardEvent) => void): () => void {
  eventBus.on('event', listener);
  return () => {
    eventBus.off('event', listener);
  };
}

export function emitDashboardEvent(partial: Omit<DashboardEvent, 'snapshot'>) {
  eventBus.emit('event', {
    ...partial,
    snapshot: getDashboardSnapshot(),
  } satisfies DashboardEvent);
}

interface MerchantProfileRecord {
  id: number;
  store_code: string;
  shop_name: string;
  location: string;
  owner_name: string;
  preferred_language: 'en' | 'hi' | 'kn';
  currency: string;
  timezone: string;
  approval_qty_threshold: number;
  approval_value_threshold: number;
}

interface ProductRecord {
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
}

interface ProductAliasRecord {
  id: number;
  product_id: number;
  alias: string;
  language: string;
}

interface InventoryRecord {
  product_id: number;
  quantity: number;
  updated_at: string;
}

interface StockMovementRecord {
  id: number;
  product_id: number;
  delta: number;
  reason: string;
  ref_type: string;
  ref_id: string | null;
  created_at: string;
}

export interface SaleRecord {
  id: number;
  bill_no: string;
  customer_name: string;
  customer_sublabel: string;
  payment_mode: string;
  payment_status: string;
  total_amount: number;
  cart_summary: string;
  voice_transcript: string;
  idempotency_key: string;
  created_at: string;
}

export interface SaleItemRecord {
  id: number;
  sale_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface DailySalesHistoryRecord {
  day_key: string;
  day_label: string;
  sub_label: string;
  total_revenue: number;
  sort_order: number;
}

interface HourlyFootfallRecord {
  hour_slot: number;
  hour_label: string;
  bill_count: number;
  is_rush: number;
}

interface SupplierRecord {
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

interface SupplierPriceRecord {
  id: number;
  supplier_id: number;
  product_id: number;
  unit_price: number;
  stock_note: string;
  is_best: number;
}

export interface PurchaseOrderRecord {
  id: number;
  po_number: string;
  supplier_id: number;
  supplier_name: string;
  supplier_location: string;
  line_summary: string;
  gst_hsn_note: string;
  total_amount: number;
  status: string;
  payment_status: string;
  payment_mode: string;
  delivery_note: string;
  created_via: string;
  created_at: string;
}

export interface PoItemRecord {
  id: number;
  po_id: number;
  product_id: number;
  product_name: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
}

interface KhataCustomerRecord {
  id: number;
  book_no: string;
  name: string;
  phone: string;
  balance_due: number;
  last_activity: string;
}

interface ReminderRecord {
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

interface ApprovalRecord {
  id: string;
  tool_name: string;
  summary: string;
  payload_json: string;
  related_po_id: number | null;
  status: string;
  expires_at: string;
  decided_at: string | null;
  created_at: string;
}

interface AgentSessionRecord {
  id: string;
  channel: string;
  language: string;
  agent_id: string | null;
  started_at: string;
  ended_at: string | null;
}

interface AgentRunRecord {
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

interface IntegrationHealthRecord {
  service: string;
  status: string;
  detail: string;
  latency_ms: number;
  last_success_at: string | null;
}

interface StoreState {
  initialized: boolean;
  seq: Record<string, number>;
  profile: MerchantProfileRecord | null;
  products: ProductRecord[];
  productAliases: ProductAliasRecord[];
  inventory: Map<number, InventoryRecord>;
  stockMovements: StockMovementRecord[];
  sales: SaleRecord[];
  saleItems: SaleItemRecord[];
  dailyHistory: DailySalesHistoryRecord[];
  hourlyFootfall: HourlyFootfallRecord[];
  suppliers: SupplierRecord[];
  supplierPrices: SupplierPriceRecord[];
  purchaseOrders: PurchaseOrderRecord[];
  poItems: PoItemRecord[];
  khataCustomers: KhataCustomerRecord[];
  reminders: ReminderRecord[];
  approvals: ApprovalRecord[];
  agentSessions: AgentSessionRecord[];
  agentRuns: AgentRunRecord[];
  integrationHealth: Map<string, IntegrationHealthRecord>;
}

const state: StoreState = {
  initialized: false,
  seq: {},
  profile: null,
  products: [],
  productAliases: [],
  inventory: new Map(),
  stockMovements: [],
  sales: [],
  saleItems: [],
  dailyHistory: [],
  hourlyFootfall: [],
  suppliers: [],
  supplierPrices: [],
  purchaseOrders: [],
  poItems: [],
  khataCustomers: [],
  reminders: [],
  approvals: [],
  agentSessions: [],
  agentRuns: [],
  integrationHealth: new Map(),
};

function nextId(table: string): number {
  state.seq[table] = (state.seq[table] || 0) + 1;
  return state.seq[table];
}

export function initDatabase() {
  if (!state.initialized) {
    seedInitialData();
    state.initialized = true;
  }
}

function seedInitialData() {
  const now = new Date().toISOString();

  state.profile = {
    id: 1,
    store_code: '#IND-104',
    shop_name: 'Sri Lakshmi Kirana',
    location: 'Indiranagar',
    owner_name: 'Suresh',
    preferred_language: 'en',
    currency: 'INR',
    timezone: 'Asia/Kolkata',
    approval_qty_threshold: 20,
    approval_value_threshold: 5000,
  };

  const seedProducts = [
    {
      sku: 'STPL-SLT-1K', hsn: '2501', name: 'Tata Salt Vacuum Evaporated',
      hindi_alias: 'टाटा नमक', kannada_alias: 'ಟಾಟಾ ಉಪ್ಪು', unit: 'pkts', pack_size: '1kg Packet',
      price: 28, cost: 24.5, mrp: 28, reorder_level: 25, category: 'Staples & Grains', daily_velocity: 11, qty: 0,
      aliases: [['salt', 'en'], ['tata salt', 'en'], ['namak', 'hi'], ['tata namak', 'hi'], ['uppu', 'kn'], ['टाटा नमक', 'hi'], ['ಟಾಟಾ ಉಪ್ಪು', 'kn']],
    },
    {
      sku: 'STPL-SUG-50K', hsn: '1701', name: 'Madhur Pure Crystal Sugar',
      hindi_alias: 'चीनी / शक्कर', kannada_alias: 'ಸಕ್ಕರೆ', unit: 'kg', pack_size: '50kg Gunny Bag',
      price: 46, cost: 41.0, mrp: 46, reorder_level: 20, category: 'Staples & Grains', daily_velocity: 8.5, qty: 12,
      aliases: [['sugar', 'en'], ['madhur sugar', 'en'], ['cheeni', 'hi'], ['shakkar', 'hi'], ['chini', 'hi'], ['sakkare', 'kn'], ['चीनी', 'hi'], ['ಸಕ್ಕರೆ', 'kn']],
    },
    {
      sku: 'STPL-ATT-10K', hsn: '1101', name: 'Aashirvaad Superior MP Shudh Atta',
      hindi_alias: 'आशीर्वाद आटा', kannada_alias: 'ಗೋಧಿ ಹಿಟ್ಟು', unit: 'bags', pack_size: '10kg Bag',
      price: 445, cost: 395.0, mrp: 445, reorder_level: 10, category: 'Staples & Grains', daily_velocity: 4.2, qty: 3,
      aliases: [['atta', 'en'], ['aashirvaad atta', 'en'], ['wheat flour', 'en'], ['aata', 'hi'], ['godhi hittu', 'kn'], ['आटा', 'hi'], ['ಗೋಧಿ ಹಿಟ್ಟು', 'kn']],
    },
    {
      sku: 'OIL-SUN-1L', hsn: '1512', name: 'Fortune Sunlite Refined Sunflower Oil',
      hindi_alias: 'फॉर्च्यून तेल', kannada_alias: 'ಸೂರ್ಯಕಾಂತಿ ಎಣ್ಣೆ', unit: 'pouches', pack_size: '1L Pouch',
      price: 135, cost: 128.0, mrp: 145, reorder_level: 30, category: 'Edible Oils', daily_velocity: 7.5, qty: 48,
      aliases: [['oil', 'en'], ['sunflower oil', 'en'], ['fortune oil', 'en'], ['tel', 'hi'], ['enne', 'kn'], ['तेल', 'hi'], ['ಎಣ್ಣೆ', 'kn']],
    },
    {
      sku: 'SPC-TUR-200', hsn: '0910', name: 'Everest Pure Turmeric Powder',
      hindi_alias: 'हल्दी पाउडर', kannada_alias: 'ಅರಿಶಿನ ಪುಡಿ', unit: 'boxes', pack_size: '200g Box',
      price: 60, cost: 52.0, mrp: 60, reorder_level: 20, category: 'Spices & Masala', daily_velocity: 3.1, qty: 62,
      aliases: [['turmeric', 'en'], ['haldi', 'hi'], ['everest haldi', 'en'], ['arishina', 'kn'], ['हल्दी', 'hi']],
    },
    {
      sku: 'DRY-MLK-500', hsn: '0401', name: 'Nandini Fresh Toned Milk',
      hindi_alias: 'दूध', kannada_alias: 'ನಂದಿನಿ ಹಾಲು', unit: 'pkts', pack_size: '500ml Pouch',
      price: 24, cost: 22.0, mrp: 24, reorder_level: 20, category: 'Dairy & Bakery', daily_velocity: 26, qty: 6,
      aliases: [['milk', 'en'], ['nandini milk', 'en'], ['doodh', 'hi'], ['haalu', 'kn'], ['दूध', 'hi'], ['ಹಾಲು', 'kn']],
    },
    {
      sku: 'DRY-AML-500', hsn: '0401', name: 'Amul Taaza Toned Milk',
      hindi_alias: 'अमूल दूध', kannada_alias: 'ಅಮುಲ್ ಹಾಲು', unit: 'pkts', pack_size: '500ml Pack',
      price: 27, cost: 25.0, mrp: 27, reorder_level: 15, category: 'Dairy & Bakery', daily_velocity: 18, qty: 38,
      aliases: [['amul milk', 'en'], ['amul taaza', 'en'], ['amul doodh', 'hi']],
    },
    {
      sku: 'STPL-DAL-1K', hsn: '0713', name: 'Toor Dal Premium Loose',
      hindi_alias: 'तूर दाल', kannada_alias: 'ತೊಗರಿ ಬೇಳೆ', unit: 'kg', pack_size: 'Per kg Loose',
      price: 160, cost: 134.0, mrp: 165, reorder_level: 15, category: 'Staples & Grains', daily_velocity: 5.8, qty: 42,
      aliases: [['toor dal', 'en'], ['dal', 'en'], ['arhar dal', 'hi'], ['togari bele', 'kn'], ['दाल', 'hi']],
    },
    {
      sku: 'STPL-RCE-50K', hsn: '1006', name: 'Sona Masoori Rice',
      hindi_alias: 'सोना मसूरी चावल', kannada_alias: 'ಸೋನಾ ಮಸೂರಿ ಅಕ್ಕಿ', unit: 'bags', pack_size: '50kg Bag',
      price: 2650, cost: 2350.0, mrp: 2750, reorder_level: 5, category: 'Staples & Grains', daily_velocity: 1.5, qty: 14,
      aliases: [['rice', 'en'], ['sona masoori', 'en'], ['chawal', 'hi'], ['akki', 'kn'], ['चावल', 'hi'], ['ಅಕ್ಕಿ', 'kn']],
    },
    {
      sku: 'STPL-ATT-5K', hsn: '1101', name: 'Aashirvaad Shudh Chakki Atta (5kg)',
      hindi_alias: 'आशीर्वाद 5 किलो आटा', kannada_alias: '5 ಕೆಜಿ ಗೋಧಿ ಹಿಟ್ಟು', unit: 'bags', pack_size: '5kg Bag',
      price: 235, cost: 205.0, mrp: 240, reorder_level: 8, category: 'Staples & Grains', daily_velocity: 5.0, qty: 11,
      aliases: [['5kg atta', 'en'], ['atta 5kg', 'en'], ['aashirvaad 5kg', 'en']],
    },
  ];

  const productIds: Record<string, number> = {};
  for (const p of seedProducts) {
    const pid = nextId('products');
    state.products.push({
      id: pid,
      sku: p.sku,
      hsn: p.hsn,
      name: p.name,
      hindi_alias: p.hindi_alias,
      kannada_alias: p.kannada_alias,
      unit: p.unit,
      pack_size: p.pack_size,
      price: p.price,
      cost: p.cost,
      mrp: p.mrp,
      reorder_level: p.reorder_level,
      category: p.category,
      daily_velocity: p.daily_velocity,
    });
    productIds[p.sku] = pid;
    state.inventory.set(pid, { product_id: pid, quantity: p.qty, updated_at: now });
    for (const [alias, lang] of p.aliases) {
      state.productAliases.push({ id: nextId('product_aliases'), product_id: pid, alias, language: lang });
    }
  }

  const addSup = (
    code: string, name: string, location: string, phone: string,
    rating: number, on_time_pct: number, delivery_speed: string,
    payment_terms: string, min_order_amount: number, gst_note: string
  ) => {
    const id = nextId('suppliers');
    state.suppliers.push({ id, code, name, location, phone, rating, on_time_pct, delivery_speed, payment_terms, min_order_amount, gst_note });
    return id;
  };

  const s1 = addSup('SG', 'Sri Ganesh Traders', 'APMC Yard Yard-B, Yeshwanthpur', '+91 98451 22011', 4.8, 98, 'Next Day (14 hrs)', '7 Days Credit (Udhar)', 0, 'Auto Invoiced');
  const s2 = addSup('BW', 'Balaji Wholesale Mart', 'Chickpet Commercial Corridor', '+91 98802 44120', 4.5, 91, '2 Business Days', 'Immediate Cash / UPI', 0, 'GST Ready');
  const s3 = addSup('MC', 'Metro Cash & Carry', 'Banjara Outpost / Hub 4', '+91 80412 90001', 4.9, 99, 'Same Day Pickup', '15 Days Credit', 10000, 'Triple Inspected');
  const s4 = addSup('KT', 'Karnataka Traders Yeshwanthpur', 'Yeshwanthpur APMC Gate 2', '+91 97410 88776', 4.6, 94, 'Next Day', 'COD Only', 0, 'Standard GST');

  const addPrice = (supplier_id: number, product_id: number, unit_price: number, stock_note: string, is_best: number) => {
    state.supplierPrices.push({ id: nextId('supplier_prices'), supplier_id, product_id, unit_price, stock_note, is_best });
  };

  addPrice(s1, productIds['STPL-SUG-50K'], 38.00, 'In Stock (450 Bags)', 1);
  addPrice(s2, productIds['STPL-SUG-50K'], 39.50, 'In Stock (80 Bags)', 0);
  addPrice(s3, productIds['STPL-SUG-50K'], 40.20, 'Min Order: ₹10,000', 0);
  addPrice(s4, productIds['STPL-SUG-50K'], 39.80, 'COD Only', 0);

  addPrice(s1, productIds['STPL-ATT-10K'], 388.00, 'In Stock (120 Bags)', 1);
  addPrice(s2, productIds['STPL-ATT-10K'], 395.00, 'Fastest • 4 hrs', 0);
  addPrice(s3, productIds['STPL-ATT-10K'], 392.00, 'Min Order: ₹10,000', 0);

  addPrice(s1, productIds['STPL-SLT-1K'], 23.20, 'In Stock (300 Pkts)', 1);
  addPrice(s2, productIds['STPL-SLT-1K'], 24.00, 'In Stock (150 Pkts)', 0);
  addPrice(s3, productIds['STPL-SLT-1K'], 23.80, 'Min Order: ₹10,000', 0);

  addPrice(s1, productIds['STPL-DAL-1K'], 131.00, 'In Stock (800 kg)', 1);
  addPrice(s2, productIds['STPL-DAL-1K'], 135.00, 'In Stock (240 kg)', 0);
  addPrice(s3, productIds['STPL-DAL-1K'], 133.50, 'Same Day Pickup', 0);

  addPrice(s1, productIds['STPL-RCE-50K'], 2290.00, 'In Stock (200 Bags)', 1);
  addPrice(s2, productIds['STPL-RCE-50K'], 2350.00, 'In Stock (60 Bags)', 0);
  addPrice(s3, productIds['STPL-RCE-50K'], 2380.00, 'Same Day Pickup', 0);

  addPrice(s1, productIds['OIL-SUN-1L'], 124.00, 'In Stock (400 Pouches)', 1);
  addPrice(s2, productIds['OIL-SUN-1L'], 126.50, 'In Stock (180 Pouches)', 0);
  addPrice(s3, productIds['OIL-SUN-1L'], 125.00, 'Same Day Pickup', 0);

  addPrice(s2, productIds['DRY-MLK-500'], 21.50, 'Morning Crate (4 hrs)', 1);
  addPrice(s4, productIds['DRY-MLK-500'], 22.00, 'Next Day Crate', 0);

  state.dailyHistory = [
    { day_key: 'mon', day_label: 'Mon', sub_label: 'सोम', total_revenue: 14200, sort_order: 1 },
    { day_key: 'tue', day_label: 'Tue', sub_label: 'मंगल', total_revenue: 15800, sort_order: 2 },
    { day_key: 'wed', day_label: 'Wed', sub_label: 'बुध', total_revenue: 13400, sort_order: 3 },
    { day_key: 'thu', day_label: 'Thu', sub_label: 'गुरु', total_revenue: 16900, sort_order: 4 },
    { day_key: 'fri', day_label: 'Fri', sub_label: 'शुक्र', total_revenue: 17100, sort_order: 5 },
    { day_key: 'sat', day_label: 'Sat', sub_label: 'शनि', total_revenue: 17200, sort_order: 6 },
    { day_key: 'sun', day_label: 'Sun (आज)', sub_label: 'Today', total_revenue: 18450, sort_order: 7 },
  ];

  const hours: [number, string, number, number][] = [
    [8, '8 AM', 2, 0], [9, '9 AM', 4, 0], [10, '10 AM', 6, 0], [11, '11 AM', 8, 0],
    [12, '12 PM', 5, 0], [13, '1 PM', 2, 0], [14, '2 PM', 1, 0],
    [15, '3 PM', 2, 0], [16, '4 PM', 5, 0], [17, '5 PM', 7, 0], [18, '6 PM', 9, 0],
    [19, '7 PM', 12, 1], [20, '8 PM', 10, 1], [21, '9 PM', 4, 0],
  ];
  state.hourlyFootfall = hours.map(([hour_slot, hour_label, bill_count, is_rush]) => ({
    hour_slot, hour_label, bill_count, is_rush,
  }));

  const addSale = (
    bill_no: string, customer_name: string, customer_sublabel: string, payment_mode: string,
    total_amount: number, cart_summary: string, voice_transcript: string, idempotency_key: string,
    created_at: string, items: [number, string, number, number, number][]
  ) => {
    const id = nextId('sales');
    state.sales.push({
      id, bill_no, customer_name, customer_sublabel, payment_mode,
      payment_status: payment_mode.toLowerCase().includes('udhaar') ? 'credit' : 'paid',
      total_amount, cart_summary, voice_transcript, idempotency_key, created_at,
    });
    for (const [product_id, product_name, quantity, unit_price, line_total] of items) {
      state.saleItems.push({ id: nextId('sale_items'), sale_id: id, product_id, product_name, quantity, unit_price, line_total });
    }
    return id;
  };

  addSale(
    '#POS-4777', 'Morning Counter Summary (43 bills)', 'Indiranagar Morning Shift', 'Cash', 9146,
    'Aashirvaad Atta 10kg x 12, Amul Milk x 33, Toor Dal x 6kg', '', 'seed-batch-cash',
    new Date(Date.now() - 4 * 3600000).toISOString(),
    [
      [productIds['STPL-ATT-10K'], 'Aashirvaad Superior MP Shudh Atta', 12, 445, 5340],
      [productIds['DRY-AML-500'], 'Amul Taaza Toned Milk', 33, 27, 891],
      [productIds['STPL-DAL-1K'], 'Toor Dal Premium Loose', 6, 160, 960],
      [productIds['OIL-SUN-1L'], 'Fortune Sunlite Refined Sunflower Oil', 14, 135, 1890],
    ]
  );

  addSale(
    '#POS-4776', 'Digital QR Counter Batch', 'PhonePe / GPay Instant', 'UPI PhonePe', 6632,
    'Fortune Oil x 4, Madhur Sugar x 20kg, Atta 10kg x 2', '', 'seed-batch-upi',
    new Date(Date.now() - 3.5 * 3600000).toISOString(),
    [
      [productIds['STPL-SUG-50K'], 'Madhur Pure Crystal Sugar', 20, 46, 920],
      [productIds['STPL-ATT-10K'], 'Aashirvaad Superior MP Shudh Atta', 2, 445, 890],
    ]
  );

  addSale(
    '#POS-4775', 'Savitri Devi (Khata)', 'Khata Book #03', 'Udhaar', 920,
    'Madhur Sugar 2kg, Toor Dal 2kg, Atta 5kg', '', 'seed-batch-khata',
    new Date(Date.now() - 3 * 3600000).toISOString(),
    [[productIds['STPL-DAL-1K'], 'Toor Dal Premium Loose', 2, 160, 320]]
  );

  addSale(
    '#POS-4778', 'Deepa Patel', '+91 94481 02931', 'GPay QR', 478,
    'Aashirvaad Atta 10kg, Tata Salt 1kg (2 items)', 'दीपा पटेल आटा और नमक...', 'seed-4778',
    new Date(Date.now() - 95 * 60000).toISOString(),
    [
      [productIds['STPL-ATT-10K'], 'Aashirvaad Superior MP Shudh Atta', 1, 445, 445],
      [productIds['STPL-SLT-1K'], 'Tata Salt Vacuum Evaporated', 1, 28, 28],
    ]
  );

  addSale(
    '#POS-4779', 'Anand Sharma (Teacher)', 'Khata Book #14', 'Udhaar', 680,
    'Fortune Oil 1L, Toor Dal 2kg, Surf Excel 1kg (4 items)', 'आनंद शर्मा के खाते में लिखो...', 'seed-4779',
    new Date(Date.now() - 75 * 60000).toISOString(),
    [
      [productIds['OIL-SUN-1L'], 'Fortune Sunlite Refined Sunflower Oil', 2, 135, 270],
      [productIds['STPL-DAL-1K'], 'Toor Dal Premium Loose', 2, 160, 320],
    ]
  );

  addSale(
    '#POS-4780', 'Walk-in Customer', 'Counter Quick Bill', 'Cash', 54,
    'Amul Taaza Milk 500ml x 2 (2 items)', 'दो पैकेट अमूल दूध...', 'seed-4780',
    new Date(Date.now() - 45 * 60000).toISOString(),
    [[productIds['DRY-AML-500'], 'Amul Taaza Toned Milk', 2, 27, 54]]
  );

  addSale(
    '#POS-4781', 'Ramesh Kumar (Goyal)', '+91 98452 11092', 'UPI PhonePe', 540,
    'Atta 10kg, Sugar 2kg, Vim Bar (3 items)', '10 किलो आटा, 2 किलो चीनी...', 'seed-4781',
    new Date(Date.now() - 18 * 60000).toISOString(),
    [
      [productIds['STPL-ATT-10K'], 'Aashirvaad Superior MP Shudh Atta', 1, 445, 445],
      [productIds['STPL-SUG-50K'], 'Madhur Pure Crystal Sugar', 2, 46, 92],
    ]
  );

  const po1 = nextId('purchase_orders');
  state.purchaseOrders.push(
    {
      id: po1,
      po_number: '#PO-2026-089',
      supplier_id: s1,
      supplier_name: 'Sri Ganesh Traders',
      supplier_location: 'APMC Yard Yard-B, Yeshwanthpur',
      line_summary: '20 Bags Sona Masoori Rice (50kg each @ ₹380/bag deposit)',
      gst_hsn_note: 'GST: ₹361.90 • HSN 1006',
      total_amount: 7600,
      status: 'pending_approval',
      payment_status: 'unpaid',
      payment_mode: '7 Days Credit',
      delivery_note: 'Hold expires in 18 mins',
      created_via: 'Voice Engine',
      created_at: new Date(Date.now() - 25 * 60000).toISOString(),
    },
    {
      id: nextId('purchase_orders'),
      po_number: '#PO-2026-088',
      supplier_id: s2,
      supplier_name: 'ITC Agro Distribution Hub',
      supplier_location: 'Whitefield Logistics Center',
      line_summary: '30 Bundles Aashirvaad Atta (10kg) + 15 Cases Sunfeast',
      gst_hsn_note: 'Carrier: E-Cart Logistics • Vehicle KA-04-E-2918',
      total_amount: 18450,
      status: 'dispatched',
      payment_status: 'unpaid',
      payment_mode: 'UPI / NEFT on Delivery',
      delivery_note: 'Expected Today by 4:00 PM',
      created_via: 'Voice Engine',
      created_at: new Date(Date.now() - 4 * 3600000).toISOString(),
    },
    {
      id: nextId('purchase_orders'),
      po_number: '#PO-2026-085',
      supplier_id: s3,
      supplier_name: 'Fortune Edible Oils Depot',
      supplier_location: 'Peenya Industrial Estate',
      line_summary: '10 Tins Fortune Sunflower Oil (15L) + 5 Cases Mustard',
      gst_hsn_note: 'Direct Supplier Van #KA-02-B-9912',
      total_amount: 22100,
      status: 'dispatched',
      payment_status: 'unpaid',
      payment_mode: '15 Days Credit',
      delivery_note: 'Expected Tomorrow, 10:00 AM',
      created_via: 'Voice Engine',
      created_at: new Date(Date.now() - 18 * 3600000).toISOString(),
    },
    {
      id: nextId('purchase_orders'),
      po_number: '#PO-2026-081',
      supplier_id: s4,
      supplier_name: 'Tata Consumer Products Wholesaler',
      supplier_location: 'Rajajinagar Depot #3',
      line_summary: '50 Packs Tata Salt 1kg • 40 Cartons Tata Tea Gold',
      gst_hsn_note: 'Inventory stock updated automatically via Barcode Sync',
      total_amount: 11350,
      status: 'received',
      payment_status: 'paid',
      payment_mode: 'NEFT',
      delivery_note: 'Delivered Yesterday, 5:40 PM • Paid via NEFT',
      created_via: 'Manual Order',
      created_at: new Date(Date.now() - 28 * 3600000).toISOString(),
    }
  );

  state.poItems.push({
    id: nextId('po_items'),
    po_id: po1,
    product_id: productIds['STPL-RCE-50K'],
    product_name: 'Sona Masoori Rice',
    quantity: 20,
    unit_cost: 380,
    line_total: 7600,
  });

  state.approvals.push({
    id: 'appr-po-089',
    tool_name: 'place_purchase_order',
    summary: '20 Bags Sona Masoori Rice (50kg) from Sri Ganesh Traders for ₹7,600',
    payload_json: JSON.stringify({ poId: po1, poNumber: '#PO-2026-089', supplierName: 'Sri Ganesh Traders', totalAmount: 7600 }),
    related_po_id: po1,
    status: 'pending',
    expires_at: new Date(Date.now() + 18 * 60000).toISOString(),
    decided_at: null,
    created_at: now,
  });

  state.khataCustomers.push(
    { id: nextId('khata_customers'), book_no: 'Khata Book #08', name: 'Ramesh Kumar (Goyal)', phone: '+91 98452 11092', balance_due: 2500, last_activity: 'Credited ₹500 via Voice at 10:41 AM' },
    { id: nextId('khata_customers'), book_no: 'Khata Book #14', name: 'Anand Sharma (Teacher)', phone: '+91 98450 33120', balance_due: 700, last_activity: 'Added ₹680 groceries 1 hr ago' },
    { id: nextId('khata_customers'), book_no: 'Khata Book #03', name: 'Savitri Devi', phone: '+91 99001 44512', balance_due: 0, last_activity: 'Settled ₹920 via UPI today' }
  );

  state.reminders.push(
    { id: nextId('reminders'), type: 'payment', title: 'Collect Khata Due from Ramesh Kumar', description: 'Send WhatsApp payment link with UPI QR for pending ₹2,500 balance', party_name: 'Ramesh Kumar (Goyal)', amount: 2500, due_at: new Date(Date.now() + 2 * 3600000).toISOString(), status: 'pending', channel: 'whatsapp', created_at: now },
    { id: nextId('reminders'), type: 'payment', title: 'Follow up with Anand Sharma (Teacher)', description: 'Monthly school-teacher Khata cycle settlement reminder', party_name: 'Anand Sharma (Teacher)', amount: 700, due_at: new Date(Date.now() + 5 * 3600000).toISOString(), status: 'pending', channel: 'whatsapp', created_at: now },
    { id: nextId('reminders'), type: 'delivery', title: 'Receive ITC Agro Atta Delivery', description: '30 Bundles Aashirvaad Atta arriving by E-Cart Logistics Vehicle KA-04-E-2918', party_name: 'ITC Agro Distribution Hub', amount: 18450, due_at: new Date(Date.now() + 3 * 3600000).toISOString(), status: 'pending', channel: 'voice', created_at: now },
    { id: nextId('reminders'), type: 'restock', title: 'Urgent: Tata Salt & Nandini Milk Refill', description: '0 pkts Tata Salt remaining; Nandini Milk down to 6 pkts', party_name: 'Sri Ganesh Traders', amount: 1800, due_at: new Date(Date.now() + 1 * 3600000).toISOString(), status: 'pending', channel: 'app', created_at: now }
  );

  state.agentRuns.push(
    {
      id: nextId('agent_runs'),
      session_id: 'seed-session',
      language: 'Hinglish',
      utterance: '“Ramesh ji ke khate me 500 rupaye jama karo”',
      rpc_label: 'RPC: update_khata_ledger(id: 849, amount: 500)',
      tool_name: 'record_khata_payment',
      args_json: JSON.stringify({ customer_name: 'Ramesh Kumar', amount: 500 }),
      result_summary: 'Credited ₹500 to Ramesh Kumar Khata',
      financial_delta: '+ ₹ 500.00',
      status: 'Executed',
      latency_ms: 142,
      created_at: new Date(Date.now() - 40 * 60000).toISOString(),
    },
    {
      id: nextId('agent_runs'),
      session_id: 'seed-session',
      language: 'Kanglish',
      utterance: '“Sunflower oil 1 litre 2 packet add maadi bill ge”',
      rpc_label: 'RPC: add_pos_line_item(sku: 2011, qty: 2)',
      tool_name: 'record_sale',
      args_json: JSON.stringify({ product: 'Fortune Sunflower Oil 1L', qty: 2 }),
      result_summary: 'Added 2 pouches Sunflower Oil to POS bill',
      financial_delta: '+ ₹ 270.00',
      status: 'Executed',
      latency_ms: 156,
      created_at: new Date(Date.now() - 46 * 60000).toISOString(),
    },
    {
      id: nextId('agent_runs'),
      session_id: 'seed-session',
      language: 'English',
      utterance: '“Print the last tax invoice for Bill #1048”',
      rpc_label: 'RPC: trigger_esc_pos_print(id: 1048)',
      tool_name: 'get_sales_summary',
      args_json: JSON.stringify({ bill_id: 1048 }),
      result_summary: 'Queued Thermal Receipt print for #1048',
      financial_delta: 'Thermal Receipt',
      status: 'Executed',
      latency_ms: 118,
      created_at: new Date(Date.now() - 53 * 60000).toISOString(),
    }
  );

  recordHealth('ledger', 'healthy', 'In-memory transactional ledger & atomic stock store active', 2);
  recordHealth('gemini', process.env.GEMINI_API_KEY ? 'ready' : 'missing_key', process.env.GEMINI_API_KEY ? 'Configured for Gemini tool loop' : 'Add GEMINI_API_KEY in Settings > Secrets', 0);
  recordHealth('murf', process.env.MURF_API_KEY ? 'ready' : 'missing_key', process.env.MURF_API_KEY ? `Voice ${process.env.MURF_VOICE_ID || 'en-IN-anisha'} ready` : 'Add MURF_API_KEY in Settings > Secrets', 0);
  recordHealth('agora', process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE ? 'ready' : 'missing_key', process.env.AGORA_APP_ID ? 'RTC token minting & ConvoAI ready' : 'Add AGORA_* secrets in Settings > Secrets', 0);
}

export function recordHealth(service: string, status: string, detail: string, latencyMs = 0) {
  state.integrationHealth.set(service, {
    service,
    status,
    detail,
    latency_ms: latencyMs,
    last_success_at: status === 'healthy' ? new Date().toISOString() : null,
  });
}

export function updateReadyHealth(service: string, detail: string) {
  const existing = state.integrationHealth.get(service);
  if (!existing || existing.status === 'missing_key') {
    state.integrationHealth.set(service, {
      service,
      status: 'ready',
      detail,
      latency_ms: existing?.latency_ms ?? 0,
      last_success_at: existing?.last_success_at ?? null,
    });
  }
}

export function getHealthRows() {
  return Array.from(state.integrationHealth.values());
}

export function getProfile() {
  initDatabase();
  return state.profile!;
}

export function updateProfile(patch: Partial<Omit<MerchantProfileRecord, 'id' | 'store_code' | 'currency' | 'timezone'>>) {
  initDatabase();
  state.profile = {
    ...state.profile!,
    ...patch,
  };
  return state.profile;
}

export function getProductCount() {
  initDatabase();
  return state.products.length;
}

export function applyStockMovement(
  productId: number,
  delta: number,
  reason: string,
  refType: string,
  refId: string | null = null,
  allowNegative = false
) {
  initDatabase();
  const inv = state.inventory.get(productId);
  if (!inv) {
    throw new Error(`Product ${productId} not found in inventory`);
  }
  const nextQty = Number((inv.quantity + delta).toFixed(2));
  if (nextQty < 0 && !allowNegative) {
    throw new Error(`Insufficient stock: current quantity is ${inv.quantity}, requested deduction is ${Math.abs(delta)}`);
  }
  const now = new Date().toISOString();
  inv.quantity = nextQty;
  inv.updated_at = now;
  state.stockMovements.push({
    id: nextId('stock_movements'),
    product_id: productId,
    delta,
    reason,
    ref_type: refType,
    ref_id: refId,
    created_at: now,
  });
  return nextQty;
}

export function getEnrichedProducts() {
  initDatabase();
  return state.products
    .map((p) => {
      const inv = state.inventory.get(p.id);
      return {
        ...p,
        stock_qty: inv?.quantity ?? 0,
        stock_updated_at: inv?.updated_at ?? new Date().toISOString(),
      };
    })
    .sort((a, b) => {
      const rank = (x: typeof a) => (x.stock_qty <= 0 ? 0 : x.stock_qty <= x.reorder_level ? 1 : 2);
      const rDiff = rank(a) - rank(b);
      if (rDiff !== 0) return rDiff;
      const defDiff = (b.reorder_level - b.stock_qty) - (a.reorder_level - a.stock_qty);
      if (defDiff !== 0) return defDiff;
      return a.name.localeCompare(b.name);
    });
}

export function findProductsByQuery(query: string) {
  initDatabase();
  const q = query.trim().toLowerCase();
  const enriched = getEnrichedProducts();
  if (!q) return enriched;

  const exact = enriched.filter((p) => {
    const aliases = state.productAliases.filter((a) => a.product_id === p.id).map((a) => a.alias.toLowerCase());
    return (
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      p.hindi_alias.toLowerCase().includes(q) ||
      p.kannada_alias.toLowerCase().includes(q) ||
      aliases.some((al) => al.includes(q))
    );
  });

  if (exact.length > 0) return exact.sort((a, b) => a.stock_qty - b.stock_qty);

  const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
  if (tokens.length === 0) return [];

  return enriched.filter((item) => {
    const aliases = state.productAliases.filter((a) => a.product_id === item.id).map((a) => a.alias).join(' ');
    const haystack = `${item.name} ${item.hindi_alias} ${item.kannada_alias} ${aliases}`.toLowerCase();
    return tokens.some((tok) => haystack.includes(tok));
  });
}

export function addProduct(input: {
  name: string;
  sku?: string;
  hsn?: string;
  hindi_alias?: string;
  kannada_alias?: string;
  unit?: string;
  pack_size?: string;
  price: number;
  cost: number;
  mrp?: number;
  reorder_level?: number;
  category?: string;
  initial_qty?: number;
}) {
  initDatabase();
  const pid = nextId('products');
  const now = new Date().toISOString();
  const sku = input.sku || `SKU-${Date.now().toString(36).toUpperCase()}`;
  const prod: ProductRecord = {
    id: pid,
    sku,
    hsn: input.hsn || '2106',
    name: input.name,
    hindi_alias: input.hindi_alias || '',
    kannada_alias: input.kannada_alias || '',
    unit: input.unit || 'pkts',
    pack_size: input.pack_size || '1 Unit',
    price: input.price,
    cost: input.cost,
    mrp: input.mrp || input.price,
    reorder_level: input.reorder_level ?? 10,
    category: input.category || 'Staples & Grains',
    daily_velocity: 2.5,
  };
  state.products.push(prod);
  state.inventory.set(pid, { product_id: pid, quantity: input.initial_qty ?? 10, updated_at: now });
  if (prod.hindi_alias) state.productAliases.push({ id: nextId('product_aliases'), product_id: pid, alias: prod.hindi_alias, language: 'hi' });
  if (prod.kannada_alias) state.productAliases.push({ id: nextId('product_aliases'), product_id: pid, alias: prod.kannada_alias, language: 'kn' });
  return { ...prod, stock_qty: input.initial_qty ?? 10, stock_updated_at: now };
}

export function updateProduct(
  productId: number,
  patch: Partial<Pick<ProductRecord, 'price' | 'cost' | 'mrp' | 'reorder_level' | 'category' | 'name'>>
) {
  initDatabase();
  const product = state.products.find((p) => p.id === productId);
  if (!product) throw new Error(`Product ${productId} not found`);
  if (typeof patch.price === 'number' && patch.price > 0) product.price = patch.price;
  if (typeof patch.cost === 'number' && patch.cost > 0) product.cost = patch.cost;
  if (typeof patch.mrp === 'number' && patch.mrp > 0) product.mrp = patch.mrp;
  if (typeof patch.reorder_level === 'number' && patch.reorder_level >= 0) product.reorder_level = patch.reorder_level;
  if (typeof patch.category === 'string' && patch.category.trim()) product.category = patch.category.trim();
  if (typeof patch.name === 'string' && patch.name.trim()) product.name = patch.name.trim();
  return product;
}

export function recordSaleTransaction(input: {
  customer_name?: string;
  customer_sublabel?: string;
  payment_mode?: string;
  voice_transcript?: string;
  items: { product_id: number; quantity: number }[];
}) {
  initDatabase();
  let totalAmount = 0;
  const resolved: { product: ProductRecord; qty: number; lineTotal: number }[] = [];

  for (const line of input.items) {
    const product = state.products.find((p) => p.id === line.product_id);
    if (!product) throw new Error('Product not found');
    const inv = state.inventory.get(product.id);
    if (!inv || inv.quantity < line.quantity) {
      throw new Error(`Insufficient stock for ${product.name}: available ${inv?.quantity ?? 0} ${product.unit}`);
    }
    const lineTotal = Math.round(product.price * line.quantity);
    totalAmount += lineTotal;
    resolved.push({ product, qty: line.quantity, lineTotal });
  }

  const billNo = `#POS-${4782 + state.sales.length + Math.floor(Math.random() * 10)}`;
  const customerName = input.customer_name || 'Walk-in Customer';
  const paymentMode = input.payment_mode || 'Cash';
  const summary = resolved.map((r) => `${r.product.name} x ${r.qty}`).join(', ');
  const now = new Date().toISOString();
  const saleId = nextId('sales');

  const sale: SaleRecord = {
    id: saleId,
    bill_no: billNo,
    customer_name: customerName,
    customer_sublabel: input.customer_sublabel || 'Counter Quick Bill',
    payment_mode: paymentMode,
    payment_status: paymentMode.toLowerCase().includes('udhaar') || paymentMode.toLowerCase().includes('khata') ? 'credit' : 'paid',
    total_amount: totalAmount,
    cart_summary: summary,
    voice_transcript: input.voice_transcript || '',
    idempotency_key: `sale-${Date.now()}-${Math.random()}`,
    created_at: now,
  };
  state.sales.push(sale);

  for (const r of resolved) {
    applyStockMovement(r.product.id, -r.qty, `POS Bill ${billNo}`, 'sale', billNo, false);
    state.saleItems.push({
      id: nextId('sale_items'),
      sale_id: saleId,
      product_id: r.product.id,
      product_name: r.product.name,
      quantity: r.qty,
      unit_price: r.product.price,
      line_total: r.lineTotal,
    });
  }

  if (paymentMode.toLowerCase().includes('udhaar') || paymentMode.toLowerCase().includes('khata')) {
    const existing = state.khataCustomers.find((k) => k.name.toLowerCase().includes(customerName.toLowerCase()));
    if (existing) {
      existing.balance_due += totalAmount;
      existing.last_activity = `Added ₹${totalAmount} via ${billNo}`;
    } else {
      state.khataCustomers.push({
        id: nextId('khata_customers'),
        book_no: `Khata Book #${Math.floor(20 + Math.random() * 70)}`,
        name: customerName,
        phone: '+91 98450 00000',
        balance_due: totalAmount,
        last_activity: `Opened ₹${totalAmount} via ${billNo}`,
      });
    }
  }

  return { sale, billNo, totalAmount, summary, paymentMode, customer: customerName };
}

export function findSaleByRef(ref?: string) {
  initDatabase();
  const visible = [...state.sales].reverse();
  if (!ref || !ref.trim()) {
    const sale = visible.find((s) => !s.idempotency_key.startsWith('seed-batch-')) || visible[0];
    if (!sale) return null;
    return { sale, items: state.saleItems.filter((i) => i.sale_id === sale.id) };
  }
  const q = ref.trim().toLowerCase().replace(/^#/, '');
  const sale =
    visible.find((s) => s.bill_no.toLowerCase().replace(/^#/, '').includes(q)) ||
    visible.find((s) => s.customer_name.toLowerCase().includes(q)) ||
    visible[0];
  if (!sale) return null;
  return { sale, items: state.saleItems.filter((i) => i.sale_id === sale.id) };
}

export function findPurchaseOrderByRef(ref?: string) {
  initDatabase();
  const ordered = [...state.purchaseOrders].reverse();
  if (!ref || !ref.trim()) {
    const po = ordered[0];
    if (!po) return null;
    return { po, items: state.poItems.filter((i) => i.po_id === po.id) };
  }
  const q = ref.trim().toLowerCase().replace(/^#/, '');
  const po =
    ordered.find((p) => p.po_number.toLowerCase().replace(/^#/, '').includes(q)) ||
    ordered.find((p) => p.supplier_name.toLowerCase().includes(q)) ||
    ordered[0];
  if (!po) return null;
  return { po, items: state.poItems.filter((i) => i.po_id === po.id) };
}

export function payPurchaseOrder(poRef?: string, paymentMode = 'UPI') {
  initDatabase();
  const found = findPurchaseOrderByRef(poRef);
  if (!found) throw new Error('Purchase order not found');
  const { po } = found;
  if (po.status === 'pending_approval') {
    po.status = 'dispatched';
    const linkedAppr = state.approvals.find((a) => a.related_po_id === po.id && a.status === 'pending');
    if (linkedAppr) {
      linkedAppr.status = 'approved';
      linkedAppr.decided_at = new Date().toISOString();
    }
  }
  po.payment_status = 'paid';
  po.payment_mode = paymentMode;
  po.delivery_note = `Paid ₹${po.total_amount.toLocaleString('en-IN')} via ${paymentMode} • ${po.status === 'received' ? 'Delivered' : 'Confirmed & Dispatched'}`;

  // Complete any matching pending payment reminders for this supplier
  for (const rem of state.reminders) {
    if (
      rem.status === 'pending' &&
      rem.party_name.toLowerCase().includes(po.supplier_name.split(' ')[0].toLowerCase())
    ) {
      rem.status = 'completed';
    }
  }

  return po;
}

export function getSalesSummaryData() {
  initDatabase();
  const totalRevenue = state.sales.reduce((s, r) => s + r.total_amount, 0);
  const cashCollected = state.sales.filter((r) => r.payment_mode.toLowerCase().includes('cash')).reduce((s, r) => s + r.total_amount, 0);
  const upiDigital = state.sales.filter((r) => r.payment_mode.toLowerCase().includes('upi') || r.payment_mode.toLowerCase().includes('gpay')).reduce((s, r) => s + r.total_amount, 0);
  const khataCredit = state.sales.filter((r) => r.payment_mode.toLowerCase().includes('udhaar') || r.payment_mode.toLowerCase().includes('khata')).reduce((s, r) => s + r.total_amount, 0);
  const topMovingItems = [...state.products]
    .sort((a, b) => b.daily_velocity - a.daily_velocity)
    .slice(0, 5)
    .map((p) => ({ name: p.name, daily_velocity: p.daily_velocity, unit: p.unit }));
  return { totalRevenue, cashCollected, upiDigital, khataCredit, topMovingItems };
}

export function getLowStockItems() {
  return getEnrichedProducts().filter((p) => p.stock_qty <= p.reorder_level);
}

export function getSupplierQuotes(productId: number, quantity?: number) {
  initDatabase();
  const quotes = state.supplierPrices
    .filter((sp) => sp.product_id === productId)
    .map((sp) => {
      const sup = state.suppliers.find((s) => s.id === sp.supplier_id)!;
      return {
        supplier_id: sup.id,
        supplier_name: sup.name,
        delivery_speed: sup.delivery_speed,
        payment_terms: sup.payment_terms,
        rating: sup.rating,
        on_time_pct: sup.on_time_pct,
        unit_price: sp.unit_price,
        stock_note: sp.stock_note,
        is_best: sp.is_best,
        estimatedTotal: quantity ? Math.round(sp.unit_price * quantity) : undefined,
      };
    })
    .sort((a, b) => a.unit_price - b.unit_price);
  return quotes;
}

export function findSupplierByName(name?: string) {
  initDatabase();
  if (!name) return state.suppliers[0];
  const q = name.trim().toLowerCase();
  return state.suppliers.find((s) => s.name.toLowerCase().includes(q)) || state.suppliers[0];
}

export function getBestSupplierForProduct(productId: number) {
  initDatabase();
  const best = state.supplierPrices
    .filter((sp) => sp.product_id === productId)
    .sort((a, b) => a.unit_price - b.unit_price)[0];
  return best?.supplier_id || state.suppliers[0]?.id || 1;
}

export function createApprovalAndPO(
  supplierId: number,
  productId: number,
  quantity: number,
  createdVia = 'Voice Engine',
  autoApprove = false
) {
  initDatabase();
  const supplier = state.suppliers.find((s) => s.id === supplierId);
  const product = state.products.find((p) => p.id === productId);
  if (!supplier || !product) throw new Error('Supplier or product not found');

  const priceRow = state.supplierPrices.find((sp) => sp.supplier_id === supplierId && sp.product_id === productId);
  const unitCost = priceRow ? priceRow.unit_price : product.cost;
  const totalAmount = Math.round(unitCost * quantity);
  const poNum = `#PO-2026-${String(100 + state.purchaseOrders.length + Math.floor(Math.random() * 800)).slice(0, 3)}`;
  const now = new Date().toISOString();
  const poId = nextId('purchase_orders');

  state.purchaseOrders.push({
    id: poId,
    po_number: poNum,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    supplier_location: supplier.location,
    line_summary: `${quantity} ${product.unit} ${product.name} (${product.pack_size} @ ₹${unitCost})`,
    gst_hsn_note: `GST: ₹${Math.round(totalAmount * 0.05)} • HSN ${product.hsn}`,
    total_amount: totalAmount,
    status: autoApprove ? 'dispatched' : 'pending_approval',
    payment_status: 'unpaid',
    payment_mode: supplier.payment_terms,
    delivery_note: autoApprove ? 'Placed & dispatched via Agora Voice AI' : 'Hold expires in 18 mins',
    created_via: createdVia,
    created_at: now,
  });

  state.poItems.push({
    id: nextId('po_items'),
    po_id: poId,
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_cost: unitCost,
    line_total: totalAmount,
  });

  const approvalId = `appr-${crypto.randomUUID().slice(0, 8)}`;
  const summary = `${quantity} ${product.unit} ${product.name} from ${supplier.name} for ₹${totalAmount.toLocaleString('en-IN')}`;

  if (!autoApprove) {
    state.approvals.push({
      id: approvalId,
      tool_name: 'place_purchase_order',
      summary,
      payload_json: JSON.stringify({ poId, poNumber: poNum, supplierName: supplier.name, totalAmount }),
      related_po_id: poId,
      status: 'pending',
      expires_at: new Date(Date.now() + 18 * 60000).toISOString(),
      decided_at: null,
      created_at: now,
    });
  }

  return {
    approvalId: autoApprove ? null : approvalId,
    poId,
    poNumber: poNum,
    totalAmount,
    summary,
    supplierName: supplier.name,
    status: autoApprove ? 'dispatched' : 'pending_approval',
  };
}

export function resolveApproval(approvalId: string, decision: 'approved' | 'cancelled') {
  initDatabase();
  const row = state.approvals.find((a) => a.id === approvalId);
  if (!row) throw new Error('Approval not found');
  if (row.status !== 'pending') {
    throw new Error(`Approval already ${row.status}`);
  }
  row.status = decision;
  row.decided_at = new Date().toISOString();
  const payload = JSON.parse(row.payload_json || '{}');

  if (row.related_po_id) {
    const po = state.purchaseOrders.find((p) => p.id === row.related_po_id);
    if (po) {
      if (decision === 'approved') {
        po.status = 'dispatched';
        po.delivery_note = 'Confirmed via Voice Guard • Dispatching';
      } else {
        po.status = 'cancelled';
        po.delivery_note = 'Cancelled by merchant';
      }
    }
  }

  if (decision === 'approved' && row.tool_name === 'adjust_stock' && payload.productId && typeof payload.delta === 'number') {
    applyStockMovement(payload.productId, payload.delta, payload.reason || 'Approved voice stock adjustment', 'approval', approvalId, false);
  }

  return payload;
}

export function receivePurchaseOrder(poId: number) {
  initDatabase();
  const po = state.purchaseOrders.find((p) => p.id === poId);
  if (!po) throw new Error('Purchase order not found');
  if (po.status === 'received') return po;

  const items = state.poItems.filter((i) => i.po_id === poId);
  for (const item of items) {
    applyStockMovement(item.product_id, item.quantity, `Received PO ${po.po_number}`, 'purchase_order', po.po_number, true);
  }
  po.status = 'received';
  po.delivery_note = `Stock received & synced at ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  return po;
}

export function createStockApproval(productId: number, productName: string, unit: string, delta: number, reason: string) {
  initDatabase();
  const approvalId = `appr-${Date.now().toString(36)}`;
  state.approvals.push({
    id: approvalId,
    tool_name: 'adjust_stock',
    summary: `Adjust ${productName} stock by ${delta} ${unit} (${reason})`,
    payload_json: JSON.stringify({ productId, delta, reason }),
    related_po_id: null,
    status: 'pending',
    expires_at: new Date(Date.now() + 10 * 60000).toISOString(),
    decided_at: null,
    created_at: new Date().toISOString(),
  });
  return approvalId;
}

export function listPendingApprovals() {
  initDatabase();
  return [...state.approvals].filter((a) => a.status === 'pending').reverse();
}

export function recordKhataPayment(customerIdOrName: number | string, amount: number) {
  initDatabase();
  const cust =
    typeof customerIdOrName === 'number'
      ? state.khataCustomers.find((k) => k.id === customerIdOrName)
      : state.khataCustomers.find((k) => k.name.toLowerCase().includes(customerIdOrName.toLowerCase()));
  if (!cust) throw new Error(`Khata customer "${customerIdOrName}" not found`);

  const nextBal = Math.max(0, cust.balance_due - amount);
  cust.balance_due = nextBal;
  cust.last_activity = `Credited ₹${amount} • Balance ₹${nextBal}`;

  if (nextBal === 0) {
    for (const rem of state.reminders) {
      if (rem.status === 'pending' && rem.type === 'payment' && rem.party_name.toLowerCase().includes(cust.name.split(' ')[0].toLowerCase())) {
        rem.status = 'completed';
      }
    }
  }

  return { customer: cust.name, credited: amount, remainingBalance: nextBal, id: cust.id };
}

export function createReminder(input: {
  type: string;
  title?: string;
  description?: string;
  party_name: string;
  amount?: number;
  channel?: string;
}) {
  initDatabase();
  const now = new Date().toISOString();
  const due = new Date(Date.now() + 2 * 3600000).toISOString();
  const id = nextId('reminders');
  const rec: ReminderRecord = {
    id,
    type: input.type || 'payment',
    title: input.title || `${input.type === 'payment' ? 'Collect' : 'Follow up'}: ${input.party_name}`,
    description: input.description || '',
    party_name: input.party_name,
    amount: input.amount || 0,
    due_at: due,
    status: 'pending',
    channel: input.channel || 'whatsapp',
    created_at: now,
  };
  state.reminders.push(rec);
  return rec;
}

export function listPendingReminders() {
  initDatabase();
  return {
    reminders: [...state.reminders].filter((r) => r.status === 'pending').reverse().slice(0, 10),
    khataDues: [...state.khataCustomers].filter((k) => k.balance_due > 0).sort((a, b) => b.balance_due - a.balance_due),
  };
}

export function actionReminder(idOrParty: number | string, action: 'complete' | 'snooze') {
  initDatabase();
  const rem =
    typeof idOrParty === 'number'
      ? state.reminders.find((r) => r.id === idOrParty)
      : state.reminders.find((r) => r.status === 'pending' && (r.party_name.toLowerCase().includes(idOrParty.toLowerCase()) || r.title.toLowerCase().includes(idOrParty.toLowerCase())));
  if (!rem) throw new Error('Reminder not found');
  if (action === 'snooze') {
    rem.due_at = new Date(Date.now() + 24 * 3600000).toISOString();
  } else {
    rem.status = 'completed';
  }
  return rem;
}

export function addAgentRun(input: Omit<AgentRunRecord, 'id'>) {
  initDatabase();
  const rec: AgentRunRecord = {
    id: nextId('agent_runs'),
    ...input,
  };
  state.agentRuns.push(rec);
  return rec;
}

export function createAgentSession(id: string, channel: string, language: string) {
  initDatabase();
  state.agentSessions.push({
    id,
    channel,
    language,
    agent_id: null,
    started_at: new Date().toISOString(),
    ended_at: null,
  });
}

export function updateAgentSessionAgentId(sessionId: string, agentId: string) {
  initDatabase();
  const s = state.agentSessions.find((x) => x.id === sessionId);
  if (s) s.agent_id = agentId;
}

export function getAgentSession(sessionId: string) {
  initDatabase();
  return state.agentSessions.find((x) => x.id === sessionId) || null;
}

export function endAgentSession(sessionId: string) {
  initDatabase();
  const s = state.agentSessions.find((x) => x.id === sessionId);
  if (s) s.ended_at = new Date().toISOString();
}

export function getDashboardSnapshot() {
  initDatabase();
  const profile = state.profile!;
  const products = getEnrichedProducts();
  const lowStockItems = products.filter((p) => p.stock_qty <= p.reorder_level);
  const replenishmentCapital = lowStockItems.reduce((sum, p) => {
    const target = Math.max(p.reorder_level * 2 - p.stock_qty, 5);
    return sum + target * p.cost;
  }, 0);

  const salesRows = [...state.sales].reverse();
  const totalRevenue = salesRows.reduce((s, r) => s + r.total_amount, 0);
  const cashTotal = salesRows.filter((r) => r.payment_mode.toLowerCase().includes('cash')).reduce((s, r) => s + r.total_amount, 0);
  const upiTotal = salesRows.filter((r) => r.payment_mode.toLowerCase().includes('upi') || r.payment_mode.toLowerCase().includes('gpay')).reduce((s, r) => s + r.total_amount, 0);
  const khataTotal = salesRows.filter((r) => r.payment_mode.toLowerCase().includes('udhaar') || r.payment_mode.toLowerCase().includes('khata')).reduce((s, r) => s + r.total_amount, 0);

  const visibleSales = salesRows.filter((r) => !r.idempotency_key?.startsWith('seed-batch-'));
  const invoiceCount = 43 + visibleSales.length;

  const updatedHistory = state.dailyHistory.map((d) => (d.day_key === 'sun' ? { ...d, total_revenue: totalRevenue } : d));

  const suppliers = [...state.suppliers].sort((a, b) => b.rating - a.rating);
  const supplierPrices = state.supplierPrices
    .map((sp) => {
      const s = state.suppliers.find((sup) => sup.id === sp.supplier_id)!;
      const p = state.products.find((prod) => prod.id === sp.product_id)!;
      return {
        ...sp,
        supplier_name: s.name,
        supplier_code: s.code,
        supplier_location: s.location,
        rating: s.rating,
        on_time_pct: s.on_time_pct,
        delivery_speed: s.delivery_speed,
        payment_terms: s.payment_terms,
        min_order_amount: s.min_order_amount,
        gst_note: s.gst_note,
        product_name: p.name,
        product_unit: p.unit,
        pack_size: p.pack_size,
      };
    })
    .sort((a, b) => a.unit_price - b.unit_price);

  const purchaseOrders = [...state.purchaseOrders].reverse();
  const khataCustomers = [...state.khataCustomers].sort((a, b) => b.balance_due - a.balance_due || a.id - b.id);
  const totalKhataDue = khataCustomers.reduce((s, k) => s + k.balance_due, 0);
  const pendingKhataCount = khataCustomers.filter((k) => k.balance_due > 0).length;

  const reminders = [...state.reminders].sort((a, b) => {
    const rankA = a.status === 'pending' ? 0 : 1;
    const rankB = b.status === 'pending' ? 0 : 1;
    if (rankA !== rankB) return rankA - rankB;
    return b.id - a.id;
  });

  const pendingApprovals = listPendingApprovals();
  const recentRuns = [...state.agentRuns].reverse().slice(0, 20);
  const health = getHealthRows();

  const topSelling = [
    { rank: 1, name: 'Aashirvaad Shudh Chakki Atta (10kg)', unitsText: '14 bags sold', stockText: `Stock left: ${products.find((p) => p.sku === 'STPL-ATT-10K')?.stock_qty ?? 3}`, revenue: 6300, margin: 11.2, pct: 100 },
    { rank: 2, name: 'Fortune Sunlite Refined Oil (1L)', unitsText: '18 pouches sold', stockText: `Stock left: ${products.find((p) => p.sku === 'OIL-SUN-1L')?.stock_qty ?? 48}`, revenue: 2340, margin: 9.8, pct: 68 },
    { rank: 3, name: 'Amul Taaza Toned Milk (500ml)', unitsText: '35 packets sold', stockText: 'Daily dairy', revenue: 1890, margin: 6.5, pct: 54 },
    { rank: 4, name: 'Toor Dal Premium Loose (per kg)', unitsText: '8 kg weighed', stockText: `Stock: ${products.find((p) => p.sku === 'STPL-DAL-1K')?.stock_qty ?? 42} kg`, revenue: 1280, margin: 16.4, pct: 41 },
    { rank: 5, name: 'Madhur Pure Crystal Sugar (1kg)', unitsText: '22 kg sold', stockText: 'Restock suggested', revenue: 924, margin: 8.0, pct: 32 },
  ];

  return {
    profile,
    products,
    lowStockItems,
    replenishmentCapital: Math.round(replenishmentCapital),
    salesSummary: {
      totalRevenue,
      cashTotal,
      upiTotal,
      khataTotal,
      invoiceCount,
      avgBill: Math.round(totalRevenue / Math.max(invoiceCount, 1)),
      cashSharePct: totalRevenue > 0 ? Math.round((cashTotal / totalRevenue) * 100) : 0,
      upiSharePct: totalRevenue > 0 ? Math.round((upiTotal / totalRevenue) * 100) : 0,
      khataSharePct: totalRevenue > 0 ? Math.round((khataTotal / totalRevenue) * 100) : 0,
      cashCount: 26,
      upiCount: 18,
      khataCount: 3,
      sevenDayAvg: Math.round(updatedHistory.reduce((s, d) => s + d.total_revenue, 0) / updatedHistory.length),
    },
    dailyHistory: updatedHistory,
    hourlyFootfall: state.hourlyFootfall,
    topSelling,
    recentSales: visibleSales,
    suppliers,
    supplierPrices,
    purchaseOrders,
    khataCustomers,
    totalKhataDue,
    pendingKhataCount,
    reminders,
    pendingApprovals,
    recentRuns,
    health,
  };
}
