/* =========================================================
   Smart Parking Booking System
   Client-side data layer (localStorage acts as the DB)
   ========================================================= */

const DB = {
  USERS: "sp_users",
  SLOTS: "sp_slots",
  BOOKINGS: "sp_bookings",
  SESSION: "sp_currentUser"
};

function read(key) { return JSON.parse(localStorage.getItem(key) || "[]"); }
function write(key, val) { localStorage.setItem(key, JSON.stringify(val)); }
function uid(prefix) { return prefix + "_" + Math.random().toString(36).slice(2, 9); }

/* ---------- Seed default data on first run ---------- */
function seedData() {
  if (!localStorage.getItem(DB.USERS)) {
    write(DB.USERS, [
      { id: "u_admin", name: "System Admin", email: "admin@parking.com", password: "admin123", role: "admin" }
    ]);
  }
  if (!localStorage.getItem(DB.SLOTS)) {
    const locations = ["Block A - Ground Floor", "Block B - Level 1"];
    const slots = [];
    let n = 1;
    locations.forEach((loc, li) => {
      for (let i = 1; i <= 6; i++) {
        slots.push({
          id: uid("slot"),
          slotNumber: (li === 0 ? "A" : "B") + i,
          location: loc,
          type: i % 4 === 0 ? "bike" : "car",
          pricePerHour: i % 4 === 0 ? 10 : 30,
          status: "available"
        });
      }
    });
    write(DB.SLOTS, slots);
  }
  if (!localStorage.getItem(DB.BOOKINGS)) write(DB.BOOKINGS, []);
}
seedData();

/* ---------- Session helpers ---------- */
function getSession() { return JSON.parse(sessionStorage.getItem(DB.SESSION) || "null"); }
function setSession(user) { sessionStorage.setItem(DB.SESSION, JSON.stringify(user)); }
function clearSession() { sessionStorage.removeItem(DB.SESSION); }
function requireAuth(role) {
  const s = getSession();
  if (!s) { window.location.href = "index.html"; return null; }
  if (role && s.role !== role) { window.location.href = "dashboard.html"; return null; }
  return s;
}
function logout() { clearSession(); window.location.href = "index.html"; }

/* =========================================================
   AUTH PAGE (index.html)
   ========================================================= */
function initAuthPage() {
  const loginTab = document.getElementById("tab-login");
  const signupTab = document.getElementById("tab-signup");
  const loginForm = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");

  loginTab.onclick = () => {
    loginTab.classList.add("active"); signupTab.classList.remove("active");
    loginForm.style.display = "block"; signupForm.style.display = "none";
  };
  signupTab.onclick = () => {
    signupTab.classList.add("active"); loginTab.classList.remove("active");
    signupForm.style.display = "block"; loginForm.style.display = "none";
  };

  loginForm.onsubmit = (e) => {
    e.preventDefault();
    const email = document.getElementById("loginEmail").value.trim().toLowerCase();
    const pass = document.getElementById("loginPassword").value;
    const users = read(DB.USERS);
    const found = users.find(u => u.email.toLowerCase() === email && u.password === pass);
    const err = document.getElementById("loginError");
    if (!found) { err.textContent = "Invalid email or password."; err.style.display = "block"; return; }
    setSession(found);
    window.location.href = found.role === "admin" ? "admin.html" : "dashboard.html";
  };

  signupForm.onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById("suName").value.trim();
    const email = document.getElementById("suEmail").value.trim().toLowerCase();
    const pass = document.getElementById("suPassword").value;
    const err = document.getElementById("signupError");
    const users = read(DB.USERS);
    if (users.some(u => u.email.toLowerCase() === email)) {
      err.textContent = "An account with this email already exists."; err.style.display = "block"; return;
    }
    const newUser = { id: uid("user"), name, email, password: pass, role: "user" };
    users.push(newUser); write(DB.USERS, users);
    setSession(newUser);
    window.location.href = "dashboard.html";
  };
}

/* =========================================================
   DASHBOARD PAGE (dashboard.html) — end user
   ========================================================= */
let currentBookingSlotId = null;

function initDashboard() {
  const session = requireAuth("user");
  if (!session) return;
  document.getElementById("welcomeName").textContent = session.name;
  document.getElementById("logoutBtn").onclick = logout;

  document.getElementById("filterType").onchange = renderSlots;
  document.getElementById("filterLocation").onchange = renderSlots;

  populateLocationFilter();
  renderSlots();

  document.getElementById("closeModal").onclick = closeBookingModal;
  document.getElementById("bookingForm").onsubmit = submitBooking;
}

function populateLocationFilter() {
  const slots = read(DB.SLOTS);
  const locSel = document.getElementById("filterLocation");
  const locs = [...new Set(slots.map(s => s.location))];
  locs.forEach(l => {
    const opt = document.createElement("option");
    opt.value = l; opt.textContent = l;
    locSel.appendChild(opt);
  });
}

