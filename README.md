# Denver Services - Revenue Leakage Dashboard

Live dashboard showing revenue captured by Jessica (AI voice agent) that would have otherwise been lost through missed calls, out-of-hours enquiries, and lapsed customers.

## Deploy to Render (Free Tier)

### Step 1: Push to GitHub

1. Create a new repo on GitHub (private recommended)
2. Push this folder to it

### Step 2: Deploy on Render

1. Go to [render.com](https://render.com) and sign up / log in
2. Click **New > Web Service**
3. Connect your GitHub account and select this repo
4. Settings:
   - **Name:** denver-dashboard (or whatever you like)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
5. Add Environment Variable:
   - **Key:** `MONDAY_API_KEY`
   - **Value:** your Monday.com API key
6. Click **Create Web Service**

Your dashboard will be live at `https://denver-dashboard.onrender.com` (or similar) within a couple of minutes.

### Optional: Custom Board ID

Add another environment variable if you want to point at a different board:
- **Key:** `MONDAY_BOARD_ID`
- **Value:** your board ID (default is 5089267332)

## How It Works

- The server proxies Monday.com API calls so your API key never reaches the browser
- The frontend infers job types and revenue values from your existing Monday.com fields
- Falls back to sample data if the API connection fails
- No changes needed to your Monday.com board structure

## Files

- `server.js` - Express server with Monday.com proxy endpoint
- `public/index.html` - Dashboard frontend
- `package.json` - Dependencies
