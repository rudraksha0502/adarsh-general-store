// ─────────────────────────────────────────────────────────────
//  cloudinary.js  —  Cloudinary configuration & upload helper
//
//  HOW TO SET UP:
//  1. Create a free account at https://cloudinary.com
//  2. Go to Settings → Upload → Upload Presets → Add upload preset
//  3. Set "Signing Mode" to "Unsigned"  (IMPORTANT)
//  4. Copy the preset name and your Cloud Name below
// ─────────────────────────────────────────────────────────────

// ✏️  Replace these two values with your own:
const CLOUDINARY_CLOUD_NAME   = "dedzztfly";   // e.g. "dxyz12abc"
const CLOUDINARY_UPLOAD_PRESET = "store_unsigned"; // e.g. "store_unsigned"

/**
 * uploadToCloudinary
 * ------------------
 * Uploads a File/Blob to Cloudinary using an unsigned upload preset.
 * No API secret is used — safe to call from the browser.
 *
 * @param {File}   file          - The image file selected by the user
 * @param {string} [folder=""]  - Optional Cloudinary folder name
 * @param {object} [progressIds] - Optional { barWrapId, barId } DOM element IDs
 * @returns {Promise<string>}    - Resolves to the secure_url of the uploaded image
 */
async function uploadToCloudinary(file, folder = "store-uploads", progressIds = {}) {
  // ── Validate ────────────────────────────────────────────────
  if (!file) throw new Error("No file selected.");

  const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/svg+xml"];
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Only JPG, PNG, WebP, GIF, or SVG images are allowed.");
  }

  // ── Show progress bar at 20% while upload starts ────────────
  const barWrap = progressIds.barWrapId ? document.getElementById(progressIds.barWrapId) : null;
  const bar     = progressIds.barId     ? document.getElementById(progressIds.barId)     : null;
  if (barWrap) barWrap.style.display = "block";
  if (bar)     bar.style.width       = "20%";

  // ── Build FormData for Cloudinary unsigned upload ────────────
  const formData = new FormData();
  formData.append("file",         file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  formData.append("folder",        folder);

  // ── POST to Cloudinary upload API ───────────────────────────
  const endpoint = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

  let response;
  try {
    if (bar) bar.style.width = "60%";
    response = await fetch(endpoint, {
      method: "POST",
      body:   formData,
    });
  } catch (networkErr) {
    if (barWrap) barWrap.style.display = "none";
    throw new Error("Network error during upload. Check your internet connection.");
  }

  if (bar) bar.style.width = "90%";

  // ── Parse response ───────────────────────────────────────────
  const result = await response.json();

  if (!response.ok) {
    if (barWrap) barWrap.style.display = "none";
    // Cloudinary returns error details in result.error.message
    const msg = result?.error?.message || "Cloudinary upload failed.";
    throw new Error(msg);
  }

  // ── Complete progress bar then hide ─────────────────────────
  if (bar) bar.style.width = "100%";
  setTimeout(() => {
    if (barWrap) barWrap.style.display = "none";
    if (bar)     bar.style.width       = "0";
  }, 600);

  // Return the secure HTTPS URL of the uploaded image
  return result.secure_url;
}