function renderSlots() {
  const slots = read(DB.SLOTS);
  const type = document.getElementById("filterType").value;
  const loc = document.getElementById("filterLocation").value;
  const grid = document.getElementById("slotGrid");
  grid.innerHTML = "";

  const filtered = slots.filter(s =>
    (type === "all" || s.type === type) && (loc === "all" || s.location === loc)
  );

  if (filtered.length === 0) {
    grid.innerHTML = '<p style="color:var(--muted)">No slots match this filter.</p>';
    return;
  }

  filtered.forEach(s => {
    const card = document.createElement("div");
    card.className = "slot-card" + (s.status === "booked" ? " booked" : "");
    card.innerHTML = `
      <div class="slot-id">Slot ${s.slotNumber}</div>
      <div class="slot-loc">${s.location}</div>
      <div class="slot-meta"><span>Vehicle Type</span><strong>${s.type === "car" ? "Car" : "Bike"}</strong></div>
      <div class="slot-meta"><span>Rate</span><strong>₹${s.pricePerHour}/hr</strong></div>
      <div class="slot-meta"><span>Status</span>
        <span class="status-pill ${s.status}">${s.status}</span>
      </div>
      <br/>
      <button class="btn small ${s.status === "booked" ? "secondary" : ""}"
        ${s.status === "booked" ? "disabled" : ""} onclick="openBookingModal('${s.id}')">
        ${s.status === "booked" ? "Unavailable" : "Book Now"}
      </button>
    `;
    grid.appendChild(card);
  });
}

function openBookingModal(slotId) {
  currentBookingSlotId = slotId;
  const slots = read(DB.SLOTS);
  const slot = slots.find(s => s.id === slotId);
  document.getElementById("modalSlotInfo").textContent =
    `Slot ${slot.slotNumber} · ${slot.location} · ₹${slot.pricePerHour}/hr`;
  document.getElementById("bookDate").valueAsDate = new Date();
  document.getElementById("modalOverlay").classList.add("open");
}
function closeBookingModal() { document.getElementById("modalOverlay").classList.remove("open"); }

function submitBooking(e) {
  e.preventDefault();
  const session = getSession();
  const slots = read(DB.SLOTS);
  const slot = slots.find(s => s.id === currentBookingSlotId);
  const vehicleNumber = document.getElementById("vehicleNumber").value.trim().toUpperCase();
  const date = document.getElementById("bookDate").value;
  const startTime = document.getElementById("startTime").value;
  const duration = parseInt(document.getElementById("duration").value, 10);
  const totalCost = duration * slot.pricePerHour;

  const bookings = read(DB.BOOKINGS);
  bookings.push({
    id: uid("bk"), userId: session.id, userName: session.name, slotId: slot.id,
    slotNumber: slot.slotNumber, location: slot.location, vehicleNumber, date, startTime,
    duration, totalCost, status: "active", createdAt: new Date().toISOString()
  });
  write(DB.BOOKINGS, bookings);

  slot.status = "booked";
  write(DB.SLOTS, slots);

  closeBookingModal();
  renderSlots();
  alert(`Booking confirmed for Slot ${slot.slotNumber}. Total cost: ₹${totalCost}`);
}

/* =========================================================
   MY BOOKINGS PAGE (my-bookings.html) — end user
   ========================================================= */
function initMyBookings() {
  const session = requireAuth("user");
  if (!session) return;
  document.getElementById("logoutBtn").onclick = logout;
  renderMyBookings();
}

