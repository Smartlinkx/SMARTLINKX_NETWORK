const AUTH_STORAGE_KEY = "smartlinkx_current_user";

async function apiRequest(method, endpoint = "", payload = null) {
  if (!window.APP_CONFIG || !window.APP_CONFIG.API_BASE_URL) {
    throw new Error("Missing APP_CONFIG.API_BASE_URL");
  }

  const baseUrl = window.APP_CONFIG.API_BASE_URL;
  const url = endpoint ? `${baseUrl}/${endpoint}` : baseUrl;

  try {
    let response;

    if (method === "GET") {
      const query = payload ? new URLSearchParams(payload).toString() : "";
      const getUrl = query ? `${url}?${query}` : url;
      
      console.log(`GET ${getUrl}`); // Debug log
      
      response = await fetch(getUrl, {
        method: "GET",
        credentials: "same-origin" // Include cookies if needed
      });
    } else {
      console.log(`POST ${url}`, payload); // Debug log
      
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        credentials: "same-origin", // Include cookies if needed
        body: JSON.stringify(payload || {})
      });
    }

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      console.error("Invalid JSON response:", text.substring(0, 200)); // First 200 chars
      throw new Error("Invalid JSON response from server");
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

function apiGet(endpoint = "", params) {
  return apiRequest("GET", endpoint, params);
}

function apiPost(endpoint = "", payload) {
  return apiRequest("POST", endpoint, payload);
}

// In common.js, update this line:
function showMessage(id, message, isError = false) {
  const el = document.getElementById(id);  // Works with loginMessage
  if (!el) return;

  el.innerText = message || "";
  el.className = `message ${isError ? 'error' : 'success'}`;
  el.style.display = message ? "block" : "none";
  
  // Auto hide after 5 seconds
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
    console.error("Failed to read saved session:", err);
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function clearCurrentUser() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

async function login(username, password) {
  try {
    console.log("Attempting login for:", username);
    
    const result = await apiPost("login", {  // ← Fixed: specify "login" endpoint
      action: "loginUser",
      username: username.trim(),
      password: password.trim()
    });

    console.log("Login result:", result);

    if (result && result.success && result.data) {
      saveCurrentUser(result.data);
      return { success: true, data: result.data };
    }
    
    showMessage("login-message", result?.message || "Login failed", true);
    return { success: false, message: result?.message || "Login failed" };
    
  } catch (error) {
    console.error("Login error:", error);
    showMessage("login-message", error.message || "Login error occurred", true);
    return { success: false, message: error.message || "Login error occurred" };
  }
}

async function logout() {
  try {
    // Optional: call logout API
    await apiPost("logout");
  } catch (err) {
    console.warn("Logout API failed:", err);
  }
  
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
    console.warn(`Access denied. User role: ${currentRole}, Required:`, normalizedAllowed);
    clearCurrentUser();
    window.location.href = "index.html";
    return null;
  }

  return user;
}

// Initialize app on load
document.addEventListener("DOMContentLoaded", function() {
  // Check if user is already logged in on protected pages
  if (window.location.pathname.includes("dashboard") || 
      window.location.pathname.includes("admin")) {
    const user = getCurrentUser();
    if (!user) {
      window.location.href = "index.html";
    }
  }
});
