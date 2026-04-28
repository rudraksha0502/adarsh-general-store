// ─────────────────────────────────────────────
//  email.js  —  EmailJS order submission
// ─────────────────────────────────────────────

const EMAIL_SERVICE_ID  = "service_je6d14p";
const EMAIL_TEMPLATE_ID = "template_tum9m4w";
const EMAIL_PUBLIC_KEY  = "Y_K-v20lFfW8kdvPg";

// Initialise EmailJS once (called from HTML after SDK loads)
function initEmail() {
  emailjs.init(EMAIL_PUBLIC_KEY);
}

/**
 * sendOrderEmail
 * @param {Object} customer   - { name, phone, address, pincode }
 * @param {Array}  cartItems  - [{ name, variantName, price, qty }, ...]
 * @param {number} total
 * @returns {Promise<void>}
 */
async function sendOrderEmail(customer, cartItems, total) {
  const itemLines = cartItems
    .map(
      (item) =>
        `• ${item.name}${item.variantName ? " [" + item.variantName + "]" : ""} × ${item.qty}  =  ₹${(item.price * item.qty).toLocaleString("en-IN")}`
    )
    .join("\n");

  const templateParams = {
    customer_name:    customer.name,
    customer_phone:   customer.phone,
    customer_address: customer.address,
    customer_pincode: customer.pincode,
    order_items:      itemLines,
    order_total:      "₹" + total.toLocaleString("en-IN"),
    order_date:       new Date().toLocaleString("en-IN"),
    payment_method:   "Cash on Delivery",
  };

  await emailjs.send(EMAIL_SERVICE_ID, EMAIL_TEMPLATE_ID, templateParams);
}
