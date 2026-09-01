/* ============================================================
   app.js — Shared logic for ChatFlow AI
   Loaded after firebase.js on every page. Each page also has a
   small inline <script> that calls the relevant init function
   once the DOM/auth state is ready.
   ============================================================ */

/* ---------------- Utilities ---------------- */

function toast(message, type = "success") {
  let wrap = document.querySelector(".toast-wrap");
  if (!wrap) {
    wrap = document.createElement("div");
    wrap.className = "toast-wrap";
    document.body.appendChild(wrap);
  }
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function escapeHtml(str = "") {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[c]);
}

function formatDate(ts) {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatCurrency(n) {
  return "₹" + Number(n || 0).toLocaleString("en-IN");
}

function genApiKey() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let key = "CF-";
  for (let i = 0; i < 8; i++) key += chars[Math.floor(Math.random() * chars.length)];
  return key;
}

function toggleSidebar() {
  document.querySelector(".sidebar")?.classList.toggle("open");
}

/* ---------------- Auth guards ---------------- */
// Call on any customer page. Redirects to login.html if signed out,
// or shows the suspended state if banned. Resolves with {uid, profile}.
function requireCustomer() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "login.html";
        return;
      }
      const snap = await db.ref("users/" + user.uid).get();
      let profile = snap.val();
      if (!profile) {
        // First sign-in: provision the account record.
        profile = {
          name: user.displayName || "New user",
          email: user.email || "",
          photo: user.photoURL || "",
          status: "active",
          banned: false,
          plan: "free",
          subscriptionExpiry: null,
          createdAt: Date.now(),
          totalChats: 0,
          websites: {},
        };
        await db.ref("users/" + user.uid).set(profile);
      }
      if (profile.banned) {
        document.body.innerHTML = `
          <div class="auth-wrap">
            <div class="auth-card glass">
              <div class="suspended-box">Your account has been suspended. Contact support if you believe this is a mistake.</div>
              <button class="btn btn-ghost" style="width:100%" onclick="auth.signOut().then(()=>location.href='login.html')">Sign out</button>
            </div>
          </div>`;
        return;
      }
      renderUserChip(user, profile);
      resolve({ uid: user.uid, user, profile });
    });
  });
}

// Call on admin.html. Checks admins/{uid} exists in RTDB.
function requireAdmin() {
  return new Promise((resolve) => {
    auth.onAuthStateChanged(async (user) => {
      if (!user) {
        window.location.href = "login.html?admin=1";
        return;
      }
      const adminSnap = await db.ref("admins/" + user.uid).get();
      if (!adminSnap.exists()) {
        toast("This account doesn't have admin access.", "error");
        setTimeout(() => (window.location.href = "dashboard.html"), 1200);
        return;
      }
      renderUserChip(user, { plan: "Admin" });
      resolve({ uid: user.uid, user });
    });
  });
}

function renderUserChip(user, profile) {
  const chip = document.querySelector("[data-user-chip]");
  if (!chip) return;
  chip.innerHTML = `
    <img src="${user.photoURL || "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(user.displayName || user.email || "U")}" alt="">
    <div>
      <div class="name">${escapeHtml(user.displayName || user.email || "Account")}</div>
      <div class="plan">${escapeHtml((profile?.plan || "free").toString())} plan</div>
    </div>`;
}

function signInWithGoogle() {
  auth.signInWithPopup(googleProvider).catch((err) => toast(err.message, "error"));
}

function signOutUser() {
  auth.signOut().then(() => (window.location.href = "index.html"));
}

/* ---------------- Customer: Dashboard stats ---------------- */
async function loadDashboardStats(uid) {
  const [userSnap, sitesSnap] = await Promise.all([
    db.ref("users/" + uid).get(),
    db.ref("websites").orderByChild("ownerUid").equalTo(uid).get(),
  ]);
  const user = userSnap.val() || {};
  const websites = sitesSnap.val() || {};
  const websiteCount = Object.keys(websites).length;
  const totalChats = user.totalChats || 0;

  const planSnap = await db.ref("plans/" + user.plan).get();
  const plan = planSnap.val();
  const chatLimit = plan?.chatLimit ?? "Unlimited";

  set("#stat-conversations", totalChats.toLocaleString());
  set("#stat-active-visitors", Math.max(0, Math.round(totalChats * 0.03)).toString());
  set("#stat-websites", websiteCount.toString());
  set("#stat-plan", (plan?.name || user.plan || "Free"));
  set("#stat-usage", chatLimit === "Unlimited" || chatLimit == null ? `${totalChats} / ∞` : `${totalChats} / ${chatLimit}`);

  const pct = chatLimit && chatLimit !== "Unlimited" ? Math.min(100, (totalChats / chatLimit) * 100) : 8;
  const bar = document.querySelector("#usage-bar > div");
  if (bar) bar.style.width = pct + "%";
}

