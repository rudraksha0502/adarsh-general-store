/* ============================================================
   ADARSH GENERAL STORE - app.js
   Handles: Supabase fetch, product display, cart, checkout, EmailJS
   ============================================================ */

// ============================================================
// ⚙️ CONFIGURATION — REPLACE THESE WITH YOUR OWN VALUES
// ============================================================
const SUPABASE_URL    = 'YOUR_SUPABASE_URL';         // e.g. https://xyzxyz.supabase.co
const SUPABASE_ANON   = 'YOUR_SUPABASE_ANON_KEY';   // Found in Supabase > Settings > API
const EMAILJS_SERVICE = 'YOUR_EMAILJS_SERVICE_ID';  // EmailJS Service ID
const EMAILJS_TEMPLATE= 'YOUR_EMAILJS_TEMPLATE_ID'; // EmailJS Template ID
const EMAILJS_PUBLIC  = 'YOUR_EMAILJS_PUBLIC_KEY';  // EmailJS Public Key
// ============================================================

// Init Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Init EmailJS
emailjs.init(EMAILJS_PUBLIC);

// ============================================================
// STATE
// ============================================================
let allProducts   = [];   // All products from DB
let allCategories = [];   // All categories from DB
let filteredProds = [];   // Currently shown products
let cart          = JSON.parse(localStorage.getItem('ags_cart') || '[]'); // Persisted cart
let selectedCategory = 'all';
let searchQuery      = '';

// ============================================================
// BOOT — fetch everything on page load
// ============================================================
window.addEventListener('DOMContentLoaded', async () => {
  await fetchCategories();
  await fetchProducts();
  renderCartUI();
});

// ============================================================
// FETCH CATEGORIES
// ============================================================
async function fetchCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name');

  if (error) { console.error('Category fetch error:', error); return; }
  allCategories = data || [];
  renderCategoryBar();
}

// ============================================================
// RENDER CATEGORY BAR
// ============================================================
function renderCategoryBar() {
  const bar = document.getElementById('categoryBar');
  // Keep the "All" button, append categories
  bar.innerHTML = `<button class="cat-btn active" onclick="filterByCategory('all', this)">All</button>`;
  allCategories.forEach(cat => {
    bar.innerHTML += `
      <button class="cat-btn" onclick="filterByCategory('${cat.id}', this)">
        ${cat.name}
      </button>`;
  });
}

// ============================================================
// FETCH PRODUCTS
// ============================================================
async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select(`*, categories(name)`)  // join categories
    .order('name');

  if (error) {
    console.error('Product fetch error:', error);
    document.getElementById('productGrid').innerHTML = '<p class="no-products">⚠️ Could not load products.</p>';
    return;
  }

  allProducts = data || [];
  applyFilters();
}

// ============================================================
// FILTER PRODUCTS (search + category)
// ============================================================
function filterByCategory(catId, btn) {
  selectedCategory = catId;
  // Update active button
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

function filterProducts() {
  searchQuery = document.getElementById('searchInput').value.trim().toLowerCase();
  applyFilters();
}

function applyFilters() {
  filteredProds = allProducts.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery) ||
                        (p.description || '').toLowerCase().includes(searchQuery);
    const matchCat = selectedCategory === 'all' || p.category_id === selectedCategory;
    return matchSearch && matchCat;
  });
  renderProducts();
}

// ============================================================
// RENDER PRODUCTS GRID
// ============================================================
function renderProducts() {
  const grid = document.getElementById('productGrid');

  if (filteredProds.length === 0) {
    grid.innerHTML = '<p class="no-products">😕 No products found.</p>';
    return;
  }

  grid.innerHTML = filteredProds.map(p => {
    const catName = p.categories ? p.categories.name : '';
    const price = getBasePrice(p);
    const imgEl = p.imageUrl
      ? `<img src="${p.imageUrl}" alt="${p.name}" loading="lazy" />`
      : `<div class="product-img-placeholder">🛒</div>`;

    return `
      <div class="product-card" onclick="openProductModal('${p.id}')">
        ${imgEl}
        <div class="card-body">
          <div class="card-category">${catName}</div>
          <div class="card-name">${p.name}</div>
          <div class="card-price">₹${price} <span>onwards</span></div>
        </div>
        <button class="add-to-cart-btn" onclick="event.stopPropagation(); quickAddToCart('${p.id}')">
          + Add to Cart
        </button>
      </div>`;
  }).join('');
}

