let subscribersCache = [];
let isEditMode = false;
let isLoadingExpenses = false;
let isSavingExpense = false;
let selectedCoreUserAccountNo = "";
const coreUserLedgerCache = {};

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireRole("ADMIN");
  if (!user) return;

  const welcome = document.getElementById("welcomeText");
  if (welcome) {
    welcome.textContent = `Welcome, ${user.full_name || user.username}`;
  }

  bindAdminEvents();
  bindSidebarNavigation();
  await loadSubscribers();
  await loadBilling();
  await loadBillingSummary();
  await loadPayments();
  await loadExpenses();
  await loadIncomeStatement();
});

function bindAdminEvents() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderSubscribers(searchInput.value.trim());
    });
  }

  const addForm = document.getElementById("addSubscriberForm");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isEditMode) {
        await updateSubscriber();
      } else {
        await addSubscriber();
      }
    });
  }

  const paymentForm = document.getElementById("paymentForm");
  if (paymentForm) {
    paymentForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      await addPayment();
    });
  }

  const expenseForm = document.getElementById("expenseForm");
  if (expenseForm) {
    expenseForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSavingExpense) return;
      await addExpense();
    });
  }

  const generateBillingBtn = document.getElementById("generateBillingBtn");
  if (generateBillingBtn) {
    generateBillingBtn.addEventListener("click", async () => {
      await generateBilling();
    });
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", resetFormMode);
  }

  const loadLedgerBtn = document.getElementById("loadLedgerBtn");
  if (loadLedgerBtn) {
    loadLedgerBtn.addEventListener("click", async () => {
      await loadLedger();
    });
  }

  const refreshExpensesBtn = document.getElementById("refreshExpensesBtn");
  if (refreshExpensesBtn) {
    refreshExpensesBtn.addEventListener("click", async () => {
      await loadExpenses();
    });
  }

  const loadIncomeStatementBtn = document.getElementById("loadIncomeStatementBtn");
  if (loadIncomeStatementBtn) {
    loadIncomeStatementBtn.addEventListener("click", async () => {
      await loadIncomeStatement();
    });
  }

  const incomeMonth = document.getElementById("income_month");
  if (incomeMonth && !incomeMonth.value) {
    incomeMonth.value = new Date().toISOString().slice(0, 7);
  }

  const paymentDate = document.getElementById("payment_date");
  if (paymentDate && !paymentDate.value) {
    paymentDate.value = new Date().toISOString().slice(0, 10);
  }

  const expenseDate = document.getElementById("expense_date");
  if (expenseDate && !expenseDate.value) {
    expenseDate.value = new Date().toISOString().slice(0, 10);
  }

  bindInstallationDateAutoDueDay();
  bindCoreUserDetailEvents();
}


function bindInstallationDateAutoDueDay() {
  const installationDateEl = document.getElementById("installation_date");
  if (!installationDateEl) return;

  installationDateEl.addEventListener("change", () => {
    updateDueDayFromInstallationDate();
  });
}

function updateDueDayFromInstallationDate() {
  const installationDateEl = document.getElementById("installation_date");
  const dueDayEl = document.getElementById("due_day");
  if (!installationDateEl || !dueDayEl) return;

  const value = installationDateEl.value;
  if (!value) {
    dueDayEl.value = "";
    return;
  }

  const d = new Date(value);
  if (isNaN(d.getTime())) {
    dueDayEl.value = "";
    return;
  }

  dueDayEl.value = d.getDate();
}

async function loadSubscribers() {
  try {
    showMessage("pageMessage", "Loading subscribers...", false);

    const result = await apiGet({ action: "getSubscribers" });

    if (!result.success) {
      showMessage("pageMessage", result.message || "Failed to load subscribers.", true);
      return;
    }

    subscribersCache = result.data || [];
    renderSubscribers();
    renderCoreUsers();
    showMessage("pageMessage", "Subscribers loaded successfully.", false);
  } catch (err) {
    showMessage("pageMessage", "Unable to load subscribers.", true);
  }
}

function upsertSubscriberCache(subscriber) {
  if (!subscriber || !subscriber.subscriber_id) return;

  const index = subscribersCache.findIndex(
    item => String(item.subscriber_id || "") === String(subscriber.subscriber_id || "")
  );

  if (index >= 0) {
    subscribersCache[index] = { ...subscribersCache[index], ...subscriber };
  } else {
    subscribersCache.unshift(subscriber);
  }

  renderSubscribers(document.getElementById("searchInput")?.value?.trim() || "");
}

