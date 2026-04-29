/* ═══════════════════════════════════════════════════════════
   app.js  —  Adarsh General Store · User Storefront Logic
   Depends on: supabase.js (db), email.js (sendOrderEmail)
═══════════════════════════════════════════════════════════ */

/* ── Initialise EmailJS ───────────────────────────────── */
initEmail(); // defined in email.js

/* ══════════════════════════════════════════════════════════
   CART — persisted to localStorage
══════════════════════════════════════════════════════════ */
let cart = [];

function cartLoad() {
  try { cart = JSON.parse(localStorage.getItem("ags_cart") || "[]"); } catch { cart = []; }
}
function cartSave() {
  localStorage.setItem("ags_cart", JSON.stringify(cart));
}
function cartAdd(item) {
  const idx = cart.findIndex(c => c.productId === item.productId && c.variantName === item.variantName);
  if (idx > -1) { cart[idx].qty += 1; }
  else           { cart.push({ ...item, qty: 1 }); }
  cartSave();
  renderCartBadge();
}
function cartRemove(idx) {
  cart.splice(idx, 1);
  cartSave();
  renderCartBadge();
  renderCartItems();
}
function cartChangeQty(idx, delta) {
  cart[idx].qty += delta;
  if (cart[idx].qty <= 0) { cartRemove(idx); return; }
  cartSave();
  renderCartBadge();
  renderCartItems();
}
function cartTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}
function cartClear() {
  cart = [];
  cartSave();
  renderCartBadge();
}

/* ══════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════ */
let allProducts  = [];
let allCategories = [];
let activeCatId  = "all";
let searchQuery  = "";

/* active product for modal */
let modalProduct  = null;
let modalVariant  = null;

/* ══════════════════════════════════════════════════════════
   DATA FETCHING
══════════════════════════════════════════════════════════ */
async function fetchCategories() {
  const { data, error } = await db.from("categories").select("*").order("name");
  if (error) { console.error("fetchCategories:", error.message); return; }
  allCategories = data || [];
  renderCategoryBar();
}

async function fetchProducts() {
  showProductsLoading();
  const { data, error } = await db
    .from("products")
    .select("*, categories(name)")
    .order("name");
  if (error) {
    console.error("fetchProducts:", error.message);
    showProductsError(error.message);
    return;
  }
  allProducts = data || [];
  applyFilters();
}

/* ══════════════════════════════════════════════════════════
   FILTERING / SEARCH
══════════════════════════════════════════════════════════ */
function applyFilters() {
  let list = [...allProducts];

  if (activeCatId !== "all") {
    list = list.filter(p => p.category_id === activeCatId);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.description || "").toLowerCase().includes(q));
  }

  const catName = activeCatId === "all"
    ? "All Products"
    : (allCategories.find(c => c.id === activeCatId)?.name || "Products");

  const title = searchQuery.trim()
    ? `Results for "${searchQuery.trim()}"`
    : catName;

  document.getElementById("section-title").textContent = title;
  document.getElementById("product-count").textContent = `${list.length} item${list.length !== 1 ? "s" : ""}`;

  renderProductGrid(list);
}

/* ══════════════════════════════════════════════════════════
   RENDER — CATEGORY BAR
══════════════════════════════════════════════════════════ */
function renderCategoryBar() {
  const list = document.getElementById("category-list");
  /* keep "All Items" button, remove old cats */
  const allBtn = list.querySelector('[data-id="all"]');
  list.innerHTML = "";
  list.appendChild(allBtn);

  allCategories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "cat-btn";
    btn.dataset.id = cat.id;
    btn.textContent = cat.name;
    btn.addEventListener("click", () => selectCategory(cat.id));
    list.appendChild(btn);
  });
}

function selectCategory(id) {
  activeCatId = id;
  document.querySelectorAll(".cat-btn").forEach(b => b.classList.toggle("active", b.dataset.id === id));
  applyFilters();
}

/* ══════════════════════════════════════════════════════════
   RENDER — PRODUCT GRID
══════════════════════════════════════════════════════════ */
function showProductsLoading() {
  document.getElementById("products-container").innerHTML =
    `<div class="spinner-wrap"><div class="spinner"></div></div>`;
}
function showProductsError(msg) {
  document.getElementById("products-container").innerHTML =
    `<div class="state-box"><div class="state-icon">⚠️</div><p>${msg}</p></div>`;
}

