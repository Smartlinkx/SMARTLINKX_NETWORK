// =========================
// GLOBALS
// =========================
let subscribersCache = [];
let isEditMode = false;
let isLoadingExpenses = false;
let isSavingExpense = false;
let isGeneratingBilling = false; // ✅ NEW
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

  document.getElementById("generateBillingBtn")?.addEventListener("click", generateBilling);
}


// =========================
// 🚀 ENTERPRISE BILLING (MAIN)
// =========================
async function generateBilling() {
  const btn = document.getElementById("generateBillingBtn");

  if (isGeneratingBilling) return;
  isGeneratingBilling = true;

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Processing...";

  let offset = 0;
  const limit = 100;

  let totalCreated = 0;
  let totalSkipped = 0;

  try {
    while (true) {
      showMessage(
        "billingMessage",
        `⚙️ Processing batch ${offset} - ${offset + limit}`,
        false
      );

      const res = await apiGet({
        action: "generateBillingBatch",
        offset,
        limit
      });

      if (!res.success) throw new Error(res.message);

      totalCreated += res.data.created;
      totalSkipped += res.data.skipped;

      if (!res.data.has_more) break;

      offset = res.data.next_offset;
    }

    showMessage(
      "billingMessage",
      `✅ Completed! ${totalCreated} created, ${totalSkipped} skipped.`,
      false
    );

    await Promise.all([
      loadBilling(),
      loadBillingSummary(),
      loadSubscribers()
    ]);

  } catch (err) {
    showMessage("billingMessage", "❌ " + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = originalText;
    isGeneratingBilling = false;
  }
}
