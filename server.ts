import 'dotenv/config';
import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { createServer as createViteServer } from 'vite';
import { z } from 'zod';
import {
  actionReminder,
  addProduct,
  applyStockMovement,
  createApprovalAndPO,
  createReminder,
  emitDashboardEvent,
  findPurchaseOrderByRef,
  findSaleByRef,
  getBestSupplierForProduct,
  getDashboardSnapshot,
  getHealthRows,
  getLowStockItems,
  getProductCount,
  getProfile,
  initDatabase,
  payPurchaseOrder,
  receivePurchaseOrder,
  recordHealth,
  recordKhataPayment,
  recordSaleTransaction,
  resolveApproval,
  subscribeDashboardEvents,
  updateProfile,
  updateReadyHealth,
} from './server/db.ts';
import { runVoiceAgentTurn, transcribeAudioWithGemini } from './server/agent.ts';
import { synthesizeSpeech, startAgoraSession, stopAgoraSession } from './server/voice.ts';
import { getGeminiDiagnostics } from './server/geminiClient.ts';
import { generatePurchaseOrderInvoicePdf, generateSaleInvoicePdf } from './server/invoice.ts';

initDatabase();

const app = express();
app.use(express.json({ limit: '15mb' }));

// Real-time Server-Sent Events stream so Agora Conversational AI (/api/llm)
// and voice actions synchronize automatically to all connected UI clients
app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  res.write(`data: ${JSON.stringify({ type: 'connected', snapshot: getDashboardSnapshot() })}\n\n`);

  const unsubscribe = subscribeDashboardEvents((event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });

  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 25000);

  req.on('close', () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

// Download PDF Invoice for POS Sales Bills or Supplier Purchase Orders
app.get('/api/invoices/download', (req, res) => {
  try {
    const type = String(req.query.type || 'sale');
    const ref = req.query.ref ? String(req.query.ref) : undefined;
    const profile = getProfile();

    if (type === 'purchase_order' || type === 'po') {
      const found = findPurchaseOrderByRef(ref);
      if (!found) {
        res.status(404).json({ error: 'Purchase order invoice not found' });
        return;
      }
      const pdf = generatePurchaseOrderInvoicePdf({
        shopName: profile.shop_name,
        storeCode: profile.store_code,
        location: profile.location,
        po: found.po,
        items: found.items,
      });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
      res.send(pdf.buffer);
      return;
    }

    const found = findSaleByRef(ref);
    if (!found) {
      res.status(404).json({ error: 'Sale invoice not found' });
      return;
    }
    const pdf = generateSaleInvoicePdf({
      shopName: profile.shop_name,
      storeCode: profile.store_code,
      location: profile.location,
      sale: found.sale,
      items: found.items,
    });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pdf.filename}"`);
    res.send(pdf.buffer);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to generate invoice PDF' });
  }
});

// Health & integration telemetry
app.get('/api/health', (_req, res) => {
  const geminiDiag = getGeminiDiagnostics();
  const geminiOk = geminiDiag.configured;
  const murfOk = Boolean(process.env.MURF_API_KEY || process.env.MURF_API_KEY_ALT);
  const agoraOk = Boolean(process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE);

  if (geminiOk) {
    updateReadyHealth('gemini', `${geminiDiag.primaryModel} (${geminiDiag.mode})`);
  }
  if (murfOk) {
    updateReadyHealth('murf', `Voice ${process.env.MURF_VOICE_ID || 'en-IN-anisha'} ready`);
  }
  if (agoraOk) {
    updateReadyHealth('agora', 'RTC token minting & ConvoAI ready');
  }

  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    integrations: getHealthRows(),
    config: {
      geminiConfigured: geminiOk,
      geminiMode: geminiDiag.mode,
      geminiModel: geminiDiag.primaryModel,
      murfConfigured: murfOk,
      murfVoiceId: process.env.MURF_VOICE_ID || 'en-IN-anisha',
      agoraConfigured: agoraOk,
    },
  });
});

