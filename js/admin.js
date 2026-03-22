let subscribersCache = [];
let paymentsCache = [];
let isEditMode = false;
let isBooting = false;
let isLoadingSubscribers = false;
let isLoadingBilling = false;
let isLoadingPayments = false;
let isLoadingLedger = false;
let isGeneratingBilling = false;
let isSavingSubscriber = false;
let isSavingPayment = false;
let isLoadingDashboard = false;
let isLoadingExpenses = false;
let isSavingExpense = false;
let selectedCoreUserAccountNo = "";
const coreUserLedgerCache = {};

document.addEventListener("DOMContentLoaded", initAdminPage);

async function initAdminPage() {
  if (isBooting) return;
  isBooting = true;

  try {
    const user = requireRole("ADMIN");
    if (!user) return;

    setText("welcomeText", `Welcome, ${user.full_name || user.username || "Admin"}`);

    bindAdminEvents();
    bindSidebarNavigation();

    await Promise.allSettled([
      loadSubscribers(),
      loadBilling(),
      loadBillingSummary(),
      loadPayments(),
      loadDashboardSummary(),
      loadExpenses(),
      loadIncomeStatement()
    ]);
  } catch (err) {
    console.error("Admin init error:", err);
    showMessage("pageMessage", "Failed to initialize admin page.", true);
  } finally {
    isBooting = false;
  }
}

function bindAdminEvents() {
  const logoutBtn = document.getElementById("logoutBtn");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  const addForm = document.getElementById("addSubscriberForm");
  if (addForm) {
    addForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (isSavingSubscriber) return;

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
      if (isSavingPayment) return;
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

  const searchInput = document.getElementById("searchInput");
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderSubscribers(searchInput.value.trim());
    });
  }

  const cancelEditBtn = document.getElementById("cancelEditBtn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", resetFormMode);
  }

  const genBtn = document.getElementById("generateBillingBtn");
  if (genBtn) {
    genBtn.addEventListener("click", generateBilling);
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
  installationDateEl.addEventListener("change", updateDueDayFromInstallationDate);
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

  dueDayEl.value = String(d.getDate());
}

async function loadDashboardSummary() {
  if (isLoadingDashboard) return;
  isLoadingDashboard = true;

  try {
    const result = await apiGet({ action: "getDashboardSummary" });
    if (!result || !result.success) return;

    const d = result.data || {};

    setText("cardTotal", d.totalSubscribers || 0);
    setText("cardActive", d.activeSubscribers || 0);
    setText("cardDisabled", d.tempDisabledSubscribers || 0);
    setText("cardDisconnected", d.disconnectedSubscribers || 0);
    setText("cardOverdue", d.overdue || 0);
    setText("cardDueToday", d.dueToday || 0);
    setText("cardDueSoon", d.dueSoon || 0);

    // Optional extra cards if you add them in HTML later
    setTextIfExists("cardReceivable", formatMoney(d.totalReceivable || 0));
    setTextIfExists("cardAdvanceCredit", formatMoney(d.totalAdvanceCredit || 0));
    setTextIfExists("cardCollectedToday", formatMoney(d.collectedToday || 0));
    setTextIfExists("cardCollectedMonth", formatMoney(d.collectedMonth || 0));
    setTextIfExists("cardExpensesMonth", formatMoney(d.expensesMonth || 0));
    setTextIfExists("cardNetIncome", formatMoney(d.netIncome || 0));
  } catch (err) {
    console.error("loadDashboardSummary error:", err);
  } finally {
    isLoadingDashboard = false;
  }
}

async function loadSubscribers() {
  if (isLoadingSubscribers) return;
  isLoadingSubscribers = true;

  try {
    showMessage("pageMessage", "Loading subscribers...", false);

    const result = await apiGet({ action: "getSubscribers" });

    if (!result || !result.success) {
      showMessage("pageMessage", result?.message || "Failed to load subscribers.", true);
      return;
    }

    subscribersCache = Array.isArray(result.data) ? result.data : [];
    renderSubscribers(getValue("searchInput"));
    renderCoreUsers();
    updateSummaryCards();
    showMessage("pageMessage", "Subscribers loaded successfully.", false);
  } catch (err) {
    console.error("loadSubscribers error:", err);
    showMessage("pageMessage", "Unable to load subscribers.", true);
  } finally {
    isLoadingSubscribers = false;
  }
}