function renderSubscribers(keyword = "") {
  const tbody = document.getElementById("subscriberTableBody");
  if (!tbody) return;

  let rows = [...subscribersCache];

  if (keyword) {
    const q = keyword.toLowerCase();
    rows = rows.filter(item =>
      String(item.subscriber_id || "").toLowerCase().includes(q) ||
      String(item.account_no || "").toLowerCase().includes(q) ||
      String(item.full_name || "").toLowerCase().includes(q) ||
      String(item.contact_number || "").toLowerCase().includes(q) ||
      String(item.plan_name || "").toLowerCase().includes(q) ||
      String(item.assigned_ip || "").toLowerCase().includes(q) ||
      String(item.MAC_address || "").toLowerCase().includes(q) ||
      String(item.olt_port || "").toLowerCase().includes(q) ||
      String(item.onu_serial || "").toLowerCase().includes(q)
    );
  }

  const totalColspan = document.querySelectorAll("#subscriberTableBody").length ? (document.querySelectorAll("#section-subscribers thead th").length || 13) : 13;

  if (rows.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="${totalColspan}" class="empty-cell">No subscribers found.</td>
      </tr>
    `;
    updateSubscriberSummaryCards([]);
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr>
      <td><button type="button" class="btn-light" onclick="startEdit('${escapeJs(item.subscriber_id)}')">Edit</button></td>
      <td>${escapeHtml(item.subscriber_id)}</td>
      <td>${escapeHtml(item.account_no)}</td>
      <td>${escapeHtml(item.full_name)}</td>
      <td>${escapeHtml(item.plan_name)}</td>
      <td>${formatMoney(item.monthly_fee)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.contact_number)}</td>
      <td>${escapeHtml(item.assigned_ip)}</td>
      <td>${escapeHtml(item.MAC_address)}</td>
      <td>${escapeHtml(item.olt_port)}</td>
      <td>${escapeHtml(item.onu_serial)}</td>
      <td>${formatMoney(item.advance_credit)}</td>
    </tr>
  `).join("");

  updateSubscriberSummaryCards(rows);
}

