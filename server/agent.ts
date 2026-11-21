import { Type } from '@google/genai';
import type { FunctionDeclaration, Content } from '@google/genai';
import { z } from 'zod';
import {
  db,
  applyStockMovement,
  findProductsByQuery,
  createApprovalAndPO,
  resolveApproval,
  recordHealth,
} from './db.ts';
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
    description: 'Add or deduct stock quantity with a reason. Large adjustments above threshold create a Voice Guard approval.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        product_query: { type: Type.STRING, description: 'Product name or alias' },
        delta: { type: Type.NUMBER, description: 'Positive to add stock, negative to deduct stock' },
        reason: { type: Type.STRING, description: 'Reason for stock adjustment' },
      },
      required: ['product_query', 'delta', 'reason'],
    },
  },
  {
    name: 'record_sale',
    description: 'Record a customer sale / POS bill, deduct stock atomically, and log Cash, UPI PhonePe, GPay QR, or Udhaar.',
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
    description: 'Create a purchase order draft or pending approval PO with a supplier for a product.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        supplier_name: { type: Type.STRING, description: 'Supplier name e.g. Sri Ganesh Traders, Balaji Wholesale, Metro' },
        product_query: { type: Type.STRING, description: 'Product name or alias' },
        quantity: { type: Type.NUMBER, description: 'Number of units/bags/packets to order' },
      },
      required: ['supplier_name', 'product_query', 'quantity'],
    },
  },
  {
    name: 'place_purchase_order',
    description: 'Request final placement of a purchase order. Always creates a Voice Guard pending approval for merchant confirmation.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        supplier_name: { type: Type.STRING },
        product_query: { type: Type.STRING },
        quantity: { type: Type.NUMBER },
      },
      required: ['supplier_name', 'product_query', 'quantity'],
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

