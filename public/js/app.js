// FriendCall — main app logic

const socket = io();
const rtc = new RTC(socket);

// ── State ──
let me = null; // { phone, username }
let contacts = {}; // phone -> { phone, username, messages:[], unread:0, lastMsg:'', lastTime:'' }
let activePhone = null;
let pendingCall = null; // { fromPhone, fromName, offer, callType }
let typingTimers = {};
let myTyping = false;
let myTypingTimer = null;

// ── Avatar colors ──
const COLORS = [
  ["#dbeafe","#1e40af"],["#dcfce7","#166534"],["#fce7f3","#9d174d"],
  ["#fef3c7","#92400e"],["#ede9fe","#5b21b6"],["#fee2e2","#991b1b"],
  ["#e0f2fe","#0c4a6e"],["#d1fae5","#065f46"],
];
function avatarColor(phone) { return COLORS[(+phone[phone.length-1]) % COLORS.length]; }
function initials(name) { return name.trim().split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }

function setAvatar(el, name, phone, size=44) {
  const [bg, color] = avatarColor(phone);
  el.style.background = bg;
  el.style.color = color;
  el.style.width = size+"px";
  el.style.height = size+"px";
  el.textContent = initials(name);
}

// ── Register ──
const regBtn = document.getElementById("reg-btn");
regBtn.addEventListener("click", doRegister);
document.getElementById("reg-name").addEventListener("keydown", e => { if(e.key==="Enter") document.getElementById("reg-phone").focus(); });
document.getElementById("reg-phone").addEventListener("keydown", e => { if(e.key==="Enter") doRegister(); });

function doRegister() {
  const name = document.getElementById("reg-name").value.trim();
  const phone = document.getElementById("reg-phone").value.trim().replace(/\D/g,"");
  if (!name) { shake(document.getElementById("reg-name")); return; }
  if (phone.length < 10) { shake(document.getElementById("reg-phone")); return; }

  socket.emit("register", { phone, username: name });
  socket.once("registered", () => {
    me = { phone, username: name };
    // Save to sessionStorage so page refresh remembers
    sessionStorage.setItem("me", JSON.stringify(me));
    loadSavedContacts();
    document.getElementById("my-name").textContent = name;
    document.getElementById("my-phone").textContent = "+91 " + phone;
    setAvatar(document.getElementById("my-avatar"), name, phone);
    document.getElementById("screen-register").classList.remove("active");
    document.getElementById("screen-app").classList.add("active");
  });
}

// ── Saved contacts (sessionStorage) ──
function loadSavedContacts() {
  const saved = sessionStorage.getItem("contacts_" + me.phone);
  if (saved) {
    contacts = JSON.parse(saved);
    Object.values(contacts).forEach(c => renderContactItem(c));
    updateEmptyState();
  }
}
function saveContacts() {
  sessionStorage.setItem("contacts_" + me.phone, JSON.stringify(contacts));
}

// ── Add Contact ──
document.getElementById("add-contact-btn").addEventListener("click", () => {
  document.getElementById("modal-add").classList.remove("hidden");
  document.getElementById("add-phone-input").value = "";
  document.getElementById("add-result").className = "add-result";
  document.getElementById("add-result").textContent = "";
  setTimeout(() => document.getElementById("add-phone-input").focus(), 100);
});
document.getElementById("cancel-add-btn").addEventListener("click", () => {
  document.getElementById("modal-add").classList.add("hidden");
});
document.getElementById("search-btn").addEventListener("click", searchContact);
document.getElementById("add-phone-input").addEventListener("keydown", e => { if(e.key==="Enter") searchContact(); });

function searchContact() {
  const phone = document.getElementById("add-phone-input").value.trim().replace(/\D/g,"");
  if (phone.length < 10) { shake(document.getElementById("add-phone-input")); return; }
  socket.emit("find-contact", { phone });
}