function startEdit(subscriberId) {
  const item = subscribersCache.find(x => String(x.subscriber_id) === String(subscriberId));
  if (!item) {
    showMessage("formMessage", "Subscriber not found for edit.", true);
    return;
  }

  isEditMode = true;

  document.getElementById("formTitle").textContent = "Edit Subscriber";
  document.getElementById("saveBtn").textContent = "Update Subscriber";
  document.getElementById("cancelEditBtn").style.display = "inline-block";

  document.getElementById("subscriber_id").value = item.subscriber_id || "";
  document.getElementById("account_no").value = item.account_no || "";
  document.getElementById("full_name").value = item.full_name || "";
  document.getElementById("address").value = item.address || "";
  document.getElementById("contact_number").value = item.contact_number || "";
  document.getElementById("email").value = item.email || "";
  document.getElementById("plan_name").value = item.plan_name || "";
  document.getElementById("monthly_fee").value = item.monthly_fee || "";
  document.getElementById("installation_date").value = normalizeInputDate(item.installation_date);
  updateDueDayFromInstallationDate();
  document.getElementById("status").value = item.status || "ACTIVE";
  document.getElementById("portal_password").value = item.portal_password || "";
  document.getElementById("MAC_address").value = item.MAC_address || "";
  document.getElementById("assigned_ip").value = item.assigned_ip || "";
  document.getElementById("olt_port").value = item.olt_port || "";
  document.getElementById("onu_serial").value = item.onu_serial || "";
  document.getElementById("remarks").value = item.remarks || "";

  if (typeof navigateToSection === "function") navigateToSection("new-user");
  showMessage("formMessage", "Editing subscriber: " + (item.full_name || item.account_no), false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetFormMode() {
  isEditMode = false;
  document.getElementById("addSubscriberForm").reset();
  document.getElementById("subscriber_id").value = "";
  document.getElementById("formTitle").textContent = "Add New Subscriber";
  document.getElementById("saveBtn").textContent = "Save Subscriber";
  document.getElementById("cancelEditBtn").style.display = "none";
  showMessage("formMessage", "", false);
}

async function addSubscriber() {
  const payload = collectFormPayload("addSubscriber");

  try {
    showMessage("formMessage", "Saving subscriber...", false);

    const result = await apiPost(payload);

    if (!result.success) {
      showMessage("formMessage", result.message || "Failed to add subscriber.", true);
      return;
    }

    const newAccountNo = result?.data?.account_no || "";
    upsertSubscriberCache(result?.data || null);

    resetFormMode();
    showMessage(
      "formMessage",
      "Subscriber added successfully." + (newAccountNo ? " Account No: " + newAccountNo : ""),
      false
    );

    await loadSubscribers();
  } catch (err) {
    showMessage("formMessage", "Unable to save subscriber.", true);
  }
}

async function updateSubscriber() {
  const payload = collectFormPayload("updateSubscriber");

  try {
    showMessage("formMessage", "Updating subscriber...", false);

    const result = await apiPost(payload);

    if (!result.success) {
      showMessage("formMessage", result.message || "Failed to update subscriber.", true);
      return;
    }

    upsertSubscriberCache(result?.data || null);
    resetFormMode();
    showMessage("formMessage", "Subscriber updated successfully.", false);
    await loadSubscribers();
  } catch (err) {
    showMessage("formMessage", "Unable to update subscriber.", true);
  }
}

function collectFormPayload(actionName) {
  const payload = {
    action: actionName,
    subscriber_id: document.getElementById("subscriber_id").value.trim(),
    full_name: document.getElementById("full_name").value.trim(),
    address: document.getElementById("address").value.trim(),
    contact_number: document.getElementById("contact_number").value.trim(),
    email: document.getElementById("email").value.trim(),
    plan_name: document.getElementById("plan_name").value.trim(),
    monthly_fee: document.getElementById("monthly_fee").value.trim(),
    installation_date: document.getElementById("installation_date").value.trim(),
    due_day: document.getElementById("due_day").value.trim(),
    status: document.getElementById("status").value.trim(),
    portal_password: document.getElementById("portal_password").value.trim(),
    MAC_address: document.getElementById("MAC_address").value.trim(),
    assigned_ip: document.getElementById("assigned_ip").value.trim(),
    olt_port: document.getElementById("olt_port").value.trim(),
    onu_serial: document.getElementById("onu_serial").value.trim(),
    remarks: document.getElementById("remarks").value.trim()
  };

  if (actionName === "updateSubscriber") {
    payload.account_no = document.getElementById("account_no").value.trim();
  }

  return payload;
}

async function loadBilling() {
  try {
    showMessage("billingMessage", "Loading billing...", false);

    const result = await apiGet({ action: "getBilling" });

    if (!result.success) {
      showMessage("billingMessage", result.message || "Failed to load billing.", true);
      return;
    }

    renderBilling(result.data || []);
    showMessage("billingMessage", "Billing loaded successfully.", false);
  } catch (err) {
    showMessage("billingMessage", "Failed to load billing.", true);
  }
}

function renderBilling(data) {
  const tbody = document.getElementById("billingTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">No billing data.</td></tr>`;
    updateBillingCards([]);
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${escapeHtml(item.billing_id)}</td>
      <td>${escapeHtml(item.account_no)}</td>
      <td>${escapeHtml(item.full_name)}</td>
      <td>${escapeHtml(item.plan_name)}</td>
      <td>${escapeHtml(item.billing_month)}</td>
      <td>${escapeHtml(item.due_date)}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${formatMoney(item.applied_total ?? item.applied_payment ?? 0)}</td>
      <td>${formatMoney(item.balance ?? item.remaining_balance ?? item.amount)}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("");

  updateBillingCards(data);
}

async function loadBillingSummary() {
  try {
    const result = await apiGet({
      action: "getBillingStatusSummary",
      days: 7
    });

    if (!result.success) return;

    const data = result.data || {};

    document.getElementById("cardOverdue").textContent = (data.overdue || []).length;
    document.getElementById("cardDueToday").textContent = (data.dueToday || []).length;
    document.getElementById("cardDueSoon").textContent = (data.dueSoon || []).length;
  } catch (err) {
    console.error("Billing summary error:", err);
  }
}

async function addPayment() {
  const payload = {
    action: "addPayment",
    account_no: document.getElementById("payment_account_no").value.trim(),
    full_name: document.getElementById("payment_full_name").value.trim(),
    payment_date: document.getElementById("payment_date").value.trim(),
    amount: document.getElementById("payment_amount").value.trim(),
    payment_method: document.getElementById("payment_method").value.trim(),
    reference: document.getElementById("payment_reference").value.trim(),
    remarks: document.getElementById("payment_remarks").value.trim()
  };

  try {
    showMessage("paymentMessage", "Saving payment...", false);

    const result = await apiPost(payload);

    if (!result.success) {
      showMessage("paymentMessage", result.message || "Failed to save payment.", true);
      return;
    }

    document.getElementById("paymentForm").reset();
    showMessage("paymentMessage", "Payment recorded successfully.", false);

    await loadPayments();
    await loadBilling();
    await loadBillingSummary();
  } catch (err) {
    showMessage("paymentMessage", "Unable to save payment.", true);
  }
}

async function loadPayments() {
  try {
    const result = await apiGet({ action: "getPayments" });

    if (!result.success) {
      showMessage("paymentMessage", result.message || "Failed to load payments.", true);
      return;
    }

    const payments = result.data || [];
    renderPayments(payments);
    updateCollectionCards(payments);
  } catch (err) {
    showMessage("paymentMessage", "Failed to load payments.", true);
  }
}

function updateCollectionCards(data) {
  const list = Array.isArray(data) ? data : [];
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const todayTotal = list.filter(item => String(item.payment_date || "").slice(0, 10) === today).reduce((sum, item) => sum + toNumber(item.amount), 0);
  const monthTotal = list.filter(item => String(item.payment_date || "").slice(0, 7) === month).reduce((sum, item) => sum + toNumber(item.amount), 0);
  setText("cardCollectedToday", formatMoney(todayTotal));
  setText("cardCollectedMonth", formatMoney(monthTotal));
}

function renderPayments(data) {
  const tbody = document.getElementById("paymentsTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No payment data.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${escapeHtml(item.payment_id)}</td>
      <td>${escapeHtml(item.billing_id)}</td>
      <td>${escapeHtml(item.account_no)}</td>
      <td>${escapeHtml(item.full_name)}</td>
      <td>${escapeHtml(item.payment_date)}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${escapeHtml(item.payment_method)}</td>
      <td>${escapeHtml(item.reference)}</td>
    </tr>
  `).join("");
}


async function addExpense() {
  if (isSavingExpense) return;
  isSavingExpense = true;

  const payload = {
    action: "addExpense",
    expense_date: getValue("expense_date"),
    category: getValue("expense_category"),
    description: getValue("expense_description"),
    amount: getValue("expense_amount"),
    entered_by: getValue("expense_entered_by"),
    notes: getValue("expense_notes")
  };

  try {
    showMessage("expenseMessage", "Saving expense...", false);

    const result = await apiPost(payload);

    if (!result || !result.success) {
      showMessage("expenseMessage", result?.message || "Failed to save expense.", true);
      return;
    }

    const form = document.getElementById("expenseForm");
    if (form) form.reset();
    setValue("expense_date", new Date().toISOString().slice(0, 10));
    showMessage("expenseMessage", "Expense saved successfully.", false);

    await Promise.allSettled([
      loadExpenses(),
      loadIncomeStatement(),
      loadDashboardSummary()
    ]);
  } catch (err) {
    console.error("addExpense error:", err);
    showMessage("expenseMessage", "Unable to save expense.", true);
  } finally {
    isSavingExpense = false;
  }
}

async function loadExpenses() {
  if (isLoadingExpenses) return;
  isLoadingExpenses = true;

  try {
    const result = await apiGet({ action: "getExpenses" });

    if (!result || !result.success) {
      showMessage("expenseMessage", result?.message || "Failed to load expenses.", true);
      renderExpenses([]);
      return;
    }

    renderExpenses(Array.isArray(result.data) ? result.data : []);
  } catch (err) {
    console.error("loadExpenses error:", err);
    showMessage("expenseMessage", "Failed to load expenses.", true);
    renderExpenses([]);
  } finally {
    isLoadingExpenses = false;
  }
}

function renderExpenses(data) {
  const tbody = document.getElementById("expensesTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No expense data.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${escapeHtml(item.expense_id)}</td>
      <td>${escapeHtml(item.expense_date)}</td>
      <td>${escapeHtml(item.category)}</td>
      <td>${escapeHtml(item.description)}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${escapeHtml(item.entered_by)}</td>
      <td>${escapeHtml(item.notes)}</td>
    </tr>
  `).join("");
}

async function loadIncomeStatement() {
  const month = getValue("income_month") || new Date().toISOString().slice(0, 7);
  setValue("income_month", month);

  try {
    showMessage("incomeStatementMessage", "Loading income statement...", false);

    const result = await apiGet({ action: "getIncomeStatement", month });

    if (!result || !result.success) {
      showMessage("incomeStatementMessage", result?.message || "Failed to load income statement.", true);
      setText("incomeRevenue", formatMoney(0));
      setText("incomeExpenses", formatMoney(0));
      setText("incomeNetIncome", formatMoney(0));
      return;
    }

    const data = result.data || {};
    setText("incomeRevenue", formatMoney(data.revenue || 0));
    setText("incomeExpenses", formatMoney(data.expenses || 0));
    setText("incomeNetIncome", formatMoney(data.net_income || 0));
    setText("cardExpensesMonth", formatMoney(data.expenses || 0));
    setText("cardNetIncome", formatMoney(data.net_income || 0));
    showMessage("incomeStatementMessage", `Income statement loaded for ${escapeHtml(month)}.`, false);
  } catch (err) {
    console.error("loadIncomeStatement error:", err);
    showMessage("incomeStatementMessage", "Failed to load income statement.", true);
  }
}


async function loadLedger() {
  const accountNo = document.getElementById("ledger_account_no").value.trim();
  const fullName = document.getElementById("ledger_full_name").value.trim();

  try {
    showMessage("ledgerMessage", "Loading ledger...", false);

    const result = await apiGet({
      action: "getSubscriberLedger",
      account_no: accountNo,
      full_name: fullName
    });

    if (!result.success) {
      showMessage("ledgerMessage", result.message || "Failed to load ledger.", true);
      return;
    }

    const data = result.data || {};

    document.getElementById("ledgerTotalUnpaid").textContent = formatMoney(data.total_unpaid || 0);
    document.getElementById("ledgerTotalPaid").textContent = formatMoney(data.total_paid || 0);

    renderLedgerBills(data.bills || []);
    renderLedgerPayments(data.payments || []);

    showMessage("ledgerMessage", "Ledger loaded successfully.", false);
  } catch (err) {
    showMessage("ledgerMessage", "Failed to load ledger.", true);
  }
}

function renderLedgerBills(data) {
  const tbody = document.getElementById("ledgerBillsTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-cell">No billing history.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${escapeHtml(item.billing_id)}</td>
      <td>${escapeHtml(item.billing_month)}</td>
      <td>${escapeHtml(item.due_date)}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("");
}

function renderLedgerPayments(data) {
  const tbody = document.getElementById("ledgerPaymentsTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">No payment history.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${escapeHtml(item.payment_id)}</td>
      <td>${escapeHtml(item.billing_id)}</td>
      <td>${escapeHtml(item.payment_date)}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${escapeHtml(item.payment_method)}</td>
      <td>${escapeHtml(item.reference)}</td>
    </tr>
  `).join("");
}

let isGeneratingBilling = false;

async function generateBilling() {
  const btn = document.getElementById("generateBillingBtn");
  const originalText = btn ? btn.textContent : "Generate Billing";

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Generating...";
    }

    showMessage("billingMessage", "Generating monthly billing... Please wait.", false);

    let result = null;
    let lastError = null;
    const maxRetries = 3;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log("generateBilling attempt " + attempt + "/" + maxRetries);

        // Try POST first
        result = await apiPost({ action: "generateBilling" });
        lastError = null;
        break;

      } catch (err) {
        lastError = err;
        console.warn("Attempt " + attempt + " failed:", err.message);

        const isRetryable =
          err.message.includes("EMPTY_RESPONSE") ||
          err.message.includes("HTML_RESPONSE") ||
          err.message.includes("empty/HTML response") ||
          err.message.includes("Failed to fetch") ||
          err.message.includes("NetworkError") ||
          err.message.includes("Load failed");

        if (!isRetryable || attempt === maxRetries) break;

        // Try GET fallback on retry
        try {
          console.log("Trying GET fallback for generateBilling...");
          result = await apiGet({ action: "generateBilling" });
          lastError = null;
          break;
        } catch (getErr) {
          console.warn("GET fallback also failed:", getErr.message);
          lastError = getErr;
        }

        const waitMs = attempt * 2000;
        showMessage(
          "billingMessage",
          "Attempt " + attempt + " failed. Retrying in " + (waitMs / 1000) + "s...",
          false
        );
        await new Promise(resolve => setTimeout(resolve, waitMs));
      }
    }

    if (lastError) {
      throw lastError;
    }

    if (!result || !result.success) {
      showMessage(
        "billingMessage",
        result?.message || "Failed to generate billing.",
        true
      );
      return;
    }

    const created = result?.data?.total_created ?? 0;
    const skipped = result?.data?.total_skipped ?? 0;

    showMessage(
      "billingMessage",
      "Billing generated successfully. " + created + " new record(s) created. " + skipped + " skipped.",
      false
    );

    // Refresh all related data
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
      "Error: " + (err.message || "Unable to generate billing."),
      true
    );
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = originalText;
    }
  }
}