function executeTool(name: string, rawArgs: Record<string, unknown>, utterance: string, sessionId: string) {
  const started = Date.now();
  let result: unknown;
  let rpcLabel = `RPC: ${name}()`;
  let financialDelta = '';

  if (name === 'search_products' || name === 'get_stock') {
    const schema = z.object({ query: z.string().optional(), product_query: z.string().optional() });
    const parsed = schema.parse(rawArgs);
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
    const rows = db.prepare(`
      SELECT p.id, p.sku, p.name, p.unit, p.cost, p.reorder_level, i.quantity as stock_qty
      FROM products p JOIN inventory i ON i.product_id = p.id
      WHERE i.quantity <= p.reorder_level
      ORDER BY i.quantity ASC
    `).all();
    rpcLabel = `RPC: list_low_stock(count: ${rows.length})`;
    result = rows;
  } else if (name === 'adjust_stock') {
    const parsed = z.object({
      product_query: z.string(),
      delta: z.number(),
      reason: z.string().default('Voice stock update'),
    }).parse(rawArgs);
    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`No product found matching "${parsed.product_query}"`);
    const p = matches[0];
    if (Math.abs(parsed.delta) >= 20) {
      const approvalId = `appr-${Date.now().toString(36)}`;
      db.prepare(`
        INSERT INTO approvals (id, tool_name, summary, payload_json, status, expires_at, created_at)
        VALUES (?, 'adjust_stock', ?, ?, 'pending', ?, ?)
      `).run(
        approvalId,
        `Adjust ${p.name} stock by ${parsed.delta} ${p.unit} (${parsed.reason})`,
        JSON.stringify({ productId: p.id, delta: parsed.delta, reason: parsed.reason }),
        new Date(Date.now() + 10 * 60000).toISOString(),
        new Date().toISOString()
      );
      rpcLabel = `RPC: request_approval(adjust_stock: ${p.sku})`;
      result = { status: 'awaiting_approval', approvalId, message: `Large adjustment of ${parsed.delta} ${p.unit} requires confirmation.` };
    } else {
      const nextQty = applyStockMovement(p.id, parsed.delta, parsed.reason, 'voice', sessionId, false);
      rpcLabel = `RPC: adjust_stock(sku: ${p.sku}, delta: ${parsed.delta})`;
      result = { product: p.name, previousQty: p.stock_qty, newQty: nextQty, unit: p.unit };
    }
  } else if (name === 'record_sale') {
    const parsed = z.object({
      items: z.array(z.object({ product_query: z.string(), quantity: z.number().positive() })).min(1),
      payment_mode: z.string().default('Cash'),
      customer_name: z.string().default('Walk-in Customer'),
    }).parse(rawArgs);

    const tx = db.transaction(() => {
      const resolvedItems: { product: any; qty: number; lineTotal: number }[] = [];
      let totalAmount = 0;
      for (const line of parsed.items) {
        const matches = findProductsByQuery(line.product_query);
        if (matches.length === 0) throw new Error(`Product "${line.product_query}" not found`);
        const p = matches[0];
        const lineTotal = Math.round(p.price * line.quantity);
        totalAmount += lineTotal;
        resolvedItems.push({ product: p, qty: line.quantity, lineTotal });
      }
      const billNo = `#POS-${4782 + Math.floor(Math.random() * 200)}`;
      const summary = resolvedItems.map((i) => `${i.product.name} x ${i.qty}`).join(', ');
      const now = new Date().toISOString();
      const saleId = Number(db.prepare(`
        INSERT INTO sales (bill_no, customer_name, customer_sublabel, payment_mode, total_amount, cart_summary, voice_transcript, idempotency_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        billNo, parsed.customer_name, 'Voice Quick Bill', parsed.payment_mode, totalAmount, summary, utterance, `voice-${Date.now()}-${Math.random()}`, now
      ).lastInsertRowid);

      for (const line of resolvedItems) {
        applyStockMovement(line.product.id, -line.qty, `Sale ${billNo}`, 'sale', billNo, false);
        db.prepare('INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, line_total) VALUES (?, ?, ?, ?, ?, ?)')
          .run(saleId, line.product.id, line.product.name, line.qty, line.product.price, line.lineTotal);
      }

      if (parsed.payment_mode.toLowerCase().includes('udhaar') || parsed.payment_mode.toLowerCase().includes('khata')) {
        const existingKhata = db.prepare('SELECT * FROM khata_customers WHERE lower(name) LIKE ?').get(`%${parsed.customer_name.toLowerCase()}%`) as any;
        if (existingKhata) {
          db.prepare('UPDATE khata_customers SET balance_due = balance_due + ?, last_activity = ? WHERE id = ?')
            .run(totalAmount, `Added ₹${totalAmount} via ${billNo}`, existingKhata.id);
        } else {
          db.prepare('INSERT INTO khata_customers (book_no, name, phone, balance_due, last_activity) VALUES (?, ?, ?, ?, ?)')
            .run(`Khata Book #${Math.floor(20 + Math.random() * 70)}`, parsed.customer_name, '+91 98450 00000', totalAmount, `Opened ₹${totalAmount} via ${billNo}`);
        }
      }

      return { billNo, totalAmount, summary, paymentMode: parsed.payment_mode, customer: parsed.customer_name };
    });

    const saleRes = tx();
    rpcLabel = `RPC: add_pos_bill(bill: ${saleRes.billNo}, amt: ${saleRes.totalAmount})`;
    financialDelta = `+ ₹ ${saleRes.totalAmount.toFixed(2)}`;
    result = saleRes;
  } else if (name === 'get_sales_summary') {
    const salesRows = db.prepare('SELECT payment_mode, total_amount FROM sales').all() as any[];
    const totalRevenue = salesRows.reduce((s, r) => s + r.total_amount, 0);
    const cash = salesRows.filter((r) => r.payment_mode.toLowerCase().includes('cash')).reduce((s, r) => s + r.total_amount, 0);
    const upi = salesRows.filter((r) => r.payment_mode.toLowerCase().includes('upi') || r.payment_mode.toLowerCase().includes('gpay')).reduce((s, r) => s + r.total_amount, 0);
    const khata = salesRows.filter((r) => r.payment_mode.toLowerCase().includes('udhaar')).reduce((s, r) => s + r.total_amount, 0);
    const topProducts = db.prepare('SELECT name, daily_velocity, unit FROM products ORDER BY daily_velocity DESC LIMIT 5').all();
    rpcLabel = `RPC: get_sales_summary(total: ${totalRevenue})`;
    result = { totalRevenue, cashCollected: cash, upiDigital: upi, khataCredit: khata, topMovingItems: topProducts };
  } else if (name === 'compare_suppliers') {
    const parsed = z.object({ product_query: z.string(), quantity: z.number().optional() }).parse(rawArgs);
    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`Product "${parsed.product_query}" not found`);
    const product = matches[0];
    const quotes = db.prepare(`
      SELECT s.id as supplier_id, s.name as supplier_name, s.delivery_speed, s.payment_terms, s.rating, s.on_time_pct,
             sp.unit_price, sp.stock_note, sp.is_best
      FROM supplier_prices sp
      JOIN suppliers s ON s.id = sp.supplier_id
      WHERE sp.product_id = ?
      ORDER BY sp.unit_price ASC
    `).all(product.id) as any[];
    rpcLabel = `RPC: compare_suppliers(sku: ${product.sku})`;
    result = {
      product: product.name,
      currentStock: `${product.stock_qty} ${product.unit}`,
      reorderLevel: `${product.reorder_level} ${product.unit}`,
      quotes: quotes.map((q) => ({
        ...q,
        estimatedTotal: parsed.quantity ? Math.round(q.unit_price * parsed.quantity) : undefined,
      })),
    };
  } else if (name === 'draft_purchase_order' || name === 'place_purchase_order') {
    const parsed = z.object({
      supplier_name: z.string(),
      product_query: z.string(),
      quantity: z.number().positive(),
    }).parse(rawArgs);
    const matches = findProductsByQuery(parsed.product_query);
    if (matches.length === 0) throw new Error(`Product "${parsed.product_query}" not found`);
    const product = matches[0];
    const supplier = db.prepare('SELECT * FROM suppliers WHERE lower(name) LIKE ?').get(`%${parsed.supplier_name.toLowerCase()}%`) as any
      || db.prepare('SELECT * FROM suppliers ORDER BY id ASC LIMIT 1').get() as any;

    const poRes = createApprovalAndPO(supplier.id, product.id, parsed.quantity, 'Voice Engine');
    rpcLabel = `RPC: draft_purchase_order(po: ${poRes.poNumber})`;
    financialDelta = `₹ ${poRes.totalAmount.toLocaleString('en-IN')}`;
    result = {
      status: 'pending_approval',
      ...poRes,
      message: `Drafted ${poRes.poNumber} for ${poRes.summary}. Ask merchant to confirm.`,
    };
  } else if (name === 'create_reminder') {
    const parsed = z.object({
      type: z.string().default('payment'),
      party_name: z.string(),
      amount: z.number().optional().default(0),
      note: z.string(),
      channel: z.string().default('whatsapp'),
    }).parse(rawArgs);
    const now = new Date().toISOString();
    const due = new Date(Date.now() + 2 * 3600000).toISOString();
    const info = db.prepare(`
      INSERT INTO reminders (type, title, description, party_name, amount, due_at, status, channel, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)
    `).run(parsed.type, `${parsed.type === 'payment' ? 'Collect' : 'Follow up'}: ${parsed.party_name}`, parsed.note, parsed.party_name, parsed.amount, due, parsed.channel, now);
    rpcLabel = `RPC: create_reminder(party: "${parsed.party_name}")`;
    if (parsed.amount > 0) financialDelta = `₹ ${parsed.amount.toLocaleString('en-IN')}`;
    result = { id: Number(info.lastInsertRowid), status: 'created', party: parsed.party_name, amount: parsed.amount, channel: parsed.channel };
  } else if (name === 'list_reminders') {
    const reminders = db.prepare("SELECT * FROM reminders WHERE status = 'pending' ORDER BY id DESC LIMIT 10").all();
    const khata = db.prepare('SELECT * FROM khata_customers WHERE balance_due > 0 ORDER BY balance_due DESC').all();
    rpcLabel = `RPC: list_reminders(pending: ${reminders.length})`;
    result = { reminders, khataDues: khata };
  } else if (name === 'record_khata_payment') {
    const parsed = z.object({ customer_name: z.string(), amount: z.number().positive() }).parse(rawArgs);
    const cust = db.prepare('SELECT * FROM khata_customers WHERE lower(name) LIKE ?').get(`%${parsed.customer_name.toLowerCase()}%`) as any;
    if (!cust) throw new Error(`Khata customer "${parsed.customer_name}" not found`);
    const nextBal = Math.max(0, cust.balance_due - parsed.amount);
    db.prepare('UPDATE khata_customers SET balance_due = ?, last_activity = ? WHERE id = ?')
      .run(nextBal, `Credited ₹${parsed.amount} via Voice`, cust.id);
    rpcLabel = `RPC: update_khata_ledger(id: ${cust.id}, amount: ${parsed.amount})`;
    financialDelta = `+ ₹ ${parsed.amount.toFixed(2)}`;
    result = { customer: cust.name, credited: parsed.amount, remainingBalance: nextBal };
  } else if (name === 'confirm_action' || name === 'cancel_action') {
    const parsed = z.object({ keyword: z.string().optional() }).parse(rawArgs);
    const pending = db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC").all() as any[];
    if (pending.length === 0) {
      result = { status: 'none', message: 'There are no pending Voice Guard approvals.' };
    } else {
      const kw = (parsed.keyword || '').toLowerCase();
      const target = pending.find((p) => p.summary.toLowerCase().includes(kw) || p.id.toLowerCase().includes(kw)) || pending[0];
      const decision = name === 'confirm_action' ? 'approved' : 'cancelled';
      const payload = resolveApproval(target.id, decision);
      rpcLabel = `RPC: ${name}(id: ${target.id})`;
      result = { status: decision, approvalId: target.id, summary: target.summary, payload };
    }
  } else {
    throw new Error(`Unknown tool: ${name}`);
  }

  const latency = Date.now() - started;
  return { result, rpcLabel, financialDelta, latency };
}