function set(sel, val) {
  const el = document.querySelector(sel);
  if (el) el.textContent = val;
}

/* ---------------- Customer: Websites ---------------- */
async function loadWebsites(uid) {
  const listEl = document.querySelector("#websites-list");
  if (!listEl) return;
  const snap = await db.ref("websites").orderByChild("ownerUid").equalTo(uid).get();
  const data = snap.val() || {};
  const ids = Object.keys(data);
  if (ids.length === 0) {
    listEl.innerHTML = `<div class="empty-state card"><div class="glyph">🌐</div>No websites connected yet. Add your first website to get an embed key.</div>`;
    return;
  }
  listEl.innerHTML = ids.map((id) => {
    const w = data[id];
    return `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:14px; flex-wrap:wrap;">
        <div>
          <div style="font-weight:600; font-size:15.5px;">${escapeHtml(w.name)}</div>
          <div style="color:var(--muted); font-size:13px; margin-top:2px;">${escapeHtml(w.url)}</div>
          <div class="badge badge-violet" style="margin-top:10px;">${w.apiKey}</div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-ghost btn-sm" onclick="copyEmbed('${w.apiKey}')">Copy embed code</button>
          <button class="btn btn-danger btn-sm" onclick="deleteWebsite('${id}')">Remove</button>
        </div>
      </div>
    </div>`;
  }).join("");
}

async function addWebsite(uid, name, url) {
  const websiteRef = db.ref("websites").push();
  const apiKey = genApiKey();
  await websiteRef.set({
    ownerUid: uid,
    name, url, apiKey,
    createdAt: Date.now(),
    customization: {
      chatboxName: "Support",
      logo: "",
      avatar: "",
      themeColor: "#6C5CE7",
      welcomeMessage: "Hi there! How can we help you today?",
      offlineMessage: "We're offline right now — leave a message and we'll reply by email.",
      position: "bottom-right",
    },
  });
  await db.ref("users/" + uid + "/websites/" + websiteRef.key).set(true);
  toast("Website added — embed key generated.");
  loadWebsites(uid);
  populateWebsiteSelect(uid);
}

async function deleteWebsite(id) {
  if (!confirm("Remove this website? Its embed key will stop working.")) return;
  const snap = await db.ref("websites/" + id).get();
  const w = snap.val();
  await db.ref("websites/" + id).remove();
  if (w) await db.ref("users/" + w.ownerUid + "/websites/" + id).remove();
  toast("Website removed.");
  const { uid } = await requireCustomer();
  loadWebsites(uid);
}

function copyEmbed(apiKey) {
  const code = `<script src="https://cdn.chatflow.ai/widget.js"\n data-key="${apiKey}"></` + `script>`;
  navigator.clipboard.writeText(code).then(() => toast("Embed code copied to clipboard."));
}

/* ---------------- Customer: Chatbox customization ---------------- */
async function populateWebsiteSelect(uid) {
  const sel = document.querySelector("#customize-website-select");
  if (!sel) return;
  const snap = await db.ref("websites").orderByChild("ownerUid").equalTo(uid).get();
  const data = snap.val() || {};
  const ids = Object.keys(data);
  if (ids.length === 0) {
    sel.innerHTML = `<option value="">Add a website first</option>`;
    return;
  }
  sel.innerHTML = ids.map((id) => `<option value="${id}">${escapeHtml(data[id].name)}</option>`).join("");
  loadCustomizationForm(ids[0], data[ids[0]].customization);
  sel.onchange = () => loadCustomizationForm(sel.value, data[sel.value].customization);
}

