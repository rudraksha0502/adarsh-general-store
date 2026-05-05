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
// Images are now uploaded to Cloudinary (see cloudinary.js)
// BUCKET / CAT_BUCKET constants removed — no longer using Supabase Storage

/* ── State ───────────────────────────────────────────── */
let allCategories  = [];   // all rows (headers + subs)
let allHeaders     = [];   // parent_id IS NULL
let allSubs        = [];   // parent_id IS NOT NULL
let allProducts    = [];
let allOrders      = [];
let variantCount   = 0;
let deleteCallback = null;
let currentCatMode = "header"; // "header" | "sub"

/* FEATURE 1: Store open/close state tracked in admin */
let adminStoreIsOpen = true;

/* ═══════════════════════════════════════════════════════════
   FEATURE 1: STORE OPEN / CLOSE
   ─────────────────────────────────────────────────────────
   DB table `settings` with row: { key: "store_open", value: "true"/"false" }
   Admin can toggle this from the nav button.
═══════════════════════════════════════════════════════════ */

/** Fetch current store status from Supabase settings table */
async function fetchStoreStatus() {
  try {
    const { data, error } = await db
      .from("settings")
      .select("value")
      .eq("key", "store_open")
      .single();
    adminStoreIsOpen = error ? true : data.value !== "false";
  } catch {
    adminStoreIsOpen = true;
  }
  renderStoreToggleBtn();
}

/** Update the store status in DB and reflect in UI */
async function toggleStoreStatus() {
  const btn = document.getElementById("store-toggle-btn");
  if (btn) btn.disabled = true;

  const newState = !adminStoreIsOpen;
  try {
    // Upsert: insert if doesn't exist, update if it does
    const { error } = await db
      .from("settings")
      .upsert({ key: "store_open", value: String(newState) }, { onConflict: "key" });

    if (error) throw new Error(error.message);
    adminStoreIsOpen = newState;
    showToast(newState ? "✅ Store is now OPEN" : "🔒 Store is now CLOSED");
  } catch (err) {
    showToast(`❌ Could not update store status: ${err.message}`);
  } finally {
    if (btn) btn.disabled = false;
    renderStoreToggleBtn();
  }
}

/** Reflect store open/close state on the toggle button */
function renderStoreToggleBtn() {
  const btn   = document.getElementById("store-toggle-btn");
  const icon  = document.getElementById("store-toggle-icon");
  const label = document.getElementById("store-toggle-label");
  if (!btn) return;

  if (adminStoreIsOpen) {
    btn.className = "store-toggle-btn store-open";
    if (icon)  icon.textContent  = "🟢";
    if (label) label.textContent = "Store: Open";
    btn.title = "Click to close the store";
  } else {
    btn.className = "store-toggle-btn store-closed";
    if (icon)  icon.textContent  = "🔴";
    if (label) label.textContent = "Store: Closed";
    btn.title = "Click to open the store";
  }
}

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
  // Close hamburger menu on mobile after selecting a tab
  closeHamburger();

  document.getElementById("tab-add-product").style.display = tab === "add-product" ? "grid" : "none";
  document.getElementById("tab-products").style.display    = tab === "products"    ? "grid" : "none";
  document.getElementById("tab-categories").style.display  = tab === "categories"  ? "grid" : "none";
  document.getElementById("tab-orders").style.display      = tab === "orders"      ? "grid" : "none";
  document.getElementById("tab-coupons").style.display     = tab === "coupons"     ? "grid" : "none";
  const analyticsEl = document.getElementById("tab-analytics");
  if (analyticsEl) analyticsEl.style.display = tab === "analytics" ? "grid" : "none";

  // Clear badge when admin opens orders tab
  if (tab === "orders") {
    const badge = document.getElementById("orders-badge");
    if (badge) badge.style.display = "none";
    fetchOrders();
  }
  if (tab === "coupons")   fetchCouponsAdmin();
  if (tab === "products")  renderFilteredProducts();
  if (tab === "analytics") loadAnalytics();
}

/* ═══════════════════════════════════════════════════════════
   HAMBURGER MENU
═══════════════════════════════════════════════════════════ */
function toggleHamburger() {
  const btn   = document.getElementById("hamburger-btn");
  const links = document.getElementById("admin-nav-links");
  const open  = links.classList.toggle("open");
  btn.setAttribute("aria-expanded", open);
  btn.classList.toggle("open", open);
}
function closeHamburger() {
  const btn   = document.getElementById("hamburger-btn");
  const links = document.getElementById("admin-nav-links");
  links.classList.remove("open");
  btn.setAttribute("aria-expanded", "false");
  btn.classList.remove("open");
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
   CATEGORIES — FETCH & RENDER (two-tier: headers + subs)
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

  // FEATURE 3: Sort categories by numeric prefix (e.g. "1. Fruits" before "2. Dairy")
  // then alphabetically as fallback — guarantees consistent order in admin list AND
  // the storefront dropdown.
  allCategories = (data || []).sort((a, b) => {
    const na = _numericPrefixAdmin(a.name);
    const nb = _numericPrefixAdmin(b.name);
    if (na !== nb) return na - nb;
    return a.name.localeCompare(b.name);
  });

  allHeaders    = allCategories.filter(c => !c.parent_id);
  allSubs       = allCategories.filter(c =>  c.parent_id);

  document.getElementById("category-list-count").textContent = allCategories.length;
  renderCategoryList();
  populateCategoryDropdown();
  populateParentDropdown();
}

/** Extract leading numeric prefix for sort — "3. Dairy" → 3, "Beverages" → Infinity */
function _numericPrefixAdmin(name) {
  const m = (name || "").match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : Infinity;
}

