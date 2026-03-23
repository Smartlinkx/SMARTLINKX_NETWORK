// =========================
// GLOBALS
// =========================
let subscribersCache = [];
let isEditMode = false;
let isLoadingExpenses = false;
let isSavingExpense = false;
let isGeneratingBilling = false; // ✅ NEW (prevents double click)
let selectedCoreUserAccountNo = "";
const coreUserLedgerCache = {};


// =========================
// INIT
// =========================
document.addEventListener("DOMContentLoaded", async () => {
  const user = requireRole("ADMIN");
  if (!user) return;

  const welcome = document.getElementById("welcomeText");
  if (welcome) {
    welcome.textContent = `Welcome, ${user.full_name || user.username}`;
  }

  bindAdminEvents();
  bindSidebarNavigation();

  // ✅ Parallel loading (faster UI)
  await Promise.allSettled([
    loadSubscribers(),
    loadBilling(),
    loadBillingSummary(),
    loadPayments(),
    loadExpenses(),
    loadIncomeStatement()
  ]);
});


// =========================
// EVENTS
// =========================
function bindAdminEvents() {
  document.getElementById("logoutBtn")?.addEventListener("click", logout);

  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    renderSubscribers(e.target.value.trim());
  });

  document.getElementById("addSubscriberForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    isEditMode ? await updateSubscriber() : await addSubscriber();
  });

  document.getElementById("paymentForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    await addPayment();
  });

  document.getElementById("expenseForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (isSavingExpense) return;
    await addExpense();
  });

  // 🔥 IMPORTANT FIX
  document.getElementById("generateBillingBtn")?.addEventListener("click", generateBilling);

  document.getElementById("cancelEditBtn")?.addEventListener("click", resetFormMode);
  document.getElementById("loadLedgerBtn")?.addEventListener("click", loadLedger);
  document.getElementById("refreshExpensesBtn")?.addEventListener("click", loadExpenses);
  document.getElementById("loadIncomeStatementBtn")?.addEventListener("click", loadIncomeStatement);

  bindInstallationDateAutoDueDay();
  bindCoreUserDetailEvents();
}


// =========================
// 🔥 FINAL FIXED BILLING FUNCTION
// =========================
async function generateBilling() {
  const btn = document.getElementById("generateBillingBtn");
  const originalText = btn ? btn.textContent : "Generate Billing";

  // ✅ prevent spam clicking
  if (isGeneratingBilling) return;
  isGeneratingBilling = true;

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating...";
    }

    showMessage("billingMessage", "Generating billing... please wait.", false);

    let result = null;

    try {
      // ✅ Use GET first (more stable in Apps Script)
      result = await apiGet({ action: "generateBilling" });

    } catch (err) {
      console.warn("GET failed, fallback to POST:", err.message);

      // ✅ fallback
      result = await apiPost({ action: "generateBilling" });
    }

    if (!result || !result.success) {
      showMessage("billingMessage", result?.message || "Failed to generate billing.", true);
      return;
    }

    const created = result?.data?.total_created ?? 0;
    const skipped = result?.data?.total_skipped ?? 0;

    showMessage(
      "billingMessage",
      `✅ Billing generated successfully. ${created} created, ${skipped} skipped.`,
      false
    );

    // ✅ faster UI refresh
    await Promise.allSettled([
      loadBilling(),
      loadBillingSummary(),
      loadSubscribers(),
      loadDashboardSummary()
    ]);

  } catch (err) {
    console.error("generateBilling error:", err);

    showMessage(
      "billingMessage",
      "❌ Error: " + (err.message || "Unable to generate billing."),
      true
    );

  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
    isGeneratingBilling = false;
  }
}


// =========================
// 🔥 SMALL STABILITY FIX (API)
// =========================

// OPTIONAL but recommended
async function safeApiCall(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error("API error:", err);
    throw new Error(err.message || "Network error");
  }
}
