/* ═══════════════════════════════════════════════════════════
   app.js  —  Swift Store · User Storefront Logic
   Changes from original:
   • Removed EmailJS — replaced with placeOrderAndNotify()
   • placeOrder() now saves to DB, localStorage, sends PDF to Telegram
   • Added "My Orders" modal (device-based, localStorage)
   • Orders auto-removed from localStorage when delivered
   • All other existing functionality preserved
═══════════════════════════════════════════════════════════ */

/* ══════════════════════════════════════════════════════════
   CART
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
let allProducts   = [];
let allCategories = [];
let activeCatId   = "all";
let searchQuery   = "";

let modalProduct = null;
let modalVariant = null;

/* ── Pull-to-refresh state ────────────────────────────── */
let ptrStartY    = 0;
let ptrDelta     = 0;
let ptrActive    = false;
const PTR_THRESHOLD = 72; // px of drag needed to trigger refresh

/* ── Coupon state ─────────────────────────────────────── */
let appliedCoupon   = null; // { code, discount_type, discount_value }
let allCoupons      = [];   // cached from DB


/* ══════════════════════════════════════════════════════════
   DATA FETCHING
══════════════════════════════════════════════════════════ */
async function fetchCategories() {
  try {
    const { data, error } = await db.from("categories").select("*").order("name");
    if (error) { console.error("fetchCategories error:", error); return; }
    allCategories = data || [];
    renderCategoryTiles();
  } catch (err) {
    console.error("fetchCategories failed:", err);
  }
}

async function fetchProducts() {
  showProductsLoading();
  try {
    // Fetch only the columns the storefront actually needs (speeds up large catalogs)
    const { data, error } = await db
      .from("products")
      .select("id, name, description, imageurl, baseprice, mrp, variants, category_id, out_of_stock, categories(name)")
      .order("name");
    if (error) {
      console.error("fetchProducts error:", error);
      showProductsError("Failed to load products: " + error.message);
      return;
    }
    allProducts = data || [];
    applyFilters();
  } catch (err) {
    console.error("fetchProducts failed:", err);
    showProductsError("Could not connect. Please check your internet and refresh.");
  }
}

/* ── Silent refresh (no spinner flash) used by PTR ───── */
async function refreshData() {
  try {
    const [catRes, prodRes] = await Promise.all([
      db.from("categories").select("*").order("name"),
      db.from("products")
        .select("id, name, description, imageurl, baseprice, mrp, variants, category_id, out_of_stock, categories(name)")
        .order("name")
    ]);
    if (!catRes.error)  { allCategories = catRes.data  || []; renderCategoryTiles(); }
    if (!prodRes.error) { allProducts   = prodRes.data || []; applyFilters(); }
  } catch (err) {
    console.error("refreshData failed:", err);
  }
}

/* ══════════════════════════════════════════════════════════
   PULL-TO-REFRESH
══════════════════════════════════════════════════════════ */
function initPullToRefresh() {
  const indicator = document.getElementById("ptr-indicator");
  if (!indicator) return;

  document.addEventListener("touchstart", e => {
    // Only start PTR when at the very top of the page
    if (window.scrollY > 0) return;
    ptrStartY  = e.touches[0].clientY;
    ptrActive  = true;
    ptrDelta   = 0;
  }, { passive: true });

  document.addEventListener("touchmove", e => {
    if (!ptrActive) return;
    ptrDelta = e.touches[0].clientY - ptrStartY;
    if (ptrDelta <= 0) { ptrActive = false; return; }

    const progress = Math.min(ptrDelta / PTR_THRESHOLD, 1);
    const translateY = Math.min(ptrDelta * 0.45, PTR_THRESHOLD * 0.45);

    indicator.style.transform   = `translateX(-50%) translateY(${translateY}px)`;
    indicator.style.opacity     = String(progress);
    indicator.classList.toggle("ptr-ready", ptrDelta >= PTR_THRESHOLD);

    const textEl = indicator.querySelector(".ptr-text");
    if (textEl) {
      textEl.textContent = ptrDelta >= PTR_THRESHOLD ? "Release to refresh" : "Pull down to refresh";
    }
  }, { passive: true });

  document.addEventListener("touchend", async () => {
    if (!ptrActive) return;
    ptrActive = false;

    if (ptrDelta >= PTR_THRESHOLD) {
      // Trigger refresh
      indicator.classList.add("ptr-refreshing");
      indicator.classList.remove("ptr-ready");
      const textEl = indicator.querySelector(".ptr-text");
      if (textEl) textEl.textContent = "Refreshing…";

      await refreshData();

      // Also refresh coupons silently
      await fetchCoupons();

      indicator.classList.remove("ptr-refreshing");
    }

    // Animate back up
    indicator.style.transition = "transform .35s ease, opacity .35s ease";
    indicator.style.transform  = "translateX(-50%) translateY(-100%)";
    indicator.style.opacity    = "0";
    setTimeout(() => {
      indicator.style.transition = "";
      ptrDelta = 0;
    }, 350);
  });
}