function catIconHtml(cat, size = "admin") {
  if (cat.emoji) {
    return `<div class="${size === "admin" ? "admin-cat-emoji-ph" : "admin-cat-img-ph"}">${escHtml(cat.emoji)}</div>`;
  }
  if (cat.image_url) {
    return `<img class="admin-cat-img" src="${escHtml(cat.image_url)}" alt="${escHtml(cat.name)}" loading="lazy"/>`;
  }
  return `<div class="admin-cat-img-ph">📦</div>`;
}

function renderCategoryList() {
  const container = document.getElementById("category-list-container");
  if (!allCategories.length) {
    container.innerHTML = `<div class="state-box" style="padding:2rem"><div class="state-icon">🗂</div><p>No categories yet. Add a Main Category first.</p></div>`;
    return;
  }

  let html = "";

  // Render each header and its subs
  allHeaders.forEach(header => {
    const subs = allSubs.filter(s => s.parent_id === header.id);
    html += `
      <div class="cat-header-group" id="cat-header-group-${header.id}">
        <div class="cat-header-row">
          ${catIconHtml(header)}
          <div class="cat-header-label">${escHtml(header.name)}</div>
          <div class="cat-item-actions">
            <button class="btn btn-ghost btn-sm" onclick="startEditHeader('${header.id}')">✏️ Edit</button>
            <button class="btn btn-danger btn-sm" onclick="deleteCategory('${header.id}', '${escHtml(header.name)}', true)">🗑️</button>
          </div>
        </div>
        ${subs.length === 0
          ? `<div style="padding:.3rem 1.5rem;font-size:.8rem;color:var(--light)">No sub-categories yet</div>`
          : subs.map(sub => `
            <div class="cat-sub-row" id="cat-row-${sub.id}">
              ${catIconHtml(sub)}
              <div class="cat-sub-name">${escHtml(sub.name)}</div>
              <div class="cat-item-actions">
                <button class="btn btn-ghost btn-sm" onclick="startEditSub('${sub.id}')">✏️ Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteCategory('${sub.id}', '${escHtml(sub.name)}', false)">🗑️</button>
              </div>
            </div>`).join("")
        }
      </div>`;
  });

  // Orphan subs (no matching header — shouldn't happen but show just in case)
  const orphans = allSubs.filter(s => !allHeaders.find(h => h.id === s.parent_id));
  if (orphans.length) {
    html += `<div class="cat-header-group"><div class="cat-header-row"><div class="cat-header-label" style="color:var(--crimson)">⚠️ Orphaned Sub-categories</div></div>`;
    orphans.forEach(sub => {
      html += `<div class="cat-sub-row">${catIconHtml(sub)}<div class="cat-sub-name">${escHtml(sub.name)}</div>
        <div class="cat-item-actions">
          <button class="btn btn-ghost btn-sm" onclick="startEditSub('${sub.id}')">✏️ Edit</button>
          <button class="btn btn-danger btn-sm" onclick="deleteCategory('${sub.id}', '${escHtml(sub.name)}', false)">🗑️</button>
        </div></div>`;
    });
    html += `</div>`;
  }

  container.innerHTML = html || `<div class="state-box" style="padding:2rem"><div class="state-icon">🗂</div><p>No categories yet.</p></div>`;
}

function populateCategoryDropdown() {
  const select  = document.getElementById("prod-category");
  const current = select.value;
  select.innerHTML = `<option value="">— Select category —</option>`;
  // Group by header in product dropdown
  allHeaders.forEach(header => {
    const subs = allSubs.filter(s => s.parent_id === header.id);
    if (subs.length) {
      const grp = document.createElement("optgroup");
      grp.label = header.name;
      subs.forEach(sub => {
        const opt = document.createElement("option");
        opt.value       = sub.id;
        opt.textContent = sub.name;
        if (sub.id === current) opt.selected = true;
        grp.appendChild(opt);
      });
      select.appendChild(grp);
    }
  });
  // Also include headers themselves so old products still work
  allHeaders.forEach(h => {
    const opt = document.createElement("option");
    opt.value       = h.id;
    opt.textContent = `[Header] ${h.name}`;
    if (h.id === current) opt.selected = true;
    select.appendChild(opt);
  });
}

function populateParentDropdown() {
  const select = document.getElementById("sub-parent-select");
  if (!select) return;
  const current = select.value;
  select.innerHTML = `<option value="">— Select a Main Category —</option>`;
  allHeaders.forEach(h => {
    const opt = document.createElement("option");
    opt.value       = h.id;
    opt.textContent = h.name;
    if (h.id === current) opt.selected = true;
    select.appendChild(opt);
  });
}

/* ── Mode toggle: "header" vs "sub" ─────────────────── */
function setCatMode(mode) {
  currentCatMode = mode;
  document.getElementById("cat-header-form-section").style.display = mode === "header" ? "block" : "none";
  document.getElementById("cat-sub-form-section").style.display    = mode === "sub"    ? "block" : "none";
  document.getElementById("cat-mode-header-btn").classList.toggle("active", mode === "header");
  document.getElementById("cat-mode-sub-btn").classList.toggle("active", mode === "sub");
}

/* ── Icon tab toggle (emoji vs image) ───────────────── */
function switchIconTab(prefix, type) {
  const emojiSection = document.getElementById(`${prefix}-emoji-section`);
  const imageSection = document.getElementById(`${prefix}-image-section`);
  const emojiTab     = document.getElementById(`${prefix}-tab-emoji`);
  const imageTab     = document.getElementById(`${prefix}-tab-image`);
  emojiSection.style.display = type === "emoji" ? "block" : "none";
  imageSection.style.display = type === "image" ? "block" : "none";
  emojiTab.classList.toggle("active", type === "emoji");
  imageTab.classList.toggle("active", type === "image");
}

