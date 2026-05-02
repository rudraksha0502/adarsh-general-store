/* ═══════════════════════════════════════════════════════════
   telegram.js  —  Swift Store · Order Processing
   ─────────────────────────────────────────────────────────
   Replaces email.js completely.
   Responsibilities:
     1. Generate unique Order ID (ORD-<timestamp>-<random>)
     2. Save order to Supabase DB (orders table)
     3. Save order reference to localStorage
     4. Generate PDF invoice (jsPDF — in-browser, no server)
     5. Send PDF to Telegram bot as document (sendDocument)
     6. PDF is never stored — only held in memory as a Blob
═══════════════════════════════════════════════════════════ */

/* ── Telegram credentials ─────────────────────────────── */
const TG_BOT_TOKEN    = "8673630099:AAEG85SZIcTaAn2hSZA3jiK6QxjjbP5CJfE";
const TG_CHAT_ID      = "7992140393";
const TG_API_URL      = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendDocument`;
const TG_MSG_URL      = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;

/* ── Delivery charge config ───────────────────────────── */
const FREE_DELIVERY_THRESHOLD = 500;  // orders >= this get free delivery
const DELIVERY_CHARGE         = 15;   // flat fee for orders below threshold

/**
 * computeDelivery(subtotal)
 * Returns { deliveryCharge, grandTotal, isFree }
 */
function computeDelivery(subtotal) {
  const isFree         = subtotal >= FREE_DELIVERY_THRESHOLD;
  const deliveryCharge = isFree ? 0 : DELIVERY_CHARGE;
  const grandTotal     = subtotal + deliveryCharge;
  return { deliveryCharge, grandTotal, isFree };
}

/* ════════════════════════════════════════════════════════
   generateOrderId
   Returns: "ORD-1718270000000-a3f9b2"
════════════════════════════════════════════════════════ */
function generateOrderId() {
  const ts  = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `ORD-${ts}-${rnd}`;
}

/* ════════════════════════════════════════════════════════
   buildInvoicePdf
   Uses jsPDF (loaded via CDN in index.html).
   Returns a Blob — never written to disk.
════════════════════════════════════════════════════════ */
function buildInvoicePdf(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  const PAGE_W  = 210;
  const MARGIN  = 18;
  const COL_W   = PAGE_W - MARGIN * 2;

  /* ── palette helpers ── */
  const teal    = [26, 107, 107];
  const saffron = [232, 135, 26];
  const dark    = [28, 28, 28];
  const mid     = [90, 90, 90];
  const light   = [200, 200, 200];
  const white   = [255, 255, 255];
  const creamBg = [253, 246, 236];

  let y = 0;

  /* ── Header banner ─────────────────────────────────── */
  doc.setFillColor(...teal);
  doc.rect(0, 0, PAGE_W, 38, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...saffron);
  doc.text("Swift Store", MARGIN, 18);

  doc.setFontSize(9);
  doc.setTextColor(...white);
  doc.setFont("helvetica", "normal");
  doc.text("Cash on Delivery  ·  Fresh Groceries & Everyday Essentials", MARGIN, 26);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text("INVOICE", PAGE_W - MARGIN, 18, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(orderId, PAGE_W - MARGIN, 26, { align: "right" });

  y = 46;

  /* ── Order meta row ────────────────────────────────── */
  doc.setFillColor(...creamBg);
  doc.roundedRect(MARGIN, y, COL_W, 22, 2, 2, "F");

  doc.setFontSize(8.5);
  doc.setTextColor(...mid);
  doc.setFont("helvetica", "normal");

  const dateStr = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  doc.text(`Order ID:`, MARGIN + 4, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text(orderId, MARGIN + 26, y + 7);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mid);
  doc.text(`Date:`, MARGIN + 4, y + 15);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text(dateStr, MARGIN + 26, y + 15);

  doc.setFont("helvetica", "normal");
  doc.setTextColor(...mid);
  doc.text(`Payment:`, PAGE_W / 2 + 4, y + 7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...teal);
  doc.text("Cash on Delivery", PAGE_W / 2 + 26, y + 7);

  y += 30;

  /* ── Customer details ──────────────────────────────── */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(...teal);
  doc.text("BILL TO", MARGIN, y);

  y += 5;
  doc.setDrawColor(...teal);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, MARGIN + 40, y);

  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...dark);
  doc.text(customer.name, MARGIN, y);

  y += 5.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...mid);
  doc.text(`📞 ${customer.phone}`, MARGIN, y);

  y += 5;
  // Wrap long address
  const addrLines = doc.splitTextToSize(`📍 ${customer.address}, ${customer.pincode}`, COL_W * 0.55);
  doc.text(addrLines, MARGIN, y);
  y += addrLines.length * 5 + 4;

  /* ── Items table ───────────────────────────────────── */
  // Table header
  doc.setFillColor(...teal);
  doc.rect(MARGIN, y, COL_W, 9, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...white);

  const C1 = MARGIN + 3;           // Item
  const C2 = MARGIN + COL_W * 0.5; // Variant
  const C3 = MARGIN + COL_W * 0.62;// Qty
  const C4 = MARGIN + COL_W * 0.74;// Unit price
  const C5 = MARGIN + COL_W * 0.86;// Subtotal
  const C5R = MARGIN + COL_W - 2;  // right align

  doc.text("Item",        C1, y + 6);
  doc.text("Variant",     C2, y + 6);
  doc.text("Qty",         C3, y + 6);
  doc.text("Unit",        C4, y + 6);
  doc.text("Amount",      C5R, y + 6, { align: "right" });

  y += 9;

  // Table rows
  cartItems.forEach((item, idx) => {
    const rowH = 8.5;
    const bg   = idx % 2 === 0 ? white : creamBg;

    doc.setFillColor(...bg);
    doc.rect(MARGIN, y, COL_W, rowH, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...dark);

    // truncate long names
    const name = doc.splitTextToSize(item.name, COL_W * 0.46)[0];
    doc.text(name, C1, y + 5.5);
    doc.text(item.variantName ? String(item.variantName).slice(0, 14) : "—", C2, y + 5.5);
    doc.text(String(item.qty), C3, y + 5.5);
    doc.text(`Rs.${item.price.toLocaleString("en-IN")}`, C4, y + 5.5);

    doc.setFont("helvetica", "bold");
    doc.text(`Rs.${(item.price * item.qty).toLocaleString("en-IN")}`, C5R, y + 5.5, { align: "right" });

    y += rowH;
  });

  // Bottom border of table
  doc.setDrawColor(...light);
  doc.setLineWidth(0.3);
  doc.line(MARGIN, y, MARGIN + COL_W, y);

  y += 6;

  /* ── Totals block ──────────────────────────────────── */
  const TOTAL_X = MARGIN + COL_W * 0.55;
  const TOTAL_W = COL_W * 0.45;

  // Subtotal row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...mid);
  doc.text("Subtotal:", TOTAL_X + 2, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...dark);
  doc.text(`Rs.${subtotal.toLocaleString("en-IN")}`, TOTAL_X + TOTAL_W - 2, y, { align: "right" });
  y += 7;

  // Delivery charge row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...mid);
  doc.text("Delivery:", TOTAL_X + 2, y);
  doc.setFont("helvetica", "bold");
  if (deliveryCharge === 0) {
    doc.setTextColor(...teal);
    doc.text("FREE", TOTAL_X + TOTAL_W - 2, y, { align: "right" });
  } else {
    doc.setTextColor(...dark);
    doc.text(`Rs.${deliveryCharge}`, TOTAL_X + TOTAL_W - 2, y, { align: "right" });
  }
  y += 4;

  // Divider
  doc.setDrawColor(...light);
  doc.setLineWidth(0.3);
  doc.line(TOTAL_X, y, TOTAL_X + TOTAL_W, y);
  y += 5;

  // Free delivery note
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...mid);
  const freeNote = deliveryCharge === 0
    ? "✓ Free delivery on orders above Rs.500"
    : `Add Rs.${FREE_DELIVERY_THRESHOLD - subtotal} more for free delivery`;
  doc.text(freeNote, TOTAL_X + 2, y);
  y += 6;

  // Grand total row
  doc.setFillColor(...saffron);
  doc.roundedRect(TOTAL_X - 2, y - 4, TOTAL_W + 2, 12, 2, 2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...white);
  doc.text("Grand Total:", TOTAL_X + 2, y + 4);
  doc.text(`Rs.${grandTotal.toLocaleString("en-IN")}`, TOTAL_X + TOTAL_W - 2, y + 4, { align: "right" });

  y += 18;

  /* ── Footer ────────────────────────────────────────── */
  doc.setFillColor(...teal);
  doc.rect(0, 278, PAGE_W, 20, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...white);
  doc.text("Thank you for shopping at Swift Store!", PAGE_W / 2, 286, { align: "center" });
  doc.text("For queries call us · Cash on Delivery only · © 2025 Swift Store", PAGE_W / 2, 292, { align: "center" });

  return doc.output("blob");
}

/* ════════════════════════════════════════════════════════
   buildOrderTextMessage
   Builds a plain-text SMS-ready order summary for Telegram.
════════════════════════════════════════════════════════ */
function buildOrderTextMessage(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal) {
  const dateStr = new Date().toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  });

  const itemLines = cartItems.map(item => {
    const variant = item.variantName ? ` (${item.variantName})` : "";
    const lineTotal = (item.price * item.qty).toLocaleString("en-IN");
    return `  • ${item.name}${variant} x${item.qty} = Rs.${lineTotal}`;
  }).join("\n");

  const deliveryLine = deliveryCharge === 0
    ? `Delivery:  FREE (order above Rs.${FREE_DELIVERY_THRESHOLD})`
    : `Delivery:  Rs.${deliveryCharge}`;

  return (
`📦 *NEW ORDER — Swift Store*
━━━━━━━━━━━━━━━━━━━━━━━━
🆔 Order ID: ${orderId}
📅 Date: ${dateStr}

