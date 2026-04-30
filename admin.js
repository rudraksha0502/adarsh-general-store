/* ═══════════════════════════════════════════════════════════
   admin.js  —  Swift Store · Admin Panel Logic
   Changes from original:
   • Added Orders tab: fetchOrders, renderOrderList
   • markDelivered(): deletes order from DB immediately
   • switchTab() updated to handle "orders" tab
   • Realtime subscription for new orders (badge counter)
   • Confirm modal reused for Delivered confirmation
   • All product/category logic unchanged
═══════════════════════════════════════════════════════════ */

/* ── Credentials ─────────────────────────────────────── */
const ADMIN_USER    = "admin";
const ADMIN_PASS    = "adarsh@2025";
const BUCKET        = "product-images";
const CAT_BUCKET    = "category-images";

/* ── State ───────────────────────────────────────────── */
let allCategories  = [];
let allProducts    = [];
let allOrders      = [];
let variantCount   = 0;
let deleteCallback = null;

/* ═══════════════════════════════════════════════════════════
   LOGIN
═══════════════════════════════════════════════════════════ */
function doLogin() {
  const user = document.getElementById("login-user").value.trim();
  const pass = document.getElementById("login-pass").value;
  const err  = document.getElementById("login-err");

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    document.getElementById("login-screen").style.display = "none";
    document.getElementById("admin-panel").style.display  = "block";
    init();
  } else {
    err.textContent = "❌ Incorrect username or password.";
    setTimeout(() => { err.textContent = ""; }, 3000);
  }
}
function doLogout() {
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("admin-panel").style.display  = "none";
}

/* ═══════════════════════════════════════════════════════════
   TAB SWITCHING
═══════════════════════════════════════════════════════════ */
function switchTab(tab) {
  document.querySelectorAll(".admin-nav-link[data-tab]").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.getElementById("tab-products").style.display   = tab === "products"   ? "grid" : "none";
  document.getElementById("tab-categories").style.display = tab === "categories" ? "grid" : "none";
  document.getElementById("tab-orders").style.display     = tab === "orders"     ? "grid" : "none";

  // Clear badge when admin opens orders tab
  if (tab === "orders") {
    const badge = document.getElementById("orders-badge");
    if (badge) badge.style.display = "none";
    fetchOrders();
  }
}

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
let _toastTimer;
function showToast(msg) {
  const el = document.getElementById("admin-toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* ═══════════════════════════════════════════════════════════
   FORM STATUS
═══════════════════════════════════════════════════════════ */
function setStatus(id, msg, cls) {
  const el = document.getElementById(id);
  if (!msg) { el.style.display = "none"; return; }
  el.textContent = msg;
  el.className   = `form-status ${cls}`;
  el.style.display = "block";
}

/* ═══════════════════════════════════════════════════════════
   CONFIRM MODAL
═══════════════════════════════════════════════════════════ */
function openConfirm(message, onConfirm, title = "⚠️ Confirm", okLabel = "Confirm") {
  const titleEl = document.getElementById("confirm-title");
  const okBtn   = document.getElementById("confirm-ok-btn");
  if (titleEl) titleEl.textContent = title;
  if (okBtn)   okBtn.textContent   = okLabel;
  document.getElementById("confirm-msg").textContent = message;
  deleteCallback = onConfirm;
  document.getElementById("confirm-modal").style.display = "flex";
}
function closeConfirm() {
  document.getElementById("confirm-modal").style.display = "none";
  deleteCallback = null;
  // Reset confirm button label
  const okBtn = document.getElementById("confirm-ok-btn");
  if (okBtn) okBtn.textContent = "Confirm";
}

/* ═══════════════════════════════════════════════════════════
   CATEGORIES — FETCH & RENDER
═══════════════════════════════════════════════════════════ */
async function fetchCategories() {
  document.getElementById("category-list-loading").style.display = "flex";
  document.getElementById("category-list-container").innerHTML   = "";

  const { data, error } = await db.from("categories").select("*").order("name");
  document.getElementById("category-list-loading").style.display = "none";

  if (error) {
    document.getElementById("category-list-container").innerHTML =
      `<p style="color:var(--crimson)">Failed to load: ${escHtml(error.message)}</p>`;
    return;
  }
  allCategories = data || [];
  document.getElementById("category-list-count").textContent = allCategories.length;
  renderCategoryList();
  populateCategoryDropdown();
}

function renderCategoryList() {
  const container = document.getElementById("category-list-container");
  if (!allCategories.length) {
    container.innerHTML = `<div class="state-box" style="padding:2rem"><div class="state-icon">🗂</div><p>No categories yet.</p></div>`;
    return;
  }
  container.innerHTML = allCategories.map(cat => {
    const imgHtml = cat.image_url
      ? `<img class="admin-cat-img" src="${escHtml(cat.image_url)}" alt="${escHtml(cat.name)}" loading="lazy"/>`
      : `<div class="admin-cat-img-ph">📦</div>`;
    return `
      <div class="cat-item" id="cat-row-${cat.id}">
        ${imgHtml}
        <div class="cat-item-name" id="cat-name-display-${cat.id}">${escHtml(cat.name)}</div>
        <div class="cat-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="startEditCategory('${cat.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}', '${escHtml(cat.name)}')">🗑️</button>
        </div>
      </div>
    `;
  }).join("");
}

function populateCategoryDropdown() {
  const select  = document.getElementById("prod-category");
  const current = select.value;
  select.innerHTML = `<option value="">— Select category —</option>`;
  allCategories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value       = cat.id;
    opt.textContent = cat.name;
    if (cat.id === current) opt.selected = true;
    select.appendChild(opt);
  });
}

