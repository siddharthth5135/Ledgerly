================================================================================
LEDGERLY — TODAY SHIP + DEMO READY (invoice focus only)
VeriSupply / GST verification project: ON HOLD — not continuing
================================================================================

HOW TO RUN DEMO
--------------------------------------------------------------------------------
1. cd "C:\Users\SIDDHARTH\OneDrive\Desktop\SOLVED 2.0\ledgerly"
2. npm install
3. npm run dev
4. Open http://localhost:3000
5. Client path: /demo  →  /invoices/manual  →  print  →  WhatsApp share

TESTS (all passing as of ship)
--------------------------------------------------------------------------------
npm run test:unit
npm run build
npm run start
npm run test:smoke
npm run test:hardcore


A. ANALYSIS — WHAT WE ARE BUILDING (steroid invoice product)
--------------------------------------------------------------------------------
Goal: walk into local shops and sell a product that:
  - Creates GST-correct invoices fast (WhatsApp paste OR Quick bill)
  - Prints / Save-as-PDF tax invoice
  - Shares bill on WhatsApp
  - Helps collect overdue money
  - Gives CA-ready books journal

NOT building now: supplier GST verification / VeriSupply.


B. DONE IN CODE TODAY (demo blockers cleared)
--------------------------------------------------------------------------------
[x] Print-ready GST Tax Invoice page  /invoices/[id]/print
[x] Print / Save PDF toolbar (browser print)
[x] Amount in words (Indian rupees)
[x] WhatsApp share via free wa.me (₹0)
[x] Quick bill page with customer + item catalog  /invoices/manual
[x] Landing + nav repositioned to Invoice / Collect / Books
[x] /demo page = client script + WhatsApp cost sheet
[x] Trust / Pay Safe removed from primary nav (still exist if linked)
[x] In-memory store fixed (globalThis) so create → print works in production


C. WHATSAPP COST (tell clients simply)
--------------------------------------------------------------------------------
1) Share button today (wa.me) .............. ₹0
2) Auto Meta Cloud utility msg ............ ~₹0.15–₹0.80 each (rates change)
3) BSP (Wati / AiSensy / Interakt) ........ ~₹999–₹4,999/mo + per msg
Rule: sell with ₹0 share first. Buy API only after 5 paid pilots.


D. YOUR MANUAL STEPS BEFORE WALKING INTO SHOPS
--------------------------------------------------------------------------------
[ ] npm run build   (must pass)
[ ] npm run test:unit
[ ] Start npm run dev; walk /demo once yourself
[ ] Optional: deploy Vercel + share URL (so you don't need laptop offline)
[ ] Print 1 sample PDF on paper — shops trust paper
[ ] List 10 shops near you; pitch ₹999 / 7-day pilot


E. NOT REQUIRED FOR TODAY'S DEMOS (honest)
--------------------------------------------------------------------------------
- Database / auth (demo resets on server restart — fine for live demos)
- Real WhatsApp Business auto-send
- Live Razorpay webhooks
- Real Tally connector
- OCR / LLM (regex AI is enough for demos)


F. DEMO SCRIPT (memorize)
--------------------------------------------------------------------------------
1. Quick bill → Sharma Kirana → cartons → Create + Print
2. Print / Save PDF → show CGST-SGST or IGST + amount in words
3. Share WhatsApp
4. Optional: AI paste WhatsApp sample
5. Collections overdue → Books journal
6. Ask for ₹999 pilot

================================================================================
Ship > polish. Sell the invoice loop. Ignore VeriSupply for now.
================================================================================
