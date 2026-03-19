document.addEventListener("DOMContentLoaded", () => {
  const existingUser = getCurrentUser();
  if (existingUser) {
    const role = String(existingUser.role || "").toUpperCase();
    if (role === "ADMIN") {
      window.location.href = "admin.html";
      return;
    }
    if (role === "STAFF") {
      window.location.href = "staff.html";
      return;
    }
  }

  const form = document.getElementById("loginForm");
  const msgId = "loginMessage";

  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const username = document.getElementById("username")?.value.trim() || "";
    const password = document.getElementById("password")?.value.trim() || "";

    if (!username || !password) {
      showMessage(msgId, "Username and password are required.", true);
      return;
    }

    showMessage(msgId, "Signing in...", false);

    try {
      const result = await login(username, password);

      if (!result || !result.success) {
        showMessage(msgId, result?.message || "Login failed.", true);
        return;
      }

      const role = String(result.data?.role || "").toUpperCase();

      if (role === "ADMIN") {
        window.location.href = "admin.html";
        return;
      }

      if (role === "STAFF") {
        window.location.href = "staff.html";
        return;
      }

      showMessage(msgId, "Unknown user role.", true);
    } catch (err) {
      console.error("Login error:", err);
      showMessage(msgId, "Unable to connect to server.", true);
    }
  });
});
