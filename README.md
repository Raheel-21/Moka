# Moka Bistro – Table Ordering System

Customers order and pick a payment method from their phone at the table. Staff see orders live; the admin manages the menu, reports and accounts.

## Run
Requires Node.js 22.13 or newer. No `npm install` needed (no dependencies).

    ADMIN_PASSWORD=choose-a-strong-password npm start

Open http://localhost:3000 (customers) and http://localhost:3000/admin.html (staff and admin).
The first run creates the user `admin` with `ADMIN_PASSWORD` (or a random password printed in the console). Then add cashier/kitchen accounts from Admin > Staff.

## Pages
- `/` customer menu and checkout. A table QR can be `https://your-domain/#t5` to pre-fill table 5.
- `/admin.html` staff login. Cashier and kitchen see Orders (refreshes every 4 seconds, beeps on new orders). Admin also gets Menu (add, edit, hide, delete, prices, photos, uploads), Reports (revenue, orders, best sellers, per day, by payment method) and Staff.

## Before going live
1. HTTPS is required. Put the server behind a reverse proxy (Caddy or Nginx) or deploy on a host that provides it (Render, Railway, Fly.io, or a VPS). Logins and customer data must not travel over plain HTTP.
2. Keep `data/` (SQLite database and secret) and `public/uploads/` on a persistent disk and back them up.
3. Payments: customers choose Cash or Card and the waiter collects. For online payment, integrate an Egyptian gateway (Paymob, Fawry) in `POST /api/orders` and mark orders paid from its webhook.
4. Customers give phone and email, so add a privacy notice and use the data only for the order.
5. Prices are always recalculated on the server from the database, so the browser cannot change them.
6. Next steps to consider: push updates instead of polling, receipt printing, order limits per table, SMS/WhatsApp notices.

## Files
`server.js` API and static server, `seed.json` initial menu (loaded on first run only), `public/` the two pages and images, `data/` database.