function updateSummaryCards() {
  const total = subscribersCache.length;
  const active = subscribersCache.filter(x => upper(x.status) === "ACTIVE").length;
  const disabled = subscribersCache.filter(x => upper(x.status) === "TEMP DISABLED").length;
  const disconnected = subscribersCache.filter(x => upper(x.status) === "DISCONNECTED").length;

  setText("cardTotal", total);
  setText("cardActive", active);
  setText("cardDisabled", disabled);
  setText("cardDisconnected", disconnected);
}

function buildSubscriberFromPayload(payload = {}, responseData = {}) {
  const subscriberId = responseData.subscriber_id || payload.subscriber_id || `TMP-${Date.now()}`;
  return {
    subscriber_id: subscriberId,
    account_no: responseData.account_no || payload.account_no || '',
    full_name: payload.full_name || responseData.full_name || '',
    address: payload.address || responseData.address || '',
    contact_number: payload.contact_number || responseData.contact_number || '',
    email: payload.email || responseData.email || '',
    plan_name: payload.plan_name || responseData.plan_name || '',
    monthly_fee: responseData.monthly_fee || payload.monthly_fee || 0,
    installation_date: responseData.installation_date || payload.installation_date || '',
    due_day: responseData.due_day || payload.due_day || '',
    status: responseData.status || payload.status || 'ACTIVE',
    portal_password: responseData.portal_password || payload.portal_password || '',
    MAC_address: responseData.MAC_address || payload.MAC_address || '',
    assigned_ip: responseData.assigned_ip || payload.assigned_ip || '',
    olt_port: responseData.olt_port || payload.olt_port || '',
    onu_serial: responseData.onu_serial || payload.onu_serial || '',
    remarks: responseData.remarks || payload.remarks || ''
  };
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

  updateSummaryCards();
  renderSubscribers(getValue("searchInput"));
  renderCoreUsers();
}