function loadCustomizationForm(websiteId, c = {}) {
  document.querySelector("#customize-form")?.setAttribute("data-website-id", websiteId);
  const f = (id, val) => { const el = document.querySelector(id); if (el) el.value = val ?? ""; };
  f("#cz-name", c.chatboxName || "Support");
  f("#cz-welcome", c.welcomeMessage || "");
  f("#cz-offline", c.offlineMessage || "");
  f("#cz-color", c.themeColor || "#6C5CE7");
  document.querySelectorAll(".color-swatch").forEach((sw) => sw.classList.toggle("selected", sw.dataset.color === (c.themeColor || "#6C5CE7")));
  document.querySelectorAll("input[name=position]").forEach((r) => (r.checked = r.value === (c.position || "bottom-right")));
  updateLivePreview();
}

function updateLivePreview() {
  const name = document.querySelector("#cz-name")?.value || "Support";
  const welcome = document.querySelector("#cz-welcome")?.value || "Hi there!";
  const color = document.querySelector("#cz-color")?.value || "#6C5CE7";
  const position = document.querySelector("input[name=position]:checked")?.value || "bottom-right";

  set("#preview-name", name);
  set("#preview-welcome", welcome);
  const bubble = document.querySelector("#preview-bubble");
  if (bubble) {
    bubble.style.background = `linear-gradient(135deg, ${color}, ${color}CC)`;
    bubble.style.left = position.includes("left") ? "20px" : "auto";
    bubble.style.right = position.includes("right") ? "20px" : "auto";
  }
}

async function saveCustomization(uid) {
  const websiteId = document.querySelector("#customize-form")?.dataset.websiteId;
  if (!websiteId) return toast("Select a website first.", "error");
  const payload = {
    chatboxName: document.querySelector("#cz-name").value.trim() || "Support",
    logo: "",
    avatar: "",
    themeColor: document.querySelector("#cz-color").value,
    welcomeMessage: document.querySelector("#cz-welcome").value.trim(),
    offlineMessage: document.querySelector("#cz-offline").value.trim(),
    position: document.querySelector("input[name=position]:checked")?.value || "bottom-right",
  };
  await db.ref("websites/" + websiteId + "/customization").update(payload);
  toast("Chatbox settings saved.");
}

/* ---------------- Plans / Subscription (shared) ---------------- */
async function loadPlans(targetSelector, opts = {}) {
  const wrap = document.querySelector(targetSelector);
  if (!wrap) return;
  const snap = await db.ref("plans").get();
  const data = snap.val() || {};
  const ids = Object.keys(data).filter((id) => data[id].active !== false);
  if (ids.length === 0) {
    wrap.innerHTML = `<div class="empty-state card">No plans published yet.</div>`;
    return;
  }
  wrap.innerHTML = ids.map((id) => {
    const p = data[id];
    const features = Array.isArray(p.features) ? p.features : Object.values(p.features || {});
    return `
    <div class="card plan-card ${opts.highlight === id ? "featured" : ""}">
      ${opts.highlight === id ? '<div class="tag">Most popular</div>' : ""}
      <div style="font-size:13px; color:var(--muted); font-weight:600;">${escapeHtml(p.name)}</div>
      <div class="price">${formatCurrency(p.price)}<small>/${p.duration === "yearly" ? "yr" : "mo"}</small></div>
      <ul>
        ${features.map((f) => `<li><svg viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>${escapeHtml(f)}</li>`).join("")}
        <li><svg viewBox="0 0 20 20" fill="none"><path d="M4 10l4 4 8-8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>${p.websiteLimit === -1 || p.websiteLimit === "unlimited" ? "Unlimited websites" : p.websiteLimit + " website(s)"}</li>
      </ul>
      ${opts.buyable ? `<button class="btn ${opts.highlight === id ? "btn-primary" : "btn-ghost"}" style="margin-top:auto;" onclick="openCheckout('${id}')">Choose ${escapeHtml(p.name)}</button>` : ""}
    </div>`;
  }).join("");
}

/* ---------------- Coupons + Checkout ---------------- */
let checkoutState = { planId: null, plan: null, discount: 0, couponCode: null };