function updateSubscriberSummaryCards(rows) {
  const list = Array.isArray(rows) ? rows : [];
  setText("cardTotal", String(list.length));
  setText("cardActive", String(list.filter(item => String(item.status || "").toUpperCase() === "ACTIVE").length));
  setText("cardDisabled", String(list.filter(item => String(item.status || "").toUpperCase() === "TEMP DISABLED").length));
  setText("cardDisconnected", String(list.filter(item => String(item.status || "").toUpperCase() === "DISCONNECTED").length));
  setText("cardAdvanceCredit", formatMoney(list.reduce((sum, item) => sum + toNumber(item.advance_credit), 0)));
}

function updateBillingCards(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const receivable = list.reduce((sum, item) => sum + toNumber(item.balance ?? item.remaining_balance ?? item.amount), 0);
  setText("cardReceivable", formatMoney(receivable));
}

function normalizeInputDate(value) {
  if (!value) return "";
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function escapeJs(value) {
  return String(value ?? "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}



function getValue(id) {
  return document.getElementById(id)?.value?.trim?.() || "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value ?? "";
}

async function loadDashboardSummary() {
  try {
    const result = await apiGet({ action: "getBillingStatusSummary", days: 7 });
    if (!result || !result.success) return;

    const data = result.data || {};
    setText("cardOverdue", (data.overdue || []).length);
    setText("cardDueToday", (data.dueToday || []).length);
    setText("cardDueSoon", (data.dueSoon || []).length);
  } catch (err) {
    console.error("loadDashboardSummary error:", err);
  }
}

function renderCoreUsers() {
  const tbody = document.getElementById("coreUserTableBody");
  if (!tbody) return;

  const rows = Array.isArray(subscribersCache) ? subscribersCache : [];
  if (!rows.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="8">No user records found.</td></tr>';
    closeCoreUserDetail();
    return;
  }

  tbody.innerHTML = rows.map((row) => `
    <tr>
      <td><a href="#" class="core-account-link" onclick="return openCoreUserDetails('${escapeJs(row.account_no || "")}', '${escapeJs(row.full_name || "")}')">${escapeHtml(row.account_no || "-")}</a></td>
      <td>${escapeHtml(row.full_name || "-")}</td>
      <td>${escapeHtml(row.plan_name || "-")}</td>
      <td>${escapeHtml(row.MAC_address || "-")}</td>
      <td>${escapeHtml(row.assigned_ip || "-")}</td>
      <td>${escapeHtml(row.olt_port || "-")}</td>
      <td>${escapeHtml(row.onu_serial || "-")}</td>
      <td>${escapeHtml(row.status || "-")}</td>
    </tr>
  `).join("");

  if (selectedCoreUserAccountNo) {
    const current = rows.find((row) => String(row.account_no || "") === String(selectedCoreUserAccountNo));
    if (current) {
      populateCoreUserInfo(current);
      populateCoreUserServices(current);
    }
  }
}

function bindCoreUserDetailEvents() {
  const closeBtn = document.getElementById("coreUserDetailCloseBtn");
  if (closeBtn) {
    closeBtn.addEventListener("click", closeCoreUserDetail);
  }

  document.querySelectorAll(".detail-tab[data-user-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateCoreUserTab(btn.dataset.userTab || "information");
    });
  });
}