function renderProductGrid(products) {
  const container = document.getElementById("products-container");
  if (!products.length) {
    container.innerHTML =
      `<div class="state-box"><div class="state-icon">🔍</div><p>No products found.</p></div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "product-grid";

  products.forEach(p => {
    const variants = parseVariants(p.variants);
    const lowestPrice = variants.length ? Math.min(...variants.map(v => v.price)) : (p.baseprice || 0);
    const catName = p.categories?.name || "";

    const card = document.createElement("div");
    card.className = "product-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `View ${p.name}`);

    const imgHtml = p.imageurl
      ? `<img class="product-card-img" src="${escHtml(p.imageurl)}" alt="${escHtml(p.name)}" loading="lazy"/>`
      : `<div class="product-card-img-placeholder">🥬</div>`;

    card.innerHTML = `
      ${imgHtml}
      <div class="product-card-body">
        ${catName ? `<div class="product-card-category">${escHtml(catName)}</div>` : ""}
        <div class="product-card-name">${escHtml(p.name)}</div>
        <div class="product-card-desc">${escHtml(p.description || "")}</div>
        <div class="product-card-price">
          ₹${lowestPrice.toLocaleString("en-IN")}
          ${variants.length ? "<small> onwards</small>" : ""}
        </div>
        <button class="product-card-btn">View Details</button>
      </div>`;

    card.querySelector(".product-card-btn").addEventListener("click", e => { e.stopPropagation(); openProductModal(p); });
    card.addEventListener("click", () => openProductModal(p));
    card.addEventListener("keydown", e => { if (e.key === "Enter") openProductModal(p); });

    grid.appendChild(card);
  });

  container.innerHTML = "";
  container.appendChild(grid);
}

/* ══════════════════════════════════════════════════════════
   PRODUCT DETAIL MODAL
══════════════════════════════════════════════════════════ */
function openProductModal(product) {
  modalProduct = product;
  const variants = parseVariants(product.variants);
  modalVariant  = variants.length ? variants[0] : null;

  renderProductModal();
  document.getElementById("product-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function renderProductModal() {
  const p       = modalProduct;
  const variants = parseVariants(p.variants);
  const price   = modalVariant ? modalVariant.price : (p.baseprice || 0);
  const catName = p.categories?.name || "";

  const imgHtml = p.imageurl
    ? `<img class="modal-prod-img" src="${escHtml(p.imageurl)}" alt="${escHtml(p.name)}"/>`
    : `<div class="modal-prod-img-placeholder">🥬</div>`;

  let variantsHtml = "";
  if (variants.length) {
    const chips = variants.map((v, i) =>
      `<button class="variant-chip ${i === 0 ? "active" : ""}" data-idx="${i}">${escHtml(v.name)} — ₹${v.price.toLocaleString("en-IN")}</button>`
    ).join("");
    variantsHtml = `<div class="variant-label">Choose variant:</div><div class="variant-chips">${chips}</div>`;
  }

  document.getElementById("product-modal-content").innerHTML = `
    ${imgHtml}
    ${catName ? `<div class="modal-prod-category">${escHtml(catName)}</div>` : ""}
    <h2 class="modal-prod-name">${escHtml(p.name)}</h2>
    <p class="modal-prod-desc">${escHtml(p.description || "")}</p>
    <div class="modal-prod-price" id="modal-price-display">₹${price.toLocaleString("en-IN")}</div>
    ${variantsHtml}
    <button class="add-cart-btn" id="modal-add-cart-btn">🛒 Add to Cart</button>
  `;

  /* Variant chip events */
  document.querySelectorAll(".variant-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const idx = +chip.dataset.idx;
      modalVariant = variants[idx];
      document.getElementById("modal-price-display").textContent =
        `₹${modalVariant.price.toLocaleString("en-IN")}`;
      document.querySelectorAll(".variant-chip").forEach(c => c.classList.toggle("active", c === chip));
    });
  });

  document.getElementById("modal-add-cart-btn").addEventListener("click", () => {
    const price = modalVariant ? modalVariant.price : (modalProduct.baseprice || 0);
    cartAdd({
      productId:   modalProduct.id,
      name:        modalProduct.name,
      imageUrl:    modalProduct.imageurl || null,
      price,
      variantName: modalVariant ? modalVariant.name : null,
    });
    closeProductModal();
    showToast(`✅ "${modalProduct.name}" added to cart!`);
  });
}

function closeProductModal() {
  document.getElementById("product-modal").style.display = "none";
  document.body.style.overflow = "";
}

/* ══════════════════════════════════════════════════════════
   CART SIDEBAR
══════════════════════════════════════════════════════════ */
function openCart() {
  renderCartItems();
  document.getElementById("cart-overlay").style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closeCart() {
  document.getElementById("cart-overlay").style.display = "none";
  document.body.style.overflow = "";
}

function renderCartBadge() {
  const total = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById("cart-count").textContent = total;
}

function renderCartItems() {
  const container = document.getElementById("cart-items-container");
  const foot      = document.getElementById("cart-foot");

  if (!cart.length) {
    container.innerHTML =
      `<div class="cart-empty"><span>🛒</span>Your cart is empty.<br/>Add some items!</div>`;
    foot.style.display = "none";
    return;
  }

  foot.style.display = "block";
  document.getElementById("cart-total-display").textContent =
    `₹${cartTotal().toLocaleString("en-IN")}`;

  container.innerHTML = cart.map((item, i) => {
    const imgHtml = item.imageUrl
      ? `<img class="cart-item-img" src="${escHtml(item.imageUrl)}" alt="${escHtml(item.name)}"/>`
      : `<div class="cart-item-img-placeholder">🥬</div>`;

    return `
      <div class="cart-item">
        ${imgHtml}
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          ${item.variantName ? `<div class="cart-item-variant">${escHtml(item.variantName)}</div>` : ""}
          <div class="cart-item-price">₹${(item.price * item.qty).toLocaleString("en-IN")}</div>
          <div class="qty-row">
            <button class="qty-btn" data-action="dec" data-idx="${i}">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-idx="${i}">+</button>
          </div>
        </div>
        <button class="cart-remove" data-action="remove" data-idx="${i}" aria-label="Remove">🗑️</button>
      </div>`;
  }).join("");

  /* delegate events */
  container.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", () => {
      const idx    = +el.dataset.idx;
      const action = el.dataset.action;
      if (action === "inc")    cartChangeQty(idx,  1);
      if (action === "dec")    cartChangeQty(idx, -1);
      if (action === "remove") cartRemove(idx);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   CHECKOUT
══════════════════════════════════════════════════════════ */
function openCheckout() {
  if (!cart.length) { showToast("⚠️ Cart is empty!"); return; }

  closeCart();

  /* fill summary */
  const total = cartTotal();
  document.getElementById("checkout-item-lines").innerHTML = cart.map(item =>
    `<div class="order-line">
      <span>${escHtml(item.name)}${item.variantName ? ` (${escHtml(item.variantName)})` : ""} × ${item.qty}</span>
      <span>₹${(item.price * item.qty).toLocaleString("en-IN")}</span>
    </div>`
  ).join("");
  document.getElementById("checkout-grand-total").textContent = `₹${total.toLocaleString("en-IN")}`;
  document.getElementById("order-status-msg").textContent = "";
  document.getElementById("order-status-msg").className   = "order-status";

  document.getElementById("checkout-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}
function closeCheckout() {
  document.getElementById("checkout-modal").style.display = "none";
  document.body.style.overflow = "";
}

async function placeOrder() {
  const name    = document.getElementById("c-name").value.trim();
  const phone   = document.getElementById("c-phone").value.trim();
  const address = document.getElementById("c-address").value.trim();
  const pincode = document.getElementById("c-pincode").value.trim();

  if (!name || !phone || !address || !pincode) {
    setOrderStatus("⚠️ Please fill in all fields.", "err"); return;
  }
  if (!/^\d{10}$/.test(phone)) {
    setOrderStatus("⚠️ Enter a valid 10-digit phone number.", "err"); return;
  }
  if (!/^\d{6}$/.test(pincode)) {
    setOrderStatus("⚠️ Enter a valid 6-digit pincode.", "err"); return;
  }

  const btn = document.getElementById("place-order-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Sending order…";
  setOrderStatus("", "");

  try {
    await sendOrderEmail({ name, phone, address, pincode }, cart, cartTotal());
    setOrderStatus("🎉 Order placed! We'll call you to confirm delivery.", "ok");
    cartClear();
    btn.textContent = "✅ Order Placed!";

    setTimeout(() => {
      closeCheckout();
      btn.disabled    = false;
      btn.textContent = "✅ Place Order (Cash on Delivery)";
    }, 4000);

  } catch (err) {
    console.error("EmailJS error:", err);
    setOrderStatus("❌ Could not send order. Please call us directly.", "err");
    btn.disabled    = false;
    btn.textContent = "✅ Place Order (Cash on Delivery)";
  }
}

function setOrderStatus(msg, cls) {
  const el = document.getElementById("order-status-msg");
  el.textContent = msg;
  el.className   = `order-status ${cls}`;
}

/* ══════════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════════ */
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ══════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════ */
function parseVariants(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try { return JSON.parse(raw); } catch { return []; }
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ══════════════════════════════════════════════════════════
   EVENT WIRING
══════════════════════════════════════════════════════════ */
function wireEvents() {
  /* Category — "All Items" button */
  document.querySelector('[data-id="all"]').addEventListener("click", () => selectCategory("all"));

  /* Cart open/close */
  document.getElementById("cart-open-btn").addEventListener("click", openCart);
  document.getElementById("cart-close-btn").addEventListener("click", closeCart);
  document.getElementById("cart-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("cart-overlay")) closeCart();
  });

  /* Checkout open */
  document.getElementById("open-checkout-btn").addEventListener("click", openCheckout);

  /* Checkout modal close */
  document.getElementById("checkout-modal-close").addEventListener("click", closeCheckout);
  document.getElementById("checkout-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("checkout-modal")) closeCheckout();
  });

  /* Place order */
  document.getElementById("place-order-btn").addEventListener("click", placeOrder);

  /* Product modal close */
  document.getElementById("product-modal-close").addEventListener("click", closeProductModal);
  document.getElementById("product-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("product-modal")) closeProductModal();
  });

  /* Search — live filter with debounce */
  let _searchTimer;
  document.getElementById("search-input").addEventListener("input", e => {
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      searchQuery = e.target.value;
      applyFilters();
    }, 260);
  });

  /* Keyboard — Escape closes modals */
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    closeProductModal();
    closeCart();
    closeCheckout();
  });
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
(async function init() {
  cartLoad();
  renderCartBadge();
  wireEvents();
  await fetchCategories();
  await fetchProducts();
})();