👤 *Customer Details*
Name:     ${customer.name}
Phone:    ${customer.phone}
Address:  ${customer.address}
Pincode:  ${customer.pincode}

🛒 *Items Ordered*
${itemLines}

💰 *Bill Summary*
Subtotal:  Rs.${subtotal.toLocaleString("en-IN")}
${deliveryLine}
*Grand Total:  Rs.${grandTotal.toLocaleString("en-IN")}*

💳 Payment: Cash on Delivery
━━━━━━━━━━━━━━━━━━━━━━━━
📲 _Copy above for SMS to customer_`
  );
}

/* ════════════════════════════════════════════════════════
   sendPdfToTelegram
   Sends the PDF Blob directly to Telegram via sendDocument.
   The Blob is created in memory and never persisted.
════════════════════════════════════════════════════════ */
async function sendPdfToTelegram(pdfBlob, orderId, textCaption) {
  const formData = new FormData();
  formData.append("chat_id",  TG_CHAT_ID);
  formData.append("document", pdfBlob, `Invoice-${orderId}.pdf`);
  formData.append("caption",  `📦 New Order: ${orderId}`);

  const res = await fetch(TG_API_URL, { method: "POST", body: formData });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Telegram API error ${res.status}: ${text}`);
  }
  return await res.json();
}

