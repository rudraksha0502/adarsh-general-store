/* ═══════════════════════════════════════════════════════════
   admin.js  —  Adarsh General Store · Admin Panel Logic
   Depends on: supabase.js (db)
   Fixed: Supabase Storage upload + public URL retrieval
═══════════════════════════════════════════════════════════ */

/* ── Hardcoded credentials (change before deploy) ────── */
const ADMIN_USER = "admin";
const ADMIN_PASS = "adarsh@2025";
const BUCKET     = "product-images";

/* ── State ───────────────────────────────────────────── */
let allCategories = [];
let allProducts   = [];
let variantCount  = 0;
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
function openConfirm(message, onConfirm) {
  document.getElementById("confirm-msg").textContent = message;
  deleteCallback = onConfirm;
  document.getElementById("confirm-modal").style.display = "flex";
}
function closeConfirm() {
  document.getElementById("confirm-modal").style.display = "none";
  deleteCallback = null;
}

/* ═══════════════════════════════════════════════════════════
   CATEGORIES
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

  container.innerHTML = allCategories.map(cat => `
    <div class="cat-item" id="cat-row-${cat.id}">
      <div class="cat-item-name" id="cat-name-display-${cat.id}">${escHtml(cat.name)}</div>
      <div class="cat-item-actions">
        <button class="btn btn-ghost btn-sm" onclick="startEditCategory('${cat.id}')">✏️ Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCategory('${cat.id}', '${escHtml(cat.name)}')">🗑️</button>
      </div>
    </div>
  `).join("");
}

function populateCategoryDropdown() {
  const select = document.getElementById("prod-category");
  const current = select.value;
  select.innerHTML = `<option value="">— Select category —</option>`;
  allCategories.forEach(cat => {
    const opt = document.createElement("option");
    opt.value = cat.id;
    opt.textContent = cat.name;
    if (cat.id === current) opt.selected = true;
    select.appendChild(opt);
  });
}

async function addCategory() {
  const name = document.getElementById("cat-name-input").value.trim();
  if (!name) { setStatus("category-form-status", "⚠️ Category name is required.", "err"); return; }

  setStatus("category-form-status", "⏳ Saving…", "");
  const btn = document.getElementById("add-category-btn");
  btn.disabled = true;

  const { error } = await db.from("categories").insert([{ name }]);
  btn.disabled = false;

  if (error) {
    setStatus("category-form-status", `❌ ${error.message}`, "err"); return;
  }
  setStatus("category-form-status", "✅ Category added!", "ok");
  document.getElementById("cat-name-input").value = "";
  showToast("✅ Category added!");
  await fetchCategories();
  setTimeout(() => setStatus("category-form-status", "", ""), 3000);
}

function startEditCategory(catId) {
  const cat = allCategories.find(c => c.id === catId);
  if (!cat) return;

  const row = document.getElementById(`cat-row-${catId}`);
  row.innerHTML = `
    <input type="text" class="cat-edit-input" id="cat-edit-input-${catId}" value="${escHtml(cat.name)}"/>
    <div class="cat-item-actions">
      <button class="btn btn-saffron btn-sm" onclick="saveEditCategory('${catId}')">✅ Save</button>
      <button class="btn btn-ghost btn-sm" onclick="renderCategoryList()">✕</button>
    </div>
  `;
  document.getElementById(`cat-edit-input-${catId}`)?.focus();
}

async function saveEditCategory(catId) {
  const input = document.getElementById(`cat-edit-input-${catId}`);
  const newName = input?.value.trim();
  if (!newName) { showToast("⚠️ Name cannot be empty."); return; }

  const { error } = await db.from("categories").update({ name: newName }).eq("id", catId);
  if (error) { showToast(`❌ ${error.message}`); return; }

  showToast("✅ Category updated!");
  await fetchCategories();
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
      await fetchProducts(); // refresh product list too
    }
  );
}

/* ═══════════════════════════════════════════════════════════
   IMAGE UPLOAD  (Critical fix)
═══════════════════════════════════════════════════════════ */
async function uploadProductImage(file) {
  /* ── Validate ─────────────────────────────────────────── */
  if (!file) throw new Error("No file selected.");
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (file.size > MAX_SIZE) throw new Error("File is larger than 5 MB. Please compress the image.");
  const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!ALLOWED.includes(file.type)) throw new Error("Only JPG, PNG, WebP or GIF images are allowed.");

  /* ── Unique filename ──────────────────────────────────── */
  const ext      = file.name.split(".").pop().toLowerCase();
  const filename = `product_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path     = `uploads/${filename}`;

  /* ── Show progress bar ────────────────────────────────── */
  const barWrap = document.getElementById("upload-bar-wrap");
  const bar     = document.getElementById("upload-bar");
  barWrap.style.display = "block";
  bar.style.width       = "10%";

  /* ── Upload to Supabase Storage ───────────────────────── */
  const { data: uploadData, error: uploadError } = await db.storage
    .from(BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert:       false,
      contentType:  file.type,
    });

  if (uploadError) {
    barWrap.style.display = "none";
    /* Common errors with human-readable messages */
    if (uploadError.message.includes("Bucket not found")) {
      throw new Error(`Storage bucket "${BUCKET}" not found. Create it in Supabase → Storage.`);
    }
    if (uploadError.message.includes("row-level security")) {
      throw new Error("Storage permission denied. Set the bucket to Public or add RLS policies.");
    }
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  bar.style.width = "80%";

  /* ── Get public URL ───────────────────────────────────── */
  const { data: urlData } = db.storage
    .from(BUCKET)
    .getPublicUrl(uploadData?.path || path);

  bar.style.width = "100%";
  setTimeout(() => { barWrap.style.display = "none"; bar.style.width = "0"; }, 600);

  if (!urlData?.publicUrl) {
    throw new Error("Could not get public URL. Check bucket is set to Public.");
  }

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
    <input type="text"   placeholder="Name (e.g. 500g)" value="${escHtml(name)}"  id="vname-${id}"/>
    <input type="number" placeholder="Price"             value="${escHtml(String(price))}" id="vprice-${id}" min="0" step="0.01"/>
    <button class="remove-variant" onclick="removeVariantRow('vrow-${id}')" aria-label="Remove variant">✕</button>
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
  document.getElementById("product-list-loading").style.display    = "flex";
  document.getElementById("product-list-container").innerHTML      = "";

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
    const catName  = p.categories?.name || "—";
    const imgHtml  = p.imageurl
      ? `<img class="admin-prod-img" src="${escHtml(p.imageurl)}" alt="${escHtml(p.name)}" loading="lazy"/>`
      : `<div class="admin-prod-img-ph">🥬</div>`;

    return `
      <div class="admin-product-item" id="prod-row-${p.id}">
        ${imgHtml}
        <div class="admin-prod-info">
          <div class="admin-prod-name">${escHtml(p.name)}</div>
          <div class="admin-prod-price">₹${Number(p.baseprice || 0).toLocaleString("en-IN")}</div>
          <div class="admin-prod-cat">${escHtml(catName)}</div>
        </div>
        <div class="admin-prod-actions">
          <button class="btn btn-ghost btn-sm" onclick="startEditProduct('${p.id}')">✏️</button>
          <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}', '${escHtml(p.name)}')">🗑️</button>
        </div>
      </div>`;
  }).join("");
}

/* ═══════════════════════════════════════════════════════════
   PRODUCTS — SAVE (Add or Update)
═══════════════════════════════════════════════════════════ */
async function saveProduct() {
  const name      = document.getElementById("prod-name").value.trim();
  const desc      = document.getElementById("prod-desc").value.trim();
  const basePrice = parseFloat(document.getElementById("prod-price").value);
  const catId     = document.getElementById("prod-category").value || null;
  const imageFile = document.getElementById("prod-image").files[0];
  const existUrl  = document.getElementById("existing-image-url").value;
  const editId    = document.getElementById("edit-product-id").value;
  const variants  = getVariantsFromForm();

  /* Validation */
  if (!name) { setStatus("product-form-status", "⚠️ Product name is required.", "err"); return; }
  if (isNaN(basePrice) || basePrice < 0) { setStatus("product-form-status", "⚠️ Enter a valid base price.", "err"); return; }

  const btn = document.getElementById("save-product-btn");
  btn.disabled     = true;
  btn.textContent  = "⏳ Saving…";
  setStatus("product-form-status", "⏳ Saving product…", "");

  try {
    /* ── Handle image upload ─────────────────────────── */
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

    /* ── Build row ───────────────────────────────────── */
    const row = {
      name,
      description: desc,
      baseprice:   basePrice,
      imageurl,
      category_id: catId,
      variants:    variants.length ? variants : [],
    };

    /* ── Insert or Update ────────────────────────────── */
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
  document.getElementById("prod-category").value             = p.category_id || "";
  document.getElementById("existing-image-url").value        = p.imageurl || "";
  document.getElementById("save-product-btn").textContent    = "💾 Update Product";
  document.getElementById("cancel-edit-btn").style.display   = "inline-flex";

  /* Image preview */
  const preview = document.getElementById("img-preview");
  if (p.imageurl) {
    preview.src           = p.imageurl;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  /* Variants */
  document.getElementById("variants-list").innerHTML = "";
  variantCount = 0;
  parseVariants(p.variants).forEach(v => addVariantRow(v.name, v.price));

  setStatus("product-form-status", "", "");

  /* Scroll to form on mobile */
  document.querySelector('#tab-products .admin-card').scrollIntoView({ behavior: "smooth", block: "start" });

  /* Switch to products tab */
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
    }
  );
}

/* ═══════════════════════════════════════════════════════════
   FORM RESET
═══════════════════════════════════════════════════════════ */
function resetProductForm() {
  document.getElementById("product-form-title").textContent  = "➕ Add Product";
  document.getElementById("edit-product-id").value           = "";
  document.getElementById("prod-name").value                 = "";
  document.getElementById("prod-desc").value                 = "";
  document.getElementById("prod-price").value                = "";
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
}

document.addEventListener("DOMContentLoaded", () => {

  /* ── Login ───────────────────────────────────────────── */
  document.getElementById("login-btn").addEventListener("click", doLogin);
  document.getElementById("login-pass").addEventListener("keydown", e => {
    if (e.key === "Enter") doLogin();
  });
  document.getElementById("logout-btn").addEventListener("click", doLogout);

  /* ── Tabs ────────────────────────────────────────────── */
  document.querySelectorAll(".admin-nav-link[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* ── Product form ────────────────────────────────────── */
  document.getElementById("save-product-btn").addEventListener("click", saveProduct);
  document.getElementById("cancel-edit-btn").addEventListener("click", resetProductForm);
  document.getElementById("add-variant-btn").addEventListener("click", () => addVariantRow());

  /* Image file input — show preview */
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

  /* ── Category form ───────────────────────────────────── */
  document.getElementById("add-category-btn").addEventListener("click", addCategory);
  document.getElementById("cat-name-input").addEventListener("keydown", e => {
    if (e.key === "Enter") addCategory();
  });

  /* ── Confirm modal ───────────────────────────────────── */
  document.getElementById("confirm-cancel-btn").addEventListener("click", closeConfirm);
  document.getElementById("confirm-ok-btn").addEventListener("click", () => {
    if (typeof deleteCallback === "function") deleteCallback();
  });
  document.getElementById("confirm-modal").addEventListener("click", e => {
    if (e.target === document.getElementById("confirm-modal")) closeConfirm();
  });

  /* ── Keyboard ────────────────────────────────────────── */
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") closeConfirm();
  });
});
