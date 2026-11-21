import type { PurchaseOrderRecord, PoItemRecord, SaleItemRecord, SaleRecord } from './db.ts';

function escapePdfText(input: string): string {
  return input
    .replace(/₹/g, 'Rs. ')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function wrapLine(text: string, maxChars = 76): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if ((current + ' ' + w).trim().length > maxChars) {
      if (current) lines.push(current);
      current = w;
    } else {
      current = (current + ' ' + w).trim();
    }
  }
  if (current) lines.push(current);
  return lines;
}

function buildSimplePdf(lines: { text: string; bold?: boolean; size?: number }[]): Buffer {
  const ops: string[] = ['BT'];
  let y = 780;

  for (const line of lines) {
    if (y < 52) break;
    const size = line.size || 10;
    const font = line.bold ? '/F2' : '/F1';
    const safe = escapePdfText(line.text);
    ops.push(`${font} ${size} Tf`);
    ops.push(`1 0 0 1 48 ${y} Tm`);
    ops.push(`(${safe}) Tj`);
    y -= size + 6;
  }
  ops.push('ET');

  const streamContent = ops.join('\n');
  const objects: string[] = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>\nendobj\n',
    `4 0 obj\n<< /Length ${Buffer.byteLength(streamContent, 'utf8')} >>\nstream\n${streamContent}\nendstream\nendobj\n`,
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    '6 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'utf8'));
    pdf += obj;
  }

  const xrefOffset = Buffer.byteLength(pdf, 'utf8');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, 'utf8');
}

export function generateSaleInvoicePdf(params: {
  shopName: string;
  storeCode: string;
  location: string;
  sale: SaleRecord;
  items: SaleItemRecord[];
}): { buffer: Buffer; filename: string } {
  const { shopName, storeCode, location, sale, items } = params;
  const dateStr = new Date(sale.created_at).toLocaleString('en-IN');

  const lines: { text: string; bold?: boolean; size?: number }[] = [
    { text: `${shopName.toUpperCase()} - TAX INVOICE`, bold: true, size: 15 },
    { text: `Store Code: ${storeCode} | Location: ${location} | GSTIN: 29AABCS1429B1Z5`, size: 9 },
    { text: '------------------------------------------------------------------------------', size: 9 },
    { text: `Invoice No: ${sale.bill_no}        Date: ${dateStr}`, bold: true, size: 10 },
    { text: `Customer: ${sale.customer_name} (${sale.customer_sublabel || 'Counter'})`, size: 10 },
    { text: `Payment Mode: ${sale.payment_mode}    Status: ${sale.payment_status.toUpperCase()}`, size: 10 },
    { text: '------------------------------------------------------------------------------', size: 9 },
    { text: 'ITEM                                      QTY      RATE        TOTAL (INR)', bold: true, size: 9 },
    { text: '------------------------------------------------------------------------------', size: 9 },
  ];

  if (items.length > 0) {
    for (const item of items) {
      const name = item.product_name.slice(0, 38).padEnd(40, ' ');
      const qty = String(item.quantity).padStart(5, ' ');
      const rate = `Rs.${item.unit_price.toFixed(0)}`.padStart(9, ' ');
      const total = `Rs.${item.line_total.toLocaleString('en-IN')}`.padStart(12, ' ');
      lines.push({ text: `${name} ${qty} ${rate} ${total}`, size: 9 });
    }
  } else {
    for (const chunk of wrapLine(`Items: ${sale.cart_summary}`, 74)) {
      lines.push({ text: chunk, size: 9 });
    }
  }

  lines.push({ text: '------------------------------------------------------------------------------', size: 9 });
  const taxable = Math.round(sale.total_amount / 1.05);
  const gst = sale.total_amount - taxable;
  lines.push({ text: `Taxable Value: Rs. ${taxable.toLocaleString('en-IN')}`, size: 10 });
  lines.push({ text: `Included GST (5%): Rs. ${gst.toLocaleString('en-IN')}`, size: 10 });
  lines.push({ text: `GRAND TOTAL: Rs. ${sale.total_amount.toLocaleString('en-IN')}`, bold: true, size: 13 });
  lines.push({ text: '------------------------------------------------------------------------------', size: 9 });

  if (sale.voice_transcript) {
    for (const chunk of wrapLine(`Voice Command Log: "${sale.voice_transcript}"`, 74)) {
      lines.push({ text: chunk, size: 8 });
    }
  }
  lines.push({ text: 'Generated automatically by VaaniBiz Agora Voice AI Operations Engine', size: 8 });

  const safeRef = sale.bill_no.replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    buffer: buildSimplePdf(lines),
    filename: `VaaniBiz-Invoice-${safeRef}.pdf`,
  };
}

export function generatePurchaseOrderInvoicePdf(params: {
  shopName: string;
  storeCode: string;
  location: string;
  po: PurchaseOrderRecord;
  items: PoItemRecord[];
}): { buffer: Buffer; filename: string } {
  const { shopName, storeCode, location, po, items } = params;
  const dateStr = new Date(po.created_at).toLocaleString('en-IN');

  const lines: { text: string; bold?: boolean; size?: number }[] = [
    { text: `${shopName.toUpperCase()} - PURCHASE ORDER INVOICE`, bold: true, size: 15 },
    { text: `Buyer Store: ${shopName} (${storeCode}, ${location})`, size: 9 },
    { text: '------------------------------------------------------------------------------', size: 9 },
    { text: `PO Number: ${po.po_number}        Date: ${dateStr}`, bold: true, size: 10 },
    { text: `Supplier: ${po.supplier_name} (${po.supplier_location})`, size: 10 },
    { text: `Order Status: ${po.status.toUpperCase()} | Payment: ${po.payment_status.toUpperCase()} (${po.payment_mode})`, bold: true, size: 10 },
    { text: `Created Via: ${po.created_via}`, size: 9 },
    { text: '------------------------------------------------------------------------------', size: 9 },
    { text: 'ITEM                                      QTY      COST        TOTAL (INR)', bold: true, size: 9 },
    { text: '------------------------------------------------------------------------------', size: 9 },
  ];

  if (items.length > 0) {
    for (const item of items) {
      const name = item.product_name.slice(0, 38).padEnd(40, ' ');
      const qty = String(item.quantity).padStart(5, ' ');
      const rate = `Rs.${item.unit_cost.toFixed(0)}`.padStart(9, ' ');
      const total = `Rs.${item.line_total.toLocaleString('en-IN')}`.padStart(12, ' ');
      lines.push({ text: `${name} ${qty} ${rate} ${total}`, size: 9 });
    }
  } else {
    for (const chunk of wrapLine(`Breakdown: ${po.line_summary}`, 74)) {
      lines.push({ text: chunk, size: 9 });
    }
  }

  lines.push({ text: '------------------------------------------------------------------------------', size: 9 });
  lines.push({ text: `Notes: ${po.gst_hsn_note || 'Standard Wholesale GST'}`, size: 9 });
  lines.push({ text: `Delivery: ${po.delivery_note}`, size: 9 });
  lines.push({ text: `TOTAL ORDER AMOUNT: Rs. ${po.total_amount.toLocaleString('en-IN')}`, bold: true, size: 13 });
  lines.push({ text: '------------------------------------------------------------------------------', size: 9 });
  lines.push({ text: 'Generated automatically by VaaniBiz Agora Voice AI Operations Engine', size: 8 });

  const safeRef = po.po_number.replace(/[^a-zA-Z0-9_-]/g, '');
  return {
    buffer: buildSimplePdf(lines),
    filename: `VaaniBiz-PO-${safeRef}.pdf`,
  };
}