// ============================================================
// PRODUCT MODAL
// ============================================================
function openProductModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const catName = p.categories ? p.categories.name : '';
  const variants = parseVariants(p.variants);
  const hasVariants = variants.length > 0;

  const imgEl = p.imageUrl
    ? `<img class="modal-product-img" src="${p.imageUrl}" alt="${p.name}" />`
    : `<div class="modal-product-img" style="display:flex;align-items:center;justify-content:center;font-size:5rem;background:var(--peach-light);">🛒</div>`;

  const variantsHTML = hasVariants ? `
    <div class="variants-label">Select Variant:</div>
    <div class="variants-grid">
      ${variants.map((v, i) => `
        <button class="variant-btn ${i===0?'selected':''}"
                onclick="selectVariant(this, ${v.price}, '${v.name}')"
                data-price="${v.price}" data-name="${v.name}">
          ${v.name} — ₹${v.price}
        </button>`).join('')}
    </div>` : '';

  // Default price (first variant or base)
  const defaultPrice = hasVariants ? variants[0].price : (p.baseprice || p.basePrice || 0);
  const defaultVariant = hasVariants ? variants[0].name : '';

  document.getElementById('modalContent').innerHTML = `
    ${imgEl}
    <div class="modal-category">${catName}</div>
    <h2 class="modal-name">${p.name}</h2>
    <p class="modal-desc">${p.description || ''}</p>
    <div class="modal-price" id="modalPrice">₹<span id="modalPriceVal">${defaultPrice}</span></div>
    ${variantsHTML}
    <input type="hidden" id="modalVariantName" value="${defaultVariant}" />
    <button class="modal-add-btn" onclick="addToCartFromModal('${p.id}')">
      🛍️ Add to Cart
    </button>
    <span class="modal-close-link" onclick="closeProductModal()">← Back to products</span>
  `;

  document.getElementById('productModal').classList.add('show');
}

function selectVariant(btn, price, name) {
  // Update UI
  document.querySelectorAll('.variant-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  // Update price display
  document.getElementById('modalPriceVal').textContent = price;
  document.getElementById('modalVariantName').value = name;
}

function closeProductModal(event) {
  // Close if clicking overlay, not the box
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('productModal').classList.remove('show');
}

function addToCartFromModal(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const variantName  = document.getElementById('modalVariantName').value;
  const priceEl      = document.getElementById('modalPriceVal');
  const price        = parseFloat(priceEl ? priceEl.textContent : (p.baseprice || p.basePrice || 0));

  addToCart(p, variantName, price);
  closeProductModal();
}

// Quick Add (from card button) — picks first variant or base price
function quickAddToCart(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  const variants = parseVariants(p.variants);
  if (variants.length > 0) {
    addToCart(p, variants[0].name, variants[0].price);
  } else {
    addToCart(p, '', p.baseprice || p.basePrice || 0);
  }
}

// ============================================================
// CART LOGIC
// ============================================================
function addToCart(product, variantName, price) {
  const key = `${product.id}_${variantName}`; // unique key per product+variant
  const existing = cart.find(i => i.key === key);

  if (existing) {
    existing.qty++;
  } else {
    cart.push({
      key,
      id: product.id,
      name: product.name,
      imageUrl: product.imageUrl || '',
      variantName,
      price,
      qty: 1
    });
  }

  saveCart();
  renderCartUI();
  showToast(`✅ "${product.name}" added to cart`, 'success');
}

function removeFromCart(key) {
  cart = cart.filter(i => i.key !== key);
  saveCart();
  renderCartUI();
}

function changeQty(key, delta) {
  const item = cart.find(i => i.key === key);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) { removeFromCart(key); return; }
  saveCart();
  renderCartUI();
}

function saveCart() {
  localStorage.setItem('ags_cart', JSON.stringify(cart));
}

function getCartTotal() {
  return cart.reduce((sum, i) => sum + i.price * i.qty, 0);
}

function renderCartUI() {
  // Update count badge
  const totalItems = cart.reduce((sum, i) => sum + i.qty, 0);
  document.getElementById('cartCount').textContent = totalItems;

  const container = document.getElementById('cartItems');
  const footer    = document.getElementById('cartFooter');

  if (cart.length === 0) {
    container.innerHTML = '<p class="empty-cart">Your cart is empty! 🛒</p>';
    footer.style.display = 'none';
    return;
  }

  footer.style.display = 'flex';
  document.getElementById('cartTotal').textContent = getCartTotal().toFixed(2);

  container.innerHTML = cart.map(item => {
    const imgEl = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${item.name}" />`
      : `<div style="width:60px;height:60px;background:var(--peach-light);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:1.5rem;">🛒</div>`;

    return `
      <div class="cart-item">
        ${imgEl}
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          ${item.variantName ? `<div class="cart-item-variant">${item.variantName}</div>` : ''}
          <div class="cart-item-price">₹${(item.price * item.qty).toFixed(2)}</div>
          <div class="qty-controls">
            <button class="qty-btn" onclick="changeQty('${item.key}', -1)">−</button>
            <span class="qty-num">${item.qty}</span>
            <button class="qty-btn" onclick="changeQty('${item.key}', 1)">+</button>
          </div>
        </div>
        <button class="remove-btn" onclick="removeFromCart('${item.key}')" title="Remove">🗑️</button>
      </div>`;
  }).join('');
}