function renderSubscribers(keyword = "") {
  const tbody = document.getElementById("subscriberTableBody");
  if (!tbody) return;

  let rows = [...subscribersCache];

  if (keyword) {
    const q = String(keyword).toLowerCase();
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

  if (!rows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="13" class="empty-cell">No subscribers found.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = rows.map(item => `
    <tr>
      <td>
        <button type="button" class="btn-light" onclick="startEdit('${escapeJs(item.subscriber_id)}')">Edit</button>
      </td>
      <td>${escapeHtml(item.subscriber_id)}</td>
      <td>${escapeHtml(item.account_no)}</td>
      <td>
        <a href="#" onclick="return openLedger('${escapeJs(item.account_no)}','${escapeJs(item.full_name)}')">
          ${escapeHtml(item.full_name)}
        </a>
      </td>
      <td>${escapeHtml(item.plan_name)}</td>
      <td>${formatMoney(item.monthly_fee)}</td>
      <td>${escapeHtml(item.status)}</td>
      <td>${escapeHtml(item.contact_number)}</td>
      <td>${escapeHtml(item.assigned_ip)}</td>
      <td>${escapeHtml(item.MAC_address)}</td>
      <td>${escapeHtml(item.olt_port)}</td>
      <td>${escapeHtml(item.onu_serial)}</td>
      <td>${formatMoney(item.advance_credit || 0)}</td>
    </tr>
  `).join("");
}

async function openLedger(accountNo, fullName) {
  setValue("ledger_account_no", accountNo || "");
  setValue("ledger_full_name", fullName || "");

  await loadLedger(accountNo, fullName);

  const ledgerSection = document.getElementById("ledgerSection");
  if (typeof navigateToSection === "function") navigateToSection("ledger");
  if (ledgerSection) {
    ledgerSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return false;
}

function startEdit(subscriberId) {
  const item = subscribersCache.find(x => String(x.subscriber_id) === String(subscriberId));
  if (!item) {
    showMessage("formMessage", "Subscriber not found for edit.", true);
    return;
  }

  isEditMode = true;

  setText("formTitle", "Edit Subscriber");
  setText("saveBtn", "Update Subscriber");
  setDisplay("cancelEditBtn", "inline-block");

  setValue("subscriber_id", item.subscriber_id || "");
  setValue("account_no", item.account_no || "");
  setValue("full_name", item.full_name || "");
  setValue("address", item.address || "");
  setValue("contact_number", item.contact_number || "");
  setValue("email", item.email || "");
  setValue("plan_name", item.plan_name || "");
  setValue("monthly_fee", item.monthly_fee || "");
  setValue("installation_date", normalizeInputDate(item.installation_date));
  updateDueDayFromInstallationDate();
  setValue("status", item.status || "ACTIVE");
  setValue("portal_password", item.portal_password || "");
  setValue("MAC_address", item.MAC_address || "");
  setValue("assigned_ip", item.assigned_ip || "");
  setValue("olt_port", item.olt_port || "");
  setValue("onu_serial", item.onu_serial || "");
  setValue("remarks", item.remarks || "");

  if (typeof navigateToSection === "function") navigateToSection("new-user");
  showMessage("formMessage", "Editing subscriber: " + (item.full_name || item.account_no), false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetFormMode() {
  isEditMode = false;

  const form = document.getElementById("addSubscriberForm");
  if (form) form.reset();

  setValue("subscriber_id", "");
  setValue("account_no", "");
  setText("formTitle", "Add New Subscriber");
  setText("saveBtn", "Save Subscriber");
  setDisplay("cancelEditBtn", "none");
  showMessage("formMessage", "", false);
}

function upsertPaymentCache(payment) {
  if (!payment) return;

  const key = String(payment.payment_id || '');
  const index = paymentsCache.findIndex((item) => String(item.payment_id || '') === key && key);

  if (index >= 0) {
    paymentsCache[index] = { ...paymentsCache[index], ...payment };
  } else {
    paymentsCache.unshift(payment);
  }

  renderPayments(paymentsCache);
}

function buildPaymentFromPayload(payload = {}, responseData = {}) {
  return {
    payment_id: responseData.payment_id || `TMP-${Date.now()}`,
    billing_id: responseData.billing_id || '',
    account_no: responseData.account_no || payload.account_no || '',
    full_name: responseData.full_name || payload.full_name || '',
    payment_date: responseData.payment_date || payload.payment_date || '',
    amount: responseData.amount || payload.amount || 0,
    payment_method: responseData.payment_method || payload.payment_method || '',
    reference: responseData.reference || payload.reference || ''
  };
}

function refreshAfterDelay(callback, delay = 1200) {
  window.setTimeout(() => {
    Promise.resolve(callback()).catch((err) => console.error('Delayed refresh error:', err));
  }, delay);
}

async function addSubscriber() {
  if (isSavingSubscriber) return;
  isSavingSubscriber = true;

  const payload = collectFormPayload("addSubscriber");

  try {
    showMessage("formMessage", "Saving subscriber...", false);

    const result = await apiPost(payload);

    if (!result || !result.success) {
      showMessage("formMessage", result?.message || "Failed to add subscriber.", true);
      return;
    }

    const newAccountNo = result?.data?.account_no || "";
    const localSubscriber = buildSubscriberFromPayload(payload, result?.data || {});
    upsertSubscriberCache(localSubscriber);

    resetFormMode();
    showMessage(
      "formMessage",
      "Subscriber added successfully." + (newAccountNo ? " Account No: " + newAccountNo : ""),
      false
    );

    await Promise.allSettled([
      loadSubscribers(),
      loadDashboardSummary()
    ]);

    refreshAfterDelay(() => Promise.allSettled([
      loadSubscribers(),
      loadDashboardSummary()
    ]));

    refreshAfterDelay(() => Promise.allSettled([
      loadSubscribers(),
      loadDashboardSummary()
    ]));
  } catch (err) {
    console.error("addSubscriber error:", err);
    showMessage("formMessage", "Unable to save subscriber.", true);
  } finally {
    isSavingSubscriber = false;
  }
}

async function updateSubscriber() {
  if (isSavingSubscriber) return;
  isSavingSubscriber = true;

  const payload = collectFormPayload("updateSubscriber");

  try {
    showMessage("formMessage", "Updating subscriber...", false);

    const result = await apiPost(payload);

    if (!result || !result.success) {
      showMessage("formMessage", result?.message || "Failed to update subscriber.", true);
      return;
    }

    upsertSubscriberCache(buildSubscriberFromPayload(payload, result?.data || {}));
    resetFormMode();
    showMessage("formMessage", "Subscriber updated successfully.", false);

    await Promise.allSettled([
      loadSubscribers(),
      loadDashboardSummary()
    ]);
  } catch (err) {
    console.error("updateSubscriber error:", err);
    showMessage("formMessage", "Unable to update subscriber.", true);
  } finally {
    isSavingSubscriber = false;
  }
}

function collectFormPayload(actionName) {
  const payload = {
    action: actionName,
    subscriber_id: getValue("subscriber_id"),
    full_name: getValue("full_name"),
    address: getValue("address"),
    contact_number: getValue("contact_number"),
    email: getValue("email"),
    plan_name: getValue("plan_name"),
    monthly_fee: getValue("monthly_fee"),
    installation_date: getValue("installation_date"),
    due_day: getValue("due_day"),
    status: getValue("status"),
    portal_password: getValue("portal_password"),
    MAC_address: getValue("MAC_address"),
    assigned_ip: getValue("assigned_ip"),
    olt_port: getValue("olt_port"),
    onu_serial: getValue("onu_serial"),
    remarks: getValue("remarks")
  };

  if (actionName === "updateSubscriber") {
    payload.account_no = getValue("account_no");
  }

  return payload;
}

async function loadBilling() {
  if (isLoadingBilling) return;
  isLoadingBilling = true;

  try {
    showMessage("billingMessage", "Loading billing...", false);

    const result = await apiGet({ action: "getBilling" });

    if (!result || !result.success) {
      showMessage("billingMessage", result?.message || "Failed to load billing.", true);
      return;
    }

    renderBilling(Array.isArray(result.data) ? result.data : []);
    showMessage("billingMessage", "Billing loaded successfully.", false);
  } catch (err) {
    console.error("loadBilling error:", err);
    showMessage("billingMessage", "Failed to load billing.", true);
  } finally {
    isLoadingBilling = false;
  }
}

function renderBilling(data) {
  const tbody = document.getElementById("billingTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="10" class="empty-cell">No billing data.</td></tr>`;
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
      <td>${formatMoney(item.balance || 0)}</td>
      <td>${escapeHtml(item.status)}</td>
    </tr>
  `).join("");
}

async function loadBillingSummary() {
  try {
    const result = await apiGet({
      action: "getBillingStatusSummary",
      days: 7
    });

    if (!result || !result.success) return;

    const data = result.data || {};

    setText("cardOverdue", (data.overdue || []).length);
    setText("cardDueToday", (data.dueToday || []).length);
    setText("cardDueSoon", (data.dueSoon || []).length);
  } catch (err) {
    console.error("Billing summary error:", err);
  }
}

async function generateBilling() {
  if (isGeneratingBilling) return;
  isGeneratingBilling = true;

  try {
    showMessage("billingMessage", "Generating billing...", false);

    const result = await apiPost({ action: "generateBilling" });

    if (!result || !result.success) {
      showMessage("billingMessage", result?.message || "Failed to generate billing.", true);
      return;
    }

    const totalCreated = result?.data?.total_created ?? 0;
    showMessage("billingMessage", `Billing generated successfully. Created: ${totalCreated}`, false);

    await Promise.allSettled([
      loadBilling(),
      loadBillingSummary(),
      loadPayments(),
      loadSubscribers(),
      loadDashboardSummary()
    ]);
  } catch (err) {
    console.error("generateBilling error:", err);
    showMessage("billingMessage", "Failed to generate billing.", true);
  } finally {
    isGeneratingBilling = false;
  }
}

async function addPayment() {
  if (isSavingPayment) return;
  isSavingPayment = true;

  const payload = {
    action: "addPayment",
    account_no: getValue("payment_account_no"),
    full_name: getValue("payment_full_name"),
    payment_date: getValue("payment_date"),
    amount: getValue("payment_amount"),
    payment_method: getValue("payment_method"),
    reference: getValue("payment_reference"),
    remarks: getValue("payment_remarks")
  };

  try {
    showMessage("paymentMessage", "Saving payment...", false);

    const result = await apiPost(payload);

    if (!result || !result.success) {
      showMessage("paymentMessage", result?.message || "Failed to save payment.", true);
      return;
    }

    const overpayment = Number(result?.data?.overpayment || 0);
    const form = document.getElementById("paymentForm");
    if (form) form.reset();

    if (overpayment > 0) {
      showMessage(
        "paymentMessage",
        `Payment recorded successfully. Excess ${formatMoney(overpayment)} saved as advance credit.`,
        false
      );
    } else {
      showMessage("paymentMessage", "Payment recorded successfully.", false);
    }

    upsertPaymentCache(buildPaymentFromPayload(payload, result?.data || {}));

    await Promise.allSettled([
      loadPayments(),
      loadBilling(),
      loadBillingSummary(),
      loadSubscribers(),
      loadDashboardSummary()
    ]);

    refreshAfterDelay(() => Promise.allSettled([
      loadPayments(),
      loadBilling(),
      loadBillingSummary(),
      loadSubscribers(),
      loadDashboardSummary()
    ]));
  } catch (err) {
    console.error("addPayment error:", err);
    showMessage("paymentMessage", "Unable to save payment.", true);
  } finally {
    isSavingPayment = false;
  }
}

async function loadPayments() {
  if (isLoadingPayments) return;
  isLoadingPayments = true;

  try {
    const result = await apiGet({ action: "getPayments" });

    if (!result || !result.success) {
      showMessage("paymentMessage", result?.message || "Failed to load payments.", true);
      return;
    }

    paymentsCache = Array.isArray(result.data) ? result.data : [];
    renderPayments(paymentsCache);
  } catch (err) {
    console.error("loadPayments error:", err);
    showMessage("paymentMessage", "Failed to load payments.", true);
  } finally {
    isLoadingPayments = false;
  }
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
    showMessage("incomeStatementMessage", `Income statement loaded for ${escapeHtml(month)}.`, false);
  } catch (err) {
    console.error("loadIncomeStatement error:", err);
    showMessage("incomeStatementMessage", "Failed to load income statement.", true);
  }
}


async function loadLedger(accountNoArg = "", fullNameArg = "") {
  if (isLoadingLedger) return;
  isLoadingLedger = true;

  const accountNo = accountNoArg || getValue("ledger_account_no");
  const fullName = fullNameArg || getValue("ledger_full_name");

  try {
    showMessage("ledgerMessage", "Loading ledger...", false);

    const result = await apiGet({
      action: "getSubscriberLedger",
      account_no: accountNo,
      full_name: fullName
    });

    if (!result || !result.success) {
      showMessage("ledgerMessage", result?.message || "Failed to load ledger.", true);
      renderLedgerBills([]);
      renderLedgerPayments([]);
      setText("ledgerTotalUnpaid", formatMoney(0));
      setText("ledgerTotalPaid", formatMoney(0));
      setTextIfExists("ledgerAdvanceCredit", formatMoney(0));
      return;
    }

    const data = result.data || {};

    setText("ledgerTotalUnpaid", formatMoney(data.total_unpaid || 0));
    setText("ledgerTotalPaid", formatMoney(data.total_paid || 0));
    setTextIfExists("ledgerAdvanceCredit", formatMoney(data.advance_credit || 0));

    renderLedgerBills(Array.isArray(data.bills) ? data.bills : []);
    renderLedgerPayments(Array.isArray(data.payments) ? data.payments : []);

    showMessage("ledgerMessage", "Ledger loaded successfully.", false);
  } catch (err) {
    console.error("loadLedger error:", err);
    showMessage("ledgerMessage", "Failed to load ledger.", true);
  } finally {
    isLoadingLedger = false;
  }
}

function renderLedgerBills(data) {
  const tbody = document.getElementById("ledgerBillsTableBody");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No billing history.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => `
    <tr>
      <td>${escapeHtml(item.billing_id)}</td>
      <td>${escapeHtml(item.billing_month)}</td>
      <td>${escapeHtml(item.due_date)}</td>
      <td>${formatMoney(item.amount)}</td>
      <td>${formatMoney(item.applied_total ?? item.applied_payment ?? 0)}</td>
      <td>${formatMoney(item.balance || 0)}</td>
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

function normalizeInputDate(value) {
  if (!value) return "";
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

  const d = new Date(value);
  if (isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeJs(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'");
}

function getValue(id) {
  const el = document.getElementById(id);
  return el ? String(el.value || "").trim() : "";
}

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value ?? "";
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "");
}

function setTextIfExists(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value ?? "");
}

function setDisplay(id, value) {
  const el = document.getElementById(id);
  if (el) el.style.display = value;
}

function upper(value) {
  return String(value || "").trim().toUpperCase();
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