export interface AgentTurnResult {
  replyText: string;
  detectedLanguage: string;
  toolRuns: { toolName: string; rpcLabel: string; summary: string; financialDelta: string }[];
  pendingApproval: any | null;
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

  const profile = db.prepare('SELECT * FROM merchant_profile WHERE id = 1').get() as any;
  const pendingApprovals = db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC").all() as any[];

  const systemInstruction = `You are Vaani, the voice operations AI for "${profile?.shop_name || 'Sri Lakshmi Kirana'}" (${profile?.store_code || '#IND-104'}, ${profile?.location || 'Indiranagar'}).
Merchant owner: ${profile?.owner_name || 'Suresh'}. Currency: INR (₹).
Preferred language mode: ${params.preferredLanguage || profile?.preferred_language || 'en'}.

Rules:
1. Detect the user's language (English, Hindi/Hinglish, or Kannada/Kanglish) and respond concisely in a natural, warm, spoken style matching their language (use simple Hinglish/Kanglish or clear Indian English).
2. Always call the database tools to get real stock, sales, supplier prices, Khata balances, or create/update records. Never invent numbers — quote exact numbers returned by tools.
3. For purchase orders or large stock edits, summarize the rate, quantity, and total amount clearly, and ask the merchant to confirm.
4. Current pending Voice Guard approvals: ${pendingApprovals.length > 0 ? pendingApprovals.map((a) => `[${a.id}] ${a.summary}`).join('; ') : 'None'}. If the user says confirm/approve/yes/ಖಚಿತಪಡಿಸಿ/haan kar do regarding a pending order, call confirm_action.
5. Keep your final spoken reply crisp (2-3 short sentences max) so Murf Falcon TTS speaks it naturally in under 6 seconds.`;

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
  let finalReply = '';
  let lastModelUsed = 'gemini-2.5-flash';
  let lastModeUsed = 'vertex-express';