/* ════════════════════════════════════════════════════════
   sendTextToTelegram
   Sends the plain-text order summary as a Telegram message
   (Markdown formatted, easy to copy and SMS to customer).
════════════════════════════════════════════════════════ */
async function sendTextToTelegram(text) {
  const body = JSON.stringify({
    chat_id:    TG_CHAT_ID,
    text:       text,
    parse_mode: "Markdown",
  });
  const res = await fetch(TG_MSG_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body,
  });
  if (!res.ok) {
    const errText = await res.text();
    console.warn(`Telegram text message error ${res.status}: ${errText}`);
    // Non-fatal — PDF already sent, just log warning
  }
}

/* ════════════════════════════════════════════════════════
   saveOrderToDb
   Saves order record to Supabase `orders` table.
   Schema expected:
     id (text, PK) | customer_name | customer_phone |
     customer_address | customer_pincode |
     items (jsonb) | total (numeric) |
     created_at (timestamptz, default now())
════════════════════════════════════════════════════════ */
async function saveOrderToDb(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal) {
  const { error } = await db.from("orders").insert([{
    id:               orderId,
    customer_name:    customer.name,
    customer_phone:   customer.phone,
    customer_address: customer.address,
    customer_pincode: customer.pincode,
    items:            cartItems,
    subtotal:         subtotal,
    delivery_charge:  deliveryCharge,
    total:            grandTotal,
  }]);
  if (error) throw new Error(error.message);
}

/* ════════════════════════════════════════════════════════
   saveOrderToLocalStorage
   Appends a lightweight reference to "swift_orders" key.
   Used by "My Orders" view — no sensitive data.
════════════════════════════════════════════════════════ */
function saveOrderToLocalStorage(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal) {
  let orders = [];
  try { orders = JSON.parse(localStorage.getItem("swift_orders") || "[]"); } catch { orders = []; }

  orders.unshift({
    id:             orderId,
    name:           customer.name,
    phone:          customer.phone,
    address:        customer.address,
    pincode:        customer.pincode,
    items:          cartItems,
    subtotal:       subtotal,
    deliveryCharge: deliveryCharge,
    total:          grandTotal,
    placedAt:       new Date().toISOString(),
    status:         "pending",
  });

  localStorage.setItem("swift_orders", JSON.stringify(orders));
}

/* ════════════════════════════════════════════════════════
   placeOrderAndNotify  (main entry point called by app.js)
   Full order pipeline:
     1. Compute delivery charge based on subtotal
     2. Generate Order ID
     3. Save to DB (with subtotal, delivery_charge, total)
     4. Save to localStorage
     5. Build PDF in memory
     6. Send PDF to Telegram as document
     7. Send plain-text order summary to Telegram (SMS-ready)
     8. PDF Blob is GC'd automatically
════════════════════════════════════════════════════════ */
async function placeOrderAndNotify(customer, cartItems, subtotal) {
  // Step 1: Compute delivery
  const { deliveryCharge, grandTotal, isFree } = computeDelivery(subtotal);

  const orderId = generateOrderId();

  // Step 2 & 3: DB save
  await saveOrderToDb(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal);

  // Step 4: localStorage save
  saveOrderToLocalStorage(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal);

  // Step 5: Build PDF (in-memory Blob only)
  const pdfBlob = buildInvoicePdf(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal);

  // Step 6: Build text message
  const textMsg = buildOrderTextMessage(orderId, customer, cartItems, subtotal, deliveryCharge, grandTotal);

  // Step 7: Send PDF to Telegram
  await sendPdfToTelegram(pdfBlob, orderId);

  // Step 8: Send text summary to Telegram (non-fatal if fails)
  await sendTextToTelegram(textMsg);

  return orderId;
}