// Live verification ping across Gemini, Murf, Agora, and In-Memory Ledger
app.post('/api/health/verify', async (_req, res) => {
  const results: Record<string, { status: string; detail: string; latencyMs: number }> = {};

  const dbStart = Date.now();
  const cnt = getProductCount();
  results.ledger = { status: 'healthy', detail: `${cnt} SKUs verified in ledger`, latencyMs: Date.now() - dbStart };
  recordHealth('ledger', 'healthy', results.ledger.detail, results.ledger.latencyMs);

  const agStart = Date.now();
  if (process.env.AGORA_APP_ID && process.env.AGORA_APP_CERTIFICATE) {
    try {
      const { mintAgoraRtcToken } = await import('./server/voice.ts');
      mintAgoraRtcToken('health-verify', 1001);
      results.agora = { status: 'healthy', detail: 'RTC token builder verified', latencyMs: Date.now() - agStart };
      recordHealth('agora', 'healthy', results.agora.detail, results.agora.latencyMs);
    } catch (e: any) {
      results.agora = { status: 'error', detail: e?.message || 'Agora check failed', latencyMs: Date.now() - agStart };
      recordHealth('agora', 'error', results.agora.detail, results.agora.latencyMs);
    }
  } else {
    results.agora = { status: 'missing_key', detail: 'Configure AGORA_APP_ID & AGORA_APP_CERTIFICATE', latencyMs: 0 };
    recordHealth('agora', 'missing_key', results.agora.detail, 0);
  }

  const gStart = Date.now();
  try {
    const turn = await runVoiceAgentTurn({ utterance: 'Check sugar stock briefly', sessionId: 'health-check' });
    results.gemini = { status: 'healthy', detail: `Gemini responded in ${turn.latencyMs}ms`, latencyMs: turn.latencyMs };
  } catch (e: any) {
    results.gemini = { status: 'error', detail: e?.message || 'Gemini failed', latencyMs: Date.now() - gStart };
    recordHealth('gemini', 'error', results.gemini.detail, results.gemini.latencyMs);
  }

  const mStart = Date.now();
  try {
    const tts = await synthesizeSpeech('VaaniBiz voice engine healthy.', 'en');
    results.murf = {
      status: tts.provider.startsWith('murf') ? 'healthy' : 'degraded',
      detail: `${tts.provider} (${tts.audioBuffer.length} bytes)`,
      latencyMs: tts.latencyMs,
    };
  } catch (e: any) {
    results.murf = { status: 'error', detail: e?.message || 'TTS failed', latencyMs: Date.now() - mStart };
    recordHealth('murf', 'error', results.murf.detail, results.murf.latencyMs);
  }

  res.json({ ok: true, results });
});

// Full dashboard snapshot
app.get('/api/dashboard', (_req, res) => {
  res.json(getDashboardSnapshot());
});