function activateCoreUserTab(tabName) {
  document.querySelectorAll(".detail-tab[data-user-tab]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.userTab === tabName);
  });
  document.querySelectorAll(".detail-tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `coreUserTab-${tabName}`);
  });
}

function closeCoreUserDetail() {
  const card = document.getElementById("coreUserDetailCard");
  if (card) card.style.display = "none";
  selectedCoreUserAccountNo = "";
  activateCoreUserTab("information");
}

function renderDetailGrid(containerId, fields) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = fields.map((field) => `
    <div class="detail-item">
      <div class="detail-item-label">${escapeHtml(field.label)}</div>
      <div class="detail-item-value">${escapeHtml(field.value || "-")}</div>
    </div>
  `).join("");
}

function populateCoreUserInfo(user) {
  renderDetailGrid("coreUserInfoGrid", [
    { label: "Subscriber ID", value: user.subscriber_id || "-" },
    { label: "Account No.", value: user.account_no || "-" },
    { label: "Full Name", value: user.full_name || "-" },
    { label: "Plan", value: user.plan_name || "-" },
    { label: "Monthly Fee", value: formatMoney(user.monthly_fee || 0) },
    { label: "Installation Date", value: user.installation_date || "-" },
    { label: "Contact Number", value: user.contact_number || "-" },
    { label: "Address", value: user.address || "-" },
    { label: "Email", value: user.email || "-" },
    { label: "Portal Password", value: user.portal_password || "-" },
    { label: "Status", value: user.status || "-" },
    { label: "Advance Credit", value: formatMoney(user.advance_credit || 0) }
  ]);
}