/* ══════════════════════════════════════════════════════════
   COUPONS
══════════════════════════════════════════════════════════ */
async function fetchCoupons() {
  try {
    const { data, error } = await db
      .from("coupons")
      .select("*")
      .eq("is_active", true);
    if (!error) allCoupons = data || [];
  } catch (err) {
    console.error("fetchCoupons failed:", err);
  }
}

function applyCouponCode() {
  const input   = document.getElementById("c-coupon");
  const statusEl = document.getElementById("coupon-status");
  const code    = (input?.value || "").trim().toUpperCase();

  if (!code) {
    setCouponStatus("⚠️ Please enter a coupon code.", "err");
    return;
  }

  const coupon = allCoupons.find(c => c.code.toUpperCase() === code);

  if (!coupon) {
    setCouponStatus("❌ Invalid or expired coupon code.", "err");
    appliedCoupon = null;
    recalcCheckoutTotal();
    return;
  }

  // Check usage limit
  if (coupon.usage_limit !== null && coupon.usage_limit !== undefined) {
    const used = coupon.usage_count || 0;
    if (used >= coupon.usage_limit) {
      setCouponStatus("❌ This coupon has reached its usage limit.", "err");
      appliedCoupon = null;
      recalcCheckoutTotal();
      return;
    }
  }

  // Check min order value if set
  const subtotal = cartTotal();
  if (coupon.min_order_value && subtotal < coupon.min_order_value) {
    setCouponStatus(`⚠️ Minimum order ₹${coupon.min_order_value} required for this coupon.`, "err");
    appliedCoupon = null;
    recalcCheckoutTotal();
    return;
  }

  appliedCoupon = coupon;
  const disc    = computeCouponDiscount(subtotal, coupon);
  setCouponStatus(`✅ "${coupon.code}" applied! You save ₹${disc.toLocaleString("en-IN")}.`, "ok");
  recalcCheckoutTotal();
}

function removeCoupon() {
  appliedCoupon = null;
  const input = document.getElementById("c-coupon");
  if (input) input.value = "";
  setCouponStatus("", "");
  recalcCheckoutTotal();
}

function setCouponStatus(msg, cls) {
  const el = document.getElementById("coupon-status");
  if (!el) return;
  el.textContent = msg;
  el.className   = `coupon-status coupon-status-${cls}`;
}

function computeCouponDiscount(subtotal, coupon) {
  if (!coupon) return 0;
  if (coupon.discount_type === "percent") {
    const disc = Math.round(subtotal * coupon.discount_value / 100);
    return coupon.max_discount ? Math.min(disc, coupon.max_discount) : disc;
  }
  // flat
  return Math.min(coupon.discount_value, subtotal);
}

function recalcCheckoutTotal() {
  const subtotal       = cartTotal();
  const isFreeDelivery = subtotal >= FREE_DELIVERY_THRESHOLD;
  const deliveryCharge = isFreeDelivery ? 0 : DELIVERY_CHARGE;
  const couponDisc     = computeCouponDiscount(subtotal, appliedCoupon);
  const grandTotal     = Math.max(0, subtotal + deliveryCharge - couponDisc);

  // Re-render coupon discount line
  const discLine = document.getElementById("checkout-coupon-line");
  if (discLine) {
    discLine.style.display = couponDisc > 0 ? "flex" : "none";
    const valEl = document.getElementById("checkout-coupon-disc");
    if (valEl) valEl.textContent = `−₹${couponDisc.toLocaleString("en-IN")}`;
  }

  const gtEl = document.getElementById("checkout-grand-total");
  if (gtEl) gtEl.textContent = `₹${grandTotal.toLocaleString("en-IN")}`;
}

/* ══════════════════════════════════════════════════════════
   FILTERING
══════════════════════════════════════════════════════════ */
function applyFilters() {
  let list = [...allProducts];

  if (activeCatId !== "all") {
    list = list.filter(p => p.category_id === activeCatId);
  }
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    // Homepage search: return only products whose NAME matches.
    // Description is intentionally excluded from the result filter so the
    // product list stays clean and name-focused.
    list = list.filter(p => p.name.toLowerCase().includes(q));
  }

  const catName = activeCatId === "all"
    ? "All Products"
    : (allCategories.find(c => c.id === activeCatId)?.name || "Products");

  const title = searchQuery.trim()
    ? `Results for "${searchQuery.trim()}"`
    : catName;

  document.getElementById("section-title").textContent = title;
  document.getElementById("product-count").textContent =
    `${list.length} item${list.length !== 1 ? "s" : ""}`;

  // Update active filter bar
  const filterBar = document.getElementById("active-filter-bar");
  const filterLabel = document.getElementById("active-filter-label");
  if (activeCatId !== "all" && !searchQuery.trim()) {
    filterLabel.textContent = `📂 ${catName}`;
    filterBar.style.display = "inline-flex";
  } else if (searchQuery.trim()) {
    filterLabel.textContent = `🔍 "${searchQuery.trim()}"`;
    filterBar.style.display = "inline-flex";
  } else {
    filterBar.style.display = "none";
  }

  renderProductGrid(list);
}

