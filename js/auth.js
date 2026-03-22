document.addEventListener("DOMContentLoaded", function () {
  const existingUser = getCurrentUser();
  if (existingUser?.role) {
    window.location.href = getRedirectPageForRole(existingUser.role);
    return;
  }

  const loginForm = document.getElementById("loginForm");

  if (loginForm) {
    loginForm.addEventListener("submit", async function (e) {
      e.preventDefault();

      const username = document.getElementById("username").value.trim();
      const password = document.getElementById("password").value.trim();
      const submitBtn = loginForm.querySelector('button[type="submit"]');

      if (!username || !password) {
        showMessage("loginMessage", "Please enter username and password", true);
        return;
      }

      const originalText = submitBtn.innerHTML;
      submitBtn.innerHTML = '<span class="spinner"></span> Logging in...';
      submitBtn.disabled = true;

      try {
        const result = await login(username, password);

        if (result.success) {
          const nextPage = getRedirectPageForRole(result?.data?.role);
          showMessage("loginMessage", "Login successful! Redirecting...", false);
          setTimeout(() => {
            window.location.href = nextPage;
          }, 700);
        } else {
          showMessage("loginMessage", result.message || "Login failed", true);
        }
      } catch (error) {
        console.error("Login error:", error);
        showMessage("loginMessage", error.message || "Login error occurred", true);
      } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  ["username", "password"].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener("focus", function () {
        showMessage("loginMessage", "", false);
      });
    }
  });
});