async function openCheckout(planId) {
  const snap = await db.ref("plans/" + planId).get();
  const plan = snap.val();
  if (!plan) return;
  checkoutState = { planId, plan, discount: 0, couponCode: null };
  document.querySelector("#checkout-plan-name").textContent = plan.name;
  document.querySelector("#checkout-price").textContent = formatCurrency(plan.price);
  document.querySelector("#checkout-discount-row").classList.add("hidden");
  document.querySelector("#checkout-final").textContent = formatCurrency(plan.price);
  document.querySelector("#coupon-input").value = "";
  document.querySelector("#checkout-modal").classList.remove("hidden");
}

function closeCheckout() {
  document.querySelector("#checkout-modal").classList.add("hidden");
}

async function applyCoupon() {
  const code = document.querySelector("#coupon-input").value.trim().toUpperCase();
  if (!code) return;
  const snap = await db.ref("coupons/" + code).get();
  const coupon = snap.val();
  if (!coupon || coupon.status !== "active") return toast("Invalid or expired coupon.", "error");
  if (coupon.expiry && Date.now() > coupon.expiry) return toast("This coupon has expired.", "error");
  if (coupon.maxUses != null && (coupon.usedCount || 0) >= coupon.maxUses) return toast("This coupon has reached its usage limit.", "error");
  if (coupon.minPurchase && checkoutState.plan.price < coupon.minPurchase) {
    return toast(`Minimum purchase for this coupon is ${formatCurrency(coupon.minPurchase)}.`, "error");
  }
  let discount = coupon.type === "percentage" ? (checkoutState.plan.price * coupon.value) / 100 : coupon.value;
  discount = Math.min(discount, checkoutState.plan.price);
  checkoutState.discount = discount;
  checkoutState.couponCode = code;
  const final = checkoutState.plan.price - discount;
  document.querySelector("#checkout-discount-row").classList.remove("hidden");
  document.querySelector("#checkout-discount").textContent = "-" + formatCurrency(discount);
  document.querySelector("#checkout-final").textContent = formatCurrency(final);
  toast(`Coupon applied — you saved ${formatCurrency(discount)}.`);
}

async function startCheckout(uid) {
  const { plan, planId, discount, couponCode } = checkoutState;
  const finalAmount = Math.max(0, plan.price - discount);

  const completeUpgrade = async (paymentId, status) => {
    const expiry = Date.now() + (plan.duration === "yearly" ? 365 : 30) * 86400000;
    await db.ref("users/" + uid).update({ plan: planId, subscriptionExpiry: expiry });
    await db.ref("payments").push({
      uid, plan: plan.name, amount: finalAmount, date: Date.now(), status, paymentId,
    });
    if (couponCode) {
      await db.ref("coupons/" + couponCode + "/usedCount").set(firebase.database.ServerValue.increment(1));
    }
    closeCheckout();
    toast("Subscription updated — thanks!");
    if (document.querySelector("#stat-plan")) loadDashboardStats(uid);
    if (document.querySelector("#billing-history")) loadBillingHistory(uid);
  };

  if (finalAmount === 0) {
    await completeUpgrade("FREE-" + Date.now(), "paid");
    return;
  }

  if (RAZORPAY_TEST_MODE || typeof Razorpay === "undefined") {
    // Simulated checkout so the flow works without live Razorpay keys.
    if (confirm(`[Test mode] Confirm payment of ${formatCurrency(finalAmount)} for ${plan.name}?`)) {
      await completeUpgrade("TEST-" + Date.now(), "paid");
    }
    return;
  }

  const rzp = new Razorpay({
    key: RAZORPAY_KEY_ID,
    amount: finalAmount * 100,
    currency: "INR",
    name: "ChatFlow AI",
    description: `${plan.name} subscription`,
    handler: (response) => completeUpgrade(response.razorpay_payment_id, "paid"),
    theme: { color: "#6C5CE7" },
  });
  rzp.open();
}

