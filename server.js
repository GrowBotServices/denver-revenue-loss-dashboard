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

const INTAKE_BOARD = "5089267332";   // Voice Agent Enquiries (intake)
const LISA_BOARD = "1661132644";     // Lisa (where items get moved to)

// Diagnostic
app.get("/api/monday/diagnose", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "MONDAY_API_KEY not set" });

  const results = {};

  // Check intake board
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${INTAKE_BOARD}]) { name groups { id title } items_page(limit: 5) { items { id name created_at column_values { id text value } } } } }`);
    results.intakeBoard = {
      name: r?.data?.boards?.[0]?.name,
      groups: r?.data?.boards?.[0]?.groups,
      itemCount: r?.data?.boards?.[0]?.items_page?.items?.length || 0,
      sampleItems: r?.data?.boards?.[0]?.items_page?.items || [],
      error: r?.errors,
    };
  } catch (e) { results.intakeBoard = { error: e.message }; }

  // Check Lisa board
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${LISA_BOARD}]) { name groups { id title } items_page(limit: 5) { items { id name created_at column_values { id text value } } } } }`);
    results.lisaBoard = {
      name: r?.data?.boards?.[0]?.name,
      groups: r?.data?.boards?.[0]?.groups,
      itemCount: r?.data?.boards?.[0]?.items_page?.items?.length || 0,
      sampleItems: r?.data?.boards?.[0]?.items_page?.items || [],
      error: r?.errors,
    };
  } catch (e) { results.lisaBoard = { error: e.message }; }

  // Lisa board columns
  try {
    const r = await mondayQuery(apiKey, `query { boards(ids: [${LISA_BOARD}]) { columns { id title type } } }`);
    results.lisaColumns = r?.data?.boards?.[0]?.columns || [];
    results.lisaColumnsError = r?.errors;
  } catch (e) { results.lisaColumns = { error: e.message }; }

  res.json(results);
});

// Main data endpoint - pulls from both boards
app.get("/api/monday", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "MONDAY_API_KEY not set" });

  const colFields = "column_values { id text value }";

  try {
    let allItems = [];

    // Pull from intake board (Voice Agent Enquiries)
    try {
      const r = await mondayQuery(apiKey, `query { boards(ids: [${INTAKE_BOARD}]) { items_page(limit: 500) { items { id name created_at ${colFields} } } } }`);
      const items = r?.data?.boards?.[0]?.items_page?.items || [];
      console.log(`Intake board: ${items.length} items`);
      allItems = allItems.concat(items);
    } catch (e) { console.log("Intake board error:", e.message); }

    // Pull from Lisa board (where items get moved)
    try {
      const r = await mondayQuery(apiKey, `query { boards(ids: [${LISA_BOARD}]) { items_page(limit: 500) { items { id name created_at ${colFields} } } } }`);
      const items = r?.data?.boards?.[0]?.items_page?.items || [];
      console.log(`Lisa board: ${items.length} items`);
      allItems = allItems.concat(items);
    } catch (e) { console.log("Lisa board error:", e.message); }

    // Also try pulling activity log to reconstruct any items we missed
    if (allItems.length === 0) {
      console.log("No items from boards, trying activity log reconstruction...");
      try {
        const r = await mondayQuery(apiKey, `query { boards(ids: [${INTAKE_BOARD}]) { activity_logs(limit: 200) { event data created_at } } }`);
        const logs = r?.data?.boards?.[0]?.activity_logs || [];
        const createEvents = logs.filter(l => l.event === "create_pulse");

        for (const log of createEvents) {
          try {
            const d = JSON.parse(log.data);
            const cv = JSON.parse(d.column_values_json || "{}");
            allItems.push({
              id: String(d.pulse_id),
              name: d.pulse_name || "Unknown",
              created_at: new Date(Number(log.created_at) / 10000).toISOString(),
              column_values: Object.entries(cv).map(([id, val]) => ({
                id,
                text: val.text || val.value || val.phone || val.date || "",
                value: JSON.stringify(val),
              })),
            });
          } catch (e) { /* skip malformed */ }
        }
        console.log(`Reconstructed ${allItems.length} items from activity logs`);
      } catch (e) { console.log("Activity log error:", e.message); }
    }

    // Deduplicate by id
    const seen = new Map();
    for (const item of allItems) { seen.set(item.id, item); }
    const unique = Array.from(seen.values());

    console.log(`Total unique items: ${unique.length}`);
    res.json({ data: { boards: [{ items_page: { items: unique } }] }, _count: unique.length });

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

