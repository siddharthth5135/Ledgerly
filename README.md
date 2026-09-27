# Ledgerly — Trust. Invoice. Collect. Close the books.

Indian SME **money OS** combining four revenue modules in one product:

1. **Supplier Trust** — GST verification + fraud score before advances  
2. **AI Invoice Automation** — WhatsApp / Gmail / OCR → GST invoice  
3. **Collections Engine** — reminders + Razorpay payment links  
4. **Books Bridge** — Tally / Zoho journal sync (simulated)

## Run

```bash
cd ledgerly
npm install
npm run dev
```

Open http://localhost:3000

## Host

The app is a long-running Node server (PDF uses headless Chrome, scans use a local reader). Deploy the `Dockerfile` in **US East (Ohio)**, next to the Neon database.

On the host, set the same variables as `.env.local`, plus:

- `NEXT_PUBLIC_SITE_URL` = the public https address
- `PUBLIC_ORIGIN` = the same address (used in the WhatsApp link)

Do not commit `.env.local`.

## Tests

```bash
npm run test:unit
npm run dev   # other terminal
npm run test:smoke
```

## Demo flows

1. `/invoices/new` — generate from WhatsApp sample → Send + Razorpay  
2. `/trust` — verify `27AABCA1234D1Z5`  
3. `/collections` — remind overdue  
4. `/books` — push Tally / Zoho  

See `MANUAL_TODO.txt` and `../PRODUCT_PLAN.md`.