/* ── Category: Add ─────────────────────────────────── */
async function addCategory() {
  const editId   = document.getElementById("edit-category-id").value;
  const name     = document.getElementById("cat-name-input").value.trim();
  const imageFile = document.getElementById("cat-image-input").files[0];

  if (!name) { setStatus("category-form-status", "⚠️ Category name is required.", "err"); return; }

  setStatus("category-form-status", "⏳ Saving…", "");
  const btn = document.getElementById("add-category-btn");
  btn.disabled = true;

  try {
    let image_url = null;
    if (editId) {
      const existing = allCategories.find(c => c.id === editId);
      image_url = existing?.image_url || null;
    }
    if (imageFile) {
      setStatus("category-form-status", "⏳ Uploading image…", "");
      image_url = await uploadCategoryImage(imageFile);
    }

    const row = { name, image_url };

    let error;
    if (editId) {
      ({ error } = await db.from("categories").update(row).eq("id", editId));
    } else {
      ({ error } = await db.from("categories").insert([row]));
    }

    if (error) throw new Error(error.message);

    setStatus("category-form-status", `✅ Category ${editId ? "updated" : "added"}!`, "ok");
    showToast(`✅ Category ${editId ? "updated" : "added"}!`);
    resetCategoryForm();
    await fetchCategories();
    setTimeout(() => setStatus("category-form-status", "", ""), 3000);

  } catch (err) {
    setStatus("category-form-status", `❌ ${err.message}`, "err");
  } finally {
    btn.disabled = false;
  }
}

