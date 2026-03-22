const AUTH_STORAGE_KEY = "smartlinkx_current_user";
const DEFAULT_API_BASE_URL = "https://script.google.com/macros/s/AKfycbzjqFmAsNW1aGcBhkKOUTtGz_D15sj7kurO_AUSUVH-pH2G0Me5gStO_JNUxJPiFu4/exec";

(function ensureAppConfig() {
  if (!window.APP_CONFIG) {
    window.APP_CONFIG = {};
  }

  if (!window.APP_CONFIG.API_BASE_URL) {
    const metaApiBase = document.querySelector('meta[name="api-base-url"]')?.content?.trim();
    const storedApiBase = localStorage.getItem("smartlinkx_api_base_url")?.trim();
    window.APP_CONFIG.API_BASE_URL = metaApiBase || storedApiBase || DEFAULT_API_BASE_URL;
  }

  if (window.APP_CONFIG.API_BASE_URL) {
    localStorage.setItem("smartlinkx_api_base_url", window.APP_CONFIG.API_BASE_URL);
  }

  console.log("APP_CONFIG ready:", window.APP_CONFIG);
})();

function getApiBaseUrl() {
  const baseUrl = String(window.APP_CONFIG?.API_BASE_URL || "").trim();
  if (!baseUrl) {
    throw new Error("Missing APP_CONFIG.API_BASE_URL");
  }
  return baseUrl;
}

function normalizeApiDataShape(data) {
  if (data && typeof data === "object" && !("success" in data)) {
    return { success: true, message: "OK", data };
  }
  return data;
}

async function apiRequest(method, payload = null) {
  const baseUrl = getApiBaseUrl();

  try {
    let response;

    if (method === "GET") {
      const params = payload || {};
      const query = new URLSearchParams(params).toString();
      const url = query ? `${baseUrl}?${query}` : baseUrl;
      console.log(`GET ${url}`);
      response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json, text/plain, */*" }
      });
    } else {
      console.log("POST payload:", payload);
      response = await fetch(baseUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          Accept: "application/json, text/plain, */*"
        },
        body: JSON.stringify(payload || {})
      });
    }

    const text = await response.text();
    console.log("Response:", text.substring(0, 500));

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      const cleaned = String(text || "").trim();
      if (!cleaned) {
        throw new Error("Empty response from server.");
      }
      if (cleaned.startsWith("<!DOCTYPE") || cleaned.startsWith("<html")) {
        throw new Error("Server returned HTML instead of JSON. Check Apps Script deployment URL and permissions.");
      }
      throw new Error(`Invalid JSON: ${cleaned.substring(0, 200)}`);
    }

    data = normalizeApiDataShape(data);

    if (!response.ok) {
      throw new Error(data?.message || `HTTP ${response.status}`);
    }

    if (!data || data.success === false) {
      throw new Error(data?.message || "Request failed");
    }

    return data;
  } catch (err) {
    console.error("API ERROR:", err);
    throw err;
  }
}

function apiGet(params) {
  return apiRequest("GET", params);
}

function apiPost(payload) {
  return apiRequest("POST", payload);
}

function showMessage(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerText = message || "";
  el.className = `message ${isError ? "error" : "success"}`;
  el.style.display = message ? "block" : "none";

  if (message) {
    setTimeout(() => {
      if (el.innerText === message) {
        el.innerText = "";
        el.style.display = "none";
      }
    }, 5000);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "₱0.00";
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(num);
}

function toNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function saveCurrentUser(user) {
  if (!user) return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

function getCurrentUser() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function clearCurrentUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function getRedirectPageForRole(role) {
  const normalizedRole = String(role || "").trim().toUpperCase();
  if (normalizedRole === "ADMIN") return "admin.html";
  if (normalizedRole === "STAFF") return "staff.html";
  return "index.html";
}

async function login(username, password) {
  try {
    const payload = {
      action: "loginUser",
      username: username.trim(),
      password: password.trim()
    };

    const result = await apiPost(payload);

    if (result && result.success && result.data) {
      saveCurrentUser(result.data);
      return { success: true, data: result.data };
    }

    return { success: false, message: result?.message || "Invalid credentials" };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: error.message || "Login failed" };
  }
}

function logout() {
  clearCurrentUser();
  window.location.href = "index.html";
}

function requireRole(...allowedRoles) {
  const user = getCurrentUser();
  if (!user) {
    window.location.href = "index.html";
    return null;
  }

  const currentRole = String(user.role || "").trim().toUpperCase();
  const normalizedAllowed = allowedRoles
    .flat()
    .map((role) => String(role || "").trim().toUpperCase())
    .filter(Boolean);

  if (normalizedAllowed.length && !normalizedAllowed.includes(currentRole)) {
    const redirectTo = getRedirectPageForRole(currentRole);
    window.location.href = redirectTo;
    return null;
  }

  return user;
}