function populateCoreUserServices(user) {
  renderDetailGrid("coreUserServicesGrid", [
    { label: "MAC Address", value: user.MAC_address || "-" },
    { label: "Assigned IP", value: user.assigned_ip || "-" },
    { label: "OLT Port", value: user.olt_port || "-" },
    { label: "ONU Serial", value: user.onu_serial || "-" },
    { label: "Service Status", value: user.status || "-" },
    { label: "Remarks", value: user.remarks || "-" }
  ]);
}

function populateCoreUserBilling(ledger) {
  const summary = document.getElementById("coreUserBillingSummary");
  const tbody = document.getElementById("coreUserBillingTableBody");
  if (summary) {
    summary.innerHTML = `
      <div class="detail-item"><div class="detail-item-label">Total Unpaid</div><div class="detail-item-value">${formatMoney(ledger.total_unpaid || 0)}</div></div>
      <div class="detail-item"><div class="detail-item-label">Total Paid</div><div class="detail-item-value">${formatMoney(ledger.total_paid || 0)}</div></div>
      <div class="detail-item"><div class="detail-item-label">Advance Credit</div><div class="detail-item-value">${formatMoney(ledger.advance_credit || 0)}</div></div>
      <div class="detail-item"><div class="detail-item-label">Bill Count</div><div class="detail-item-value">${(ledger.bills || []).length}</div></div>
    `;
  }
  if (!tbody) return;
  const bills = Array.isArray(ledger.bills) ? ledger.bills : [];
  if (!bills.length) {
    tbody.innerHTML = '<tr><td class="empty-cell" colspan="7">No billing records found.</td></tr>';
    return;
  }
  tbody.innerHTML = bills.map((item) => `
    <tr>
      <td>${escapeHtml(item.billing_id || "-")}</td>
      <td>${escapeHtml(item.billing_month || "-")}</td>
      <td>${escapeHtml(item.due_date || "-")}</td>
      <td>${formatMoney(item.amount || 0)}</td>
      <td>${formatMoney(item.applied_total ?? item.applied_payment ?? 0)}</td>
      <td>${formatMoney(item.balance || 0)}</td>
      <td>${escapeHtml(item.status || "-")}</td>
    </tr>
  `).join("");
}