// Update merchant profile / preferences
app.patch('/api/profile', (req, res) => {
  const parsed = z.object({
    shop_name: z.string().min(2).optional(),
    location: z.string().min(2).optional(),
    owner_name: z.string().min(2).optional(),
    preferred_language: z.enum(['en', 'hi', 'kn']).optional(),
    approval_qty_threshold: z.number().int().min(1).max(1000).optional(),
    approval_value_threshold: z.number().min(500).max(500000).optional(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid profile update payload' });
    return;
  }
  const updated = updateProfile(parsed.data);
  emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
  res.json(updated);
});

// Agora RTC + Conversational AI session start / stop
app.post('/api/agent/start', async (req, res) => {
  try {
    const parsed = z.object({
      channel: z.string().optional(),
      language: z.string().optional(),
    }).parse(req.body || {});
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = host ? `${proto}://${host}` : '';
    const session = await startAgoraSession({
      channel: parsed.channel,
      language: parsed.language,
      baseUrl,
    });
    res.json(session);
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to start Agora voice session' });
  }
});

app.post('/api/agent/stop', async (req, res) => {
  const sessionId = String(req.body?.sessionId || '');
  const result = await stopAgoraSession(sessionId);
  res.json(result);
});

// OpenAI-compatible Custom LLM endpoint for Agora Conversational AI
app.post('/api/llm', async (req, res) => {
  const expectedSecret = process.env.LLM_SHARED_SECRET;
  if (expectedSecret) {
    const authHeader = String(req.headers.authorization || '');
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    const a = Buffer.from(token);
    const b = Buffer.from(expectedSecret);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  try {
    const sessionId = String(req.query.session || 'agora-convo');
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
    const utterance = typeof lastUser?.content === 'string' ? lastUser.content : 'Hello';
    const history = messages.slice(0, -1)
      .filter((m: any) => m.role === 'user' || m.role === 'assistant')
      .map((m: any) => ({ role: m.role as 'user' | 'assistant', text: String(m.content || '') }));

    const turn = await runVoiceAgentTurn({ utterance, sessionId, history });

    // Broadcast live Agora ConvoAI turn & automatic client actions (downloads, tab switches, ledger updates)
    emitDashboardEvent({
      type: 'agent_turn',
      turnId: `agora-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'agora_convo_ai',
      utterance,
      replyText: turn.replyText,
      detectedLanguage: turn.detectedLanguage,
      toolRuns: turn.toolRuns,
      clientActions: turn.clientActions,
    });

    if (req.body?.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      const chunk = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'vaanibiz-gemini-4-hydrogen',
        choices: [{ index: 0, delta: { role: 'assistant', content: turn.replyText }, finish_reason: null }],
      };
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      const doneChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: 'chat.completion.chunk',
        created: Math.floor(Date.now() / 1000),
        model: 'vaanibiz-gemini-4-hydrogen',
        choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      };
      res.write(`data: ${JSON.stringify(doneChunk)}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.json({
      id: `chatcmpl-${Date.now()}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: 'vaanibiz-gemini-4-hydrogen',
      choices: [{ index: 0, message: { role: 'assistant', content: turn.replyText }, finish_reason: 'stop' }],
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'LLM orchestration error' });
  }
});

// Direct voice turn: accepts either transcript OR audioBase64, runs Gemini tool loop, and synthesizes Murf audio!
app.post('/api/voice/turn', async (req, res) => {
  try {
    const parsed = z.object({
      utterance: z.string().optional(),
      audioBase64: z.string().optional(),
      mimeType: z.string().optional(),
      language: z.string().optional(),
      sessionId: z.string().optional(),
      synthesizeAudio: z.boolean().optional().default(true),
      history: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string() })).optional(),
    }).parse(req.body);

    let utterance = (parsed.utterance || '').trim();
    if (!utterance && parsed.audioBase64) {
      utterance = await transcribeAudioWithGemini(parsed.audioBase64, parsed.mimeType || 'audio/webm', parsed.language || 'en');
    }

    if (!utterance) {
      res.status(400).json({ error: 'Could not hear any speech clearly. Please speak again or type a command.' });
      return;
    }

    const turn = await runVoiceAgentTurn({
      utterance,
      preferredLanguage: parsed.language,
      sessionId: parsed.sessionId,
      history: parsed.history,
    });

    let audioBase64: string | null = null;
    let audioMimeType: string | null = null;
    let ttsProvider: string | null = null;
    let ttsError: string | null = null;

    if (parsed.synthesizeAudio) {
      try {
        const tts = await synthesizeSpeech(turn.replyText, turn.detectedLanguage);
        audioBase64 = tts.audioBuffer.toString('base64');
        audioMimeType = tts.mimeType;
        ttsProvider = tts.provider;
      } catch (e: any) {
        ttsError = e?.message || 'TTS unavailable';
      }
    }

    const turnId = `voice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    emitDashboardEvent({
      type: 'snapshot_updated',
      turnId,
      source: 'browser_voice',
    });

    res.json({
      turnId,
      utterance,
      ...turn,
      audioBase64,
      audioMimeType,
      ttsProvider,
      ttsError,
      snapshot: getDashboardSnapshot(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Voice turn failed' });
  }
});

// Standalone Murf TTS endpoint (for playing back voice transcripts or replies)
app.post('/api/tts', async (req, res) => {
  try {
    const parsed = z.object({
      text: z.string().min(1).max(1200),
      language: z.string().optional(),
    }).parse(req.body);
    const tts = await synthesizeSpeech(parsed.text, parsed.language);
    res.setHeader('Content-Type', tts.mimeType);
    res.setHeader('X-TTS-Provider', tts.provider);
    res.send(tts.audioBuffer);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'TTS synthesis failed' });
  }
});

// Inventory routes
app.post('/api/inventory/products', (req, res) => {
  const parsed = z.object({
    name: z.string().min(2),
    sku: z.string().min(2).optional(),
    hsn: z.string().default('2106'),
    hindi_alias: z.string().default(''),
    kannada_alias: z.string().default(''),
    unit: z.string().default('pkts'),
    pack_size: z.string().default('1 Unit'),
    price: z.number().positive(),
    cost: z.number().positive(),
    mrp: z.number().positive(),
    reorder_level: z.number().int().min(1).default(10),
    category: z.string().default('Staples & Grains'),
    initial_qty: z.number().min(0).default(10),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid product details' });
    return;
  }
  const created = addProduct(parsed.data);
  emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
  res.json({ ok: true, id: created.id, snapshot: getDashboardSnapshot() });
});

app.post('/api/inventory/adjust', (req, res) => {
  const parsed = z.object({
    productId: z.number().int().positive(),
    delta: z.number(),
    reason: z.string().default('Manual stock adjustment'),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid adjustment payload' });
    return;
  }
  try {
    const nextQty = applyStockMovement(parsed.data.productId, parsed.data.delta, parsed.data.reason, 'manual', null, false);
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, nextQty, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Stock adjustment failed' });
  }
});

// Sales / POS bill creation
app.post('/api/sales', (req, res) => {
  const parsed = z.object({
    customer_name: z.string().default('Walk-in Customer'),
    customer_sublabel: z.string().default('Counter Quick Bill'),
    payment_mode: z.string().default('Cash'),
    items: z.array(z.object({ product_id: z.number().int().positive(), quantity: z.number().positive() })).min(1),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid sale items' });
    return;
  }

  try {
    const saleRes = recordSaleTransaction(parsed.data);
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, billNo: saleRes.billNo, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to record sale' });
  }
});

// Purchase orders & Approvals
app.post('/api/purchase-orders', (req, res) => {
  const parsed = z.object({
    supplier_id: z.number().int().positive(),
    product_id: z.number().int().positive(),
    quantity: z.number().positive(),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid purchase order request' });
    return;
  }
  try {
    const po = createApprovalAndPO(parsed.data.supplier_id, parsed.data.product_id, parsed.data.quantity, 'Merchant Dashboard');
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, ...po, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to draft purchase order' });
  }
});

app.post('/api/purchase-orders/auto-draft-low', (_req, res) => {
  const lowItems = getLowStockItems();
  const drafted: any[] = [];
  for (const item of lowItems) {
    const supplierId = getBestSupplierForProduct(item.id);
    const qty = Math.max(item.reorder_level * 2 - item.stock_qty, 10);
    drafted.push(createApprovalAndPO(supplierId, item.id, qty, 'Auto-Replenish'));
  }
  emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
  res.json({ ok: true, count: drafted.length, drafted, snapshot: getDashboardSnapshot() });
});

app.post('/api/purchase-orders/:id/receive', (req, res) => {
  try {
    const poId = Number(req.params.id);
    receivePurchaseOrder(poId);
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to mark PO received' });
  }
});

app.post('/api/purchase-orders/:id/pay', (req, res) => {
  try {
    const poId = Number(req.params.id);
    const mode = String(req.body?.payment_mode || 'UPI');
    const po = getDashboardSnapshot().purchaseOrders.find((p) => p.id === poId);
    if (!po) {
      res.status(404).json({ error: 'Purchase order not found' });
      return;
    }
    const paid = payPurchaseOrder(po.po_number, mode);
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, po: paid, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to record PO payment' });
  }
});

app.post('/api/approvals/:id/confirm', (req, res) => {
  try {
    const payload = resolveApproval(req.params.id, 'approved');
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, payload, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to confirm approval' });
  }
});

app.post('/api/approvals/:id/cancel', (req, res) => {
  try {
    const payload = resolveApproval(req.params.id, 'cancelled');
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, payload, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Failed to cancel approval' });
  }
});

// Khata & Reminders
app.post('/api/khata/:id/payment', (req, res) => {
  const parsed = z.object({ amount: z.number().positive() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid payment amount' });
    return;
  }
  try {
    recordKhataPayment(Number(req.params.id), parsed.data.amount);
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Customer not found' });
  }
});

app.post('/api/reminders', (req, res) => {
  const parsed = z.object({
    type: z.enum(['payment', 'delivery', 'restock', 'task']).default('payment'),
    title: z.string().min(2),
    description: z.string().default(''),
    party_name: z.string().min(1),
    amount: z.number().min(0).default(0),
    channel: z.enum(['whatsapp', 'voice', 'app']).default('whatsapp'),
  }).safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid reminder details' });
    return;
  }
  createReminder(parsed.data);
  emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
  res.json({ ok: true, snapshot: getDashboardSnapshot() });
});

app.post('/api/reminders/:id/action', (req, res) => {
  try {
    const action = req.body?.action === 'snooze' ? 'snooze' : 'complete';
    actionReminder(Number(req.params.id), action);
    emitDashboardEvent({ type: 'snapshot_updated', source: 'ui' });
    res.json({ ok: true, snapshot: getDashboardSnapshot() });
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Reminder not found' });
  }
});

async function startServer() {
  const PORT = 3000;
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`VaaniBiz server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
