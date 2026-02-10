const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper to call Monday.com API
async function mondayQuery(apiKey, query) {
  const response = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: apiKey,
    },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

// Diagnostic endpoint - shows what Monday.com actually has
app.get("/api/monday/diagnose", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  const boardId = process.env.MONDAY_BOARD_ID || "5089267332";

  if (!apiKey) return res.status(500).json({ error: "MONDAY_API_KEY not set" });

  try {
    // Check board info and groups
    const boardInfo = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { name state board_kind groups { id title archived } columns { id title type } } }`);

    // Try active items count
    const activeItems = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items_page(limit: 5) { items { id name created_at } } } }`);

    // Try archived items
    const archivedItems = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { items_page(limit: 5, query_params: { rules: [] }) { items { id name created_at } } } }`);

    // Try board activity log to see what happened to items
    const activity = await mondayQuery(apiKey, `query { boards(ids: [${boardId}]) { activity_logs(limit: 20) { event data created_at } } }`);

    res.json({
      board: boardInfo?.data?.boards?.[0] || null,
      activeItemsSample: activeItems?.data?.boards?.[0]?.items_page?.items || [],
      archivedItemsSample: archivedItems?.data?.boards?.[0]?.items_page?.items || [],
      recentActivity: activity?.data?.boards?.[0]?.activity_logs || [],
      raw: { boardInfo, activeItems, archivedItems }
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Main data endpoint - tries active then archived
app.get("/api/monday", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  const boardId = process.env.MONDAY_BOARD_ID || "5089267332";

  if (!apiKey) {
    return res.status(500).json({ error: "MONDAY_API_KEY not set" });
  }

  const colFields = "column_values { id text value }";

  try {
    // First try: active items
    const activeQuery = `query { boards(ids: [${boardId}]) { items_page(limit: 500) { items { id name created_at ${colFields} } } } }`;
    const activeData = await mondayQuery(apiKey, activeQuery);
    const activeItems = activeData?.data?.boards?.[0]?.items_page?.items || [];

    // Second: archived items
    const archiveQuery = `query { boards(ids: [${boardId}]) { items_page(limit: 500, query_params: { include_archived: true }) { items { id name created_at ${colFields} } } } }`;
    const archiveData = await mondayQuery(apiKey, archiveQuery);
    const archiveItems = archiveData?.data?.boards?.[0]?.items_page?.items || [];

    // Combine and deduplicate
    const allMap = new Map();
    for (const item of [...activeItems, ...archiveItems]) {
      allMap.set(item.id, item);
    }
    const allItems = Array.from(allMap.values());
    console.log(`Found ${activeItems.length} active + ${archiveItems.length} archived = ${allItems.length} unique items`);

    return res.json({ data: { boards: [{ items_page: { items: allItems } }] } });

  } catch (err) {
    console.error("Monday.com API error:", err.message);
    res.status(502).json({ error: "Failed to reach Monday.com" });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
