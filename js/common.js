const AUTH_STORAGE_KEY = "smartlinkx_current_user";

async function apiRequest(method, payload = null) {
  const baseUrl = window.APP_CONFIG?.API_BASE_URL;
  
  if (!baseUrl) {
    throw new Error("Missing APP_CONFIG.API_BASE_URL");
  }

  try {
    let url = baseUrl;
    let response;

    if (method === "GET") {
      const query = payload ? new URLSearchParams(payload).toString() : "";
      url = query ? `${baseUrl}?${query}` : baseUrl;
      console.log(`GET ${url}`);
      
      response = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      });
    } else {
      // Google Apps Script uses POST with form data in query params
      const params = new URLSearchParams(payload || {});
      url = `${baseUrl}?${params.toString()}`;
      console.log(`POST ${url}`);
      
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8"
        }
      });
    }

    const text = await response.text();
    console.log("Raw response:", text.substring(0, 200));

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("Invalid JSON: " + text.substring(0, 200));
    }

    if (!data.success) {
      throw new Error(data.message || data.error || "Request failed");
    }

    return data;
  } catch (err) {
    console.error("API ERROR:", err);
    throw err;
  }
}

function apiPost(payload) {
  return apiRequest("POST", payload);
}

function apiGet(params) {
  return apiRequest("GET", params);
}

function showMessage(id, message, isError = false) {
  const el = document.getElementById(id);
  if (!el) return;

  el.innerText = message || "";
  el.className = `message ${isError ? 'error' : 'success'}`;
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

async function login(username, password) {
  try {
    const payload = {
      action: "loginUser",
      username: username.trim(),
      password: password.trim()
    };
    
    console.log("Login payload:", payload);
    const result = await apiPost(payload);
    
    if (result && result.success && result.data) {
      saveCurrentUser(result.data);
      return { success: true, data: result.data };
    }
    
    return { success: false, message: result?.message || "Login failed" };
  } catch (error) {
    console.error("Login error:", error);
    return { success: false, message: error.message };
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
    .map(role => String(role || "").trim().toUpperCase())
    .filter(Boolean);

  if (normalizedAllowed.length && !normalizedAllowed.includes(currentRole)) {
    clearCurrentUser();
    window.location.href = "index.html";
    return null;
  }

  return user;
}
