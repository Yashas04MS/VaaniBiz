import { Type } from '@google/genai';
import type { FunctionDeclaration, Content } from '@google/genai';
import { z } from 'zod';
import {
  actionReminder,
  addAgentRun,
  addProduct,
  applyStockMovement,
  createApprovalAndPO,
  createReminder,
  createStockApproval,
  findProductsByQuery,
  findPurchaseOrderByRef,
  findSaleByRef,
  findSupplierByName,
  getLowStockItems,
  getProfile,
  getSalesSummaryData,
  getSupplierQuotes,
  listPendingApprovals,
  listPendingReminders,
  payPurchaseOrder,
  receivePurchaseOrder,
  recordHealth,
  recordKhataPayment,
  recordSaleTransaction,
  resolveApproval,
  updateProduct,
  updateProfile,
} from './db.ts';
import type { ClientAction } from './db.ts';
import { generateWithModelFallback } from './geminiClient.ts';

export async function transcribeAudioWithGemini(base64Audio: string, mimeType: string, languageHint = 'en'): Promise<string> {
  const started = Date.now();
  const { response, modelUsed, modeUsed } = await generateWithModelFallback({
    purpose: 'transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: mimeType || 'audio/webm',
            data: base64Audio,
          },
        },
        {
          text: `Transcribe this Indian kirana merchant voice command accurately. It may be English, Hindi, Hinglish (Hindi in Latin or Devanagari), Kannada, or Kanglish (Kannada in Latin or Kannada script). Language hint: ${languageHint}. Return ONLY the spoken transcript text with no commentary.`,
        },
      ],
    },
  });
  const text = (response.text || '').trim();
  recordHealth('gemini', 'healthy', `${modelUsed} (${modeUsed}) active`, Date.now() - started);
  return text;
}