/* ── Save Main Category (Header) ────────────────────── */
async function saveHeader() {
  const editId    = document.getElementById("edit-header-id").value;
  const name      = document.getElementById("header-name-input").value.trim();
  const emojiVal  = document.getElementById("header-emoji-input").value.trim();
  const imageFile = document.getElementById("header-image-input").files[0];
  const useEmoji  = document.getElementById("header-emoji-section").style.display !== "none";

  if (!name) { setStatus("header-form-status", "⚠️ Header name is required.", "err"); return; }

  setStatus("header-form-status", "⏳ Saving…", "");
  const btn = document.getElementById("save-header-btn");
  btn.disabled = true;

  try {
    let image_url = editId ? (allHeaders.find(h => h.id === editId)?.image_url || null) : null;
    let emoji     = useEmoji ? (emojiVal || null) : null;

    if (!useEmoji && imageFile) {
      setStatus("header-form-status", "⏳ Uploading image…", "");
      image_url = await uploadCategoryImage(imageFile, "header-upload-bar-wrap", "header-upload-bar");
    }
    if (useEmoji) image_url = null; // clear image if switching to emoji

    const row = { name, image_url, emoji, parent_id: null };
    let error;
    if (editId) {
      ({ error } = await db.from("categories").update(row).eq("id", editId));
    } else {
      ({ error } = await db.from("categories").insert([row]));
    }
    if (error) throw new Error(error.message);

    setStatus("header-form-status", `✅ Main Category ${editId ? "updated" : "added"}!`, "ok");
    showToast(`✅ Main Category ${editId ? "updated" : "added"}!`);
    resetHeaderForm();
    await fetchCategories();
    setTimeout(() => setStatus("header-form-status", "", ""), 3000);
  } catch (err) {
    setStatus("header-form-status", `❌ ${err.message}`, "err");
  } finally {
    btn.disabled = false;
  }
}

/* ── Save Sub Category ──────────────────────────────── */
async function saveSub() {
  const editId    = document.getElementById("edit-sub-id").value;
  const parentId  = document.getElementById("sub-parent-select").value;
  const name      = document.getElementById("sub-name-input").value.trim();
  const emojiVal  = document.getElementById("sub-emoji-input").value.trim();
  const imageFile = document.getElementById("sub-image-input").files[0];
  const useEmoji  = document.getElementById("sub-emoji-section").style.display !== "none";

  if (!parentId) { setStatus("sub-form-status", "⚠️ Please select a Main Category.", "err"); return; }
  if (!name)     { setStatus("sub-form-status", "⚠️ Sub category name is required.", "err"); return; }

  setStatus("sub-form-status", "⏳ Saving…", "");
  const btn = document.getElementById("save-sub-btn");
  btn.disabled = true;

  try {
    let image_url = editId ? (allSubs.find(s => s.id === editId)?.image_url || null) : null;
    let emoji     = useEmoji ? (emojiVal || null) : null;

    if (!useEmoji && imageFile) {
      setStatus("sub-form-status", "⏳ Uploading image…", "");
      image_url = await uploadCategoryImage(imageFile, "sub-upload-bar-wrap", "sub-upload-bar");
    }
    if (useEmoji) image_url = null;

    const row = { name, image_url, emoji, parent_id: parentId };
    let error;
    if (editId) {
      ({ error } = await db.from("categories").update(row).eq("id", editId));
    } else {
      ({ error } = await db.from("categories").insert([row]));
    }
    if (error) throw new Error(error.message);

    setStatus("sub-form-status", `✅ Sub Category ${editId ? "updated" : "added"}!`, "ok");
    showToast(`✅ Sub Category ${editId ? "updated" : "added"}!`);
    resetSubForm();
    await fetchCategories();
    setTimeout(() => setStatus("sub-form-status", "", ""), 3000);
  } catch (err) {
    setStatus("sub-form-status", `❌ ${err.message}`, "err");
  } finally {
    btn.disabled = false;
  }
}