/* ---------------- Billing history (customer) ---------------- */
async function loadBillingHistory(uid) {
  const el = document.querySelector("#billing-history");
  if (!el) return;
  const snap = await db.ref("payments").orderByChild("uid").equalTo(uid).get();
  const data = snap.val() || {};
  const rows = Object.values(data).sort((a, b) => b.date - a.date);
  if (rows.length === 0) {
    el.innerHTML = `<div class="empty-state">No invoices yet.</div>`;
    return;
  }
  el.innerHTML = `
    <table><thead><tr><th>Date</th><th>Plan</th><th>Amount</th><th>Status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr><td>${formatDate(r.date)}</td><td>${escapeHtml(r.plan)}</td><td>${formatCurrency(r.amount)}</td><td><span class="badge badge-green">${escapeHtml(r.status)}</span></td></tr>`).join("")}</tbody></table>`;
}

/* ---------------- Admin: dashboard ---------------- */
async function loadAdminStats() {
  const [usersSnap, paymentsSnap, chatsSnap] = await Promise.all([
    db.ref("users").get(),
    db.ref("payments").get(),
    db.ref("users").get(),
  ]);
  const users = usersSnap.val() || {};
  const userList = Object.values(users);
  const payments = Object.values(paymentsSnap.val() || {});
  const revenue = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const totalChats = userList.reduce((s, u) => s + (u.totalChats || 0), 0);

  set("#admin-total-users", userList.length.toString());
  set("#admin-active-users", userList.filter((u) => u.status === "active" && !u.banned).length.toString());
  set("#admin-revenue", formatCurrency(revenue));
  set("#admin-subscriptions", userList.filter((u) => u.plan && u.plan !== "free").length.toString());
  set("#admin-total-chats", totalChats.toLocaleString());
}

/* ---------------- Admin: user management ---------------- */
async function loadAdminUsers() {
  const el = document.querySelector("#admin-users-table");
  if (!el) return;
  const snap = await db.ref("users").get();
  const data = snap.val() || {};
  const ids = Object.keys(data);
  if (ids.length === 0) {
    el.innerHTML = `<div class="empty-state">No users yet.</div>`;
    return;
  }
  el.innerHTML = `<table><thead><tr><th></th><th>Name</th><th>Email</th><th>Plan</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead><tbody>
    ${ids.map((uid) => {
      const u = data[uid];
      return `<tr>
        <td><img class="avatar-sm" src="${u.photo || "https://api.dicebear.com/7.x/initials/svg?seed=" + encodeURIComponent(u.name || "U")}"></td>
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td><span class="badge badge-violet">${escapeHtml(u.plan || "free")}</span></td>
        <td>${u.banned ? '<span class="badge badge-red">Banned</span>' : '<span class="badge badge-green">Active</span>'}</td>
        <td>${formatDate(u.createdAt)}</td>
        <td style="white-space:nowrap;">
          ${u.banned
            ? `<button class="btn btn-ghost btn-sm" onclick="unbanUser('${uid}')">Unban</button>`
            : `<button class="btn btn-ghost btn-sm" onclick="banUser('${uid}')">Ban</button>`}
          <button class="btn btn-ghost btn-sm" onclick="openChangePlan('${uid}','${u.plan || "free"}')">Plan</button>
          <button class="btn btn-danger btn-sm" onclick="deleteUser('${uid}')">Delete</button>
        </td>
      </tr>`;
    }).join("")}
  </tbody></table>`;
}

async function banUser(uid) { await db.ref("users/" + uid).update({ banned: true, status: "suspended" }); toast("User banned."); loadAdminUsers(); loadAdminStats(); }
async function unbanUser(uid) { await db.ref("users/" + uid).update({ banned: false, status: "active" }); toast("User unbanned."); loadAdminUsers(); loadAdminStats(); }
async function deleteUser(uid) {
  if (!confirm("Permanently delete this user record? This cannot be undone.")) return;
  await db.ref("users/" + uid).remove();
  toast("User deleted.");
  loadAdminUsers(); loadAdminStats();
}

let changePlanUid = null;
async function openChangePlan(uid, currentPlan) {
  changePlanUid = uid;
  const snap = await db.ref("plans").get();
  const plans = snap.val() || {};
  const sel = document.querySelector("#change-plan-select");
  sel.innerHTML = Object.keys(plans).map((id) => `<option value="${id}" ${id === currentPlan ? "selected" : ""}>${escapeHtml(plans[id].name)}</option>`).join("");
  document.querySelector("#change-plan-modal").classList.remove("hidden");
}
function closeChangePlan() { document.querySelector("#change-plan-modal").classList.add("hidden"); }
async function submitChangePlan() {
  const plan = document.querySelector("#change-plan-select").value;
  await db.ref("users/" + changePlanUid).update({ plan });
  toast("Plan updated for user.");
  closeChangePlan();
  loadAdminUsers();
}

/* ---------------- Admin: plan management ---------------- */
async function loadAdminPlans() {
  const el = document.querySelector("#admin-plans-grid");
  if (!el) return;
  const snap = await db.ref("plans").get();
  const data = snap.val() || {};
  const ids = Object.keys(data);
  if (ids.length === 0) {
    el.innerHTML = `<div class="empty-state card">No plans yet. Create your first plan.</div>`;
    return;
  }
  el.innerHTML = ids.map((id) => {
    const p = data[id];
    const features = Array.isArray(p.features) ? p.features : Object.values(p.features || {});
    return `<div class="card">
      <div style="display:flex; justify-content:space-between; align-items:flex-start;">
        <div>
          <div style="font-weight:600; font-size:16px;">${escapeHtml(p.name)}</div>
          <div style="color:var(--muted); font-size:13px;">${formatCurrency(p.price)} / ${p.duration}</div>
        </div>
        <span class="badge ${p.active !== false ? "badge-green" : "badge-red"}">${p.active !== false ? "Active" : "Disabled"}</span>
      </div>
      <ul style="margin:14px 0; padding-left:18px; font-size:13px; color:var(--muted);">
        ${features.map((f) => `<li>${escapeHtml(f)}</li>`).join("")}
      </ul>
      <div class="kv-row"><span class="k">Website limit</span><span>${p.websiteLimit}</span></div>
      <div class="kv-row"><span class="k">Chat limit</span><span>${p.chatLimit ?? "Unlimited"}</span></div>
      <div class="kv-row"><span class="k">Storage limit</span><span>${p.storageLimit || "—"}</span></div>
      <div style="display:flex; gap:8px; margin-top:16px;">
        <button class="btn btn-ghost btn-sm" onclick='openPlanForm("${id}")'>Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deletePlan('${id}')">Delete</button>
      </div>
    </div>`;
  }).join("");
}

let editingPlanId = null;
async function openPlanForm(id = null) {
  editingPlanId = id;
  const form = document.querySelector("#plan-form");
  form.reset();
  document.querySelector("#plan-form-title").textContent = id ? "Edit plan" : "Create plan";
  if (id) {
    const snap = await db.ref("plans/" + id).get();
    const p = snap.val();
    form.planName.value = p.name;
    form.planPrice.value = p.price;
    form.planDuration.value = p.duration;
    form.planWebsiteLimit.value = p.websiteLimit;
    form.planChatLimit.value = p.chatLimit ?? "";
    form.planStorageLimit.value = p.storageLimit || "";
    form.planFeatures.value = (Array.isArray(p.features) ? p.features : Object.values(p.features || {})).join("\n");
    form.planActive.checked = p.active !== false;
  }
  document.querySelector("#plan-modal").classList.remove("hidden");
}
function closePlanForm() { document.querySelector("#plan-modal").classList.add("hidden"); }

async function submitPlanForm(e) {
  e.preventDefault();
  const form = e.target;
  const payload = {
    name: form.planName.value.trim(),
    price: Number(form.planPrice.value),
    duration: form.planDuration.value,
    websiteLimit: form.planWebsiteLimit.value.trim(),
    chatLimit: form.planChatLimit.value ? Number(form.planChatLimit.value) : null,
    storageLimit: form.planStorageLimit.value.trim(),
    features: form.planFeatures.value.split("\n").map((f) => f.trim()).filter(Boolean),
    active: form.planActive.checked,
  };
  if (editingPlanId) {
    await db.ref("plans/" + editingPlanId).update(payload);
  } else {
    const id = payload.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || db.ref("plans").push().key;
    await db.ref("plans/" + id).set(payload);
  }
  toast("Plan saved.");
  closePlanForm();
  loadAdminPlans();
}
async function deletePlan(id) {
  if (!confirm("Delete this plan? Users currently on it will keep their access until it's changed manually.")) return;
  await db.ref("plans/" + id).remove();
  toast("Plan deleted.");
  loadAdminPlans();
}

/* ---------------- Admin: coupons ---------------- */
async function loadAdminCoupons() {
  const el = document.querySelector("#admin-coupons-table");
  if (!el) return;
  const snap = await db.ref("coupons").get();
  const data = snap.val() || {};
  const codes = Object.keys(data);
  if (codes.length === 0) { el.innerHTML = `<div class="empty-state">No coupons yet.</div>`; return; }
  el.innerHTML = `<table><thead><tr><th>Code</th><th>Type</th><th>Value</th><th>Expiry</th><th>Uses</th><th>Status</th><th>Actions</th></tr></thead><tbody>
    ${codes.map((code) => {
      const c = data[code];
      return `<tr>
        <td><strong>${escapeHtml(code)}</strong></td>
        <td>${c.type === "percentage" ? "%" : "₹"}</td>
        <td>${c.type === "percentage" ? c.value + "%" : formatCurrency(c.value)}</td>
        <td>${c.expiry ? formatDate(c.expiry) : "No expiry"}</td>
        <td>${c.usedCount || 0}${c.maxUses ? " / " + c.maxUses : ""}</td>
        <td><span class="badge ${c.status === "active" ? "badge-green" : "badge-red"}">${escapeHtml(c.status)}</span></td>
        <td><button class="btn btn-danger btn-sm" onclick="deleteCoupon('${code}')">Delete</button></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

function openCouponForm() { document.querySelector("#coupon-form").reset(); document.querySelector("#coupon-modal").classList.remove("hidden"); }
function closeCouponForm() { document.querySelector("#coupon-modal").classList.add("hidden"); }

async function submitCouponForm(e) {
  e.preventDefault();
  const form = e.target;
  const code = form.couponCode.value.trim().toUpperCase();
  if (!code) return;
  await db.ref("coupons/" + code).set({
    type: form.couponType.value,
    value: Number(form.couponValue.value),
    expiry: form.couponExpiry.value ? new Date(form.couponExpiry.value).getTime() : null,
    maxUses: form.couponMaxUses.value ? Number(form.couponMaxUses.value) : null,
    minPurchase: form.couponMinPurchase.value ? Number(form.couponMinPurchase.value) : 0,
    usedCount: 0,
    status: "active",
  });
  toast("Coupon created.");
  closeCouponForm();
  loadAdminCoupons();
}
async function deleteCoupon(code) {
  if (!confirm(`Delete coupon ${code}?`)) return;
  await db.ref("coupons/" + code).remove();
  toast("Coupon deleted.");
  loadAdminCoupons();
}

/* ---------------- Admin: payments ---------------- */
async function loadAdminPayments() {
  const el = document.querySelector("#admin-payments-table");
  if (!el) return;
  const [paySnap, userSnap] = await Promise.all([db.ref("payments").get(), db.ref("users").get()]);
  const payments = paySnap.val() || {};
  const users = userSnap.val() || {};
  const rows = Object.values(payments).sort((a, b) => b.date - a.date);
  if (rows.length === 0) { el.innerHTML = `<div class="empty-state">No payments yet.</div>`; return; }
  el.innerHTML = `<table><thead><tr><th>User</th><th>Plan</th><th>Amount</th><th>Date</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${escapeHtml(users[r.uid]?.name || r.uid)}</td><td>${escapeHtml(r.plan)}</td><td>${formatCurrency(r.amount)}</td><td>${formatDate(r.date)}</td><td><span class="badge badge-green">${escapeHtml(r.status)}</span></td></tr>`).join("")}
  </tbody></table>`;
}

/* ---------------- Admin: notifications ---------------- */
async function sendNotification(e) {
  e.preventDefault();
  const form = e.target;
  await db.ref("notifications").push({
    title: form.notifTitle.value.trim(),
    message: form.notifMessage.value.trim(),
    type: form.notifType.value,
    createdAt: Date.now(),
  });
  toast("Notification sent to all customers.");
  form.reset();
  loadAdminNotifications();
}
async function loadAdminNotifications() {
  const el = document.querySelector("#admin-notifications-list");
  if (!el) return;
  const snap = await db.ref("notifications").limitToLast(20).get();
  const data = snap.val() || {};
  const rows = Object.values(data).sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = rows.length
    ? rows.map((n) => `<div class="kv-row"><span><strong>${escapeHtml(n.title)}</strong> — ${escapeHtml(n.message)}</span><span class="k">${formatDate(n.createdAt)}</span></div>`).join("")
    : `<div class="empty-state">No announcements sent yet.</div>`;
}
async function loadCustomerNotifications() {
  const el = document.querySelector("#customer-notifications");
  if (!el) return;
  const snap = await db.ref("notifications").limitToLast(10).get();
  const data = snap.val() || {};
  const rows = Object.values(data).sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = rows.length
    ? rows.map((n) => `<div class="card card-tight" style="margin-bottom:10px;"><span class="badge badge-${n.type === "maintenance" ? "amber" : n.type === "offer" ? "violet" : "green"}">${escapeHtml(n.type)}</span><div style="margin-top:8px; font-weight:600;">${escapeHtml(n.title)}</div><div style="font-size:13.5px; margin-top:4px;">${escapeHtml(n.message)}</div></div>`).join("")
    : `<div class="empty-state">No announcements right now.</div>`;
}

/* ---------------- Analytics ---------------- */
async function loadCustomerAnalytics(uid) {
  const snap = await db.ref("users/" + uid).get();
  const u = snap.val() || {};
  set("#an-visitors", Math.max(0, Math.round((u.totalChats || 0) * 1.8)).toLocaleString());
  set("#an-chats", (u.totalChats || 0).toLocaleString());
  set("#an-response-time", "1m 42s");
}

async function loadAdminAnalytics() {
  const [usersSnap, paymentsSnap] = await Promise.all([db.ref("users").get(), db.ref("payments").get()]);
  const users = Object.values(usersSnap.val() || {});
  const payments = Object.values(paymentsSnap.val() || {});

  // Revenue by month (last 6 months)
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ label: d.toLocaleDateString(undefined, { month: "short" }), start: d.getTime(), end: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() });
  }
  const revenueByMonth = months.map((m) => payments.filter((p) => p.status === "paid" && p.date >= m.start && p.date < m.end).reduce((s, p) => s + Number(p.amount || 0), 0));
  drawBarChart("#chart-revenue", months.map((m) => m.label), revenueByMonth, "#6C5CE7");

  const usersByMonth = months.map((m) => users.filter((u) => u.createdAt >= m.start && u.createdAt < m.end).length);
  drawBarChart("#chart-users", months.map((m) => m.label), usersByMonth, "#29D3C1");

  const planCounts = {};
  users.forEach((u) => { const p = u.plan || "free"; planCounts[p] = (planCounts[p] || 0) + 1; });
  const el = document.querySelector("#popular-plans");
  if (el) {
    const max = Math.max(1, ...Object.values(planCounts));
    el.innerHTML = Object.entries(planCounts).map(([plan, count]) => `
      <div class="kv-row"><span class="k">${escapeHtml(plan)}</span><span>${count}</span></div>
      <div class="progress-bar" style="margin-bottom:10px;"><div style="width:${(count / max) * 100}%"></div></div>
    `).join("");
  }
}