const toolDeclarations: FunctionDeclaration[] = [
  {
    name: 'search_products',
    description: 'Search store inventory products by English, Hindi, Hinglish, Kannada, or Kanglish name or alias.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Product name or local alias e.g. sugar, cheeni, sakkare, atta, namak, milk, oil, dal' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_stock',
    description: 'Get current stock quantity, reorder threshold, price, and days remaining for a product.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_query: { type: Type.STRING, description: 'Product name or alias' },
      },
      required: ['product_query'],
    },
  },
  {
    name: 'list_low_stock',
    description: 'List all items currently out of stock or below safety reorder threshold.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        limit: { type: Type.NUMBER, description: 'Max items to return' },
      },
    },
  },
  {
    name: 'adjust_stock',
    description: 'Add or deduct stock quantity immediately as requested by voice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_query: { type: Type.STRING, description: 'Product name or alias' },
        delta: { type: Type.NUMBER, description: 'Positive to add stock, negative to deduct stock' },
        reason: { type: Type.STRING, description: 'Reason for stock adjustment' },
        require_approval: { type: Type.BOOLEAN, description: 'Only set true if user explicitly asks to queue for approval instead of applying immediately' },
      },
      required: ['product_query', 'delta', 'reason'],
    },
  },
  {
    name: 'update_product_details',
    description: 'Automatically update a product price, cost, MRP, or reorder threshold as suggested or instructed by voice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_query: { type: Type.STRING, description: 'Product name or alias' },
        price: { type: Type.NUMBER, description: 'New selling price in INR' },
        cost: { type: Type.NUMBER, description: 'New procurement cost in INR' },
        mrp: { type: Type.NUMBER, description: 'New MRP in INR' },
        reorder_level: { type: Type.NUMBER, description: 'New low-stock reorder threshold' },
      },
      required: ['product_query'],
    },
  },
  {
    name: 'add_product',
    description: 'Add a brand new product SKU to store inventory automatically via voice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        name: { type: Type.STRING, description: 'Product name in English' },
        price: { type: Type.NUMBER, description: 'Selling price in INR' },
        cost: { type: Type.NUMBER, description: 'Cost price in INR' },
        initial_qty: { type: Type.NUMBER, description: 'Starting stock quantity' },
        unit: { type: Type.STRING, description: 'Unit such as kg, pkts, bags, pouches, boxes' },
        category: { type: Type.STRING, description: 'Category name' },
        hindi_alias: { type: Type.STRING },
        kannada_alias: { type: Type.STRING },
        reorder_level: { type: Type.NUMBER },
      },
      required: ['name', 'price'],
    },
  },
  {
    name: 'record_sale',
    description: 'Record a customer sale / POS order, deduct stock atomically, log Cash, UPI PhonePe, GPay QR, or Udhaar, and create an invoice.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        items: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              product_query: { type: Type.STRING },
              quantity: { type: Type.NUMBER },
            },
            required: ['product_query', 'quantity'],
          },
        },
        payment_mode: { type: Type.STRING, description: 'Cash, UPI PhonePe, GPay QR, or Udhaar' },
        customer_name: { type: Type.STRING, description: 'Customer name if provided, else Walk-in Customer' },
      },
      required: ['items'],
    },
  },
  {
    name: 'get_sales_summary',
    description: 'Get today or 7-day sales revenue, cash/UPI/Khata split, invoice count, and top moving items.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        period: { type: Type.STRING, description: 'today or week' },
      },
    },
  },
  {
    name: 'compare_suppliers',
    description: 'Compare mandi & wholesale suppliers for a product by rate, delivery speed, and credit terms.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_query: { type: Type.STRING, description: 'Product to compare suppliers for' },
        quantity: { type: Type.NUMBER, description: 'Order quantity to calculate total cost' },
      },
      required: ['product_query'],
    },
  },
  {
    name: 'draft_purchase_order',
    description: 'Draft or place a purchase order with a supplier for a product. Set auto_confirm=true to place immediately.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        supplier_name: { type: Type.STRING, description: 'Supplier name e.g. Sri Ganesh Traders, Balaji Wholesale, Metro' },
        product_query: { type: Type.STRING, description: 'Product name or alias' },
        quantity: { type: Type.NUMBER, description: 'Number of units/bags/packets to order' },
        auto_confirm: { type: Type.BOOLEAN, description: 'Set true to place and dispatch immediately without waiting for secondary tap' },
      },
      required: ['supplier_name', 'product_query', 'quantity'],
    },
  },
  {
    name: 'place_purchase_order',
    description: 'Place and dispatch a purchase order with a supplier immediately, optionally paying for it too.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        supplier_name: { type: Type.STRING },
        product_query: { type: Type.STRING },
        quantity: { type: Type.NUMBER },
        auto_confirm: { type: Type.BOOLEAN, description: 'Defaults to true so voice commands complete the order immediately' },
        payment_mode: { type: Type.STRING, description: 'Optional: if user asks to also pay now e.g. UPI, NEFT, Cash' },
      },
      required: ['product_query', 'quantity'],
    },
  },
  {
    name: 'receive_purchase_order',
    description: 'Mark a purchase order as received and automatically add its items into store inventory.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        reference: { type: Type.STRING, description: 'PO number e.g. #PO-2026-089 or supplier name' },
      },
    },
  },
  {
    name: 'make_payment',
    description: 'Make or record a payment: pay a supplier Purchase Order, collect/credit a customer Khata payment, or settle dues.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        target_type: { type: Type.STRING, description: 'supplier_po or khata' },
        reference: { type: Type.STRING, description: 'PO number, supplier name, or customer name' },
        amount: { type: Type.NUMBER, description: 'Payment amount in INR (required for khata)' },
        payment_mode: { type: Type.STRING, description: 'UPI, NEFT, Cash, GPay QR, PhonePe' },
      },
      required: ['target_type', 'reference'],
    },
  },
  {
    name: 'download_invoice',
    description: 'Generate and immediately download a PDF invoice for a customer POS sale bill OR a supplier Purchase Order. Always set invoice_type="purchase_order" with the PO number when downloading a supplier order invoice, or invoice_type="sale" with the POS bill number for a customer bill.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoice_type: { type: Type.STRING, description: 'purchase_order, sale, or latest' },
        reference: { type: Type.STRING, description: 'PO number (e.g. #PO-2026-089), Bill number (e.g. #POS-4781), supplier name, or customer name' },
      },
      required: ['invoice_type'],
    },
  },
  {
    name: 'create_reminder',
    description: 'Create a payment, Khata collection, delivery, or restock reminder.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: { type: Type.STRING, description: 'payment, delivery, restock, or task' },
        party_name: { type: Type.STRING, description: 'Customer or supplier name' },
        amount: { type: Type.NUMBER, description: 'Amount in INR if applicable' },
        note: { type: Type.STRING, description: 'Short reminder description' },
        channel: { type: Type.STRING, description: 'whatsapp, voice, or app' },
      },
      required: ['type', 'party_name', 'note'],
    },
  },
  {
    name: 'manage_reminder',
    description: 'Complete or snooze a pending reminder by party name or keyword.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: { type: Type.STRING, description: 'Party name or reminder keyword' },
        action: { type: Type.STRING, description: 'complete or snooze' },
      },
      required: ['keyword', 'action'],
    },
  },
  {
    name: 'list_reminders',
    description: 'List pending reminders and overdue Khata customer balances.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        status: { type: Type.STRING, description: 'pending or all' },
      },
    },
  },
  {
    name: 'record_khata_payment',
    description: 'Credit/reduce a customer Udhar Khata balance when they pay.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        customer_name: { type: Type.STRING },
        amount: { type: Type.NUMBER },
      },
      required: ['customer_name', 'amount'],
    },
  },
  {
    name: 'update_store_settings',
    description: 'Update store settings automatically: shop name, location, owner name, preferred language (en/hi/kn), or approval thresholds.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        shop_name: { type: Type.STRING },
        location: { type: Type.STRING },
        owner_name: { type: Type.STRING },
        preferred_language: { type: Type.STRING, description: 'en, hi, or kn' },
        approval_qty_threshold: { type: Type.NUMBER },
        approval_value_threshold: { type: Type.NUMBER },
      },
    },
  },
  {
    name: 'navigate_screen',
    description: 'Switch the dashboard screen automatically when the user asks to view a section.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        tab: { type: Type.STRING, description: 'voice, sales, inventory, suppliers, reminders, or settings' },
      },
      required: ['tab'],
    },
  },
  {
    name: 'confirm_action',
    description: 'Approve and execute a pending Voice Guard approval (e.g. Confirm Sri Ganesh Order or Khachitapadisi).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: { type: Type.STRING, description: 'Supplier name, PO number, or approval ID' },
      },
    },
  },
  {
    name: 'cancel_action',
    description: 'Cancel a pending Voice Guard approval.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        keyword: { type: Type.STRING },
      },
    },
  },
];