async function openCoreUserDetails(accountNo, fullName) {
  const user = (Array.isArray(subscribersCache) ? subscribersCache : []).find((row) => String(row.account_no || "") === String(accountNo || ""));
  if (!user) return false;

  selectedCoreUserAccountNo = user.account_no || "";
  const card = document.getElementById("coreUserDetailCard");
  const title = document.getElementById("coreUserDetailTitle");
  const subtitle = document.getElementById("coreUserDetailSubtitle");
  if (title) title.textContent = `${user.full_name || "Subscriber"} (${user.account_no || ""})`;
  if (subtitle) subtitle.textContent = `Plan: ${user.plan_name || "-"} • Status: ${user.status || "-"}`;
  if (card) card.style.display = "block";

  populateCoreUserInfo(user);
  populateCoreUserServices(user);
  activateCoreUserTab("information");

  const ledgerKey = `${user.account_no || ""}||${user.full_name || ""}`;
  if (coreUserLedgerCache[ledgerKey]) {
    populateCoreUserBilling(coreUserLedgerCache[ledgerKey]);
  } else {
    const tbody = document.getElementById("coreUserBillingTableBody");
    if (tbody) tbody.innerHTML = '<tr><td class="empty-cell" colspan="7">Loading billing records...</td></tr>';
    try {
      const result = await apiGet({ action: "getSubscriberLedger", account_no: user.account_no || "", full_name: user.full_name || "" });
      if (result && result.success && result.data) {
        coreUserLedgerCache[ledgerKey] = result.data;
        populateCoreUserBilling(result.data);
      } else {
        populateCoreUserBilling({ total_unpaid: 0, total_paid: 0, advance_credit: 0, bills: [] });
      }
    } catch (err) {
      console.error("openCoreUserDetails error:", err);
      populateCoreUserBilling({ total_unpaid: 0, total_paid: 0, advance_credit: 0, bills: [] });
    }
  }

  const section = document.getElementById("section-core-user");
  if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
  return false;
}