/* ── Category Section Groups (BigBasket-style) ─────────── */
/* ══════════════════════════════════════════════════════════
   CATEGORY MODAL — grouped tiles, fully dynamic from DB
   No hardcoded keywords or emoji mappings.
══════════════════════════════════════════════════════════ */
/* ── Helper: extract leading number from a string ───────
   "3. Dairy" → 3,  "10 Snacks" → 10,  "Beverages" → Infinity
──────────────────────────────────────────────────────── */
function _numericPrefix(name) {
  const m = (name || "").match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

/* ── Build tile HTML (shared by full render & search) ── */
function _catTileHtml(cat) {
  const tileIcon = cat.emoji
    ? `<div class="cat-tile-emoji">${escHtml(cat.emoji)}</div>`
    : cat.image_url
      ? `<img class="cat-tile-img" src="${escHtml(cat.image_url)}" alt="${escHtml(cat.name)}" loading="lazy"/>`
      : `<div class="cat-tile-emoji">📦</div>`;
  return `
    <div class="cat-tile" data-id="${escHtml(cat.id)}" id="cat-tile-${escHtml(cat.id)}">
      ${tileIcon}
      <div class="cat-tile-name">${escHtml(cat.name)}</div>
    </div>`;
}

function renderCategoryTiles(catSearchQuery) {
  const container = document.getElementById("cat-tiles-container");
  if (!container) return;

  const q = (catSearchQuery || "").trim().toLowerCase();

  // Sort parent headers by numeric prefix ascending
  const headers = allCategories
    .filter(c => !c.parent_id)
    .sort((a, b) => _numericPrefix(a.name) - _numericPrefix(b.name));
  const subs = allCategories.filter(c => c.parent_id);

  // All Items tile visibility
  const allTile = document.getElementById("cat-tile-all");

  let html = "";

  if (q) {
    /* ── SEARCH MODE ───────────────────────────────────────
       Show a flat list of sub-categories whose name matches
       OR that contain a product whose name matches the query.
    ──────────────────────────────────────────────────────── */
    // Build a set of category IDs that contain a matching product
    const catIdsWithMatchingProduct = new Set(
      allProducts
        .filter(p => p.name.toLowerCase().includes(q))
        .map(p => p.category_id)
        .filter(Boolean)
    );

    const matchingSubs = subs.filter(cat =>
      cat.name.toLowerCase().includes(q) ||
      catIdsWithMatchingProduct.has(cat.id)
    );

    if (allTile) allTile.style.display = "none";

    if (matchingSubs.length) {
      html += `<div class="cat-group-section cat-search-results">
        <div class="cat-group-heading">🔍 Search Results</div>
        <div class="cat-group-tiles">
          ${matchingSubs.map(_catTileHtml).join("")}
        </div>
      </div>`;
    } else {
      html = `<div class="cat-search-no-results">No categories or products found for "<strong>${escHtml(catSearchQuery.trim())}</strong>".</div>`;
    }

  } else {
    /* ── NORMAL MODE — sorted headers ────────────────────── */
    if (allTile) allTile.style.display = "";

    headers.forEach(header => {
      const children = subs.filter(s => s.parent_id === header.id);
      if (!children.length) return;
      const headerIcon = header.emoji || "🏪";
      html += `
        <div class="cat-group-section">
          <div class="cat-group-heading">${headerIcon} ${escHtml(header.name)}</div>
          <div class="cat-group-tiles">
            ${children.map(_catTileHtml).join("")}
          </div>
        </div>`;
    });

    // Orphan subs whose parent was deleted
    const orphans = subs.filter(s => !headers.find(h => h.id === s.parent_id));
    if (orphans.length) {
      html += `<div class="cat-group-section"><div class="cat-group-heading">🏪 Other</div><div class="cat-group-tiles">`;
      orphans.forEach(cat => { html += _catTileHtml(cat); });
      html += `</div></div>`;
    }

    if (!html) {
      html = `<div style="padding:1.5rem;text-align:center;color:var(--light)">No categories yet.</div>`;
    }
  }

  container.innerHTML = html;

  container.querySelectorAll(".cat-tile").forEach(tile => {
    tile.addEventListener("click", () => selectCategoryAndClose(tile.dataset.id));
  });

  if (allTile) allTile.onclick = () => selectCategoryAndClose("all");

  updateCategoryTileActive();
}

function updateCategoryTileActive() {
  document.querySelectorAll(".cat-tile").forEach(tile => {
    tile.classList.toggle("active", tile.dataset.id === activeCatId);
  });
}

function openCategoryModal() {
  updateCategoryTileActive();
  const overlay = document.getElementById("cat-modal-overlay");
  overlay.style.display = "flex";
  document.body.style.overflow = "hidden";
  // Clear and focus category search on open
  const catSearch = document.getElementById("cat-search-input");
  if (catSearch) {
    catSearch.value = "";
    renderCategoryTiles(""); // reset to full list
    setTimeout(() => catSearch.focus(), 120);
  }
}

function closeCategoryModal() {
  document.getElementById("cat-modal-overlay").style.display = "none";
  document.body.style.overflow = "";
}

function selectCategoryAndClose(id) {
  selectCategory(id);
  closeCategoryModal();
}

function selectCategory(id) {
  activeCatId = id;
  updateCategoryTileActive();
  applyFilters();
}

/* ══════════════════════════════════════════════════════════
   RENDER PRODUCT GRID
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
    container.innerHTML = `<div class="state-box"><div class="state-icon">🔍</div><p>No products found.</p></div>`;
    return;
  }

  const grid = document.createElement("div");
  grid.className = "product-grid";

  // Use a DocumentFragment so cards are built off-screen and appended in one hit
  const frag = document.createDocumentFragment();

  products.forEach(p => {
    try {
      const variants     = parseVariants(p.variants);
      let sellingPrice, mrpPrice;
      if (variants.length) {
        // Find cheapest variant and use its MRP (falling back to product-level MRP)
        const cheapest = variants.reduce((a, b) => (Number(a.price)||0) <= (Number(b.price)||0) ? a : b);
        sellingPrice = Number(cheapest.price) || 0;
        const vMrp   = cheapest.mrp && cheapest.mrp > sellingPrice ? cheapest.mrp : null;
        mrpPrice     = vMrp || ((p.mrp && p.mrp > sellingPrice) ? p.mrp : null);
      } else {
        sellingPrice = p.baseprice || 0;
        mrpPrice     = (p.mrp && p.mrp > sellingPrice) ? p.mrp : null;
      }
      const discountPercent = mrpPrice
        ? Math.round(((mrpPrice - sellingPrice) / mrpPrice) * 100)
        : 0;
      const isOOS = p.out_of_stock === true;

      const card = document.createElement("div");
      card.className = "product-card product-card-compact";
      card.setAttribute("role", "button");
      card.setAttribute("tabindex", "0");
      card.setAttribute("aria-label", `View ${p.name}`);

      const imgHtml = p.imageurl
        ? `<img class="product-card-img" src="${escHtml(p.imageurl)}" alt="${escHtml(p.name)}" loading="lazy" decoding="async"/>`
        : `<div class="product-card-img-placeholder">📦</div>`;

      card.innerHTML = `
        ${imgHtml}
        ${discountPercent > 0 && !isOOS ? `<div class="card-discount-ribbon">${discountPercent}% OFF</div>` : ""}
        ${isOOS ? `<div class="card-oos-ribbon">Out of Stock</div>` : ""}
        <div class="product-card-body">
          <div class="product-card-name">${escHtml(p.name)}</div>
          <div class="product-card-price-compact">
            <span class="selling-price-sm">₹${sellingPrice.toLocaleString("en-IN")}</span>
            ${mrpPrice ? `<span class="mrp-price-sm">₹${mrpPrice.toLocaleString("en-IN")}</span>` : ""}
            ${discountPercent > 0 ? `<span class="discount-badge-sm">${discountPercent}%&nbsp;off</span>` : ""}
          </div>
          ${variants.length ? `<div class="card-variants-hint">${variants.length} options</div>` : ""}
          ${isOOS ? `<div class="card-oos-label">Out of Stock</div>` : ""}
        </div>
      `;

      if (!isOOS) {
        card.addEventListener("click",   () => openProductModal(p));
        card.addEventListener("keydown", e => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openProductModal(p); }
        });
      }

      frag.appendChild(card);
    } catch (cardErr) {
      console.error("Error rendering product card:", p?.name || p?.id, cardErr);
    }
  });

  grid.appendChild(frag);  // single DOM insertion
  container.innerHTML = "";
  container.appendChild(grid);
}

/* ══════════════════════════════════════════════════════════
   PRODUCT MODAL
══════════════════════════════════════════════════════════ */
function openProductModal(product) {
  if (product.out_of_stock) return; // guard against direct calls
  modalProduct = product;
  const variants = parseVariants(product.variants);
  modalVariant   = variants.length ? variants[0] : null;
  renderProductModal();
  document.getElementById("product-modal").style.display = "flex";
  // Apply two-column desktop class
  const box = document.getElementById("product-modal-box");
  if (box) box.classList.add("product-detail-box");
  document.body.style.overflow = "hidden";
}

function renderProductModal() {
  const p        = modalProduct;
  const variants = parseVariants(p.variants);
  const price    = modalVariant ? modalVariant.price : (p.baseprice || 0);
  const variantMrp = modalVariant?.mrp && modalVariant.mrp > price ? modalVariant.mrp : null;
  const mrpPrice = variantMrp || ((p.mrp && p.mrp > price) ? p.mrp : null);
  const discountPercent = mrpPrice
    ? Math.round(((mrpPrice - price) / mrpPrice) * 100)
    : 0;
  const catName = p.categories?.name || "";

  const imgHtml = p.imageurl
    ? `<img class="modal-prod-img" src="${escHtml(p.imageurl)}" alt="${escHtml(p.name)}"/>`
    : `<div class="modal-prod-img-placeholder">📦</div>`;

  let variantsHtml = "";
  if (variants.length) {
    const chips = variants.map((v, i) =>
      `<button class="variant-chip ${i === 0 ? "active" : ""}" data-idx="${i}">${escHtml(v.name)} — ₹${v.price.toLocaleString("en-IN")}</button>`
    ).join("");
    variantsHtml = `<div class="variant-label">Choose variant:</div><div class="variant-chips">${chips}</div>`;
  }

  const savingsHtml = mrpPrice
    ? `<div class="modal-savings-badge">You save ₹${(mrpPrice - price).toLocaleString("en-IN")} (${discountPercent}% off)</div>`
    : "";

  document.getElementById("product-modal-content").innerHTML = `
    ${imgHtml}
    ${catName ? `<div class="modal-prod-category">${escHtml(catName)}</div>` : ""}
    <h2 class="modal-prod-name">${escHtml(p.name)}</h2>
    <p class="modal-prod-desc">${escHtml(p.description || "")}</p>
    <div class="modal-prod-price" id="modal-price-block">
      <span class="selling-price-large">₹${price.toLocaleString("en-IN")}</span>
      ${mrpPrice ? `<span class="mrp-price mrp-price-large">MRP ₹${mrpPrice.toLocaleString("en-IN")}</span>` : ""}
      ${discountPercent > 0 ? `<span class="discount-badge discount-badge-lg">${discountPercent}% off</span>` : ""}
    </div>
    ${savingsHtml}
    ${variantsHtml}
    <button class="add-cart-btn" id="modal-add-cart-btn">🛒 Add to Cart</button>
  `;

  document.querySelectorAll(".variant-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const idx = +chip.dataset.idx;
      modalVariant = variants[idx];
      const newPrice   = modalVariant.price;
      const newMrp     = (modalVariant.mrp && modalVariant.mrp > newPrice)
        ? modalVariant.mrp
        : (modalProduct.mrp && modalProduct.mrp > newPrice ? modalProduct.mrp : null);
      const newDisc    = newMrp ? Math.round(((newMrp - newPrice) / newMrp) * 100) : 0;
      document.getElementById("modal-price-block").innerHTML = `
        <span class="selling-price-large">₹${newPrice.toLocaleString("en-IN")}</span>
        ${newMrp ? `<span class="mrp-price mrp-price-large">MRP ₹${newMrp.toLocaleString("en-IN")}</span>` : ""}
        ${newDisc > 0 ? `<span class="discount-badge discount-badge-lg">${newDisc}% off</span>` : ""}
      `;
      document.querySelectorAll(".variant-chip").forEach(c => c.classList.toggle("active", c === chip));
    });
  });

  document.getElementById("modal-add-cart-btn").addEventListener("click", () => {
    const finalPrice = modalVariant ? modalVariant.price : (modalProduct.baseprice || 0);
    const finalMrp   = (modalVariant?.mrp && modalVariant.mrp > finalPrice)
      ? modalVariant.mrp
      : (modalProduct.mrp || null);
    cartAdd({
      productId:   modalProduct.id,
      name:        modalProduct.name,
      imageUrl:    modalProduct.imageurl || null,
      price:       finalPrice,
      mrp:         finalMrp,
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
    container.innerHTML = `<div class="cart-empty"><span>🛒</span>Your cart is empty.<br/>Add some items!</div>`;
    foot.style.display = "none";
    return;
  }

  foot.style.display = "block";
  document.getElementById("cart-total-display").textContent = `₹${cartTotal().toLocaleString("en-IN")}`;

  container.innerHTML = cart.map((item, i) => {
    const imgHtml = item.imageUrl
      ? `<img class="cart-item-img" src="${escHtml(item.imageUrl)}" alt="${escHtml(item.name)}"/>`
      : `<div class="cart-item-img-placeholder">🥬</div>`;

    let savingHtml = "";
    if (item.mrp && item.mrp > item.price) {
      const saved = (item.mrp - item.price) * item.qty;
      savingHtml = `<div class="cart-item-saving">✨ Saved ₹${saved.toLocaleString("en-IN")}</div>`;
    }

    return `
      <div class="cart-item">
        ${imgHtml}
        <div class="cart-item-info">
          <div class="cart-item-name">${escHtml(item.name)}</div>
          ${item.variantName ? `<div class="cart-item-variant">${escHtml(item.variantName)}</div>` : ""}
          <div class="cart-item-price">
            ₹${(item.price * item.qty).toLocaleString("en-IN")}
            ${item.mrp && item.mrp > item.price
              ? `<span class="mrp-price">₹${(item.mrp * item.qty).toLocaleString("en-IN")}</span>`
              : ""}
          </div>
          ${savingHtml}
          <div class="qty-row">
            <button class="qty-btn" data-action="dec" data-idx="${i}">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-action="inc" data-idx="${i}">+</button>
          </div>
        </div>
        <button class="cart-remove" data-action="remove" data-idx="${i}" aria-label="Remove">🗑️</button>
      </div>`;
  }).join("");

  container.querySelectorAll("[data-action]").forEach(el => {
    el.addEventListener("click", () => {
      const idx    = +el.dataset.idx;
      const action = el.dataset.action;
      if (action === "inc")    cartChangeQty(idx, 1);
      if (action === "dec")    cartChangeQty(idx, -1);
      if (action === "remove") cartRemove(idx);
    });
  });
}

/* ══════════════════════════════════════════════════════════
   CHECKOUT
   ─────────────────────────────────────────────────────────
   CHANGED: placeOrder() now calls placeOrderAndNotify()
   from telegram.js instead of sendOrderEmail() from email.js
══════════════════════════════════════════════════════════ */
function openCheckout() {
  if (!cart.length) { showToast("⚠️ Cart is empty!"); return; }
  closeCart();

  // Reset coupon on each checkout open
  appliedCoupon = null;
  const couponInput = document.getElementById("c-coupon");
  if (couponInput) couponInput.value = "";
  setCouponStatus("", "");

  const subtotal       = cartTotal();
  const isFreeDelivery = subtotal >= FREE_DELIVERY_THRESHOLD;
  const deliveryCharge = isFreeDelivery ? 0 : DELIVERY_CHARGE;
  const grandTotal     = subtotal + deliveryCharge;

  document.getElementById("checkout-item-lines").innerHTML = cart.map(item =>
    `<div class="order-line">
       <span>${escHtml(item.name)}${item.variantName ? ` (${escHtml(item.variantName)})` : ""} × ${item.qty}</span>
       <span>₹${(item.price * item.qty).toLocaleString("en-IN")}</span>
     </div>`
  ).join("") +
  `<div class="order-line order-line-sub">
     <span>Subtotal</span>
     <span>₹${subtotal.toLocaleString("en-IN")}</span>
   </div>
   <div class="order-line order-line-delivery ${isFreeDelivery ? "order-line-free" : ""}">
     <span>🚚 Delivery</span>
     <span>${isFreeDelivery ? "FREE" : `₹${deliveryCharge}`}</span>
   </div>
   <div class="order-line order-line-coupon" id="checkout-coupon-line" style="display:none">
     <span>🏷️ Coupon discount</span>
     <span class="coupon-disc-value" id="checkout-coupon-disc">−₹0</span>
   </div>`;

  document.getElementById("checkout-grand-total").textContent = `₹${grandTotal.toLocaleString("en-IN")}`;
  document.getElementById("order-status-msg").textContent = "";
  document.getElementById("checkout-modal").style.display = "flex";
  document.body.style.overflow = "hidden";

  // Wire coupon apply button fresh each time
  const applyBtn = document.getElementById("coupon-apply-btn");
  if (applyBtn) {
    applyBtn.onclick = applyCouponCode;
  }
  const couponEl = document.getElementById("c-coupon");
  if (couponEl) {
    couponEl.onkeydown = e => { if (e.key === "Enter") applyCouponCode(); };
  }
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
  if (!/^\d{10}$/.test(phone))  { setOrderStatus("⚠️ Enter valid 10-digit phone.", "err"); return; }
  if (!/^\d{6}$/.test(pincode)) { setOrderStatus("⚠️ Enter valid 6-digit pincode.", "err"); return; }

  const btn = document.getElementById("place-order-btn");
  btn.disabled    = true;
  btn.textContent = "⏳ Placing order…";
  setOrderStatus("", "");

  try {
    const customer    = { name, phone, address, pincode };
    const cartSnap    = cart.map(i => ({ ...i })); // snapshot before clear
    const subtotal    = cartTotal();
    const couponDisc  = computeCouponDiscount(subtotal, appliedCoupon);
    const couponCode  = appliedCoupon ? appliedCoupon.code : null;

    await placeOrderAndNotify(customer, cartSnap, subtotal, couponDisc, couponCode);

    // Increment coupon usage count if a coupon was applied
    if (appliedCoupon?.id) {
      try {
        const newCount = (appliedCoupon.usage_count || 0) + 1;
        await db.from("coupons").update({ usage_count: newCount }).eq("id", appliedCoupon.id);
      } catch (e) {
        console.warn("Could not increment coupon usage:", e);
      }
    }

    setOrderStatus("🎉 Order placed! We'll call you to confirm delivery.", "ok");
    cartClear();
    appliedCoupon = null;
    btn.textContent = "✅ Order Placed!";

    setTimeout(() => {
      closeCheckout();
      btn.disabled    = false;
      btn.textContent = "✅ Place Order (Cash on Delivery)";
    }, 4000);

  } catch (err) {
    console.error("placeOrder error:", err);
    setOrderStatus("❌ Could not place order. Please call us directly.", "err");
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
   MY ORDERS  (device-based · localStorage)
   ─────────────────────────────────────────────────────────
   Reads "swift_orders" from localStorage and renders
   a list of orders for this device.
   When admin marks an order Delivered, the DB row is deleted
   and the frontend removes it from localStorage too.
══════════════════════════════════════════════════════════ */
function getLocalOrders() {
  try { return JSON.parse(localStorage.getItem("swift_orders") || "[]"); } catch { return []; }
}

/**
 * removeOrderFromLocalStorage
 * Called when an order is confirmed delivered or when the
 * admin panel broadcasts a deletion via URL hash / polling.
 */
function removeOrderFromLocalStorage(orderId) {
  let orders = getLocalOrders();
  orders = orders.filter(o => o.id !== orderId);
  localStorage.setItem("swift_orders", JSON.stringify(orders));
}

function openMyOrders() {
  renderMyOrders();
  document.getElementById("my-orders-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
  // Reconcile against DB immediately when user opens the panel
  _reconcileLocalOrders().then(() => {
    const modal = document.getElementById("my-orders-modal");
    if (modal && modal.style.display !== "none") renderMyOrders();
  });
}
function closeMyOrders() {
  document.getElementById("my-orders-modal").style.display = "none";
  document.body.style.overflow = "";
}

function renderMyOrders() {
  const orders    = getLocalOrders();
  const container = document.getElementById("my-orders-list");

  if (!orders.length) {
    container.innerHTML = `
      <div class="my-orders-empty">
        <div style="font-size:2.5rem;margin-bottom:.6rem">📋</div>
        <p>No orders yet on this device.</p>
        <p style="font-size:.82rem;color:var(--light);margin-top:.3rem">Orders placed from this browser will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = orders.map(order => {
    const date = order.placedAt
      ? new Date(order.placedAt).toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      : "—";

    const itemLines = (order.items || []).map(item =>
      `<div class="my-order-item-line">
         <span>${escHtml(item.name)}${item.variantName ? ` (${escHtml(item.variantName)})` : ""} × ${item.qty}</span>
         <span>₹${(item.price * item.qty).toLocaleString("en-IN")}</span>
       </div>`
    ).join("");

    return `
      <div class="my-order-card" id="my-order-${escHtml(order.id)}">
        <div class="my-order-header">
          <div>
            <div class="my-order-id">${escHtml(order.id)}</div>
            <div class="my-order-date">${date}</div>
          </div>
          <div class="my-order-status pending">⏳ Pending</div>
        </div>
        <div class="my-order-items">${itemLines}</div>
        <div class="my-order-footer">
          <div class="my-order-address">📍 ${escHtml(order.address)}, ${escHtml(order.pincode)}</div>
          <div class="my-order-bill">
            <div class="my-order-bill-row">
              <span>Subtotal</span>
              <span>₹${Number(order.subtotal || order.total).toLocaleString("en-IN")}</span>
            </div>
            <div class="my-order-bill-row ${(order.deliveryCharge || 0) === 0 ? "my-order-free-del" : ""}">
              <span>🚚 Delivery</span>
              <span>${(order.deliveryCharge || 0) === 0 ? "FREE" : `₹${order.deliveryCharge}`}</span>
            </div>
            <div class="my-order-bill-row my-order-total-row">
              <span>Total</span>
              <strong>₹${Number(order.total).toLocaleString("en-IN")}</strong>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");
}

/* ══════════════════════════════════════════════════════════
   REALTIME — sync localStorage when admin deletes an order
   ─────────────────────────────────────────────────────────
   We subscribe to the Supabase realtime channel for the
   "orders" table DELETE event. When an order is deleted
   (admin marks Delivered), we remove it from localStorage
   and refresh the My Orders UI if it is open.

   NOTE: payload.old.id is only populated when the Supabase
   table has REPLICA IDENTITY FULL set. As a safety net we
   also poll every 30s and reconcile against the DB.
══════════════════════════════════════════════════════════ */
function subscribeToOrderDeletions() {
  db.channel("orders-deletes")
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "orders" },
      payload => {
        // payload.old.id is available only with REPLICA IDENTITY FULL
        const deletedId = payload.old?.id;
        if (deletedId) {
          _handleOrderDelivered(deletedId);
        } else {
          // Fallback: reconcile all local orders against DB
          _reconcileLocalOrders();
        }
      }
    )
    .subscribe();

  // Polling fallback every 30s — catches cases where realtime
  // event fires without payload.old.id
  setInterval(_reconcileLocalOrders, 30000);
}

/**
 * Called when we know a specific order was delivered.
 */
function _handleOrderDelivered(orderId) {
  removeOrderFromLocalStorage(orderId);
  const modal = document.getElementById("my-orders-modal");
  if (modal && modal.style.display !== "none") {
    renderMyOrders();
  }
  showToast(`✅ Your order ${orderId} has been delivered!`);
}

/**
 * Reconcile: fetch all order IDs from DB for this device
 * and remove any local orders that no longer exist in DB.
 * This is the fix for when realtime fires without payload.old.id.
 */
async function _reconcileLocalOrders() {
  const localOrders = getLocalOrders();
  if (!localOrders.length) return;

  const localIds = localOrders.map(o => o.id);
  const { data, error } = await db
    .from("orders")
    .select("id")
    .in("id", localIds);

  if (error) return; // silently skip on network error

  const existingIds = new Set((data || []).map(r => r.id));
  const removedIds  = localIds.filter(id => !existingIds.has(id));

  if (!removedIds.length) return;

  removedIds.forEach(id => removeOrderFromLocalStorage(id));

  const modal = document.getElementById("my-orders-modal");
  if (modal && modal.style.display !== "none") {
    renderMyOrders();
  }

  removedIds.forEach(id => showToast(`✅ Order ${id} has been delivered!`));
}

/* ══════════════════════════════════════════════════════════
   TOAST & UTILITIES
══════════════════════════════════════════════════════════ */
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}
function parseVariants(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ══════════════════════════════════════════════════════════
   SEARCH — Fixed LTR behaviour
══════════════════════════════════════════════════════════ */
function initSearch() {
  const input = document.getElementById("search-input");
  if (!input) return;

  input.setAttribute("dir", "ltr");
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocorrect", "off");
  input.setAttribute("autocapitalize", "off");
  input.setAttribute("spellcheck", "false");

  let _searchTimer = null;

  input.addEventListener("input", function () {
    const val = this.value;
    clearTimeout(_searchTimer);
    _searchTimer = setTimeout(() => {
      searchQuery = val;
      applyFilters();
    }, 220);
  });
}

/* ══════════════════════════════════════════════════════════
   EVENT WIRING
══════════════════════════════════════════════════════════ */
function wireEvents() {
  // Cart
  document.getElementById("cart-open-btn").addEventListener("click", openCart);
  document.getElementById("cart-close-btn").addEventListener("click", closeCart);
  document.getElementById("cart-overlay").addEventListener("click", e => {
    if (e.target === document.getElementById("cart-overlay")) closeCart();
  });

  // Checkout
  document.getElementById("open-checkout-btn").addEventListener("click", openCheckout);
  document.getElementById("checkout-modal-close").addEventListener("click", closeCheckout);
  document.getElementById("checkout-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("checkout-modal")) closeCheckout();
  });
  document.getElementById("place-order-btn").addEventListener("click", placeOrder);

  // Product modal
  document.getElementById("product-modal-close").addEventListener("click", closeProductModal);
  document.getElementById("product-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("product-modal")) closeProductModal();
  });

  // Category modal
  const catNavBtn = document.getElementById("categories-nav-btn");
  if (catNavBtn) catNavBtn.addEventListener("click", openCategoryModal);

  const catModalClose = document.getElementById("cat-modal-close");
  if (catModalClose) catModalClose.addEventListener("click", closeCategoryModal);

  const catOverlay = document.getElementById("cat-modal-overlay");
  if (catOverlay) {
    catOverlay.addEventListener("click", e => {
      if (e.target === catOverlay) closeCategoryModal();
    });
  }

  // Category search input — debounced
  const catSearchInput = document.getElementById("cat-search-input");
  if (catSearchInput) {
    let _catSearchTimer = null;
    catSearchInput.addEventListener("input", function () {
      clearTimeout(_catSearchTimer);
      _catSearchTimer = setTimeout(() => renderCategoryTiles(this.value), 180);
    });
    catSearchInput.addEventListener("keydown", e => {
      if (e.key === "Escape") { catSearchInput.value = ""; renderCategoryTiles(""); }
    });
  }

  const allTile = document.getElementById("cat-tile-all");
  if (allTile) allTile.addEventListener("click", () => selectCategoryAndClose("all"));

  const clearBtn = document.getElementById("clear-filter-btn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      activeCatId  = "all";
      searchQuery  = "";
      const si = document.getElementById("search-input");
      if (si) si.value = "";
      updateCategoryTileActive();
      applyFilters();
    });
  }

  // My Orders modal
  const myOrdersBtn = document.getElementById("my-orders-btn");
  if (myOrdersBtn) myOrdersBtn.addEventListener("click", openMyOrders);

  const myOrdersClose = document.getElementById("my-orders-modal-close");
  if (myOrdersClose) myOrdersClose.addEventListener("click", closeMyOrders);

  const myOrdersModal = document.getElementById("my-orders-modal");
  if (myOrdersModal) {
    myOrdersModal.addEventListener("click", e => {
      if (e.target === myOrdersModal) closeMyOrders();
    });
  }

  // Keyboard
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      closeProductModal();
      closeCart();
      closeCheckout();
      closeCategoryModal();
      closeMyOrders();
    }
  });
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
(async function init() {
  cartLoad();
  renderCartBadge();
  wireEvents();
  initSearch();
  initPullToRefresh();
  subscribeToOrderDeletions(); // realtime sync for delivered orders
  await fetchCategories();
  await fetchProducts();
  await fetchCoupons();
})();
