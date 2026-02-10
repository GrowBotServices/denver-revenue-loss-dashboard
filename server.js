const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

async function mondayQuery(apiKey, query) {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
      "API-Version": "2024-10",
    },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

// Diagnostic - tries every known method to find archived items
app.get("/api/monday/diagnose", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  const boardId = process.env.MONDAY_BOARD_ID || "5089267332";
  if (!apiKey) return res.status(500).json({ error: "MONDAY_API_KEY not set" });

  const results = {};

  // Method 1: Standard active items
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { name items_page(limit: 5) { items { id name created_at } } } }`);
    results.method1_active = { items: r?.data?.boards?.[0]?.items_page?.items || [], boardName: r?.data?.boards?.[0]?.name, error: r?.errors };
  } catch (e) { results.method1_active = { error: e.message }; }

  // Method 2: Query with archived column rule
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items_page(limit: 5, query_params: {rules: [{column_id: "__archived__", compare_value: ["true"]}]}) { items { id name created_at } } } }`);
    results.method2_archived_rule = { items: r?.data?.boards?.[0]?.items_page?.items || [], error: r?.errors };
  } catch (e) { results.method2_archived_rule = { error: e.message }; }

  // Method 3: items field with archived state
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items(limit: 5, page: 1) { id name created_at state } } }`);
    results.method3_items_field = { items: r?.data?.boards?.[0]?.items || [], error: r?.errors };
  } catch (e) { results.method3_items_field = { error: e.message }; }

  // Method 4: Board groups to see if there's an archived group
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { groups { id title archived } } }`);
    results.method4_groups = { groups: r?.data?.boards?.[0]?.groups || [], error: r?.errors };
  } catch (e) { results.method4_groups = { error: e.message }; }

  // Method 5: Board columns so we know the field IDs
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { columns { id title type } } }`);
    results.method5_columns = { columns: r?.data?.boards?.[0]?.columns || [], error: r?.errors };
  } catch (e) { results.method5_columns = { error: e.message }; }

  // Method 6: Activity log to confirm items exist
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { activity_logs(limit: 10) { event data created_at } } }`);
    results.method6_activity = { logs: r?.data?.boards?.[0]?.activity_logs || [], error: r?.errors };
  } catch (e) { results.method6_activity = { error: e.message }; }

  // Method 7: items_page with no filters at all
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items_page(limit: 5, query_params: {}) { items { id name created_at } } } }`);
    results.method7_empty_params = { items: r?.data?.boards?.[0]?.items_page?.items || [], error: r?.errors };
  } catch (e) { results.method7_empty_params = { error: e.message }; }

  res.json({ boardId, methods: results });
});

// Main data endpoint - tries multiple archive methods
app.get("/api/monday", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  const boardId = process.env.MONDAY_BOARD_ID || "5089267332";
  if (!apiKey) return res.status(500).json({ error: "MONDAY_API_KEY not set" });

  const colFields = "column_values { id text value }";

  try {
    let items = [];
    let method = "none";

    // Try 1: Archived column rule
    try {
      const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items_page(limit: 500, query_params: {rules: [{column_id: "__archived__", compare_value: ["true"]}]}) { cursor items { id name created_at ${colFields} } } } }`);
      const found = r?.data?.boards?.[0]?.items_page?.items || [];
      if (found.length > 0) { items = found; method = "archived_rule"; }
    } catch (e) { console.log("Archive rule failed:", e.message); }

    // Try 2: items field (older API, includes all states)
    if (items.length === 0) {
      try {
        const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items(limit: 500) { id name created_at state ${colFields} } } }`);
        const found = r?.data?.boards?.[0]?.items || [];
        if (found.length > 0) { items = found; method = "items_field"; }
      } catch (e) { console.log("Items field failed:", e.message); }
    }

    // Try 3: Standard items_page
    if (items.length === 0) {
      try {
        const r = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items_page(limit: 500) { items { id name created_at ${colFields} } } } }`);
        const found = r?.data?.boards?.[0]?.items_page?.items || [];
        if (found.length > 0) { items = found; method = "standard"; }
      } catch (e) { console.log("Standard query failed:", e.message); }
    }

    console.log(`Monday.com: Found ${items.length} items via ${method}`);
    res.json({ data: { boards: [{ items_page: { items } }] }, _method: method, _count: items.length });

  } catch (err) {
    console.error("Monday.com error:", err.message);
    res.status(502).json({ error: err.message });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