interface TurnContext {
  lastOrderContext?: { type: 'purchase_order' | 'sale'; ref: string } | null;
}

function executeTool(
  name: string,
  rawArgs: Record<string, unknown>,
  utterance: string,
  sessionId: string,
  turnCtx: TurnContext
) {
  const started = Date.now();
  let result: unknown;
  let rpcLabel = `RPC: ${name}()`;
  let financialDelta = '';
  const clientActions: ClientAction[] = [];
  const appliedChanges: string[] = [];

  if (name === 'search_products' || name === 'get_stock') {
    const parsed = z.object({ query: z.string().optional(), product_query: z.string().optional() }).parse(rawArgs);
    const q = parsed.product_query || parsed.query || '';
    const matches = findProductsByQuery(q);
    rpcLabel = `RPC: query_inventory(term: "${q}")`;
    result = matches.slice(0, 5).map((m) => ({
      id: m.id,
      sku: m.sku,
      name: m.name,
      hindi_alias: m.hindi_alias,
      kannada_alias: m.kannada_alias,
      stock_qty: m.stock_qty,
      unit: m.unit,
      reorder_level: m.reorder_level,
      price: m.price,
      cost: m.cost,
      status: m.stock_qty <= 0 ? 'Out of Stock' : m.stock_qty <= m.reorder_level ? 'Low Stock' : 'In Stock',
      days_remaining: m.daily_velocity > 0 ? Number((m.stock_qty / m.daily_velocity).toFixed(1)) : 99,
    }));
  } else if (name === 'list_low_stock') {
    const rows = getLowStockItems();
    rpcLabel = `RPC: list_low_stock(count: ${rows.length})`;
    result = rows.map((r) => ({
      id: r.id,
      sku: r.sku,
      name: r.name,
      unit: r.unit,
      cost: r.cost,
      reorder_level: r.reorder_level,
      stock_qty: r.stock_qty,
    }));
  } else if (name === 'adjust_stock') {
    const parsed = z.object({
      product_query: z.string(),
      delta: z.number(),
      reason: z.string().default('Voice stock update'),
      require_approval: z.boolean().optional().default(false),
    }).parse(rawArgs);
    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`No product found matching "${parsed.product_query}"`);
    const p = matches[0];
    if (parsed.require_approval) {
      const approvalId = createStockApproval(p.id, p.name, p.unit, parsed.delta, parsed.reason);
      rpcLabel = `RPC: request_approval(adjust_stock: ${p.sku})`;
      result = { status: 'awaiting_approval', approvalId, message: `Queued adjustment of ${parsed.delta} ${p.unit} for approval.` };
    } else {
      const nextQty = applyStockMovement(p.id, parsed.delta, parsed.reason, 'voice', sessionId, false);
      rpcLabel = `RPC: adjust_stock(sku: ${p.sku}, delta: ${parsed.delta})`;
      appliedChanges.push(`Stock ${p.name}: ${p.stock_qty} -> ${nextQty} ${p.unit}`);
      result = { product: p.name, previousQty: p.stock_qty, newQty: nextQty, unit: p.unit };
    }
  } else if (name === 'update_product_details') {
    const parsed = z.object({
      product_query: z.string(),
      price: z.number().positive().optional(),
      cost: z.number().positive().optional(),
      mrp: z.number().positive().optional(),
      reorder_level: z.number().int().min(0).optional(),
    }).parse(rawArgs);
    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`No product found matching "${parsed.product_query}"`);
    const p = matches[0];
    const updated = updateProduct(p.id, {
      price: parsed.price,
      cost: parsed.cost,
      mrp: parsed.mrp,
      reorder_level: parsed.reorder_level,
    });
    rpcLabel = `RPC: update_product(sku: ${updated.sku})`;
    appliedChanges.push(`Updated ${updated.name} (Price ₹${updated.price}, Reorder ${updated.reorder_level})`);
    result = { ok: true, product: updated.name, price: updated.price, cost: updated.cost, mrp: updated.mrp, reorder_level: updated.reorder_level };
  } else if (name === 'add_product') {
    const parsed = z.object({
      name: z.string().min(2),
      price: z.number().positive(),
      cost: z.number().positive().optional(),
      initial_qty: z.number().min(0).optional().default(20),
      unit: z.string().optional().default('pkts'),
      category: z.string().optional().default('Staples & Grains'),
      hindi_alias: z.string().optional().default(''),
      kannada_alias: z.string().optional().default(''),
      reorder_level: z.number().int().min(1).optional().default(10),
    }).parse(rawArgs);
    const created = addProduct({
      name: parsed.name,
      price: parsed.price,
      cost: parsed.cost ?? Math.round(parsed.price * 0.85),
      initial_qty: parsed.initial_qty,
      unit: parsed.unit,
      category: parsed.category,
      hindi_alias: parsed.hindi_alias,
      kannada_alias: parsed.kannada_alias,
      reorder_level: parsed.reorder_level,
    });
    rpcLabel = `RPC: add_product(sku: ${created.sku})`;
    appliedChanges.push(`Added SKU ${created.name} (${created.stock_qty} ${created.unit})`);
    result = created;
  } else if (name === 'record_sale') {
    const parsed = z.object({
      items: z.array(z.object({ product_query: z.string(), quantity: z.number().positive() })).min(1),
      payment_mode: z.string().default('Cash'),
      customer_name: z.string().default('Walk-in Customer'),
    }).parse(rawArgs);

    const resolvedItems: { product_id: number; quantity: number }[] = [];
    for (const line of parsed.items) {
      const matches = findProductsByQuery(line.product_query);
      if (matches.length === 0) throw new Error(`Product "${line.product_query}" not found`);
      resolvedItems.push({ product_id: matches[0].id, quantity: line.quantity });
    }

    const saleRes = recordSaleTransaction({
      customer_name: parsed.customer_name,
      customer_sublabel: 'Agora Voice POS Bill',
      payment_mode: parsed.payment_mode,
      voice_transcript: utterance,
      items: resolvedItems,
    });

    turnCtx.lastOrderContext = { type: 'sale', ref: saleRes.billNo };
    rpcLabel = `RPC: add_pos_bill(bill: ${saleRes.billNo}, amt: ${saleRes.totalAmount})`;
    financialDelta = `+ ₹ ${saleRes.totalAmount.toLocaleString('en-IN')}`;
    appliedChanges.push(`Bill ${saleRes.billNo} (₹${saleRes.totalAmount} • ${saleRes.paymentMode})`);
    result = {
      billNo: saleRes.billNo,
      totalAmount: saleRes.totalAmount,
      summary: saleRes.summary,
      paymentMode: saleRes.paymentMode,
      customer: saleRes.customer,
    };
  } else if (name === 'get_sales_summary') {
    const summary = getSalesSummaryData();
    rpcLabel = `RPC: get_sales_summary(total: ${summary.totalRevenue})`;
    result = summary;
  } else if (name === 'compare_suppliers') {
    const parsed = z.object({ product_query: z.string(), quantity: z.number().optional() }).parse(rawArgs);
    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`Product "${parsed.product_query}" not found`);
    const product = matches[0];
    const quotes = getSupplierQuotes(product.id, parsed.quantity);
    rpcLabel = `RPC: compare_suppliers(sku: ${product.sku})`;
    result = {
      product: product.name,
      currentStock: `${product.stock_qty} ${product.unit}`,
      reorderLevel: `${product.reorder_level} ${product.unit}`,
      quotes,
    };
  } else if (name === 'draft_purchase_order' || name === 'place_purchase_order') {
    const parsed = z.object({
      supplier_name: z.string().optional(),
      product_query: z.string(),
      quantity: z.number().positive(),
      auto_confirm: z.boolean().optional(),
      payment_mode: z.string().optional(),
    }).parse(rawArgs);

    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`Product "${parsed.product_query}" not found`);
    const product = matches[0];
    const supplier = parsed.supplier_name ? findSupplierByName(parsed.supplier_name) : findSupplierByName();
    const shouldAutoConfirm = parsed.auto_confirm ?? (name === 'place_purchase_order');

    const poRes = createApprovalAndPO(supplier.id, product.id, parsed.quantity, 'Agora Voice AI', shouldAutoConfirm);

    let paidPo = null;
    if (parsed.payment_mode) {
      paidPo = payPurchaseOrder(poRes.poNumber, parsed.payment_mode);
      appliedChanges.push(`Paid ${poRes.poNumber} (₹${poRes.totalAmount.toLocaleString('en-IN')}) via ${parsed.payment_mode}`);
    }

    turnCtx.lastOrderContext = { type: 'purchase_order', ref: poRes.poNumber };
    rpcLabel = `RPC: ${shouldAutoConfirm ? 'place_purchase_order' : 'draft_purchase_order'}(po: ${poRes.poNumber})`;
    financialDelta = `₹ ${poRes.totalAmount.toLocaleString('en-IN')}`;
    appliedChanges.unshift(`${shouldAutoConfirm ? 'Placed' : 'Drafted'} ${poRes.poNumber} with ${poRes.supplierName}`);
    result = {
      ...poRes,
      status: paidPo ? 'dispatched_and_paid' : poRes.status,
      paymentStatus: paidPo?.payment_status || 'unpaid',
      message: shouldAutoConfirm
        ? `Order ${poRes.poNumber} placed and dispatched with ${poRes.supplierName} for ₹${poRes.totalAmount.toLocaleString('en-IN')}.`
        : `Drafted ${poRes.poNumber} for ${poRes.summary}.`,
    };
  } else if (name === 'receive_purchase_order') {
    const parsed = z.object({ reference: z.string().optional() }).parse(rawArgs);
    const found = findPurchaseOrderByRef(parsed.reference);
    if (!found) throw new Error('Purchase order not found');
    const received = receivePurchaseOrder(found.po.id);
    turnCtx.lastOrderContext = { type: 'purchase_order', ref: received.po_number };
    rpcLabel = `RPC: receive_po(po: ${received.po_number})`;
    appliedChanges.push(`Received ${received.po_number} & synced stock`);
    result = { ok: true, poNumber: received.po_number, status: received.status, deliveryNote: received.delivery_note };
  } else if (name === 'make_payment') {
    const parsed = z.object({
      target_type: z.enum(['supplier_po', 'khata']).default('supplier_po'),
      reference: z.string(),
      amount: z.number().positive().optional(),
      payment_mode: z.string().default('UPI'),
    }).parse(rawArgs);

    if (parsed.target_type === 'khata') {
      const amt = parsed.amount;
      if (!amt) throw new Error('Amount is required for Khata payment');
      const res = recordKhataPayment(parsed.reference, amt);
      rpcLabel = `RPC: collect_khata_payment(customer: "${res.customer}", amt: ${amt})`;
      financialDelta = `+ ₹ ${amt.toLocaleString('en-IN')}`;
      appliedChanges.push(`Collected ₹${amt.toLocaleString('en-IN')} from ${res.customer}`);
      result = res;
    } else {
      const paid = payPurchaseOrder(parsed.reference, parsed.payment_mode);
      turnCtx.lastOrderContext = { type: 'purchase_order', ref: paid.po_number };
      rpcLabel = `RPC: pay_purchase_order(po: ${paid.po_number}, mode: ${parsed.payment_mode})`;
      financialDelta = `- ₹ ${paid.total_amount.toLocaleString('en-IN')}`;
      appliedChanges.push(`Paid ${paid.po_number} (₹${paid.total_amount.toLocaleString('en-IN')}) via ${parsed.payment_mode}`);
      result = {
        ok: true,
        poNumber: paid.po_number,
        supplier: paid.supplier_name,
        amountPaid: paid.total_amount,
        paymentMode: paid.payment_mode,
        paymentStatus: paid.payment_status,
      };
    }
  } else if (name === 'download_invoice') {
    const parsed = z.object({
      invoice_type: z.enum(['sale', 'purchase_order', 'latest']).default('latest'),
      reference: z.string().optional(),
    }).parse(rawArgs);

    let resolvedType: 'sale' | 'purchase_order' = 'sale';
    let refToLookup = parsed.reference;
    let refLabel = '';
    let url = '';
    let filename = '';

    const looksLikePoRef = Boolean(parsed.reference && /po-|ganesh|balaji|metro|itc|fortune|tata consumer/i.test(parsed.reference));
    const looksLikeSaleRef = Boolean(parsed.reference && /pos-/i.test(parsed.reference));

    const usePo =
      parsed.invoice_type === 'purchase_order' ||
      looksLikePoRef ||
      (parsed.invoice_type === 'latest' && !looksLikeSaleRef && turnCtx.lastOrderContext?.type === 'purchase_order');

    if (!refToLookup && turnCtx.lastOrderContext) {
      refToLookup = turnCtx.lastOrderContext.ref;
    }

    if (usePo) {
      const foundPo = findPurchaseOrderByRef(refToLookup);
      if (!foundPo) throw new Error('No matching purchase order found to generate invoice');
      resolvedType = 'purchase_order';
      refLabel = foundPo.po.po_number;
      const safeRef = refLabel.replace(/[^a-zA-Z0-9_-]/g, '');
      url = `/api/invoices/download?type=purchase_order&ref=${encodeURIComponent(refLabel)}`;
      filename = `VaaniBiz-PO-${safeRef}.pdf`;
    } else if (parsed.invoice_type === 'latest' && !parsed.reference) {
      const latestPo = findPurchaseOrderByRef();
      const latestSale = findSaleByRef();
      const poTime = latestPo ? Date.parse(latestPo.po.created_at || '0') : 0;
      const saleTime = latestSale ? Date.parse(latestSale.sale.created_at || '0') : 0;
      if (latestPo && poTime >= saleTime) {
        resolvedType = 'purchase_order';
        refLabel = latestPo.po.po_number;
        const safeRef = refLabel.replace(/[^a-zA-Z0-9_-]/g, '');
        url = `/api/invoices/download?type=purchase_order&ref=${encodeURIComponent(refLabel)}`;
        filename = `VaaniBiz-PO-${safeRef}.pdf`;
      } else if (latestSale) {
        resolvedType = 'sale';
        refLabel = latestSale.sale.bill_no;
        const safeRef = refLabel.replace(/[^a-zA-Z0-9_-]/g, '');
        url = `/api/invoices/download?type=sale&ref=${encodeURIComponent(refLabel)}`;
        filename = `VaaniBiz-Invoice-${safeRef}.pdf`;
      } else {
        throw new Error('No matching invoice found');
      }
    } else {
      const foundSale = findSaleByRef(refToLookup);
      if (!foundSale) throw new Error('No matching sale bill found to generate invoice');
      resolvedType = 'sale';
      refLabel = foundSale.sale.bill_no;
      const safeRef = refLabel.replace(/[^a-zA-Z0-9_-]/g, '');
      url = `/api/invoices/download?type=sale&ref=${encodeURIComponent(refLabel)}`;
      filename = `VaaniBiz-Invoice-${safeRef}.pdf`;
    }

    rpcLabel = `RPC: download_invoice(type: ${resolvedType}, ref: ${refLabel})`;
    clientActions.push({
      type: 'download_invoice',
      url,
      filename,
      label: `Download ${refLabel} PDF`,
    });
    appliedChanges.push(`Downloaded Invoice ${refLabel}`);
    result = { ok: true, invoiceType: resolvedType, reference: refLabel, filename, downloadTriggered: true };
  } else if (name === 'create_reminder') {
    const parsed = z.object({
      type: z.string().default('payment'),
      party_name: z.string(),
      amount: z.number().optional().default(0),
      note: z.string(),
      channel: z.string().default('whatsapp'),
    }).parse(rawArgs);
    const rec = createReminder({
      type: parsed.type,
      party_name: parsed.party_name,
      amount: parsed.amount,
      description: parsed.note,
      channel: parsed.channel,
    });
    rpcLabel = `RPC: create_reminder(party: "${parsed.party_name}")`;
    if (parsed.amount > 0) financialDelta = `₹ ${parsed.amount.toLocaleString('en-IN')}`;
    appliedChanges.push(`Reminder set for ${parsed.party_name}`);
    result = { id: rec.id, status: 'created', party: parsed.party_name, amount: parsed.amount, channel: parsed.channel };
  } else if (name === 'manage_reminder') {
    const parsed = z.object({
      keyword: z.string(),
      action: z.enum(['complete', 'snooze']).default('complete'),
    }).parse(rawArgs);
    const rem = actionReminder(parsed.keyword, parsed.action);
    rpcLabel = `RPC: manage_reminder(id: ${rem.id}, action: ${parsed.action})`;
    appliedChanges.push(`${parsed.action === 'complete' ? 'Completed' : 'Snoozed'} reminder: ${rem.party_name}`);
    result = rem;
  } else if (name === 'list_reminders') {
    const data = listPendingReminders();
    rpcLabel = `RPC: list_reminders(pending: ${data.reminders.length})`;
    result = data;
  } else if (name === 'record_khata_payment') {
    const parsed = z.object({ customer_name: z.string(), amount: z.number().positive() }).parse(rawArgs);
    const res = recordKhataPayment(parsed.customer_name, parsed.amount);
    rpcLabel = `RPC: update_khata_ledger(id: ${res.id}, amount: ${parsed.amount})`;
    financialDelta = `+ ₹ ${parsed.amount.toFixed(2)}`;
    appliedChanges.push(`Credited ₹${parsed.amount} to ${res.customer}`);
    result = res;
  } else if (name === 'update_store_settings') {
    const parsed = z.object({
      shop_name: z.string().optional(),
      location: z.string().optional(),
      owner_name: z.string().optional(),
      preferred_language: z.enum(['en', 'hi', 'kn']).optional(),
      approval_qty_threshold: z.number().int().min(1).optional(),
      approval_value_threshold: z.number().min(500).optional(),
    }).parse(rawArgs);
    const updated = updateProfile(parsed);
    rpcLabel = `RPC: update_store_settings()`;
    if (parsed.preferred_language) {
      clientActions.push({ type: 'set_language', language: parsed.preferred_language });
    }
    appliedChanges.push('Updated store preferences automatically');
    result = updated;
  } else if (name === 'navigate_screen') {
    const parsed = z.object({
      tab: z.enum(['voice', 'sales', 'inventory', 'suppliers', 'reminders', 'settings']),
    }).parse(rawArgs);
    rpcLabel = `RPC: navigate_screen(tab: "${parsed.tab}")`;
    clientActions.push({ type: 'navigate', tab: parsed.tab });
    appliedChanges.push(`Switched view to ${parsed.tab}`);
    result = { navigated: parsed.tab };
  } else if (name === 'confirm_action' || name === 'cancel_action') {
    const parsed = z.object({ keyword: z.string().optional() }).parse(rawArgs);
    const pending = listPendingApprovals();
    if (pending.length === 0) {
      result = { status: 'none', message: 'There are no pending Voice Guard approvals.' };
    } else {
      const kw = (parsed.keyword || '').toLowerCase();
      const target = pending.find((p) => p.summary.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)) || pending[0];
      const decision = name === 'confirm_action' ? 'approved' : 'cancelled';
      const payload = resolveApproval(target.id, decision);
      rpcLabel = `RPC: ${name}(id: ${target.id})`;
      appliedChanges.push(`${decision === 'approved' ? 'Approved' : 'Cancelled'}: ${target.summary}`);
      result = { status: decision, approvalId: target.id, summary: target.summary, payload };
    }
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  const latency = Date.now() - started;
  return { result, rpcLabel, financialDelta, latency, clientActions, appliedChanges };
}

