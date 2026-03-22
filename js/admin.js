let isGeneratingBilling = false;

async function generateBilling() {
  if (isGeneratingBilling) return;
  isGeneratingBilling = true;

  try {
    showMessage("billingMessage", "Generating billing...", false);

    const result = await apiPost({
      action: "generateBilling"
    });

    console.log("Billing API Result:", result);

    const totalCreated =
      Number(result?.data?.total_created ?? result?.data?.created ?? 0);

    showMessage(
      "billingMessage",
      `${result.message || "Billing generated successfully"} (${totalCreated})`,
      false
    );

    if (typeof loadBilling === "function") loadBilling();
    if (typeof loadBillingSummary === "function") loadBillingSummary();
    if (typeof loadSubscribers === "function") loadSubscribers();

  } catch (err) {
    console.error("Billing error:", err);

    showMessage(
      "billingMessage",
      err.message || "Failed to generate billing.",
      true
    );
  } finally {
    isGeneratingBilling = false;
  }
}
