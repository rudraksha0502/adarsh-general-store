/* ============================================================
   ADARSH GENERAL STORE - admin.js
   Handles: login, categories CRUD, products CRUD, settings
   ============================================================ */

// ============================================================
// ⚙️ CONFIGURATION — same as app.js
// ============================================================
const SUPABASE_URL  = 'https://fghjsmevbdypjgzbigti.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZnaGpzbWV2YmR5cGpnemJpZ3RpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcyMDU2NDYsImV4cCI6MjA5Mjc4MTY0Nn0.Pbp_sfEJLqyKRAv3LPMCVMDBz4s6qd3BrsVfJQB8xJk';

// ✅ HARDCODED ADMIN CREDENTIALS (no Supabase Auth needed)
const ADMIN_USER = 'Adarsh';
const ADMIN_PASS = '13223LOVE';  // ← Change this to your preferred password
// ============================================================

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// Storage bucket name (create this in Supabase)
const STORAGE_BUCKET = 'product-images';

// Local state
let categories = [];
let products   = [];

// ============================================================
// LOGIN
// ============================================================
function doLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value.trim();

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    // Simple session flag
    sessionStorage.setItem('ags_admin', 'true');
    document.getElementById('loginWrapper').style.display = 'none';
    document.getElementById('adminPanel').style.display   = 'block';
    initAdmin();
  } else {
    document.getElementById('loginError').style.display = 'block';
  }
}

function doLogout() {
  sessionStorage.removeItem('ags_admin');
  location.reload();
}

// Check if already logged in
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('ags_admin') === 'true') {
    document.getElementById('loginWrapper').style.display = 'none';
    document.getElementById('adminPanel').style.display   = 'block';
    initAdmin();
  }
});

// ============================================================
// INIT ADMIN
// ============================================================
async function initAdmin() {
  await fetchCategories();
  await fetchProducts();
  updateStats();
  loadSettings();
}