export interface AgentTurnResult {
  replyText: string;
  detectedLanguage: string;
  toolRuns: { toolName: string; rpcLabel: string; summary: string; financialDelta: string }[];
  pendingApproval: any | null;
  clientActions: ClientAction[];
  appliedChanges: string[];
  latencyMs: number;
}

export async function runVoiceAgentTurn(params: {
  utterance: string;
  preferredLanguage?: string;
  sessionId?: string;
  history?: { role: 'user' | 'assistant'; text: string }[];
}): Promise<AgentTurnResult> {
  const started = Date.now();
  const sessionId = params.sessionId || `sess-${Date.now()}`;

  const profile = getProfile();
  const pendingApprovals = listPendingApprovals();

  const systemInstruction = `You are Vaani, the Agora Voice AI operations engine for "${profile?.shop_name || 'Sri Lakshmi Kirana'}" (${profile?.store_code || '#IND-104'}, ${profile?.location || 'Indiranagar'}).
Merchant owner: ${profile?.owner_name || 'Suresh'}. Currency: INR (₹).
Preferred language mode: ${params.preferredLanguage || profile?.preferred_language || 'en'}.

Rules:
1. Detect the user's language (English, Hindi/Hinglish, or Kannada/Kanglish) and respond concisely in a natural, warm, spoken style matching their language.
2. Execute ALL requested operations automatically through tools — from placing orders (use place_purchase_order with auto_confirm=true or record_sale for customer orders), making payments (make_payment for suppliers/POs or Khata collections), downloading PDF invoices (download_invoice), to automatically making any system changes suggested or requested (adjust_stock, update_product_details, add_product, update_store_settings, manage_reminder, navigate_screen).
3. Do NOT merely suggest changes when the user asks you to perform them or asks you to apply recommended fixes — call the mutation tools immediately so the live system updates automatically!
4. If the user asks to place an order AND pay AND download the invoice in one request, chain the tools in sequence (e.g., place_purchase_order -> make_payment -> download_invoice, or record_sale -> download_invoice).
5. Always quote exact numbers, bill numbers, PO numbers, and amounts returned by tools.
6. Current pending Voice Guard approvals: ${pendingApprovals.length > 0 ? pendingApprovals.map((a) => `[${a.id}] ${a.summary}`).join('; ') : 'None'}. If the user says confirm/approve/yes/ಖಚಿತಪಡಿಸಿ/haan kar do, call confirm_action.
7. Keep your final spoken reply crisp (2-3 short sentences max) so TTS speaks it naturally.`;

  const contents: Content[] = [];
  if (params.history && params.history.length > 0) {
    for (const h of params.history.slice(-6)) {
      contents.push({
        role: h.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: h.text }],
      });
    }
  }
  contents.push({ role: 'user', parts: [{ text: params.utterance }] });

  const toolRuns: { toolName: string; rpcLabel: string; summary: string; financialDelta: string }[] = [];
  const allClientActions: ClientAction[] = [];
  const allAppliedChanges: string[] = [];
  const turnCtx: TurnContext = { lastOrderContext: null };
  let finalReply = '';
  let lastModelUsed = 'gemini-3.1-flash-lite';
  let lastModeUsed = 'gemini-api';

  for (let step = 0; step < 8; step++) {
    const { response, modelUsed, modeUsed } = await generateWithModelFallback({
      purpose: 'chat',
      contents,
      config: {
        systemInstruction,
        tools: [{ functionDeclarations: toolDeclarations }],
      },
    });
    lastModelUsed = modelUsed;
    lastModeUsed = modeUsed;

    const calls = response.functionCalls;
    const modelContent = response.candidates?.[0]?.content;

    if (!calls || calls.length === 0) {
      finalReply = (response.text || '').trim();
      break;
    }

    if (modelContent) {
      contents.push(modelContent);
    }

    const responseParts: any[] = [];
    for (const call of calls) {
      try {
        const exec = executeTool(call.name || '', (call.args || {}) as Record<string, unknown>, params.utterance, sessionId, turnCtx);
        toolRuns.push({
          toolName: call.name || 'tool',
          rpcLabel: exec.rpcLabel,
          summary: typeof exec.result === 'string' ? exec.result : JSON.stringify(exec.result).slice(0, 140),
          financialDelta: exec.financialDelta,
        });
        allClientActions.push(...exec.clientActions);
        allAppliedChanges.push(...exec.appliedChanges);

        addAgentRun({
          session_id: sessionId,
          language: detectLanguageLabel(params.utterance),
          utterance: `“${params.utterance}”`,
          rpc_label: exec.rpcLabel,
          tool_name: call.name || 'tool',
          args_json: JSON.stringify(call.args || {}),
          result_summary: JSON.stringify(exec.result).slice(0, 200),
          financial_delta: exec.financialDelta,
          status: 'Executed',
          latency_ms: exec.latency,
          created_at: new Date().toISOString(),
        });

        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { result: exec.result },
          },
        });
      } catch (err: any) {
        responseParts.push({
          functionResponse: {
            id: call.id,
            name: call.name,
            response: { error: err?.message || 'Tool execution failed' },
          },
        });
      }
    }

    contents.push({ role: 'user', parts: responseParts });
  }

  if (!finalReply) {
    finalReply = 'Done, I have executed your request and updated the store system.';
  }

  const latencyMs = Date.now() - started;
  recordHealth('gemini', 'healthy', `${lastModelUsed} (${lastModeUsed}) • ${latencyMs}ms`, latencyMs);

  const latestApproval = listPendingApprovals()[0] || null;

  return {
    replyText: finalReply,
    detectedLanguage: detectLanguageLabel(params.utterance),
    toolRuns,
    pendingApproval: latestApproval,
    clientActions: allClientActions,
    appliedChanges: allAppliedChanges,
    latencyMs,
  };
}

function detectLanguageLabel(text: string): string {
  if (/[\u0C80-\u0CFF]/.test(text) || /\b(maadi|keji|sakkare|akki|haalu|bittu|yavaga|kodi|beeku)\b/i.test(text)) {
    return 'Kanglish';
  }
  if (/[\u0900-\u097F]/.test(text) || /\b(aaj|kitni|kilo|bikri|khate|karo|cheeni|namak|bhaiya|kitna|chahiye|bhej)\b/i.test(text)) {
    return 'Hinglish';
  }
  return 'English';
}