function toggleCart() {
  const sidebar = document.getElementById('cartSidebar');
  const overlay = document.getElementById('cartOverlay');
  sidebar.classList.toggle('open');
  overlay.classList.toggle('show');
}

// ============================================================
// CHECKOUT
// ============================================================
function openCheckout() {
  if (cart.length === 0) { showToast('Cart is empty!', 'error'); return; }
  toggleCart(); // close cart sidebar first

  // Build order summary
  let summaryHTML = '<h4>Order Summary:</h4>';
  cart.forEach(item => {
    summaryHTML += `
      <div class="order-summary-item">
        <span>${item.name} ${item.variantName ? `(${item.variantName})` : ''} × ${item.qty}</span>
        <span>₹${(item.price * item.qty).toFixed(2)}</span>
      </div>`;
  });
  summaryHTML += `
    <div class="order-summary-total">
      <span>Total</span><span>₹${getCartTotal().toFixed(2)}</span>
    </div>`;

  document.getElementById('orderSummary').innerHTML = summaryHTML;
  document.getElementById('checkoutModal').classList.add('show');
}

function closeCheckoutModal(event) {
  if (event && event.target !== event.currentTarget) return;
  document.getElementById('checkoutModal').classList.remove('show');
}

// ============================================================
// PLACE ORDER — send via EmailJS
// ============================================================
async function placeOrder() {
  const name    = document.getElementById('custName').value.trim();
  const phone   = document.getElementById('custPhone').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const pincode = document.getElementById('custPincode').value.trim();

  // Validation
  if (!name || !phone || !address || !pincode) {
    showToast('Please fill all fields!', 'error'); return;
  }
  if (!/^\d{10}$/.test(phone)) {
    showToast('Enter valid 10-digit phone number!', 'error'); return;
  }
  if (!/^\d{6}$/.test(pincode)) {
    showToast('Enter valid 6-digit pincode!', 'error'); return;
  }

  // Build order text for email
  const orderLines = cart.map(item =>
    `• ${item.name}${item.variantName ? ` (${item.variantName})` : ''} × ${item.qty} = ₹${(item.price * item.qty).toFixed(2)}`
  ).join('\n');

  const totalAmount = getCartTotal().toFixed(2);
  const orderDate   = new Date().toLocaleString('en-IN');

  // EmailJS template params — match these to your EmailJS template variables
  const templateParams = {
    customer_name:    name,
    customer_phone:   phone,
    customer_address: address,
    customer_pincode: pincode,
    order_items:      orderLines,
    order_total:      `₹${totalAmount}`,
    payment_method:   'Cash on Delivery',
    order_date:       orderDate
  };

  // Disable button to prevent double clicks
  const btn = document.getElementById('placeOrderBtn');
  btn.disabled = true;
  btn.textContent = 'Sending order...';

  try {
    await emailjs.send(EMAILJS_SERVICE, EMAILJS_TEMPLATE, templateParams);

    // Success
    cart = [];
    saveCart();
    renderCartUI();
    document.getElementById('checkoutModal').classList.remove('show');
    document.getElementById('successModal').classList.add('show');

    // Clear form
    ['custName','custPhone','custAddress','custPincode'].forEach(id => {
      document.getElementById(id).value = '';
    });

  } catch (err) {
    console.error('EmailJS error:', err);
    showToast('❌ Order failed. Please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '🎉 Place Order (Cash on Delivery)';
  }
}

function closeSuccessModal() {
  document.getElementById('successModal').classList.remove('show');
}

// ============================================================
// HELPERS
// ============================================================
function parseVariants(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v : [];
  } catch { return []; }
}

function getBasePrice(p) {
  const variants = parseVariants(p.variants);
  if (variants.length > 0) return variants[0].price;
  return p.baseprice || p.basePrice || 0;
}

function showToast(msg, type = '') {
  let toast = document.getElementById('globalToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'globalToast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 2800);
}