function startEditCategory(catId) {
  const cat = allCategories.find(c => c.id === catId);
  if (!cat) return;

  document.getElementById("cat-name-input").value  = cat.name;
  document.getElementById("edit-category-id").value = catId;
  document.getElementById("add-category-btn").textContent = "💾 Update Category";
  document.getElementById("cancel-cat-edit-btn").style.display = "inline-flex";

  const preview = document.getElementById("cat-img-preview");
  if (cat.image_url) {
    preview.src           = cat.image_url;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  document.getElementById("cat-name-input").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetCategoryForm() {
  document.getElementById("cat-name-input").value          = "";
  document.getElementById("edit-category-id").value        = "";
  document.getElementById("cat-image-input").value         = "";
  document.getElementById("cat-img-preview").style.display = "none";
  document.getElementById("cat-img-preview").src           = "";
  document.getElementById("add-category-btn").textContent  = "➕ Add Category";
  document.getElementById("cancel-cat-edit-btn").style.display = "none";
  document.getElementById("cat-upload-bar-wrap").style.display = "none";
  document.getElementById("cat-upload-bar").style.width        = "0";
  setStatus("category-form-status", "", "");
}

async function deleteCategory(catId, catName) {
  openConfirm(
    `Delete category "${catName}"? Products in this category will lose their category.`,
    async () => {
      const { error } = await db.from("categories").delete().eq("id", catId);
      closeConfirm();
      if (error) { showToast(`❌ ${error.message}`); return; }
      showToast("🗑️ Category deleted.");
      await fetchCategories();
      await fetchProducts();
    },
    "⚠️ Delete?",
    "🗑️ Delete"
  );
}

/* ═══════════════════════════════════════════════════════════
   IMAGE UPLOAD — Product
═══════════════════════════════════════════════════════════ */
async function uploadProductImage(file) {
  validateImageFile(file, 5);
  const url = await uploadToStorage(BUCKET, file, "uploads", "upload-bar-wrap", "upload-bar");
  return url;
}

/* ═══════════════════════════════════════════════════════════
   IMAGE UPLOAD — Category
═══════════════════════════════════════════════════════════ */
async function uploadCategoryImage(file) {
  validateImageFile(file, 2);
  try {
    return await uploadToStorage(CAT_BUCKET, file, "uploads", "cat-upload-bar-wrap", "cat-upload-bar");
  } catch (err) {
    if (err.message.includes("not found")) {
      return await uploadToStorage(BUCKET, file, "cat-uploads", "cat-upload-bar-wrap", "cat-upload-bar");
    }
    throw err;
  }
}

function validateImageFile(file, maxMB) {
  if (!file) throw new Error("No file selected.");
  if (file.size > maxMB * 1024 * 1024) throw new Error(`File is larger than ${maxMB} MB.`);
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!ALLOWED.includes(file.type)) throw new Error("Only JPG, PNG, WebP, GIF or SVG images are allowed.");
}

async function uploadToStorage(bucket, file, folder, barWrapId, barId) {
  const ext      = file.name.split(".").pop().toLowerCase();
  const filename = `${folder}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path     = `${folder}/${filename}`;

  const barWrap = document.getElementById(barWrapId);
  const bar     = document.getElementById(barId);
  if (barWrap) { barWrap.style.display = "block"; }
  if (bar)     { bar.style.width = "20%"; }

  const { data: uploadData, error: uploadError } = await db.storage
    .from(bucket)
    .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });

  if (uploadError) {
    if (barWrap) barWrap.style.display = "none";
    if (uploadError.message.includes("Bucket not found")) {
      throw new Error(`Storage bucket "${bucket}" not found. Create it in Supabase → Storage.`);
    }
    if (uploadError.message.includes("row-level security")) {
      throw new Error("Storage permission denied. Set the bucket to Public or add RLS policies.");
    }
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  if (bar) bar.style.width = "80%";

  const { data: urlData } = db.storage.from(bucket).getPublicUrl(uploadData?.path || path);
  if (bar) bar.style.width = "100%";
  setTimeout(() => {
    if (barWrap) barWrap.style.display = "none";
    if (bar)     bar.style.width = "0";
  }, 600);

  if (!urlData?.publicUrl) throw new Error("Could not get public URL. Check bucket is set to Public.");
  return urlData.publicUrl;
}

/* ═══════════════════════════════════════════════════════════
   VARIANTS UI
═══════════════════════════════════════════════════════════ */
function addVariantRow(name = "", price = "") {
  const id  = variantCount++;
  const row = document.createElement("div");
  row.className = "variant-row";
  row.id = `vrow-${id}`;
  row.innerHTML = `
    <input type="text"   placeholder="Name (e.g. 500g)" value="${escHtml(name)}"           id="vname-${id}"/>
    <input type="number" placeholder="Price"             value="${escHtml(String(price))}" id="vprice-${id}" min="0" step="0.01"/>
    <button class="remove-variant" onclick="removeVariantRow('vrow-${id}')" aria-label="Remove">✕</button>
  `;
  document.getElementById("variants-list").appendChild(row);
}
function removeVariantRow(rowId) {
  document.getElementById(rowId)?.remove();
}
function getVariantsFromForm() {
  return [...document.querySelectorAll(".variant-row")].reduce((acc, row) => {
    const name  = row.querySelector('input[type="text"]')?.value.trim();
    const price = parseFloat(row.querySelector('input[type="number"]')?.value);
    if (name && !isNaN(price) && price >= 0) acc.push({ name, price });
    return acc;
  }, []);
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS — FETCH & RENDER
═══════════════════════════════════════════════════════════ */
async function fetchProducts() {
  document.getElementById("product-list-loading").style.display = "flex";
  document.getElementById("product-list-container").innerHTML   = "";

  const { data, error } = await db
    .from("products")
    .select("*, categories(name)")
    .order("name");

  document.getElementById("product-list-loading").style.display = "none";

  if (error) {
    document.getElementById("product-list-container").innerHTML =
      `<p style="color:var(--crimson)">Failed to load: ${escHtml(error.message)}</p>`;
    return;
  }
  allProducts = data || [];
  document.getElementById("product-list-count").textContent = allProducts.length;
  renderProductList();
}

function renderProductList() {
  const container = document.getElementById("product-list-container");
  if (!allProducts.length) {
    container.innerHTML = `<div class="state-box" style="padding:2rem"><div class="state-icon">📦</div><p>No products yet.</p></div>`;
    return;
  }
  container.innerHTML = allProducts.map(p => {
    const catName = p.categories?.name || "—";
    const imgHtml = p.imageurl
      ? `<img class="admin-prod-img" src="${escHtml(p.imageurl)}" alt="${escHtml(p.name)}" loading="lazy"/>`
      : `<div class="admin-prod-img-ph">🥬</div>`;

    const sellingPrice = Number(p.baseprice || 0);
    const mrpHtml = (p.mrp && p.mrp > sellingPrice)
      ? `<span class="admin-prod-mrp">MRP ₹${Number(p.mrp).toLocaleString("en-IN")}</span>`
      : "";
    const discountPct = (p.mrp && p.mrp > sellingPrice)
      ? Math.round(((p.mrp - sellingPrice) / p.mrp) * 100)
      : 0;

    const isOOS = p.out_of_stock === true;
    return `
      <div class="admin-product-item${isOOS ? " admin-prod-oos" : ""}" id="prod-row-${p.id}">
        ${imgHtml}
        <div class="admin-prod-info">
          <div class="admin-prod-name">${escHtml(p.name)}</div>
          <div class="admin-prod-price">
            ₹${sellingPrice.toLocaleString("en-IN")}
            ${mrpHtml}
            ${discountPct > 0 ? `<span class="admin-prod-discount">${discountPct}% off</span>` : ""}
          </div>
          <div class="admin-prod-cat">${escHtml(catName)}</div>
          ${isOOS ? `<div class="admin-oos-badge">🚫 Out of Stock</div>` : ""}
        </div>
        <div class="admin-prod-actions">
          <label class="oos-toggle-label" title="${isOOS ? "Mark as In Stock" : "Mark as Out of Stock"}">
            <input type="checkbox" class="oos-toggle-cb" data-id="${p.id}" ${isOOS ? "checked" : ""}/>
            <span class="oos-toggle-track"><span class="oos-toggle-thumb"></span></span>
            <span class="oos-toggle-text">${isOOS ? "OOS" : "In Stock"}</span>
          </label>
          <button class="btn btn-ghost btn-sm" onclick="startEditProduct('${p.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}', '${escHtml(p.name)}')">🗑️</button>
        </div>
      </div>`;
  }).join("");

  // Wire OOS toggle checkboxes
  container.querySelectorAll(".oos-toggle-cb").forEach(cb => {
    cb.addEventListener("change", () => toggleOutOfStock(cb.dataset.id, cb.checked));
  });
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS — TOGGLE OUT OF STOCK
═══════════════════════════════════════════════════════════ */
async function toggleOutOfStock(productId, isOOS) {
  const { error } = await db
    .from("products")
    .update({ out_of_stock: isOOS })
    .eq("id", productId);

  if (error) {
    showToast(`❌ Could not update: ${error.message}`);
    await fetchProducts(); // revert UI
    return;
  }

  // Update local state without full re-fetch
  const prod = allProducts.find(p => p.id === productId);
  if (prod) prod.out_of_stock = isOOS;

  // Update the card visually
  const row = document.getElementById(`prod-row-${productId}`);
  if (row) {
    row.classList.toggle("admin-prod-oos", isOOS);
    const badgeEl = row.querySelector(".admin-oos-badge");
    if (isOOS && !badgeEl) {
      const info = row.querySelector(".admin-prod-info");
      const badge = document.createElement("div");
      badge.className = "admin-oos-badge";
      badge.textContent = "🚫 Out of Stock";
      info.appendChild(badge);
    } else if (!isOOS && badgeEl) {
      badgeEl.remove();
    }
    const textEl = row.querySelector(".oos-toggle-text");
    if (textEl) textEl.textContent = isOOS ? "OOS" : "In Stock";
    const label = row.querySelector(".oos-toggle-label");
    if (label) label.title = isOOS ? "Mark as In Stock" : "Mark as Out of Stock";
  }

  showToast(isOOS ? `🚫 "${prod?.name}" marked Out of Stock` : `✅ "${prod?.name}" is now In Stock`);
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS — SAVE (Add or Update)
═══════════════════════════════════════════════════════════ */
async function saveProduct() {
  const name        = document.getElementById("prod-name").value.trim();
  const desc        = document.getElementById("prod-desc").value.trim();
  const basePrice   = parseFloat(document.getElementById("prod-price").value);
  const mrpVal      = parseFloat(document.getElementById("prod-mrp").value);
  const catId       = document.getElementById("prod-category").value || null;
  const imageFile   = document.getElementById("prod-image").files[0];
  const existUrl    = document.getElementById("existing-image-url").value;
  const editId      = document.getElementById("edit-product-id").value;
  const variants    = getVariantsFromForm();

  if (!name) { setStatus("product-form-status", "⚠️ Product name is required.", "err"); return; }
  if (isNaN(basePrice) || basePrice < 0) { setStatus("product-form-status", "⚠️ Enter a valid selling price.", "err"); return; }
  if (!isNaN(mrpVal) && mrpVal > 0 && mrpVal < basePrice) {
    setStatus("product-form-status", "⚠️ MRP should be ≥ selling price.", "err"); return;
  }

  const btn = document.getElementById("save-product-btn");
  btn.disabled    = true;
  btn.textContent = "⏳ Saving…";
  setStatus("product-form-status", "⏳ Saving product…", "");

  try {
    let imageurl = existUrl || "";
    if (imageFile) {
      setStatus("product-form-status", "⏳ Uploading image…", "");
      try {
        imageurl = await uploadProductImage(imageFile);
      } catch (imgErr) {
        setStatus("product-form-status", `❌ Image upload failed: ${imgErr.message}`, "err");
        btn.disabled    = false;
        btn.textContent = editId ? "💾 Update Product" : "💾 Save Product";
        return;
      }
    }

    const row = {
      name,
      description: desc,
      baseprice:   basePrice,
      mrp:         (!isNaN(mrpVal) && mrpVal > 0) ? mrpVal : null,
      imageurl,
      category_id: catId,
      variants:    variants.length ? variants : [],
    };

    let dbError;
    if (editId) {
      ({ error: dbError } = await db.from("products").update(row).eq("id", editId));
    } else {
      ({ error: dbError } = await db.from("products").insert([row]));
    }

    if (dbError) throw new Error(dbError.message);

    setStatus("product-form-status", `✅ Product ${editId ? "updated" : "added"} successfully!`, "ok");
    showToast(`✅ Product ${editId ? "updated" : "added"}!`);
    resetProductForm();
    await fetchProducts();
    setTimeout(() => setStatus("product-form-status", "", ""), 3000);

  } catch (err) {
    console.error("saveProduct error:", err);
    setStatus("product-form-status", `❌ ${err.message}`, "err");
  } finally {
    btn.disabled    = false;
    btn.textContent = document.getElementById("edit-product-id").value ? "💾 Update Product" : "💾 Save Product";
  }
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS — EDIT
═══════════════════════════════════════════════════════════ */
function startEditProduct(productId) {
  const p = allProducts.find(x => x.id === productId);
  if (!p) return;

  document.getElementById("product-form-title").textContent  = "✏️ Edit Product";
  document.getElementById("edit-product-id").value           = productId;
  document.getElementById("prod-name").value                 = p.name || "";
  document.getElementById("prod-desc").value                 = p.description || "";
  document.getElementById("prod-price").value                = p.baseprice || "";
  document.getElementById("prod-mrp").value                  = p.mrp || "";
  document.getElementById("prod-category").value             = p.category_id || "";
  document.getElementById("existing-image-url").value        = p.imageurl || "";
  document.getElementById("save-product-btn").textContent    = "💾 Update Product";
  document.getElementById("cancel-edit-btn").style.display   = "inline-flex";

  const preview = document.getElementById("img-preview");
  if (p.imageurl) {
    preview.src           = p.imageurl;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  document.getElementById("variants-list").innerHTML = "";
  variantCount = 0;
  parseVariants(p.variants).forEach(v => addVariantRow(v.name, v.price));

  setStatus("product-form-status", "", "");
  document.querySelector('#tab-products .admin-card').scrollIntoView({ behavior: "smooth", block: "start" });
  switchTab("products");
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS — DELETE
═══════════════════════════════════════════════════════════ */
async function deleteProduct(productId, productName) {
  openConfirm(
    `Delete "${productName}"? This cannot be undone.`,
    async () => {
      const { error } = await db.from("products").delete().eq("id", productId);
      closeConfirm();
      if (error) { showToast(`❌ ${error.message}`); return; }
      showToast("🗑️ Product deleted.");
      if (document.getElementById("edit-product-id").value === productId) resetProductForm();
      await fetchProducts();
    },
    "⚠️ Delete?",
    "🗑️ Delete"
  );
}

/* ═══════════════════════════════════════════════════════════
   FORM RESET — Product
═══════════════════════════════════════════════════════════ */
function resetProductForm() {
  document.getElementById("product-form-title").textContent  = "➕ Add Product";
  document.getElementById("edit-product-id").value           = "";
  document.getElementById("prod-name").value                 = "";
  document.getElementById("prod-desc").value                 = "";
  document.getElementById("prod-price").value                = "";
  document.getElementById("prod-mrp").value                  = "";
  document.getElementById("prod-category").value             = "";
  document.getElementById("prod-image").value                = "";
  document.getElementById("existing-image-url").value        = "";
  document.getElementById("img-preview").style.display       = "none";
  document.getElementById("img-preview").src                 = "";
  document.getElementById("variants-list").innerHTML         = "";
  document.getElementById("cancel-edit-btn").style.display   = "none";
  document.getElementById("save-product-btn").textContent    = "💾 Save Product";
  document.getElementById("upload-bar-wrap").style.display   = "none";
  document.getElementById("upload-bar").style.width          = "0";
  variantCount = 0;
  setStatus("product-form-status", "", "");
}

/* ═══════════════════════════════════════════════════════════
   ORDERS — FETCH & RENDER
   ─────────────────────────────────────────────────────────
   Reads from Supabase `orders` table.
   Table schema expected:
     id (text PK) | customer_name | customer_phone |
     customer_address | customer_pincode |
     items (jsonb) | total (numeric) | created_at
═══════════════════════════════════════════════════════════ */
async function fetchOrders() {
  const loadEl = document.getElementById("order-list-loading");
  const contEl = document.getElementById("order-list-container");
  if (loadEl) loadEl.style.display = "flex";
  if (contEl) contEl.innerHTML     = "";

  const { data, error } = await db
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (loadEl) loadEl.style.display = "none";

  if (error) {
    if (contEl) contEl.innerHTML =
      `<p style="color:var(--crimson);padding:1rem">Failed to load orders: ${escHtml(error.message)}</p>`;
    return;
  }

  allOrders = data || [];
  const countEl = document.getElementById("order-list-count");
  if (countEl) countEl.textContent = allOrders.length;
  renderOrderList();
}

function renderOrderList() {
  const container = document.getElementById("order-list-container");
  if (!container) return;

  if (!allOrders.length) {
    container.innerHTML = `
      <div class="state-box" style="padding:2.5rem">
        <div class="state-icon">📋</div>
        <p>No active orders.</p>
        <p style="font-size:.82rem;color:var(--light);margin-top:.3rem">New orders will appear here instantly.</p>
      </div>`;
    return;
  }

  container.innerHTML = allOrders.map(order => {
    const items   = Array.isArray(order.items) ? order.items : [];
    const dateStr = order.created_at
      ? new Date(order.created_at).toLocaleString("en-IN", {
          day: "2-digit", month: "short", year: "numeric",
          hour: "2-digit", minute: "2-digit"
        })
      : "—";

    const itemLines = items.map(item =>
      `<div class="order-admin-item-line">
         <span>${escHtml(item.name)}${item.variantName ? ` <em>(${escHtml(item.variantName)})</em>` : ""} × ${item.qty}</span>
         <span>₹${(item.price * item.qty).toLocaleString("en-IN")}</span>
       </div>`
    ).join("");

    return `
      <div class="order-admin-card" id="order-row-${escHtml(order.id)}">
        <div class="order-admin-header">
          <div>
            <div class="order-admin-id">${escHtml(order.id)}</div>
            <div class="order-admin-date">${dateStr}</div>
          </div>
          <div class="order-admin-total">₹${Number(order.total).toLocaleString("en-IN")}</div>
        </div>

        <div class="order-admin-customer">
          <span>👤 <strong>${escHtml(order.customer_name)}</strong></span>
          <span>📞 ${escHtml(order.customer_phone)}</span>
          <span>📍 ${escHtml(order.customer_address)}, ${escHtml(order.customer_pincode)}</span>
        </div>

        <div class="order-admin-items">${itemLines}</div>

        <div class="order-admin-actions">
          <button
            class="btn btn-saffron btn-sm"
            onclick="markDelivered('${escHtml(order.id)}')"
          >
            ✅ Mark as Delivered
          </button>
        </div>
      </div>`;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════
   ORDERS — MARK AS DELIVERED
   ─────────────────────────────────────────────────────────
   On confirmation:
     1. Deletes the order row from Supabase DB immediately
     2. Removes the card from the admin UI instantly
     3. The Supabase Realtime DELETE event triggers the
        storefront (app.js) to remove it from localStorage
        and the user's My Orders view
═══════════════════════════════════════════════════════════ */
async function markDelivered(orderId) {
  openConfirm(
    `Mark order ${orderId} as delivered? This will permanently delete it from the system.`,
    async () => {
      closeConfirm();

      // Remove card from UI immediately (optimistic)
      const row = document.getElementById(`order-row-${orderId}`);
      if (row) {
        row.style.transition = "opacity .3s";
        row.style.opacity    = "0";
        setTimeout(() => row.remove(), 320);
      }

      // Delete from Supabase DB
      const { error } = await db.from("orders").delete().eq("id", orderId);

      if (error) {
        showToast(`❌ Could not delete order: ${error.message}`);
        // Re-fetch to restore accurate state
        await fetchOrders();
        return;
      }

      // Update local state and counter
      allOrders = allOrders.filter(o => o.id !== orderId);
      const countEl = document.getElementById("order-list-count");
      if (countEl) countEl.textContent = allOrders.length;

      showToast(`✅ Order ${orderId} marked as delivered and deleted.`);

      // If list is now empty, show empty state
      if (!allOrders.length) renderOrderList();
    },
    "✅ Confirm Delivery",
    "✅ Delivered"
  );
}

/* ═══════════════════════════════════════════════════════════
   REALTIME — new order badge notification
   ─────────────────────────────────────────────────────────
   Shows a red dot on the "Orders" nav tab when a new order
   arrives while admin is on a different tab.
═══════════════════════════════════════════════════════════ */
function subscribeToNewOrders() {
  db.channel("admin-orders-watch")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "orders" },
      payload => {
        // Show badge on Orders tab button
        const badge = document.getElementById("orders-badge");
        if (badge) {
          badge.style.display = "inline-block";
          badge.textContent   = "🆕";
        }
        // If admin is already on orders tab, refresh automatically
        const ordersTab = document.getElementById("tab-orders");
        if (ordersTab && ordersTab.style.display !== "none") {
          fetchOrders();
        } else {
          showToast("📋 New order received!");
        }
      }
    )
    .subscribe();
}

/* ═══════════════════════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════
   INIT & EVENT WIRING
═══════════════════════════════════════════════════════════ */
async function init() {
  await fetchCategories();
  await fetchProducts();
  await fetchOrders();
  subscribeToNewOrders();
}

document.addEventListener("DOMContentLoaded", () => {

  /* ── Login ─────────────────────────────────────────── */
  document.getElementById("login-btn").addEventListener("click", doLogin);
  document.getElementById("login-pass").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("logout-btn").addEventListener("click", doLogout);

  /* ── Tabs ──────────────────────────────────────────── */
  document.querySelectorAll(".admin-nav-link[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* ── Product form ──────────────────────────────────── */
  document.getElementById("save-product-btn").addEventListener("click", saveProduct);
  document.getElementById("cancel-edit-btn").addEventListener("click", resetProductForm);
  document.getElementById("add-variant-btn").addEventListener("click", () => addVariantRow());

  document.getElementById("prod-image").addEventListener("change", e => {
    const file    = e.target.files[0];
    const preview = document.getElementById("img-preview");
    if (file) {
      preview.src           = URL.createObjectURL(file);
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  });

  /* ── Category form ─────────────────────────────────── */
  document.getElementById("add-category-btn").addEventListener("click", addCategory);
  document.getElementById("cat-name-input").addEventListener("keydown", e => {
    if (e.key === "Enter") addCategory();
  });

  document.getElementById("cat-image-input").addEventListener("change", e => {
    const file    = e.target.files[0];
    const preview = document.getElementById("cat-img-preview");
    if (file) {
      preview.src           = URL.createObjectURL(file);
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  });

  const cancelCatBtn = document.getElementById("cancel-cat-edit-btn");
  if (cancelCatBtn) cancelCatBtn.addEventListener("click", resetCategoryForm);

  /* ── Orders tab — refresh button ───────────────────── */
  const refreshOrdersBtn = document.getElementById("refresh-orders-btn");
  if (refreshOrdersBtn) refreshOrdersBtn.addEventListener("click", fetchOrders);

  /* ── Confirm modal ─────────────────────────────────── */
  document.getElementById("confirm-cancel-btn").addEventListener("click", closeConfirm);
  document.getElementById("confirm-ok-btn").addEventListener("click", () => {
    if (typeof deleteCallback === "function") deleteCallback();
  });
  document.getElementById("confirm-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("confirm-modal")) closeConfirm();
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeConfirm();
  });
});
