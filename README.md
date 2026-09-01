# ChatFlow AI

A complete SaaS chatbox-support platform: customer dashboard, embeddable
widget key system, plan/coupon/payment management, and an admin panel —
built with plain HTML/CSS/JS and Firebase (Auth + Realtime Database + Storage).

## Files

| File            | Purpose                                                |
|------------------|---------------------------------------------------------|
| `index.html`     | Marketing landing page                                  |
| `login.html`     | Google-only sign-in (customer and admin)                |
| `dashboard.html` | Customer app — websites, widget customization, billing  |
| `admin.html`     | Admin app — users, plans, coupons, payments, analytics  |
| `plans.html`     | Public pricing page with checkout                       |
| `style.css`      | Shared glassmorphism design system                      |
| `app.js`         | All shared logic (auth guards, CRUD, checkout, charts)  |
| `firebase.js`    | Firebase project config — **edit this first**           |

## 1. Set up Firebase

1. Create a project at https://console.firebase.google.com
2. **Authentication** → Sign-in method → enable **Google**.
3. **Realtime Database** → Create database (start in locked mode) and copy the
   rules from the comment block at the top of `firebase.js` into the Rules tab.
4. **Storage** → enable (used for future logo/avatar uploads).
5. Project settings → General → "Your apps" → add a Web app → copy the
   config object into `firebaseConfig` in `firebase.js`.

## 2. Make yourself an admin

In the Realtime Database, after signing in once via `login.html` (so your
`users/{uid}` record exists), manually add:

```
admins/
  <your-uid>: true
```

Then visit `admin.html` — you'll pass the admin check.

## 3. Seed starter plans

Plans are fully admin-managed, but you can bootstrap the three plans from
the brief by pasting this into `plans/` in the Realtime Database console:

```json
{
  "free": {
    "name": "Free", "price": 0, "duration": "monthly",
    "websiteLimit": "1", "chatLimit": 100, "storageLimit": "500 MB",
    "features": ["1 website", "100 chats/month"], "active": true
  },
  "pro": {
    "name": "Pro", "price": 499, "duration": "monthly",
    "websiteLimit": "5", "chatLimit": null, "storageLimit": "5 GB",
    "features": ["Unlimited chats", "5 websites", "Remove branding"], "active": true
  },
  "business": {
    "name": "Business", "price": 1499, "duration": "monthly",
    "websiteLimit": "unlimited", "chatLimit": null, "storageLimit": "50 GB",
    "features": ["Unlimited websites", "Multiple agents", "AI support"], "active": true
  }
}
```

New users are created with `plan: "free"` automatically on first sign-in.

## 4. Payments (Razorpay)

`firebase.js` ships with `RAZORPAY_TEST_MODE = true`, which simulates a
successful payment with a confirm dialog — so checkout works immediately
with no keys. To go live:

1. Get a Key ID from https://dashboard.razorpay.com
2. Set `RAZORPAY_KEY_ID` in `firebase.js`.
3. Set `RAZORPAY_TEST_MODE = false`.
4. For production, move order creation/signature verification to a small
   backend (Cloud Function) — this client-only flow is for demo/dev use.

## 5. Run it

Any static file server works, e.g.:

```
npx serve .
```

Then open `index.html`. No build step required.

## Notes on scope

- The widget script referenced in embed codes (`chatflow.js` /
  `widget.js`) is the *published* chat bubble your customers' visitors
  would use — it's a separate deployable asset, out of scope for the
  dashboard/admin app itself.
- "Live Chat" and chat volume are stubbed with `totalChats` on the user
  record; wire up a real `chats/{websiteId}/{chatId}` feed from your
  widget script to make the live inbox and analytics fully real.
- Coupon/plan writes are admin-only per the Realtime Database rules
  template — the UI itself doesn't restrict anything, so deploy the rules.
