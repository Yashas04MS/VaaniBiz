import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initDatabase,
  getDashboardSnapshot,
  createApprovalAndPO,
  payPurchaseOrder,
  recordSaleTransaction,
  findPurchaseOrderByRef,
  findSaleByRef,
  applyStockMovement,
  updateProfile,
} from './db.ts';
import { generatePurchaseOrderInvoicePdf, generateSaleInvoicePdf } from './invoice.ts';
import { sanitizeModelName, getCandidateModels, isVertexExpressKey } from './geminiClient.ts';

test('geminiClient helpers sanitize models and detect Vertex keys cleanly', () => {
  assert.equal(sanitizeModelName('models/gemini-4-hydrogen'), 'gemini-4-hydrogen');
  assert.equal(sanitizeModelName('AQ.Abc123SecretKey'), '');
  assert.equal(sanitizeModelName('AIzaSyFakeKey'), '');
  assert.equal(isVertexExpressKey('AQ.TestKey'), true);
  assert.equal(isVertexExpressKey('AIzaSyTestKey'), false);
  const chatModels = getCandidateModels('chat');
  assert.ok(chatModels.includes('gemini-4-hydrogen'));
  assert.ok(chatModels.includes('gemini-3.1-flash-lite'));
});

test('in-memory ledger supports end-to-end PO placement, UPI payment, stock movement, and PDF invoice generation', () => {
  initDatabase();
  const initialSnap = getDashboardSnapshot();
  assert.ok(initialSnap.products.length >= 10);

  const poRes = createApprovalAndPO(1, 2, 50, 'Agora Voice AI', true);
  assert.equal(poRes.status, 'dispatched');
  assert.ok(poRes.poNumber.startsWith('#PO-'));

  const paid = payPurchaseOrder(poRes.poNumber, 'UPI');
  assert.equal(paid.payment_status, 'paid');
  assert.equal(paid.payment_mode, 'UPI');

  const foundPo = findPurchaseOrderByRef(poRes.poNumber);
  assert.ok(foundPo);
  const poPdf = generatePurchaseOrderInvoicePdf({
    shopName: initialSnap.profile.shop_name,
    storeCode: initialSnap.profile.store_code,
    location: initialSnap.profile.location,
    po: foundPo.po,
    items: foundPo.items,
  });
  assert.ok(poPdf.buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-1.4'));
  assert.ok(poPdf.filename.endsWith('.pdf'));

  const sugarBefore = getDashboardSnapshot().products.find((p) => p.id === 2)!;
  const nextQty = applyStockMovement(2, 10, 'Test restock', 'voice', 'sess-test', false);
  assert.equal(nextQty, sugarBefore.stock_qty + 10);

  const saleRes = recordSaleTransaction({
    customer_name: 'Ramesh',
    payment_mode: 'UPI PhonePe',
    items: [{ product_id: 2, quantity: 2 }],
  });
  assert.ok(saleRes.billNo.startsWith('#POS-'));

  const foundSale = findSaleByRef(saleRes.billNo);
  assert.ok(foundSale);
  const salePdf = generateSaleInvoicePdf({
    shopName: initialSnap.profile.shop_name,
    storeCode: initialSnap.profile.store_code,
    location: initialSnap.profile.location,
    sale: foundSale.sale,
    items: foundSale.items,
  });
  assert.ok(salePdf.buffer.subarray(0, 8).toString('ascii').startsWith('%PDF-1.4'));

  const updatedProfile = updateProfile({ preferred_language: 'hi' });
  assert.equal(updatedProfile.preferred_language, 'hi');
  updateProfile({ preferred_language: 'en' });
});