/* ── Edit: start editing a header ──────────────────── */
function startEditHeader(headerId) {
  const cat = allHeaders.find(h => h.id === headerId);
  if (!cat) return;
  setCatMode("header");
  document.getElementById("edit-header-id").value    = headerId;
  document.getElementById("header-name-input").value = cat.name;
  document.getElementById("save-header-btn").textContent = "💾 Update Main Category";
  document.getElementById("cancel-header-edit-btn").style.display = "inline-flex";

  if (cat.emoji) {
    switchIconTab("header", "emoji");
    document.getElementById("header-emoji-input").value = cat.emoji;
  } else if (cat.image_url) {
    switchIconTab("header", "image");
    const prev = document.getElementById("header-img-preview");
    prev.src = cat.image_url; prev.style.display = "block";
  }
  document.getElementById("header-name-input").scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ── Edit: start editing a sub ──────────────────────── */
function startEditSub(subId) {
  const cat = allSubs.find(s => s.id === subId);
  if (!cat) return;
  setCatMode("sub");
  document.getElementById("edit-sub-id").value       = subId;
  document.getElementById("sub-name-input").value    = cat.name;
  document.getElementById("sub-parent-select").value = cat.parent_id || "";
  document.getElementById("save-sub-btn").textContent = "💾 Update Sub Category";
  document.getElementById("cancel-sub-edit-btn").style.display = "inline-flex";

  if (cat.emoji) {
    switchIconTab("sub", "emoji");
    document.getElementById("sub-emoji-input").value = cat.emoji;
  } else if (cat.image_url) {
    switchIconTab("sub", "image");
    const prev = document.getElementById("sub-img-preview");
    prev.src = cat.image_url; prev.style.display = "block";
  }
  document.getElementById("sub-name-input").scrollIntoView({ behavior: "smooth", block: "center" });
}

function resetHeaderForm() {
  document.getElementById("edit-header-id").value           = "";
  document.getElementById("header-name-input").value        = "";
  document.getElementById("header-emoji-input").value       = "";
  document.getElementById("header-image-input").value       = "";
  document.getElementById("header-img-preview").style.display = "none";
  document.getElementById("header-img-preview").src         = "";
  document.getElementById("save-header-btn").textContent    = "➕ Save Main Category";
  document.getElementById("cancel-header-edit-btn").style.display = "none";
  document.getElementById("header-upload-bar-wrap").style.display = "none";
  document.getElementById("header-upload-bar").style.width        = "0";
  switchIconTab("header", "emoji");
  setStatus("header-form-status", "", "");
}

function resetSubForm() {
  document.getElementById("edit-sub-id").value              = "";
  document.getElementById("sub-name-input").value           = "";
  document.getElementById("sub-emoji-input").value          = "";
  document.getElementById("sub-image-input").value          = "";
  document.getElementById("sub-img-preview").style.display  = "none";
  document.getElementById("sub-img-preview").src            = "";
  document.getElementById("sub-parent-select").value        = "";
  document.getElementById("save-sub-btn").textContent       = "➕ Save Sub Category";
  document.getElementById("cancel-sub-edit-btn").style.display = "none";
  document.getElementById("sub-upload-bar-wrap").style.display = "none";
  document.getElementById("sub-upload-bar").style.width         = "0";
  switchIconTab("sub", "emoji");
  setStatus("sub-form-status", "", "");
}

async function deleteCategory(catId, catName, isHeader) {
  const msg = isHeader
    ? `Delete header "${catName}"? All its sub-categories will also be deleted, and products will lose their category.`
    : `Delete sub-category "${catName}"? Products in it will lose their category.`;
  openConfirm(msg, async () => {
    let error;

    if (isHeader) {
      const subIds = allSubs.filter(s => s.parent_id === catId).map(s => s.id);
      // 1. Nullify category_id on products in any sub
      if (subIds.length) {
        ({ error } = await db.from("products").update({ category_id: null }).in("category_id", subIds));
        if (error) { closeConfirm(); showToast(`❌ ${error.message}`); return; }
      }
      // 2. Nullify category_id on products directly on the header
      ({ error } = await db.from("products").update({ category_id: null }).eq("category_id", catId));
      if (error) { closeConfirm(); showToast(`❌ ${error.message}`); return; }
      // 3. Delete sub-categories
      if (subIds.length) {
        ({ error } = await db.from("categories").delete().in("id", subIds));
        if (error) { closeConfirm(); showToast(`❌ ${error.message}`); return; }
      }
    } else {
      // Nullify products in this sub first
      ({ error } = await db.from("products").update({ category_id: null }).eq("category_id", catId));
      if (error) { closeConfirm(); showToast(`❌ ${error.message}`); return; }
    }

    // Delete the category itself
    ({ error } = await db.from("categories").delete().eq("id", catId));
    closeConfirm();
    if (error) { showToast(`❌ ${error.message}`); return; }
    showToast("🗑️ Deleted.");
    await fetchCategories();
    await fetchProducts();
  }, "⚠️ Delete?", "🗑️ Delete");
}

/* ── Kept for backward compat — old event listeners reference this */
function resetCategoryForm() { resetHeaderForm(); resetSubForm(); }

/* ═══════════════════════════════════════════════════════════
   IMAGE UPLOAD — Product (via Cloudinary)
   ─────────────────────────────────────────────────────────
   Uses uploadToCloudinary() from cloudinary.js.
   No Supabase Storage bucket needed.
═══════════════════════════════════════════════════════════ */
async function uploadProductImage(file) {
  // Max 5 MB check before sending to Cloudinary
  if (file.size > 5 * 1024 * 1024) throw new Error("File is larger than 5 MB.");
  return await uploadToCloudinary(file, "store-products", {
    barWrapId: "upload-bar-wrap",
    barId:     "upload-bar",
  });
}

/* ═══════════════════════════════════════════════════════════
   IMAGE UPLOAD — Category (via Cloudinary)
═══════════════════════════════════════════════════════════ */
async function uploadCategoryImage(file, barWrapId = "cat-upload-bar-wrap", barId = "cat-upload-bar") {
  // Max 2 MB check before sending to Cloudinary
  if (file.size > 2 * 1024 * 1024) throw new Error("File is larger than 2 MB.");
  return await uploadToCloudinary(file, "store-categories", { barWrapId, barId });
}

/* ═══════════════════════════════════════════════════════════
   VARIANTS UI
═══════════════════════════════════════════════════════════ */
function addVariantRow(name = "", price = "", mrp = "", out_of_stock = false) {
  const id  = variantCount++;
  const row = document.createElement("div");
  row.className = "variant-row";
  row.id = `vrow-${id}`;
  row.innerHTML = `
    <input type="text"   placeholder="Name (e.g. 500g)"   value="${escHtml(name)}"           id="vname-${id}"/>
    <input type="number" placeholder="Selling Price (₹)"  value="${escHtml(String(price))}" id="vprice-${id}" min="0" step="0.01"/>
    <input type="number" placeholder="MRP ₹ (optional)"   value="${escHtml(String(mrp))}"   id="vmrp-${id}"   min="0" step="0.01"/>
    <label class="variant-oos-label" title="Mark this variant as out of stock">
      <input type="checkbox" class="variant-oos-cb" id="voos-${id}" ${out_of_stock ? "checked" : ""}/>
      <span class="variant-oos-text">OOS</span>
    </label>
    <button class="remove-variant" onclick="removeVariantRow('vrow-${id}')" aria-label="Remove">✕</button>
  `;
  document.getElementById("variants-list").appendChild(row);
}
function removeVariantRow(rowId) {
  document.getElementById(rowId)?.remove();
}
function getVariantsFromForm() {
  return [...document.querySelectorAll(".variant-row")].reduce((acc, row) => {
    const name     = row.querySelector('input[type="text"]')?.value.trim();
    const inputs   = row.querySelectorAll('input[type="number"]');
    const price    = parseFloat(inputs[0]?.value);
    const mrpRaw   = parseFloat(inputs[1]?.value);
    const mrp      = (!isNaN(mrpRaw) && mrpRaw > 0) ? mrpRaw : null;
    const oos      = row.querySelector('.variant-oos-cb')?.checked || false;
    if (name && !isNaN(price) && price >= 0) {
      if (mrp !== null && mrp < price) return acc; // skip invalid: MRP < selling price
      acc.push({ name, price, mrp, out_of_stock: oos });
    }
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

function renderProductList(filterText = "") {
  const container = document.getElementById("product-list-container");
  const query     = filterText.toLowerCase().trim();
  const products  = query
    ? allProducts.filter(p => p.name.toLowerCase().includes(query))
    : allProducts;

  document.getElementById("product-list-count").textContent = products.length;

  if (!products.length) {
    container.innerHTML = query
      ? `<div class="state-box" style="padding:2rem"><div class="state-icon">🔍</div><p>No products match "<strong>${escHtml(filterText)}</strong>".</p></div>`
      : `<div class="state-box" style="padding:2rem"><div class="state-icon">📦</div><p>No products yet.</p></div>`;
    return;
  }
  container.innerHTML = products.map(p => {
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

/* Render using current search input value */
function renderFilteredProducts() {
  const q = document.getElementById("product-search-input")?.value || "";
  renderProductList(q);
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
  const pricingType = document.getElementById("prod-pricing-type").value || "fixed";
  const catId       = document.getElementById("prod-category").value || null;
  const imageFile   = document.getElementById("prod-image").files[0];
  const existUrl    = document.getElementById("existing-image-url").value;
  const editId      = document.getElementById("edit-product-id").value;
  const variants    = getVariantsFromForm();

  if (!name) { setStatus("product-form-status", "⚠️ Product name is required.", "err"); return; }

  let basePrice = 0, mrpVal = null;
  let pricePerKg = null, minQty = null, stepSize = null;

  if (pricingType === "dynamic") {
    // ── Dynamic pricing validation ──────────────────────
    pricePerKg = parseFloat(document.getElementById("prod-price-per-kg").value);
    minQty     = parseInt(document.getElementById("prod-min-qty").value);
    stepSize   = parseInt(document.getElementById("prod-step-size").value);
    if (isNaN(pricePerKg) || pricePerKg <= 0) {
      setStatus("product-form-status", "⚠️ Price per KG is required and must be > 0.", "err"); return;
    }
    if (isNaN(minQty) || minQty <= 0) {
      setStatus("product-form-status", "⚠️ Minimum Quantity is required and must be > 0.", "err"); return;
    }
    if (isNaN(stepSize) || stepSize <= 0) {
      setStatus("product-form-status", "⚠️ Step Size is required and must be > 0.", "err"); return;
    }
    if (minQty % stepSize !== 0) {
      setStatus("product-form-status", "⚠️ Minimum Quantity must be divisible by Step Size.", "err"); return;
    }
    // Store price_per_kg as baseprice for DB compatibility; dynamic fields go in variants field
    basePrice = pricePerKg;
  } else {
    // ── Fixed pricing validation ──────────────────────
    basePrice = parseFloat(document.getElementById("prod-price").value);
    mrpVal    = parseFloat(document.getElementById("prod-mrp").value);
    if (isNaN(basePrice) || basePrice < 0) { setStatus("product-form-status", "⚠️ Enter a valid selling price.", "err"); return; }
    if (!isNaN(mrpVal) && mrpVal > 0 && mrpVal < basePrice) {
      setStatus("product-form-status", "⚠️ MRP should be ≥ selling price.", "err"); return;
    }
    const invalidVariant = variants.find(v => v.mrp !== null && v.mrp < v.price);
    if (invalidVariant) {
      setStatus("product-form-status", `⚠️ Variant "${invalidVariant.name}": MRP should be ≥ selling price.`, "err"); return;
    }
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
      description:  desc,
      pricing_type: pricingType,
      baseprice:    basePrice,
      mrp:          (!isNaN(mrpVal) && mrpVal > 0) ? mrpVal : null,
      price_per_kg: pricingType === "dynamic" ? pricePerKg : null,
      min_qty:      pricingType === "dynamic" ? minQty     : null,
      step_size:    pricingType === "dynamic" ? stepSize   : null,
      imageurl,
      category_id:  catId,
      variants:     (pricingType === "fixed" && variants.length) ? variants : [],
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

  const pricingType = p.pricing_type || "fixed";

  document.getElementById("product-form-title").textContent  = "✏️ Edit Product";
  document.getElementById("edit-product-id").value           = productId;
  document.getElementById("prod-name").value                 = p.name || "";
  document.getElementById("prod-desc").value                 = p.description || "";
  document.getElementById("prod-category").value             = p.category_id || "";
  document.getElementById("existing-image-url").value        = p.imageurl || "";
  document.getElementById("save-product-btn").textContent    = "💾 Update Product";
  document.getElementById("cancel-edit-btn").style.display   = "inline-flex";

  // Restore pricing type UI
  setPricingType(pricingType);

  if (pricingType === "dynamic") {
    const ppkg = document.getElementById("prod-price-per-kg");
    const minq = document.getElementById("prod-min-qty");
    const step = document.getElementById("prod-step-size");
    if (ppkg) ppkg.value = p.price_per_kg || "";
    if (minq) minq.value = p.min_qty      || "";
    if (step) step.value = p.step_size    || "";
  } else {
    document.getElementById("prod-price").value = p.baseprice || "";
    document.getElementById("prod-mrp").value   = p.mrp       || "";
    updateDiscountPreview();
  }

  const preview = document.getElementById("img-preview");
  if (p.imageurl) {
    preview.src           = p.imageurl;
    preview.style.display = "block";
  } else {
    preview.style.display = "none";
  }

  document.getElementById("variants-list").innerHTML = "";
  variantCount = 0;
  if (pricingType === "fixed") {
    parseVariants(p.variants).forEach(v => addVariantRow(v.name, v.price, v.mrp || "", v.out_of_stock || false));
  }

  setStatus("product-form-status", "", "");
  document.querySelector('#tab-add-product .admin-card').scrollIntoView({ behavior: "smooth", block: "start" });
  switchTab("add-product");
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
   FEATURE 5: FIXED vs DYNAMIC PRICING
   ─────────────────────────────────────────────────────────
   Toggles UI between fixed price fields and dynamic
   per-KG fields. Only one system active at a time.
═══════════════════════════════════════════════════════════ */
function setPricingType(type) {
  document.getElementById("prod-pricing-type").value = type;

  const fixedSection   = document.getElementById("fixed-pricing-section");
  const dynamicSection = document.getElementById("dynamic-pricing-section");
  const fixedBtn       = document.getElementById("pricing-btn-fixed");
  const dynamicBtn     = document.getElementById("pricing-btn-dynamic");

  if (type === "fixed") {
    fixedSection.style.display   = "block";
    dynamicSection.style.display = "none";
    fixedBtn.classList.add("active");
    dynamicBtn.classList.remove("active");
    // Re-enable fixed fields
    document.getElementById("prod-price").disabled = false;
    document.getElementById("prod-mrp").disabled   = false;
  } else {
    fixedSection.style.display   = "none";
    dynamicSection.style.display = "block";
    fixedBtn.classList.remove("active");
    dynamicBtn.classList.add("active");
    // Clear fixed fields when switching to dynamic
    document.getElementById("prod-price").value = "";
    document.getElementById("prod-mrp").value   = "";
    document.getElementById("discount-preview").style.display = "none";
  }
}

/** Show live discount % preview when both MRP and selling price are filled */
function updateDiscountPreview() {
  const mrp   = parseFloat(document.getElementById("prod-mrp").value);
  const price = parseFloat(document.getElementById("prod-price").value);
  const el    = document.getElementById("discount-preview");
  if (!el) return;

  if (!isNaN(mrp) && !isNaN(price) && mrp > 0 && price > 0 && mrp >= price) {
    const pct = Math.round(((mrp - price) / mrp) * 100);
    if (pct > 0) {
      el.textContent = `🏷️ ${pct}% discount — customer saves ₹${(mrp - price).toLocaleString("en-IN")}`;
      el.style.display = "block";
      return;
    }
  }
  el.style.display = "none";
}


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
  // Reset dynamic pricing fields
  const ppkg = document.getElementById("prod-price-per-kg");
  const minq = document.getElementById("prod-min-qty");
  const step = document.getElementById("prod-step-size");
  if (ppkg) ppkg.value = "";
  if (minq) minq.value = "";
  if (step) step.value = "";
  const dp = document.getElementById("discount-preview");
  if (dp) dp.style.display = "none";
  setPricingType("fixed");
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

        <div class="order-admin-bill">
          <span>Subtotal: ₹${Number(order.subtotal || order.total).toLocaleString("en-IN")}</span>
          <span class="${(order.delivery_charge || 0) === 0 ? "order-admin-free-del" : ""}">
            🚚 ${(order.delivery_charge || 0) === 0 ? "Free Delivery" : `Delivery: ₹${order.delivery_charge}`}
          </span>
          <strong>Total: ₹${Number(order.total).toLocaleString("en-IN")}</strong>
        </div>

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

/* ═══════════════════════════════════════════════════════════
   COUPONS ADMIN
   Table schema (Supabase):
     coupons (id uuid, code text, discount_type text,
              discount_value numeric, max_discount numeric,
              min_order_value numeric, is_active boolean,
              usage_limit integer, usage_count integer,
              created_at timestamptz)
═══════════════════════════════════════════════════════════ */
let allCouponsAdmin = [];

async function fetchCouponsAdmin() {
  const loading   = document.getElementById("coupon-list-loading");
  const container = document.getElementById("coupon-list-container");
  if (loading)   loading.style.display   = "flex";
  if (container) container.innerHTML     = "";

  const { data, error } = await db.from("coupons").select("*").order("created_at", { ascending: false });
  if (loading) loading.style.display = "none";

  if (error) {
    if (container) container.innerHTML = `<p style="color:var(--crimson);font-size:.85rem">Failed to load coupons: ${error.message}</p>`;
    return;
  }

  allCouponsAdmin = data || [];
  renderCouponList();
}

function renderCouponList() {
  const container = document.getElementById("coupon-list-container");
  const countEl   = document.getElementById("coupon-list-count");
  if (!container) return;

  if (countEl) countEl.textContent = allCouponsAdmin.length;

  if (!allCouponsAdmin.length) {
    container.innerHTML = `<p style="color:var(--light);font-size:.88rem;text-align:center;padding:1.5rem 0">No coupons yet. Add one!</p>`;
    return;
  }

  container.innerHTML = allCouponsAdmin.map(c => {
    const discLabel = c.discount_type === "percent"
      ? `${c.discount_value}%${c.max_discount ? ` (max ₹${c.max_discount})` : ""}`
      : `₹${c.discount_value} flat`;
    const minLabel  = c.min_order_value ? `Min order ₹${c.min_order_value}` : "No minimum";
    const badge     = c.is_active
      ? `<span class="coupon-active-badge">Active</span>`
      : `<span class="coupon-inactive-badge">Inactive</span>`;

    const usageCount = c.usage_count || 0;
    const usageLimit = c.usage_limit || null;
    const usedLabel  = usageLimit
      ? `<span class="coupon-usage-label">${usageCount}/${usageLimit} used</span>`
      : (usageCount ? `<span class="coupon-usage-label">${usageCount} used</span>` : "");
    const limitReached = usageLimit && usageCount >= usageLimit;
    const limitBadge   = limitReached ? `<span class="coupon-limit-badge">Limit Reached</span>` : "";

    return `
      <div class="coupon-admin-row" id="coupon-row-${c.id}">
        <div class="coupon-admin-info">
          <div class="coupon-admin-code">${escAdminHtml(c.code)} ${badge} ${limitBadge}</div>
          <div class="coupon-admin-detail">${discLabel} · ${minLabel} ${usedLabel}</div>
        </div>
        <div class="coupon-admin-actions">
          <button class="btn btn-ghost btn-sm" onclick="toggleCouponActive('${c.id}', ${c.is_active})">
            ${c.is_active ? "Deactivate" : "Activate"}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteCouponConfirm('${c.id}', '${escAdminHtml(c.code)}')">Delete</button>
        </div>
      </div>`;
  }).join("");
}

async function saveCoupon() {
  const code       = document.getElementById("coupon-code-input").value.trim().toUpperCase();
  const type       = document.getElementById("coupon-type-select").value;
  const value      = parseFloat(document.getElementById("coupon-value-input").value) || 0;
  const maxDisc    = parseFloat(document.getElementById("coupon-max-input").value)   || null;
  const minOrder   = parseFloat(document.getElementById("coupon-min-input").value)   || null;
  const usageLimit = parseInt(document.getElementById("coupon-usage-limit-input").value) || null;

  if (!code)  { setStatus("coupon-form-status", "⚠️ Code is required.", "err"); return; }
  if (!value) { setStatus("coupon-form-status", "⚠️ Discount value must be > 0.", "err"); return; }
  if (type === "percent" && value > 100) { setStatus("coupon-form-status", "⚠️ Percent can't exceed 100.", "err"); return; }
  if (usageLimit !== null && usageLimit < 1) { setStatus("coupon-form-status", "⚠️ Usage limit must be at least 1.", "err"); return; }

  const payload = {
    code,
    discount_type:   type,
    discount_value:  value,
    max_discount:    maxDisc,
    min_order_value: minOrder,
    usage_limit:     usageLimit,
    usage_count:     0,
    is_active:       true
  };

  setStatus("coupon-form-status", "⏳ Saving…", "");
  const { error } = await db.from("coupons").insert([payload]);
  if (error) { setStatus("coupon-form-status", `❌ ${error.message}`, "err"); return; }

  setStatus("coupon-form-status", "✅ Coupon added!", "ok");
  resetCouponForm();
  await fetchCouponsAdmin();
}

function resetCouponForm() {
  ["coupon-code-input","coupon-value-input","coupon-max-input","coupon-min-input","coupon-usage-limit-input"]
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ""; });
  const sel = document.getElementById("coupon-type-select");
  if (sel) sel.value = "percent";
  setStatus("coupon-form-status", "", "");
}

async function toggleCouponActive(id, currentActive) {
  const { error } = await db.from("coupons").update({ is_active: !currentActive }).eq("id", id);
  if (error) { showToast("❌ " + error.message); return; }
  showToast(currentActive ? "Coupon deactivated." : "Coupon activated.");
  await fetchCouponsAdmin();
}

function deleteCouponConfirm(id, code) {
  openConfirm(
    `Delete coupon "${code}"? This cannot be undone.`,
    () => deleteCoupon(id),
    "🗑️ Delete Coupon",
    "Delete"
  );
}

async function deleteCoupon(id) {
  closeConfirm();
  const { error } = await db.from("coupons").delete().eq("id", id);
  if (error) { showToast("❌ " + error.message); return; }
  showToast("✅ Coupon deleted.");
  await fetchCouponsAdmin();
}

function escAdminHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ═══════════════════════════════════════════════════════════
   INIT & EVENT WIRING
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   FEATURE 6: ADMIN ANALYTICS
   ─────────────────────────────────────────────────────────
   Pulls live stats from already-loaded in-memory arrays
   + quick DB count queries. Lightweight — no extra tables.
═══════════════════════════════════════════════════════════ */
async function loadAnalytics() {
  const loadEl = document.getElementById("analytics-loading");
  if (loadEl) loadEl.style.display = "flex";

  try {
    // Use already-loaded data where possible
    const totalProducts = allProducts.length;
    const oosCount      = allProducts.filter(p => p.out_of_stock).length;
    const dynamicCount  = allProducts.filter(p => p.pricing_type === "dynamic").length;
    const totalCats     = allCategories.length;
    const pendingOrders = allOrders.length;

    // Fetch active coupons count
    const { count: activeCoupons } = await db
      .from("coupons").select("id", { count: "exact", head: true })
      .eq("is_active", true);

    // Set stats
    _setStat("stat-products-val",  totalProducts);
    _setStat("stat-oos-val",       oosCount);
    _setStat("stat-cats-val",      totalCats);
    _setStat("stat-orders-val",    pendingOrders);
    _setStat("stat-dynamic-val",   dynamicCount);
    _setStat("stat-coupons-val",   activeCoupons || 0);

    // Revenue from pending orders
    const revenue = allOrders.reduce((s, o) => s + Number(o.total || 0), 0);
    const revenueEl = document.getElementById("revenue-breakdown");
    if (revenueEl) {
      revenueEl.innerHTML = allOrders.length
        ? `<strong>₹${revenue.toLocaleString("en-IN")}</strong> across ${allOrders.length} pending order${allOrders.length !== 1 ? "s" : ""}`
        : `<span style="color:#aaa">No pending orders</span>`;
    }

    // Inventory warnings — OOS products list
    const warnEl = document.getElementById("inventory-warnings");
    if (warnEl) {
      const oosList = allProducts.filter(p => p.out_of_stock);
      if (!oosList.length) {
        warnEl.innerHTML = `<span style="color:var(--teal)">✅ All products are in stock!</span>`;
      } else {
        warnEl.innerHTML = oosList.map(p =>
          `<div style="padding:.3rem 0;border-bottom:1px solid #f0f0f0">
            🚫 <strong>${escHtml(p.name)}</strong>
            <button class="btn btn-ghost btn-sm" style="margin-left:.5rem;font-size:.72rem"
              onclick="toggleOutOfStock('${p.id}', false); loadAnalytics();">Mark In Stock</button>
          </div>`
        ).join("");
      }
    }
  } catch (err) {
    console.error("Analytics error:", err);
  } finally {
    if (loadEl) loadEl.style.display = "none";
  }
}

function _setStat(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

async function init() {
  /* FEATURE 1: Load store status so toggle button shows correct state */
  await fetchStoreStatus();
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

  /* FEATURE 1: Store open/close toggle button */
  const storeToggleBtn = document.getElementById("store-toggle-btn");
  if (storeToggleBtn) {
    storeToggleBtn.addEventListener("click", toggleStoreStatus);
  }

  /* ── Hamburger ─────────────────────────────────────── */
  document.getElementById("hamburger-btn").addEventListener("click", toggleHamburger);
  // Close hamburger when clicking outside the nav
  document.addEventListener("click", e => {
    const nav = document.querySelector(".admin-nav");
    if (nav && !nav.contains(e.target)) closeHamburger();
  });

  /* ── Tabs ──────────────────────────────────────────── */
  document.querySelectorAll(".admin-nav-link[data-tab]").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  /* ── Product search ────────────────────────────────── */
  const prodSearch = document.getElementById("product-search-input");
  if (prodSearch) {
    prodSearch.addEventListener("input", () => renderFilteredProducts());
  }

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

  /* ── Discount preview — live update as admin types MRP/price ── */
  const prodMrpEl   = document.getElementById("prod-mrp");
  const prodPriceEl = document.getElementById("prod-price");
  if (prodMrpEl)   prodMrpEl.addEventListener("input",   updateDiscountPreview);
  if (prodPriceEl) prodPriceEl.addEventListener("input",  updateDiscountPreview);

  /* ── Category forms ─────────────────────────────────── */
  // Header form
  const saveHeaderBtn = document.getElementById("save-header-btn");
  if (saveHeaderBtn) saveHeaderBtn.addEventListener("click", saveHeader);
  const cancelHeaderBtn = document.getElementById("cancel-header-edit-btn");
  if (cancelHeaderBtn) cancelHeaderBtn.addEventListener("click", resetHeaderForm);
  const headerNameInput = document.getElementById("header-name-input");
  if (headerNameInput) headerNameInput.addEventListener("keydown", e => { if (e.key === "Enter") saveHeader(); });
  const headerImageInput = document.getElementById("header-image-input");
  if (headerImageInput) headerImageInput.addEventListener("change", e => {
    const file = e.target.files[0];
    const preview = document.getElementById("header-img-preview");
    if (file) { preview.src = URL.createObjectURL(file); preview.style.display = "block"; }
    else { preview.style.display = "none"; }
  });

  // Sub form
  const saveSubBtn = document.getElementById("save-sub-btn");
  if (saveSubBtn) saveSubBtn.addEventListener("click", saveSub);
  const cancelSubBtn = document.getElementById("cancel-sub-edit-btn");
  if (cancelSubBtn) cancelSubBtn.addEventListener("click", resetSubForm);
  const subNameInput = document.getElementById("sub-name-input");
  if (subNameInput) subNameInput.addEventListener("keydown", e => { if (e.key === "Enter") saveSub(); });
  const subImageInput = document.getElementById("sub-image-input");
  if (subImageInput) subImageInput.addEventListener("change", e => {
    const file = e.target.files[0];
    const preview = document.getElementById("sub-img-preview");
    if (file) { preview.src = URL.createObjectURL(file); preview.style.display = "block"; }
    else { preview.style.display = "none"; }
  });

  /* ── Orders tab — refresh button ───────────────────── */
  const refreshOrdersBtn = document.getElementById("refresh-orders-btn");
  if (refreshOrdersBtn) refreshOrdersBtn.addEventListener("click", fetchOrders);

  /* ── Coupons tab ────────────────────────────────────── */
  const saveCouponBtn = document.getElementById("save-coupon-btn");
  if (saveCouponBtn) saveCouponBtn.addEventListener("click", saveCoupon);
  const couponCodeInput = document.getElementById("coupon-code-input");
  if (couponCodeInput) couponCodeInput.addEventListener("keydown", e => { if (e.key === "Enter") saveCoupon(); });

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