socket.on("contact-found", (contact) => {
  const res = document.getElementById("add-result");
  if (contacts[contact.phone]) {
    res.className = "add-result err";
    res.textContent = contact.username + " is already in your contacts.";
    return;
  }
  res.className = "add-result ok";
  res.textContent = `Found: ${contact.username} (+91 ${contact.phone})`;

  // Replace search button with "Add" button
  const sb = document.getElementById("search-btn");
  sb.textContent = "Add Contact";
  sb.onclick = () => {
    addContact(contact);
    document.getElementById("modal-add").classList.add("hidden");
    sb.textContent = "Search";
    sb.onclick = searchContact;
  };
});

socket.on("contact-error", (msg) => {
  const res = document.getElementById("add-result");
  res.className = "add-result err";
  res.textContent = msg;
});

function addContact(contact) {
  contacts[contact.phone] = {
    phone: contact.phone,
    username: contact.username,
    online: contact.online,
    messages: [],
    unread: 0,
    lastMsg: "",
    lastTime: "",
  };
  saveContacts();
  renderContactItem(contacts[contact.phone]);
  updateEmptyState();
}

// ── Render contact in sidebar ──
function renderContactItem(contact) {
  // Remove existing if any
  const existing = document.querySelector(`.contact-item[data-phone="${contact.phone}"]`);
  if (existing) existing.remove();

  const li = document.createElement("li");
  li.className = "contact-item";
  li.dataset.phone = contact.phone;

  const av = document.createElement("div");
  av.className = "avatar";
  setAvatar(av, contact.username, contact.phone);

  const info = document.createElement("div");
  info.className = "info";

  const cname = document.createElement("div");
  cname.className = "cname";
  cname.textContent = contact.username;

  const clast = document.createElement("div");
  clast.className = "clast";
  clast.textContent = contact.lastMsg || "+91 " + contact.phone;
  clast.id = "last_" + contact.phone;

  info.append(cname, clast);

  const meta = document.createElement("div");
  meta.className = "cmeta";

  const ctime = document.createElement("div");
  ctime.className = "ctime";
  ctime.id = "time_" + contact.phone;
  ctime.textContent = contact.lastTime || "";

  const badge = document.createElement("div");
  badge.className = "unread-badge";
  badge.id = "badge_" + contact.phone;
  badge.style.display = contact.unread > 0 ? "flex" : "none";
  badge.textContent = contact.unread;

  const dot = document.createElement("div");
  dot.className = "online-dot";
  dot.id = "dot_" + contact.phone;
  dot.style.display = contact.online ? "block" : "none";

  meta.append(ctime, badge, dot);
  li.append(av, info, meta);

  li.addEventListener("click", () => openChat(contact.phone));

  // Prepend so newest contact is on top
  const list = document.getElementById("contacts-list");
  const empty = list.querySelector(".empty-contacts");
  if (empty) empty.remove();
  list.prepend(li);
}

function updateEmptyState() {
  const list = document.getElementById("contacts-list");
  if (Object.keys(contacts).length === 0 && !list.querySelector(".empty-contacts")) {
    const li = document.createElement("li");
    li.className = "empty-contacts";
    li.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#ccc" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><p>No contacts yet.<br/>Click + to add a friend.</p>`;
    list.appendChild(li);
  }
}

// ── Search contacts ──
document.getElementById("search-input").addEventListener("input", function() {
  const q = this.value.toLowerCase();
  document.querySelectorAll(".contact-item").forEach(li => {
    const name = li.querySelector(".cname").textContent.toLowerCase();
    const phone = li.dataset.phone;
    li.style.display = (name.includes(q) || phone.includes(q)) ? "" : "none";
  });
});