function renderMyBookings() {
  const session = getSession();
  const bookings = read(DB.BOOKINGS).filter(b => b.userId === session.id).reverse();
  const tbody = document.getElementById("myBookingsBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">No bookings yet. <a href="dashboard.html">Book a slot</a>.</td></tr>';
    return;
  }
  bookings.forEach(b => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.slotNumber}</td><td>${b.vehicleNumber}</td><td>${b.date}</td>
      <td>${b.startTime}</td><td>${b.duration} hr</td><td>₹${b.totalCost}</td>
      <td>
        <span class="status-pill ${b.status === "active" ? "available" : "booked"}">${b.status}</span>
        ${b.status === "active" ? `<button class="btn small danger" style="margin-left:6px" onclick="cancelBooking('${b.id}')">Cancel</button>` : ""}
      </td>`;
    tbody.appendChild(tr);
  });
}

function cancelBooking(bookingId) {
  const bookings = read(DB.BOOKINGS);
  const b = bookings.find(x => x.id === bookingId);
  if (!b) return;
  if (!confirm("Cancel this booking?")) return;
  b.status = "cancelled";
  write(DB.BOOKINGS, bookings);

  const slots = read(DB.SLOTS);
  const slot = slots.find(s => s.id === b.slotId);
  if (slot) { slot.status = "available"; write(DB.SLOTS, slots); }

  renderSlots();
  renderMyBookings();
}

/* =========================================================
   PROFILE PAGE (profile.html) — end user
   ========================================================= */
function initProfile() {
  const session = requireAuth("user");
  if (!session) return;
  document.getElementById("logoutBtn").onclick = logout;

  document.getElementById("avatarInitial").textContent = session.name.charAt(0).toUpperCase();
  document.getElementById("profileNameDisplay").textContent = session.name;
  document.getElementById("profileName").value = session.name;
  document.getElementById("profileEmail").value = session.email;

  const bookings = read(DB.BOOKINGS).filter(b => b.userId === session.id);
  document.getElementById("statTotalBookings").textContent = bookings.length;
  document.getElementById("statActiveBookings").textContent = bookings.filter(b => b.status === "active").length;
  document.getElementById("statTotalSpent").textContent =
    "₹" + bookings.filter(b => b.status !== "cancelled").reduce((s, b) => s + b.totalCost, 0);

  document.getElementById("profileForm").onsubmit = function (e) {
    e.preventDefault();
    const newName = document.getElementById("profileName").value.trim();
    const users = read(DB.USERS);
    const user = users.find(u => u.id === session.id);
    if (user) { user.name = newName; write(DB.USERS, users); }
    const updatedSession = { ...session, name: newName };
    setSession(updatedSession);
    const msg = document.getElementById("profileSuccess");
    msg.style.display = "block";
    setTimeout(() => (msg.style.display = "none"), 2500);
  };
}

/* =========================================================
   ADMIN PAGE (admin.html)
   ========================================================= */
function initAdmin() {
  const session = requireAuth("admin");
  if (!session) return;
  document.getElementById("logoutBtn").onclick = logout;

  renderStats();
  renderSlotTable();

  document.getElementById("addSlotForm").onsubmit = addSlot;
}

/* =========================================================
   ADMIN — ALL BOOKINGS PAGE (admin-bookings.html)
   ========================================================= */
function initAdminBookings() {
  const session = requireAuth("admin");
  if (!session) return;
  document.getElementById("logoutBtn").onclick = logout;
  renderStats();
  renderAllBookings();
}

function renderStats() {
  const slots = read(DB.SLOTS);
  const bookings = read(DB.BOOKINGS);
  const available = slots.filter(s => s.status === "available").length;
  const booked = slots.filter(s => s.status === "booked").length;
  const revenue = bookings.filter(b => b.status !== "cancelled").reduce((sum, b) => sum + b.totalCost, 0);

  document.getElementById("statTotal").textContent = slots.length;
  document.getElementById("statAvailable").textContent = available;
  document.getElementById("statBooked").textContent = booked;
  document.getElementById("statRevenue").textContent = "₹" + revenue;
}

function renderSlotTable() {
  const slots = read(DB.SLOTS);
  const tbody = document.getElementById("slotTableBody");
  tbody.innerHTML = "";
  slots.forEach(s => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.slotNumber}</td><td>${s.location}</td><td>${s.type}</td><td>₹${s.pricePerHour}/hr</td>
      <td><span class="status-pill ${s.status}">${s.status}</span></td>
      <td><button class="btn small danger" onclick="deleteSlot('${s.id}')">Delete</button></td>`;
    tbody.appendChild(tr);
  });
}

function addSlot(e) {
  e.preventDefault();
  const slots = read(DB.SLOTS);
  slots.push({
    id: uid("slot"),
    slotNumber: document.getElementById("newSlotNumber").value.trim(),
    location: document.getElementById("newSlotLocation").value.trim(),
    type: document.getElementById("newSlotType").value,
    pricePerHour: parseInt(document.getElementById("newSlotPrice").value, 10),
    status: "available"
  });
  write(DB.SLOTS, slots);
  e.target.reset();
  renderStats(); renderSlotTable();
}

function deleteSlot(id) {
  let slots = read(DB.SLOTS);
  slots = slots.filter(s => s.id !== id);
  write(DB.SLOTS, slots);
  renderStats(); renderSlotTable();
}

function renderAllBookings() {
  const bookings = read(DB.BOOKINGS).slice().reverse();
  const tbody = document.getElementById("allBookingsBody");
  tbody.innerHTML = "";
  if (bookings.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">No bookings yet.</td></tr>';
    return;
  }
  bookings.forEach(b => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${b.userName}</td><td>${b.slotNumber}</td><td>${b.vehicleNumber}</td>
      <td>${b.date} ${b.startTime}</td><td>${b.duration} hr</td><td>₹${b.totalCost}</td>
      <td><span class="status-pill ${b.status === "active" ? "available" : "booked"}">${b.status}</span></td>`;
    tbody.appendChild(tr);
  });
}
