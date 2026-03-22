const AUTH_STORAGE_KEY = "smartlinkx_current_user";
const API_STORAGE_KEY = "smartlinkx_api_base_url";
const DEFAULT_API_BASE_URL = "https://script.google.com/macros/s/AKfycbzjqFmAsNW1aGcBhkKOUTtGz_D15sj7kurO_AUSUVH-pH2G0Me5gStO_JNUxJPiFu4/exec";

(function ensureAppConfig() {
  if (!window.APP_CONFIG) window.APP_CONFIG = {};

  const metaApiBase = document.querySelector('meta[name="api-base-url"]')?.content?.trim();
  const storedApiBase = localStorage.getItem(API_STORAGE_KEY)?.trim();

  if (!window.APP_CONFIG.API_BASE_URL) {
    window.APP_CONFIG.API_BASE_URL = metaApiBase || storedApiBase || DEFAULT_API_BASE_URL;
  }

  if (window.APP_CONFIG.API_BASE_URL) {
    localStorage.setItem(API_STORAGE_KEY, window.APP_CONFIG.API_BASE_URL);
  }

  console.log("APP_CONFIG ready:", window.APP_CONFIG);
})();

function getApiBaseUrl() {
  const baseUrl = String(window.APP_CONFIG?.API_BASE_URL || "").trim();
  if (!baseUrl) throw new Error("Missing APP_CONFIG.API_BASE_URL");
  return baseUrl;
}

function buildUrl(baseUrl, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    search.append(key, String(value));
  });
  const query = search.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

async function parseApiResponse(response, method, payload) {
  const text = await response.text();
  const trimmed = String(text || "").trim();
  console.log(`${method} response (${response.status}):`, trimmed.substring(0, 300));

  if (!trimmed) {
    const action = payload?.action ? ` for action \"${payload.action}\"` : "";
    throw new Error(`Empty response from server${action}. Check your Apps Script deployment and make sure doPost/doGet returns JSON.`);
  }

  if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
    throw new Error("Server returned HTML instead of JSON. Your Apps Script web app may be undeployed, unauthorized, or pointing to the wrong URL.");
  }

  let data;
  try {
    data = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Invalid JSON from server: ${trimmed.substring(0, 200)}`);
  }

  if (!response.ok) {
    throw new Error(data.message || `HTTP ${response.status}`);
  }

  if (data.success === false) {
    throw new Error(data.message || "Request failed");
  }

  return data;
}

async function apiRequest(method, payload = null) {
  const baseUrl = getApiBaseUrl();

  try {
    if (method === "GET") {
      const url = buildUrl(baseUrl, payload || {});
      console.log(`GET ${url}`);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { Accept: "application/json, text/plain, */*" }
      });
      return await parseApiResponse(response, "GET", payload);
    }

    console.log("POST payload:", payload);

    // Google Apps Script requires redirect:follow for POST
    let response = await fetch(baseUrl, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        Accept: "application/json, text/plain, */*"
      },
      body: JSON.stringify(payload || {})
    });

    try {
      return await parseApiResponse(response, "POST", payload);
    } catch (postErr) {
      const message = String(postErr?.message || "");
      const isEmptyOrHtml =
        message.includes("Empty response from server") ||
        message.includes("returned HTML") ||
        message.includes("HTTP 405");

      // Only retry as GET for safe/read-like actions, NOT for write actions
      const writeActions = [
        "generateBilling",
        "addPayment",
        "addSubscriber",
        "updateSubscriber",
        "addExpense",
        "portalLogin",
        "loginUser",
        "recomputeAllBilling"
      ];
      const actionName = payload?.action || "";
      const isWriteAction = writeActions.includes(actionName);

      if (!isWriteAction && isEmptyOrHtml && payload && typeof payload === "object") {
        console.warn("POST failed, retrying as GET with query params.", postErr);
        const url = buildUrl(baseUrl, payload);
        response = await fetch(url, {
          method: "GET",
          redirect: "follow",
          headers: { Accept: "application/json, text/plain, */*" }
        });
        return await parseApiResponse(response, "GET-fallback", payload);
      }

      // For write actions or other errors, throw a clear message
      if (isEmptyOrHtml && isWriteAction) {
        throw new Error(
          `Server returned empty response for "${actionName}". ` +
          `Please verify your Apps Script is deployed as "Execute as: Me" ` +
          `and "Who has access: Anyone". Then try again.`
        );
      }

      throw postErr;
    }
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
      el.innerText = "";
      el.style.display = "none";
    }, 5000);
  }
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
    const result = await apiPost({
      action: "loginUser",
      username: String(username || "").trim(),
      password: String(password || "").trim()
    });

    if (result && result.success !== false && result.data) {
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
    window.location.href = getRedirectPageForRole(currentRole);
    return null;
  }

  return user;
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === "") return 0;

  const normalized = String(value)
    .replace(/,/g, "")
    .replace(/[^0-9.-]/g, "")
    .trim();

  const num = Number(normalized);
  return Number.isFinite(num) ? num : 0;
}

function formatMoney(value) {
  const amount = toNumber(value);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}