  for (let step = 0; step < 6; step++) {
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
        const exec = executeTool(call.name || '', (call.args || {}) as Record<string, unknown>, params.utterance, sessionId);
        toolRuns.push({
          toolName: call.name || 'tool',
          rpcLabel: exec.rpcLabel,
          summary: typeof exec.result === 'string' ? exec.result : JSON.stringify(exec.result).slice(0, 120),
          financialDelta: exec.financialDelta,
        });
        db.prepare(`
          INSERT INTO agent_runs (session_id, language, utterance, rpc_label, tool_name, args_json, result_summary, financial_delta, status, latency_ms, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Executed', ?, ?)
        `).run(
          sessionId,
          detectLanguageLabel(params.utterance),
          `“${params.utterance}”`,
          exec.rpcLabel,
          call.name || 'tool',
          JSON.stringify(call.args || {}),
          JSON.stringify(exec.result).slice(0, 200),
          exec.financialDelta,
          exec.latency,
          new Date().toISOString()
        );
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
    finalReply = 'Done, I have updated your store records.';
  }

  const latencyMs = Date.now() - started;
  recordHealth('gemini', 'healthy', `${lastModelUsed} (${lastModeUsed}) • ${latencyMs}ms`, latencyMs);

  const latestApproval = db.prepare("SELECT * FROM approvals WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1").get() || null;

  return {
    replyText: finalReply,
    detectedLanguage: detectLanguageLabel(params.utterance),
    toolRuns,
    pendingApproval: latestApproval,
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
