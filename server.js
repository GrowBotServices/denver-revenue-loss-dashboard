const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Proxy endpoint - keeps Monday.com API key on the server
app.get("/api/monday", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  const boardId = process.env.MONDAY_BOARD_ID || "5089267332";

  if (!apiKey) {
    return res.status(500).json({ error: "MONDAY_API_KEY not set" });
  }

  const query = `query { boards(ids: [${boardId}]) { items_page(limit: 500) { items { id name created_at column_values { id text value } } } } }`;

  try {
    const response = await fetch("https://api.monday.com/v2", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiKey,
      },
      body: JSON.stringify({ query }),
    });

    const data = await response.json();
    res.json(data);
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