// ── Open chat ──
function openChat(phone) {
  activePhone = phone;
  const contact = contacts[phone];

  // Mark active
  document.querySelectorAll(".contact-item").forEach(li => li.classList.remove("active"));
  const li = document.querySelector(`.contact-item[data-phone="${phone}"]`);
  if (li) li.classList.add("active");

  // Clear unread
  contact.unread = 0;
  const badge = document.getElementById("badge_" + phone);
  if (badge) badge.style.display = "none";
  saveContacts();

  // Show chat UI
  document.getElementById("chat-empty").classList.add("hidden");
  document.getElementById("chat-header").classList.remove("hidden");
  document.getElementById("messages").classList.remove("hidden");
  document.getElementById("typing-bar").classList.remove("hidden");
  document.getElementById("input-bar").classList.remove("hidden");

  // Set header info
  document.getElementById("chat-contact-name").textContent = contact.username;
  document.getElementById("chat-contact-status").textContent = contact.online ? "online" : "+91 " + contact.phone;

  const av = document.getElementById("chat-avatar");
  setAvatar(av, contact.username, contact.phone, 38);

  // Render messages
  const msgsEl = document.getElementById("messages");
  msgsEl.innerHTML = "";
  contact.messages.forEach(m => appendBubble(m, false));
  msgsEl.scrollTop = msgsEl.scrollHeight;

  document.getElementById("msg-input").focus();
}

// ── Messaging ──
document.getElementById("send-btn").addEventListener("click", sendMsg);
document.getElementById("msg-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMsg(); }
});
document.getElementById("msg-input").addEventListener("input", function() {
  autoResize(this);
  if (!myTyping && activePhone) {
    myTyping = true;
    socket.emit("typing", { toPhone: activePhone, isTyping: true });
  }
  clearTimeout(myTypingTimer);
  myTypingTimer = setTimeout(() => {
    myTyping = false;
    if (activePhone) socket.emit("typing", { toPhone: activePhone, isTyping: false });
  }, 1500);
});

function sendMsg() {
  const input = document.getElementById("msg-input");
  const text = input.value.trim();
  if (!text || !activePhone) return;

  const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const msgObj = { from: "me", text, timestamp };

  socket.emit("send-message", { toPhone: activePhone, message: text });

  contacts[activePhone].messages.push(msgObj);
  contacts[activePhone].lastMsg = text;
  contacts[activePhone].lastTime = timestamp;
  saveContacts();

  appendBubble(msgObj, true);
  updateLastMsg(activePhone, text, timestamp);

  input.value = "";
  autoResize(input);
  myTyping = false;
  socket.emit("typing", { toPhone: activePhone, isTyping: false });
}

socket.on("receive-message", ({ fromPhone, fromName, message, timestamp }) => {
  // Ensure contact exists
  if (!contacts[fromPhone]) {
    contacts[fromPhone] = {
      phone: fromPhone, username: fromName, online: true,
      messages: [], unread: 0, lastMsg: "", lastTime: "",
    };
    renderContactItem(contacts[fromPhone]);
  }

  const msgObj = { from: "them", text: message, timestamp };
  contacts[fromPhone].messages.push(msgObj);
  contacts[fromPhone].lastMsg = message;
  contacts[fromPhone].lastTime = timestamp;

  if (activePhone === fromPhone) {
    appendBubble(msgObj, true);
  } else {
    contacts[fromPhone].unread++;
    const badge = document.getElementById("badge_" + fromPhone);
    if (badge) { badge.style.display = "flex"; badge.textContent = contacts[fromPhone].unread; }
  }

  updateLastMsg(fromPhone, message, timestamp);
  saveContacts();

  // Move contact to top
  const li = document.querySelector(`.contact-item[data-phone="${fromPhone}"]`);
  if (li) document.getElementById("contacts-list").prepend(li);
});

function appendBubble(msg, scroll) {
  const wrap = document.createElement("div");
  wrap.className = "bubble-wrap " + (msg.from === "me" ? "mine" : "theirs");
  const bub = document.createElement("div");
  bub.className = "bubble";
  bub.innerHTML = escHtml(msg.text) + `<span class="btime">${msg.timestamp}</span>`;
  wrap.appendChild(bub);
  const msgsEl = document.getElementById("messages");
  msgsEl.appendChild(wrap);
  if (scroll) msgsEl.scrollTop = msgsEl.scrollHeight;
}

