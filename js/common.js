/* ============================
   COMMON.JS
   Shared helpers for login/admin/staff
============================ */

const STORAGE_KEY_USER = "isp_current_user";

/* ============================
   CONFIG CHECK
============================ */
function getApiBaseUrl() {
  if (
    typeof APP_CONFIG === "undefined" ||
    !APP_CONFIG ||
    !APP_CONFIG.API_BASE_URL
  ) {
    throw new Error("Missing APP_CONFIG.API_BASE_URL");
  }

  return String(APP_CONFIG.API_BASE_URL).trim();
}

/* ============================
   AUTH STORAGE
============================ */
function saveCurrentUser(user) {
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user || {}));
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USER);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function clearCurrentUser() {
  localStorage.removeItem(STORAGE_KEY_USER);
}

function logout() {
  clearCurrentUser();
  window.location.href = "index.html";
}

function requireRole(requiredRole) {
  const user = getCurrentUser();

  if (!user) {
    window.location.href = "index.html";
    return null;
  }

  if (requiredRole && String(user.role || "").toUpperCase() !== String(requiredRole).toUpperCase()) {
    window.location.href = "index.html";
    return null;
  }

  return user;
}

/* ============================
   API HELPERS
============================ */
function buildApiUrl(params = {}) {
  const base = getApiBaseUrl();
  const url = new URL(base);

  Object.keys(params || {}).forEach(key => {
    const value = params[key];
    if (value !== undefined && value !== null && String(value) !== "") {
      url.searchParams.set(key, value);
    }
  });

  // cache buster
  url.searchParams.set("_ts", Date.now().toString());

  return url.toString();
}

async function apiGet(params = {}) {
  const url = buildApiUrl(params);

  const response = await fetch(url, {
    method: "GET",
    redirect: "follow"
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("GET non-JSON response:", text);
    throw new Error("Server returned invalid JSON.");
  }

  return data;
}

async function apiPost(payload = {}) {
  const response = await fetch(getApiBaseUrl(), {
    method: "POST",
    redirect: "follow",
    headers: {
      "Content-Type": "text/plain;charset=utf-8"
    },
    body: JSON.stringify(payload || {})
  });

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error("POST non-JSON response:", text);
    throw new Error("Server returned invalid JSON.");
  }

  return data;
}

/* ============================
   LOGIN
============================ */
async function login(username, password) {
  const result = await apiPost({
    action: "loginUser",
    username,
    password
  });

  if (result && result.success && result.data) {
    saveCurrentUser(result.data);
  }

  return result;
}

/* ============================
   UI HELPERS
============================ */
function showMessage(elementId, message, isError = false) {
  const el = document.getElementById(elementId);
  if (!el) return;

  el.textContent = message || "";
  el.style.display = message ? "block" : "none";
  el.style.color = isError ? "#b91c1c" : "#065f46";
  el.style.background = isError ? "#fee2e2" : "#d1fae5";
  el.style.border = isError ? "1px solid #fecaca" : "1px solid #a7f3d0";
  el.style.padding = message ? "10px 12px" : "0";
  el.style.marginTop = message ? "12px" : "0";
  el.style.borderRadius = "8px";
}

function formatMoney(value) {
  const num = Number(value || 0);
  return "₱" + num.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