// Minimal dependency-free bar chart renderer (avoids pulling in a chart lib for a few bars).
function drawBarChart(sel, labels, values, color) {
  const el = document.querySelector(sel);
  if (!el) return;
  const max = Math.max(1, ...values);
  el.innerHTML = `<div style="display:flex; align-items:flex-end; gap:14px; height:160px; padding-top:10px;">
    ${values.map((v, i) => `
      <div style="flex:1; text-align:center;">
        <div style="height:${(v / max) * 130 || 2}px; background:linear-gradient(180deg, ${color}, ${color}55); border-radius:6px 6px 2px 2px;" title="${v}"></div>
        <div style="font-size:11px; color:var(--muted); margin-top:6px;">${labels[i]}</div>
      </div>`).join("")}
  </div>`;
}

/* ---------------- Settings ---------------- */
async function saveCustomerProfile(uid, e) {
  e.preventDefault();
  const form = e.target;
  await db.ref("users/" + uid).update({ name: form.profileName.value.trim() });
  toast("Profile updated.");
}

async function saveAdminSettings(e) {
  e.preventDefault();
  const form = e.target;
  await db.ref("settings/platform").update({
    name: form.platformName.value.trim(),
  });
  toast("Platform settings saved.");
}
async function loadAdminSettings() {
  const form = document.querySelector("#admin-settings-form");
  if (!form) return;
  const snap = await db.ref("settings/platform").get();
  const s = snap.val() || {};
  if (form.platformName) form.platformName.value = s.name || "ChatFlow AI";
}
