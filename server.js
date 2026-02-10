const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const GHL_BASE = "https://services.leadconnectorhq.com";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Helper to call GHL API
async function ghlRequest(endpoint, apiKey, params = {}) {
  const url = new URL(endpoint, GHL_BASE);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Version: "2021-07-28",
      Accept: "application/json",
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GHL ${response.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

// Diagnostic endpoint - shows raw GHL data so we can map fields
app.get("/api/ghl/diagnose", async (req, res) => {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GHL_API_KEY not set in Render environment variables" });

  try {
    const contacts = await ghlRequest("/contacts/", apiKey, {
      limit: "20",
      sortBy: "date_added",
      order: "desc",
    });

    let customFields = null;
    try {
      customFields = await ghlRequest("/locations/custom-fields", apiKey);
    } catch (e) {
      customFields = { error: e.message };
    }

    res.json({
      status: "ok",
      contactCount: contacts?.contacts?.length || 0,
      sampleContacts: (contacts?.contacts || []).slice(0, 5).map((c) => ({
        id: c.id,
        name: `${c.firstName || ""} ${c.lastName || ""}`.trim(),
        phone: c.phone,
        dateAdded: c.dateAdded,
        tags: c.tags,
        source: c.source,
        customFields: c.customFields || [],
        allKeys: Object.keys(c),
      })),
      customFieldDefinitions: customFields,
      rawFirstContact: contacts?.contacts?.[0] || null,
    });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
});

// Main data endpoint - pulls contacts from GHL, formats for dashboard
app.get("/api/monday", async (req, res) => {
  const apiKey = process.env.GHL_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GHL_API_KEY not set" });
  }

  try {
    let allContacts = [];
    let hasMore = true;
    let page = 1;

    while (hasMore && page <= 10) {
      const batch = await ghlRequest("/contacts/", apiKey, {
        limit: "100",
        sortBy: "date_added",
        order: "desc",
      });

      const contacts = batch?.contacts || [];
      allContacts = allContacts.concat(contacts);
      hasMore = false; // GHL pagination needs cursor - for now get first batch
      page++;
    }

    console.log(`GHL returned ${allContacts.length} contacts`);

    const items = allContacts.map((contact) => {
      const cf = {};
      if (Array.isArray(contact.customFields)) {
        for (const f of contact.customFields) {
          cf[f.id] = f.value;
          if (f.key) cf[f.key] = f.value;
          if (f.field_key) cf[f.field_key] = f.value;
        }
      }

      const description = cf.call_summary || cf.callSummary || cf.call_transcript ||
        cf.transcript || cf.notes || cf.description || cf.job_description ||
        cf.callNotes || cf.call_notes || contact.notes || "";

      const boilerType = cf.boiler_type || cf.boilerType || cf.appliance_type ||
        cf.system_type || "";

      const callSource = cf.call_source || cf.callSource || cf.lead_source ||
        contact.source || "";

      const tags = (contact.tags || []).join(" ").toLowerCase();

      return {
        id: contact.id,
        name: `${contact.firstName || ""} ${contact.lastName || ""}`.trim() || "Unknown",
        created_at: contact.dateAdded || new Date().toISOString(),
        column_values: [
          { id: "long_text_mkyw56xd", text: description, value: null },
          { id: "dropdown_mkyw8ax3", text: boilerType, value: null },
          { id: "text_mkyw1az7", text: callSource, value: null },
          { id: "date_mkyw2x9h", text: contact.dateAdded || "", value: null },
          { id: "color_mkzpja00", text: "", value: JSON.stringify({ label: tags.match(/book|confirm|complete|done/) ? "Booked" : "Pending" }) },
          { id: "phone_mkywvsvx", text: contact.phone || "", value: null },
          { id: "text_mkywvcy1", text: cf.postcode || cf.postal_code || contact.postalCode || "", value: null },
        ],
      };
    });

    res.json({
      data: { boards: [{ items_page: { items } }] },
      _source: "ghl",
      _count: allContacts.length,
    });
  } catch (err) {
    console.error("GHL API error:", err.message);
    res.status(502).json({ error: `GHL API error: ${err.message}` });
  }
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Dashboard running on port ${PORT}`);
});
