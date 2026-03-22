async function apiRequest(method, payload = null) {
  if (!window.APP_CONFIG || !APP_CONFIG.API_BASE_URL) {
    throw new Error("Missing APP_CONFIG.API_BASE_URL");
  }

  try {
    let response;

    if (method === "GET") {
      const params = new URLSearchParams(payload).toString();
      response = await fetch(`${APP_CONFIG.API_BASE_URL}?${params}`);
    } else {
      response = await fetch(APP_CONFIG.API_BASE_URL, {
        method: "POST",
        body: JSON.stringify(payload)
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

  el.innerText = message;
  el.style.color = isError ? "red" : "green";
}
