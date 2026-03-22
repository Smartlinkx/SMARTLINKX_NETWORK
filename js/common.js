const AUTH_STORAGE_KEY = "smartlinkx_current_user";

async function apiRequest(method, payload = null) {
  if (!window.APP_CONFIG || !APP_CONFIG.API_BASE_URL) {
    throw new Error("Missing APP_CONFIG.API_BASE_URL");
  }

  try {
    let response;

    if (method === "GET") {
      const query = payload ? new URLSearchParams(payload).toString() : "";
      const url = query
        ? `${APP_CONFIG.API_BASE_URL}?${query}`
        : APP_CONFIG.API_BASE_URL;

      response = await fetch(url, {
        method: "GET"
      });
    } else {
      response = await fetch(APP_CONFIG.API_BASE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload || {})
      });
    }

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("Invalid JSON response: " + text);
    }

    if (!data.success) {
      throw new Error(data.message || "Request failed");
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
  el.style.color = isError ? "red" : "green";
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
    console.error("Failed to read saved session:", err);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function clearCurrentUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

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
    .map(role => String(role || "").trim().toUpperCase())
    .filter(Boolean);

  if (normalizedAllowed.length && !normalizedAllowed.includes(currentRole)) {
    clearCurrentUser();
    window.location.href = "index.html";
    return null;
  }

  return user;
}