// ============================================================
// NAVIGATION
// ============================================================
function showSection(name) {
  // Hide all sections
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav button').forEach(b => b.classList.remove('active'));

  document.getElementById(`sec${capitalize(name)}`).classList.add('active');
  document.getElementById(`nav${capitalize(name)}`).classList.add('active');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ============================================================
// STATS
// ============================================================
function updateStats() {
  document.getElementById('statProducts').textContent   = products.length;
  document.getElementById('statCategories').textContent = categories.length;
}

// ============================================================
// CATEGORIES
// ============================================================
async function fetchCategories() {
  const { data, error } = await supabase.from('categories').select('*').order('name');
  if (error) { showAdminToast('Error fetching categories: ' + error.message, 'error'); return; }
  categories = data || [];
  renderCategoriesTable();
  populateCategoryDropdown();
}

function renderCategoriesTable() {
  const tbody = document.getElementById('catTableBody');
  if (categories.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--gray-400)">No categories yet.</td></tr>';
    return;
  }
  tbody.innerHTML = categories.map((cat, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${cat.name}</td>
      <td>
        <button class="btn-edit" onclick="editCategory('${cat.id}', '${escapeHtml(cat.name)}')">✏️ Edit</button>
        <button class="btn-delete" onclick="deleteCategory('${cat.id}')">🗑️ Delete</button>
      </td>
    </tr>`).join('');
}

async function saveCategory() {
  const name   = document.getElementById('catNameInput').value.trim();
  const editId = document.getElementById('editCatId').value;

  if (!name) { showAdminToast('Please enter a category name', 'error'); return; }

  let error;
  if (editId) {
    // Update existing
    ({ error } = await supabase.from('categories').update({ name }).eq('id', editId));
  } else {
    // Insert new
    ({ error } = await supabase.from('categories').insert({ name }));
  }

  if (error) { showAdminToast('Error: ' + error.message, 'error'); return; }

  showAdminToast(editId ? '✅ Category updated!' : '✅ Category added!', 'success');
  resetCatForm();
  await fetchCategories();
  updateStats();
}

function editCategory(id, name) {
  document.getElementById('catNameInput').value = name;
  document.getElementById('editCatId').value    = id;
  document.getElementById('catNameInput').focus();
}

function resetCatForm() {
  document.getElementById('catNameInput').value = '';
  document.getElementById('editCatId').value    = '';
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? Products in it will lose their category link.')) return;

  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) { showAdminToast('Error: ' + error.message, 'error'); return; }

  showAdminToast('✅ Category deleted', 'success');
  await fetchCategories();
  updateStats();
}

function populateCategoryDropdown() {
  const sel = document.getElementById('prodCategory');
  const current = sel.value;
  sel.innerHTML = '<option value="">Select category...</option>' +
    categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (current) sel.value = current;
}

// ============================================================
// PRODUCTS
// ============================================================
async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, categories(name)')
    .order('name');

  if (error) { showAdminToast('Error fetching products: ' + error.message, 'error'); return; }
  products = data || [];
  renderProductsTable();
}

function renderProductsTable() {
  const tbody = document.getElementById('prodTableBody');
  if (products.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-400)">No products yet.</td></tr>';
    return;
  }
  tbody.innerHTML = products.map(p => {
    const catName  = p.categories ? p.categories.name : '—';
    const variants = parseVariants(p.variants);
    const price    = variants.length > 0 ? `₹${variants[0].price}+` : `₹${p.baseprice || p.basePrice || 0}`;
    const varInfo  = variants.length > 0 ? variants.map(v => `${v.name}=₹${v.price}`).join(', ') : 'No variants';
    const imgEl    = p.imageurl || p.imageUrl
      ? `<img src="${p.imageurl || p.imageUrl}" alt="${p.name}" />`
      : `<span style="font-size:1.8rem">🛒</span>`;

    return `
      <tr>
        <td>${imgEl}</td>
        <td><strong>${p.name}</strong><br/><small style="color:var(--gray-400)">${(p.description||'').slice(0,40)}${p.description&&p.description.length>40?'...':''}</small></td>
        <td>${catName}</td>
        <td>${price}</td>
        <td><small style="color:var(--gray-400)">${varInfo}</small></td>
        <td>
          <button class="btn-edit" onclick="editProduct('${p.id}')">✏️ Edit</button>
          <button class="btn-delete" onclick="deleteProduct('${p.id}')">🗑️ Delete</button>
        </td>
      </tr>`;
  }).join('');
}

// ---- Product Form ----
function toggleProductForm() {
  const wrapper = document.getElementById('productFormWrapper');
  const btn     = document.getElementById('toggleProductFormBtn');
  const isHidden = wrapper.style.display === 'none';
  wrapper.style.display = isHidden ? 'block' : 'none';
  btn.textContent        = isHidden ? '✕ Close Form' : '＋ Add New Product';
  if (isHidden) {
    cancelProductForm(); // reset fields when opening fresh
    wrapper.style.display = 'block';
  }
}

function cancelProductForm() {
  document.getElementById('prodName').value         = '';
  document.getElementById('prodBasePrice').value    = '';
  document.getElementById('prodDesc').value         = '';
  document.getElementById('prodCategory').value     = '';
  document.getElementById('editProdId').value       = '';
  document.getElementById('existingImageUrl').value = '';
  document.getElementById('imgPreview').style.display = 'none';
  document.getElementById('imgPreview').src = '';
  document.getElementById('variantsBuilder').innerHTML = '';

  document.getElementById('productFormWrapper').style.display = 'none';
  document.getElementById('toggleProductFormBtn').textContent = '＋ Add New Product';
}

function editProduct(id) {
  const p = products.find(x => x.id === id);
  if (!p) return;

  document.getElementById('prodName').value      = p.name;
  document.getElementById('prodBasePrice').value = p.baseprice || p.basePrice || '';
  document.getElementById('prodDesc').value      = p.description || '';
  document.getElementById('prodCategory').value  = p.category_id || '';
  document.getElementById('editProdId').value    = p.id;

  const imgUrl = p.imageurl || p.imageUrl || '';
  document.getElementById('existingImageUrl').value = imgUrl;
  if (imgUrl) {
    document.getElementById('imgPreview').src = imgUrl;
    document.getElementById('imgPreview').style.display = 'block';
  }

  // Rebuild variant rows
  document.getElementById('variantsBuilder').innerHTML = '';
  const variants = parseVariants(p.variants);
  variants.forEach(v => addVariantRow(v.name, v.price));

  // Show form
  document.getElementById('productFormWrapper').style.display = 'block';
  document.getElementById('toggleProductFormBtn').textContent = '✕ Close Form';
  document.getElementById('prodName').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---- Variants ----
function addVariantRow(name = '', price = '') {
  const builder = document.getElementById('variantsBuilder');
  const row = document.createElement('div');
  row.className = 'variant-row';
  row.innerHTML = `
    <input type="text" placeholder="Size/Weight (e.g. 500g)" value="${name}" class="variant-name" />
    <input type="number" placeholder="Price (₹)" value="${price}" min="0" class="variant-price" />
    <button class="btn-remove-variant" onclick="this.parentElement.remove()">✕</button>
  `;
  builder.appendChild(row);
}

function getVariantsFromForm() {
  const rows = document.querySelectorAll('#variantsBuilder .variant-row');
  const variants = [];
  rows.forEach(row => {
    const name  = row.querySelector('.variant-name').value.trim();
    const price = parseFloat(row.querySelector('.variant-price').value);
    if (name && !isNaN(price)) {
      variants.push({ name, price });
    }
  });
  return variants;
}

// ---- Image Preview ----
function previewImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const preview = document.getElementById('imgPreview');
    preview.src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
}

// ---- Save Product (Insert or Update) ----
async function saveProduct() {
  const name       = document.getElementById('prodName').value.trim();
  const basePrice  = parseFloat(document.getElementById('prodBasePrice').value);
  const desc       = document.getElementById('prodDesc').value.trim();
  const catId      = document.getElementById('prodCategory').value;
  const editId     = document.getElementById('editProdId').value;
  const existingImg= document.getElementById('existingImageUrl').value;
  const variants   = getVariantsFromForm();

  if (!name || isNaN(basePrice) || !catId) {
    showAdminToast('Please fill Name, Price, and Category', 'error'); return;
  }

  const saveBtn = document.querySelector('.btn-save');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    // Upload image if new file selected
    let imageUrl = existingImg;
    const fileInput = document.getElementById('prodImage');
    if (fileInput.files.length > 0) {
      imageUrl = await uploadImage(fileInput.files[0]);
      if (!imageUrl) { showAdminToast('Image upload failed', 'error'); return; }
    }

    const productData = {
      name,
      baseprice:   basePrice,
      description: desc,
      category_id: catId,
      imageurl:    imageUrl,
      variants:    JSON.stringify(variants)
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from('products').update(productData).eq('id', editId));
    } else {
      ({ error } = await supabase.from('products').insert(productData));
    }

    if (error) { showAdminToast('Error: ' + error.message, 'error'); return; }

    showAdminToast(editId ? '✅ Product updated!' : '✅ Product added!', 'success');
    cancelProductForm();
    await fetchProducts();
    updateStats();

  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = '💾 Save Product';
  }
}

async function uploadImage(file) {
  const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;

  const { data, error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(fileName, file, { upsert: true });

  if (error) {
    console.error('Upload error:', error);
    showAdminToast('Upload error: ' + error.message, 'error');
    return null;
  }

  // Get public URL
  const { data: urlData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(fileName);

  return urlData.publicUrl;
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;

  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) { showAdminToast('Error: ' + error.message, 'error'); return; }

  showAdminToast('✅ Product deleted', 'success');
  await fetchProducts();
  updateStats();
}

// ============================================================
// SETTINGS
// ============================================================
function loadSettings() {
  const email = localStorage.getItem('ags_order_email') || 'rudraksha0502@gmail.com';
  const name  = localStorage.getItem('ags_store_name')  || 'Adarsh General Store';
  document.getElementById('orderEmail').value = email;
  document.getElementById('storeName').value  = name;
}

function saveSettings() {
  const email = document.getElementById('orderEmail').value.trim();
  const name  = document.getElementById('storeName').value.trim();

  if (!email) { showAdminToast('Please enter an email address', 'error'); return; }

  localStorage.setItem('ags_order_email', email);
  localStorage.setItem('ags_store_name',  name);

  showAdminToast('✅ Settings saved! Remember to update your EmailJS template email too.', 'success');
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

function escapeHtml(str) {
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function showAdminToast(msg, type = '') {
  const toast = document.getElementById('adminToast');
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}