function updateLastMsg(phone, text, time) {
  const lastEl = document.getElementById("last_" + phone);
  const timeEl = document.getElementById("time_" + phone);
  if (lastEl) lastEl.textContent = text;
  if (timeEl) timeEl.textContent = time;
}

// Typing indicator
socket.on("typing", ({ fromPhone, isTyping }) => {
  if (fromPhone !== activePhone) return;
  clearTimeout(typingTimers[fromPhone]);
  const bar = document.getElementById("typing-bar");
  if (isTyping) {
    bar.textContent = (contacts[fromPhone]?.username || "They") + " is typing…";
    typingTimers[fromPhone] = setTimeout(() => { bar.textContent = ""; }, 3000);
  } else {
    bar.textContent = "";
  }
});

// ── CALLS ──
document.getElementById("voice-call-btn").addEventListener("click", () => {
  if (activePhone) rtc.startCall(activePhone, "audio");
});
document.getElementById("video-call-btn").addEventListener("click", () => {
  if (activePhone) rtc.startCall(activePhone, "video");
});

// Incoming call
socket.on("incoming-call", ({ fromPhone, fromName, offer, callType }) => {
  pendingCall = { fromPhone, fromName, offer, callType };

  // Auto-add to contacts if not there
  if (!contacts[fromPhone]) {
    contacts[fromPhone] = { phone: fromPhone, username: fromName, online: true, messages: [], unread: 0, lastMsg: "", lastTime: "" };
    renderContactItem(contacts[fromPhone]);
    saveContacts();
  }

  document.getElementById("inc-name").textContent = fromName;
  document.getElementById("inc-type").textContent = callType === "video" ? "Incoming video call…" : "Incoming voice call…";
  const av = document.getElementById("inc-avatar");
  setAvatar(av, fromName, fromPhone, 72);

  document.getElementById("modal-call").classList.remove("hidden");
  document.getElementById("call-peer-name").textContent = fromName;
  const audioAv = document.getElementById("audio-avatar");
  setAvatar(audioAv, fromName, fromPhone, 120);
});

document.getElementById("btn-accept").addEventListener("click", () => {
  if (!pendingCall) return;
  document.getElementById("modal-call").classList.add("hidden");
  rtc.acceptCall(pendingCall.fromPhone, pendingCall.offer, pendingCall.callType);
  pendingCall = null;
});

document.getElementById("btn-reject").addEventListener("click", () => {
  if (pendingCall) {
    socket.emit("reject-call", { toPhone: pendingCall.fromPhone });
    pendingCall = null;
  }
  document.getElementById("modal-call").classList.add("hidden");
});

document.getElementById("btn-hangup").addEventListener("click", () => rtc.hangup());
document.getElementById("btn-mute").addEventListener("click", () => rtc.toggleMute());
document.getElementById("btn-cam").addEventListener("click", () => rtc.toggleCam());
document.getElementById("btn-spk").addEventListener("click", () => {
  // Speaker toggle — mainly cosmetic on desktop; on mobile this would switch output
  document.getElementById("btn-spk").classList.toggle("active");
});

// ── Auto-login if session exists ──
window.addEventListener("load", () => {
  const saved = sessionStorage.getItem("me");
  if (saved) {
    const parsed = JSON.parse(saved);
    document.getElementById("reg-name").value = parsed.username;
    document.getElementById("reg-phone").value = parsed.phone;
  }
});

// ── Helpers ──
function escHtml(s) {
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/\n/g,"<br>");
}
function autoResize(el) {
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 120) + "px";
}
function shake(el) {
  el.style.animation = "none"; el.offsetHeight;
  el.style.animation = "shake .3s ease";
  setTimeout(() => el.style.animation = "", 400);
}
const sty = document.createElement("style");
sty.textContent = `@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}`;
document.head.appendChild(sty);