function bindSidebarNavigation() {
  const body = document.body;
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("mobileOverlay");
  const mobileBtn = document.getElementById("mobileMenuBtn");
  const collapseBtn = document.getElementById("sidebarCollapseBtn");
  const navLinks = Array.from(document.querySelectorAll(".nav-link[data-section]"));
  const parents = Array.from(document.querySelectorAll(".nav-parent[data-dropdown]"));

  parents.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth <= 900 && sidebar?.classList.contains("collapsed")) {
        sidebar.classList.remove("collapsed");
        body.classList.remove("sidebar-collapsed");
      }
      const name = btn.dataset.dropdown;
      const submenu = document.querySelector(`.nav-submenu[data-submenu="${name}"]`);
      if (!submenu) return;
      const willOpen = !submenu.classList.contains("open");
      submenu.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });
  });

  navLinks.forEach((btn) => {
    btn.addEventListener("click", () => {
      navigateToSection(btn.dataset.section);
      if (window.innerWidth <= 900) closeMobileSidebar();
    });
  });

  if (mobileBtn) mobileBtn.addEventListener("click", openMobileSidebar);
  if (overlay) overlay.addEventListener("click", closeMobileSidebar);
  if (collapseBtn) {
    collapseBtn.addEventListener("click", () => {
      if (window.innerWidth <= 900) {
        openMobileSidebar();
        return;
      }
      const collapsed = sidebar?.classList.toggle("collapsed");
      body.classList.toggle("sidebar-collapsed", !!collapsed);
    });
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMobileSidebar();
  });

  const initial = (window.location.hash || "").replace("#", "") || "dashboard";
  navigateToSection(initial);
}

function navigateToSection(sectionName) {
  const sections = Array.from(document.querySelectorAll(".content-section"));
  const navLinks = Array.from(document.querySelectorAll(".nav-link[data-section]"));
  const targetId = `section-${sectionName}`;
  const hasTarget = sections.some((section) => section.id === targetId);
  const finalSection = hasTarget ? sectionName : "dashboard";

  sections.forEach((section) => {
    section.classList.toggle("active", section.id === `section-${finalSection}`);
  });
  navLinks.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.section === finalSection);
  });
  window.location.hash = finalSection;
}

function openMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("mobileOverlay");
  sidebar?.classList.add("mobile-open");
  overlay?.classList.add("show");
}

function closeMobileSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("mobileOverlay");
  sidebar?.classList.remove("mobile-open");
  overlay?.classList.remove("show");
}
