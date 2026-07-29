// ======================================================
// FriendCall — Main Application
// ======================================================

let socket = null;
let rtc = null;

let me = null;

let contacts = {};

let activePhone = null;

let pendingCall = null;

let myTyping = false;
let myTypingTimer = null;

let socketEventsBound = false;


// ======================================================
// RINGTONE
// ======================================================

const ringtone =
  new Audio(
    "/sounds/ringtone.mp3"
  );

ringtone.loop = true;


// ======================================================
// AVATAR
// ======================================================

const COLORS = [
  ["#dbeafe", "#1e40af"],
  ["#dcfce7", "#166534"],
  ["#fce7f3", "#9d174d"],
  ["#fef3c7", "#92400e"],
  ["#ede9fe", "#5b21b6"],
  ["#fee2e2", "#991b1b"],
  ["#e0f2fe", "#0c4a6e"],
  ["#d1fae5", "#065f46"],
];

function avatarColor(phone) {
  const value =
    Number(
      phone?.[
        phone.length - 1
      ]
    ) || 0;

  return COLORS[
    value % COLORS.length
  ];
}

function initials(name) {
  return String(name || "?")
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function setAvatar(
  element,
  name,
  phone,
  size = 44
) {
  if (!element) return;

  const [background, color] =
    avatarColor(phone);

  element.style.background =
    background;

  element.style.color =
    color;

  element.style.width =
    size + "px";

  element.style.height =
    size + "px";

  element.textContent =
    initials(name);
}


// ======================================================
// AUTH ELEMENTS
// ======================================================

const registerForm =
  document.getElementById(
    "register-form"
  );

const loginForm =
  document.getElementById(
    "login-form"
  );


const clearChatBtn =
  document.getElementById("clear-chat-btn");

clearChatBtn?.addEventListener("click", () => {
  if (!socket || !activePhone) {
    return;
  }

  const contact = contacts[activePhone];

  if (!contact) {
    return;
  }

  const confirmed = confirm(
    `Clear chat with ${contact.username}?\n\nThis will permanently delete all messages for both users.`
  );

  if (!confirmed) {
    return;
  }

  socket.emit("clear-chat", {
    otherPhone: activePhone,
  });
});

// ======================================================
// SHOW LOGIN
// ======================================================

document
  .getElementById(
    "show-login-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      registerForm?.classList.add(
        "hidden"
      );

      loginForm?.classList.remove(
        "hidden"
      );
    }
  );


// ======================================================
// SHOW REGISTER
// ======================================================

document
  .getElementById(
    "show-register-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      loginForm?.classList.add(
        "hidden"
      );

      registerForm?.classList.remove(
        "hidden"
      );
    }
  );


// ======================================================
// REGISTER
// ======================================================

document
  .getElementById("reg-btn")
  ?.addEventListener(
    "click",
    doRegister
  );


async function doRegister() {
  const username =
    document
      .getElementById(
        "reg-name"
      )
      .value.trim();

  const phone =
    document
      .getElementById(
        "reg-phone"
      )
      .value.replace(
        /\D/g,
        ""
      );

  const password =
    document.getElementById(
      "reg-password"
    ).value;

  const error =
    document.getElementById(
      "register-error"
    );

  if (error) {
    error.textContent = "";
  }

  if (!username) {
    showRegisterError(
      "Enter your name."
    );

    return;
  }

  if (phone.length !== 10) {
    showRegisterError(
      "Enter a valid 10-digit mobile number."
    );

    return;
  }

  if (password.length < 6) {
    showRegisterError(
      "Password must be at least 6 characters."
    );

    return;
  }

  try {
    const response =
      await fetch(
        "/api/auth/register",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            username,
            phone,
            password,
          }),
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          "Registration failed."
      );
    }

    localStorage.setItem(
      "friendcall_token",
      data.token
    );

    me = data.user;

    startAuthenticatedApp();
  } catch (err) {
    showRegisterError(
      err.message
    );
  }
}


function showRegisterError(
  message
) {
  const error =
    document.getElementById(
      "register-error"
    );

  if (error) {
    error.textContent =
      message;
  }
}


// ======================================================
// LOGIN
// ======================================================

document
  .getElementById(
    "login-btn"
  )
  ?.addEventListener(
    "click",
    doLogin
  );


async function doLogin() {
  const phone =
    document
      .getElementById(
        "login-phone"
      )
      .value.replace(
        /\D/g,
        ""
      );

  const password =
    document.getElementById(
      "login-password"
    ).value;

  const error =
    document.getElementById(
      "login-error"
    );

  if (error) {
    error.textContent = "";
  }

  if (phone.length !== 10) {
    showLoginError(
      "Enter a valid 10-digit mobile number."
    );

    return;
  }

  if (!password) {
    showLoginError(
      "Enter your password."
    );

    return;
  }

  try {
    const response =
      await fetch(
        "/api/auth/login",
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            phone,
            password,
          }),
        }
      );

    const data =
      await response.json();

    if (!response.ok) {
      throw new Error(
        data.message ||
          "Login failed."
      );
    }

    localStorage.setItem(
      "friendcall_token",
      data.token
    );

    me = data.user;

    startAuthenticatedApp();
  } catch (err) {
    showLoginError(
      err.message
    );
  }
}


function showLoginError(
  message
) {
  const error =
    document.getElementById(
      "login-error"
    );

  if (error) {
    error.textContent =
      message;
  }
}


// ======================================================
// ENTER KEY AUTH
// ======================================================

document
  .getElementById(
    "reg-name"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        document
          .getElementById(
            "reg-phone"
          )
          ?.focus();
      }
    }
  );


document
  .getElementById(
    "reg-phone"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        document
          .getElementById(
            "reg-password"
          )
          ?.focus();
      }
    }
  );


document
  .getElementById(
    "reg-password"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        doRegister();
      }
    }
  );


document
  .getElementById(
    "login-phone"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        document
          .getElementById(
            "login-password"
          )
          ?.focus();
      }
    }
  );


document
  .getElementById(
    "login-password"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        doLogin();
      }
    }
  );


// ======================================================
// PERSISTENT LOGIN
// ======================================================

window.addEventListener(
  "load",
  async () => {
    const token =
      localStorage.getItem(
        "friendcall_token"
      );

    if (!token) {
      return;
    }

    try {
      const response =
        await fetch(
          "/api/auth/me",
          {
            headers: {
              Authorization:
                `Bearer ${token}`,
            },
          }
        );

      if (!response.ok) {
        throw new Error(
          "Invalid session"
        );
      }

      const data =
        await response.json();

      me = data.user;

      startAuthenticatedApp();
    } catch {
      localStorage.removeItem(
        "friendcall_token"
      );
    }
  }
);


// ======================================================
// START AUTHENTICATED APP
// ======================================================

function startAuthenticatedApp() {
  if (!me) return;

  if (
    socket &&
    socket.connected
  ) {
    initApp();
    return;
  }

  const token =
    localStorage.getItem(
      "friendcall_token"
    );

  if (!token) return;

  socket = io({
    auth: {
      token,
    },
  });

  rtc =
    new RTC(socket);

  bindSocketEvents();

  socket.on(
    "connect",
    () => {
      console.log(
        "Socket connected:",
        socket.id
      );

      initApp();
    }
  );

  socket.on(
    "connect_error",
    (err) => {
      console.error(
        "Socket error:",
        err.message
      );

      if (
        err.message ===
          "Authentication required" ||
        err.message ===
          "Invalid authentication"
      ) {
        localStorage.removeItem(
          "friendcall_token"
        );

        location.reload();
      }
    }
  );
}


// ======================================================
// INIT APP
// ======================================================

function initApp() {
  if (!me || !socket) {
    return;
  }

  const myName =
    document.getElementById(
      "my-name"
    );

  const myPhone =
    document.getElementById(
      "my-phone"
    );

  if (myName) {
    myName.textContent =
      me.username;
  }

  if (myPhone) {
    myPhone.textContent =
      "+91 " + me.phone;
  }

  setAvatar(
    document.getElementById(
      "my-avatar"
    ),
    me.username,
    me.phone
  );

  loadSavedContacts();

  socket.emit(
    "load-contacts"
  );

  document
    .getElementById(
      "screen-register"
    )
    ?.classList.remove(
      "active"
    );

  document
    .getElementById(
      "screen-app"
    )
    ?.classList.add(
      "active"
    );
}


// ======================================================
// LOCAL CONTACT STORAGE
// ======================================================

function loadSavedContacts() {
  if (!me) return;

  const saved =
    localStorage.getItem(
      "contacts_" + me.phone
    );

  if (!saved) {
    updateEmptyState();
    return;
  }

  try {
    contacts =
      JSON.parse(saved);

    const list =
      document.getElementById(
        "contacts-list"
      );

    if (list) {
      list.innerHTML = "";
    }

    Object.values(
      contacts
    ).forEach(
      (contact) => {
        renderContactItem(
          contact
        );
      }
    );

    updateEmptyState();
  } catch {
    contacts = {};
  }
}


function saveContacts() {
  if (!me) return;

  localStorage.setItem(
    "contacts_" + me.phone,
    JSON.stringify(
      contacts
    )
  );
}


// ======================================================
// SOCKET EVENTS
// ======================================================

function bindSocketEvents() {
  if (
    !socket ||
    socketEventsBound
  ) {
    return;
  }

  socketEventsBound = true;


  // ====================================================
  // CONTACTS LOADED
  // ====================================================

  socket.on(
    "contacts-loaded",
    (savedContacts) => {
      const oldContacts =
        contacts;

      contacts = {};

      const list =
        document.getElementById(
          "contacts-list"
        );

      if (list) {
        list.innerHTML = "";
      }

      savedContacts.forEach(
        (contact) => {
          const old =
            oldContacts[
              contact.phone
            ] || {};

          contacts[
            contact.phone
          ] = {
            phone:
              contact.phone,

            username:
              contact.username,

            online:
              Boolean(
                contact.online
              ),

            lastSeen:
              contact.lastSeen ||
              old.lastSeen ||
              null,

            messages:
              old.messages || [],

            unread:
              old.unread || 0,

            lastMsg:
              old.lastMsg || "",

            lastTime:
              old.lastTime || "",
          };

          renderContactItem(
            contacts[
              contact.phone
            ]
          );
        }
      );

      saveContacts();
      updateEmptyState();

      if (
        activePhone &&
        contacts[
          activePhone
        ]
      ) {
        showNormalStatus(
          activePhone
        );
      }
    }
  );


  // ====================================================
  // CONTACT FOUND
  // ====================================================

  socket.on(
    "contact-found",
    (contact) => {
      const result =
        document.getElementById(
          "add-result"
        );

      if (!result) return;

      if (
        contact.phone ===
        me.phone
      ) {
        result.className =
          "add-result err";

        result.textContent =
          "You cannot add yourself.";

        return;
      }

      if (
        contacts[
          contact.phone
        ]
      ) {
        result.className =
          "add-result err";

        result.textContent =
          contact.username +
          " is already in your contacts.";

        return;
      }

      result.className =
        "add-result ok";

      result.textContent =
        `Found: ${contact.username} (+91 ${contact.phone})`;

      const searchButton =
        document.getElementById(
          "search-btn"
        );

      searchButton.textContent =
        "Add Contact";

      searchButton.onclick =
        () => {
          addContact(
            contact
          );

          document
            .getElementById(
              "modal-add"
            )
            ?.classList.add(
              "hidden"
            );

          searchButton.textContent =
            "Search";

          searchButton.onclick =
            searchContact;
        };
    }
  );


  // ====================================================
  // CONTACT ERROR
  // ====================================================

  socket.on(
    "contact-error",
    (message) => {
      const result =
        document.getElementById(
          "add-result"
        );

      if (!result) return;

      result.className =
        "add-result err";

      result.textContent =
        message;
    }
  );

// ====================================================
// CHAT CLEARED
// ====================================================

socket.on("chat-cleared", ({ otherPhone }) => {
  const contact = contacts[otherPhone];

  if (contact) {
    // Clear local cached chat data
    contact.messages = [];
    contact.lastMsg = "";
    contact.lastTime = "";
    contact.unread = 0;

    saveContacts();

    // Reset contact list preview
    const last =
      document.getElementById("last_" + otherPhone);

    const time =
      document.getElementById("time_" + otherPhone);

    const badge =
      document.getElementById("badge_" + otherPhone);

    if (last) {
      last.textContent = "+91 " + otherPhone;
    }

    if (time) {
      time.textContent = "";
    }

    if (badge) {
      badge.textContent = "";
      badge.style.display = "none";
    }
  }

  // Clear visible chat if this conversation is open
  if (activePhone === otherPhone) {
    const messagesContainer =
      document.getElementById("messages");

    if (messagesContainer) {
      messagesContainer.innerHTML = "";
    }
  }
});

socket.on(
  "message-history",
  (messages) => {
    const messagesElement =
      document.getElementById(
        "messages"
      );

    if (!messagesElement) return;

    messagesElement.innerHTML = "";

    messages.forEach((message) => {

      appendBubble(
        {
          id:
            message._id,

          from:
            message.fromPhone === me.phone
              ? "me"
              : "them",

          text:
            message.message,

          timestamp:
            message.timestamp,

          edited:
            Boolean(message.edited),
        },

        false
      );
    });

    messagesElement.scrollTop =
      messagesElement.scrollHeight;
  }
);

socket.on(
  "message-sent",
  ({
    messageId,
    toPhone,
    message,
    timestamp,
    edited,
  }) => {

    if (!contacts[toPhone]) {
      return;
    }

    const msg = {
      id: messageId,
      from: "me",
      text: message,
      timestamp,
      edited: Boolean(edited),
    };

    contacts[toPhone].messages.push(msg);

    contacts[toPhone].lastMsg =
      message;

    contacts[toPhone].lastTime =
      timestamp;

    saveContacts();

    if (activePhone === toPhone) {
      appendBubble(msg, true);
    }

    updateLastMsg(
      toPhone,
      message,
      timestamp
    );
  }
);


// ====================================================
// MESSAGE EDITED
// ====================================================

socket.on(
  "message-edited",
  ({
    messageId,
    fromPhone,
    toPhone,
    message,
  }) => {

    const otherPhone =
      fromPhone === me.phone
        ? toPhone
        : fromPhone;

    const contact =
      contacts[otherPhone];

    if (contact) {

      const savedMessage =
        contact.messages.find(
          (msg) =>
            msg.id === messageId
        );

      if (savedMessage) {
        savedMessage.text =
          message;

        savedMessage.edited =
          true;
      }

      // If edited message is latest
      const last =
        contact.messages[
          contact.messages.length - 1
        ];

      if (
        last &&
        last.id === messageId
      ) {
        contact.lastMsg =
          message;

        updateLastMsg(
          otherPhone,
          message,
          contact.lastTime
        );
      }

      saveContacts();
    }


    // Update visible bubble
    const wrapper =
      document.querySelector(
        `[data-message-id="${messageId}"]`
      );

    if (wrapper) {

      const text =
        wrapper.querySelector(
          ".message-text"
        );

      if (text) {
        text.textContent =
          message;
      }


      let edited =
        wrapper.querySelector(
          ".edited-label"
        );

      if (!edited) {

        edited =
          document.createElement(
            "span"
          );

        edited.className =
          "edited-label";

        edited.textContent =
          "edited";

        const meta =
          wrapper.querySelector(
            ".message-meta"
          );

        if (meta) {
          meta.prepend(
            edited
          );
        }
      }
    }
  }
);


// ====================================================
// MESSAGE DELETED
// ====================================================

socket.on(
  "message-deleted",
  ({
    messageId,
    fromPhone,
    toPhone,
  }) => {

    const otherPhone =
      fromPhone === me.phone
        ? toPhone
        : fromPhone;

    const contact =
      contacts[otherPhone];


    if (contact) {

      contact.messages =
        contact.messages.filter(
          (msg) =>
            msg.id !== messageId
        );


      const lastMessage =
        contact.messages[
          contact.messages.length - 1
        ];


      if (lastMessage) {

        contact.lastMsg =
          lastMessage.text;

        contact.lastTime =
          lastMessage.timestamp;

        updateLastMsg(
          otherPhone,
          lastMessage.text,
          lastMessage.timestamp
        );

      } else {

        contact.lastMsg = "";
        contact.lastTime = "";

        const last =
          document.getElementById(
            "last_" + otherPhone
          );

        const time =
          document.getElementById(
            "time_" + otherPhone
          );

        if (last) {
          last.textContent =
            "+91 " + otherPhone;
        }

        if (time) {
          time.textContent = "";
        }
      }

      saveContacts();
    }


    // Remove visible bubble
    document
      .querySelector(
        `[data-message-id="${messageId}"]`
      )
      ?.remove();
  }
);


// ====================================================
// MESSAGE ACTION ERROR
// ====================================================

socket.on(
  "message-action-error",
  (message) => {
    alert(message);
  }
);

  // ====================================================
  // RECEIVE MESSAGE
  // ====================================================

  socket.on(
    "receive-message",
    ({
       messageId,
    fromPhone,
    fromName,
    message,
    timestamp,
    edited,
    }) => {
      if (
        !contacts[
          fromPhone
        ]
      ) {
        contacts[
          fromPhone
        ] = {
          phone:
            fromPhone,

          username:
            fromName,

          online:
            true,

          lastSeen:
            null,

          messages:
            [],

          unread:
            0,

          lastMsg:
            "",

          lastTime:
            "",
        };

        renderContactItem(
          contacts[
            fromPhone
          ]
        );
      }

      const msg = {
      id: messageId,
  from: "them",
  text: message,
  timestamp,
  edited: Boolean(edited),
      };

      contacts[
        fromPhone
      ].messages.push(msg);

      contacts[
        fromPhone
      ].lastMsg =
        message;

      contacts[
        fromPhone
      ].lastTime =
        timestamp;

      if (
        activePhone ===
        fromPhone
      ) {
        appendBubble(
          msg,
          true
        );
      } else {
        contacts[
          fromPhone
        ].unread++;

        const badge =
          document.getElementById(
            "badge_" +
              fromPhone
          );

        if (badge) {
          badge.style.display =
            "flex";

          badge.textContent =
            contacts[
              fromPhone
            ].unread;
        }
      }

      updateLastMsg(
        fromPhone,
        message,
        timestamp
      );

      saveContacts();

      const item =
        document.querySelector(
          `.contact-item[data-phone="${fromPhone}"]`
        );

      if (item) {
        document
          .getElementById(
            "contacts-list"
          )
          ?.prepend(item);
      }
    }
  );


  // ====================================================
  // TYPING
  // WhatsApp style:
  // typing... replaces online
  // ====================================================

  socket.on(
    "typing",
    ({
      fromPhone,
      isTyping,
    }) => {
      if (
        fromPhone !==
        activePhone
      ) {
        return;
      }

      const status =
        document.getElementById(
          "chat-contact-status"
        );

      if (!status) return;

      if (isTyping) {
        status.textContent =
          "typing...";
      } else {
        showNormalStatus(
          fromPhone
        );
      }
    }
  );


  // ====================================================
  // ONLINE
  // ====================================================

  socket.on(
    "user-online",
    ({ phone }) => {
      if (
        !contacts[phone]
      ) {
        return;
      }

      contacts[
        phone
      ].online = true;

      contacts[
        phone
      ].lastSeen = null;

      const dot =
        document.getElementById(
          "dot_" + phone
        );

      if (dot) {
        dot.style.display =
          "block";
      }

      showNormalStatus(
        phone
      );

      saveContacts();
    }
  );


  // ====================================================
  // OFFLINE / LAST SEEN
  // ====================================================

  socket.on(
    "user-offline",
    ({
      phone,
      lastSeen,
    }) => {
      if (
        !contacts[phone]
      ) {
        return;
      }

      contacts[
        phone
      ].online = false;

      contacts[
        phone
      ].lastSeen =
        lastSeen;

      const dot =
        document.getElementById(
          "dot_" + phone
        );

      if (dot) {
        dot.style.display =
          "none";
      }

      showNormalStatus(
        phone
      );

      saveContacts();
    }
  );


  // ====================================================
  // INCOMING CALL
  // ====================================================

  socket.on(
    "incoming-call",
    ({
      fromPhone,
      fromName,
      offer,
      callType,
    }) => {
      ringtone
        .play()
        .catch(() => {});

      pendingCall = {
        fromPhone,
        fromName,
        offer,
        callType,
      };

      if (
        !contacts[
          fromPhone
        ]
      ) {
        contacts[
          fromPhone
        ] = {
          phone:
            fromPhone,

          username:
            fromName,

          online:
            true,

          lastSeen:
            null,

          messages:
            [],

          unread:
            0,

          lastMsg:
            "",

          lastTime:
            "",
        };

        renderContactItem(
          contacts[
            fromPhone
          ]
        );

        saveContacts();
      }

      const name =
        document.getElementById(
          "inc-name"
        );

      const type =
        document.getElementById(
          "inc-type"
        );

      if (name) {
        name.textContent =
          fromName;
      }

      if (type) {
        type.textContent =
          callType === "video"
            ? "Incoming video call..."
            : "Incoming voice call...";
      }

      setAvatar(
        document.getElementById(
          "inc-avatar"
        ),
        fromName,
        fromPhone,
        72
      );

      document
        .getElementById(
          "modal-call"
        )
        ?.classList.remove(
          "hidden"
        );
    }
  );


  // ====================================================
  // CALL REJECTED
  // ====================================================

  socket.on(
    "call-rejected",
    () => {
      stopRingtone();
      closeCallOverlay();
    }
  );


  // ====================================================
  // CALL ENDED
  // ====================================================

  socket.on(
    "call-ended",
    () => {
      stopRingtone();
      closeCallOverlay();
    }
  );
}


// ======================================================
// ADD CONTACT MODAL
// ======================================================

document
  .getElementById(
    "add-contact-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      const input =
        document.getElementById(
          "add-phone-input"
        );

      const result =
        document.getElementById(
          "add-result"
        );

      const searchButton =
        document.getElementById(
          "search-btn"
        );

      if (input) {
        input.value = "";
      }

      if (result) {
        result.className =
          "add-result";

        result.textContent =
          "";
      }

      if (searchButton) {
        searchButton.textContent =
          "Search";

        searchButton.onclick =
          searchContact;
      }

      document
        .getElementById(
          "modal-add"
        )
        ?.classList.remove(
          "hidden"
        );

      setTimeout(() => {
        input?.focus();
      }, 100);
    }
  );


document
  .getElementById(
    "cancel-add-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      document
        .getElementById(
          "modal-add"
        )
        ?.classList.add(
          "hidden"
        );
    }
  );


document
  .getElementById(
    "search-btn"
  )
  ?.addEventListener(
    "click",
    searchContact
  );


document
  .getElementById(
    "add-phone-input"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter"
      ) {
        searchContact();
      }
    }
  );


function searchContact() {
  if (!socket) return;

  const phone =
    document
      .getElementById(
        "add-phone-input"
      )
      .value.replace(
        /\D/g,
        ""
      );

  if (phone.length !== 10) {
    shake(
      document.getElementById(
        "add-phone-input"
      )
    );

    return;
  }

  socket.emit(
    "find-contact",
    {
      phone,
    }
  );
}


function addContact(
  contact
) {
  if (
    contacts[
      contact.phone
    ]
  ) {
    return;
  }

  contacts[
    contact.phone
  ] = {
    phone:
      contact.phone,

    username:
      contact.username,

    online:
      Boolean(
        contact.online
      ),

    lastSeen:
      contact.lastSeen ||
      null,

    messages:
      [],

    unread:
      0,

    lastMsg:
      "",

    lastTime:
      "",
  };

  saveContacts();

  socket.emit(
    "save-contact",
    {
      contactPhone:
        contact.phone,

      contactName:
        contact.username,
    }
  );

  renderContactItem(
    contacts[
      contact.phone
    ]
  );

  updateEmptyState();
}


// ======================================================
// RENDER CONTACT
// ======================================================

function renderContactItem(
  contact
) {
  document
    .querySelector(
      `.contact-item[data-phone="${contact.phone}"]`
    )
    ?.remove();

  const li =
    document.createElement(
      "li"
    );

  li.className =
    "contact-item";

  li.dataset.phone =
    contact.phone;


  const avatar =
    document.createElement(
      "div"
    );

  avatar.className =
    "avatar";

  setAvatar(
    avatar,
    contact.username,
    contact.phone
  );


  const info =
    document.createElement(
      "div"
    );

  info.className =
    "info";


  const name =
    document.createElement(
      "div"
    );

  name.className =
    "cname";

  name.textContent =
    contact.username;


  const last =
    document.createElement(
      "div"
    );

  last.className =
    "clast";

  last.id =
    "last_" +
    contact.phone;

  last.textContent =
    contact.lastMsg ||
    "+91 " +
      contact.phone;


  info.append(
    name,
    last
  );


  const meta =
    document.createElement(
      "div"
    );

  meta.className =
    "cmeta";


  const time =
    document.createElement(
      "div"
    );

  time.className =
    "ctime";

  time.id =
    "time_" +
    contact.phone;

  time.textContent =
    contact.lastTime || "";


  const badge =
    document.createElement(
      "div"
    );

  badge.className =
    "unread-badge";

  badge.id =
    "badge_" +
    contact.phone;

  badge.style.display =
    contact.unread > 0
      ? "flex"
      : "none";

  badge.textContent =
    contact.unread || "";


  const dot =
    document.createElement(
      "div"
    );

  dot.className =
    "online-dot";

  dot.id =
    "dot_" +
    contact.phone;

  dot.style.display =
    contact.online
      ? "block"
      : "none";


  meta.append(
    time,
    badge,
    dot
  );

  li.append(
    avatar,
    info,
    meta
  );

  li.addEventListener(
    "click",
    () => {
      openChat(
        contact.phone
      );
    }
  );

  const list =
    document.getElementById(
      "contacts-list"
    );

  list
    ?.querySelector(
      ".empty-contacts"
    )
    ?.remove();

  list?.prepend(li);
}


// ======================================================
// EMPTY CONTACTS
// ======================================================

function updateEmptyState() {
  const list =
    document.getElementById(
      "contacts-list"
    );

  if (!list) return;

  list
    .querySelector(
      ".empty-contacts"
    )
    ?.remove();

  if (
    Object.keys(
      contacts
    ).length !== 0
  ) {
    return;
  }

  const li =
    document.createElement(
      "li"
    );

  li.className =
    "empty-contacts";

  li.innerHTML = `
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#ccc"
      stroke-width="1.5"
    >
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>

    <p>
      No contacts yet.<br>
      Click + to add a friend.
    </p>
  `;

  list.appendChild(li);
}


// ======================================================
// SEARCH CONTACT LIST
// ======================================================

document
  .getElementById(
    "search-input"
  )
  ?.addEventListener(
    "input",
    function () {
      const query =
        this.value
          .toLowerCase()
          .trim();

      document
        .querySelectorAll(
          ".contact-item"
        )
        .forEach(
          (item) => {
            const name =
              item
                .querySelector(
                  ".cname"
                )
                ?.textContent
                .toLowerCase() ||
              "";

            const phone =
              item.dataset.phone ||
              "";

            item.style.display =
              name.includes(
                query
              ) ||
              phone.includes(
                query
              )
                ? ""
                : "none";
          }
        );
    }
  );


// ======================================================
// OPEN CHAT
// ======================================================

function openChat(phone) {
  const contact =
    contacts[phone];

  if (!contact) return;

  activePhone = phone;

  document
    .querySelectorAll(
      ".contact-item"
    )
    .forEach(
      (item) => {
        item.classList.remove(
          "active"
        );
      }
    );

  document
    .querySelector(
      `.contact-item[data-phone="${phone}"]`
    )
    ?.classList.add(
      "active"
    );

  contact.unread = 0;

  const badge =
    document.getElementById(
      "badge_" + phone
    );

  if (badge) {
    badge.style.display =
      "none";
  }

  saveContacts();


  document
    .getElementById(
      "chat-area"
    )
    ?.classList.add(
      "active-chat"
    );

  document
    .getElementById(
      "chat-empty"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById(
      "chat-header"
    )
    ?.classList.remove(
      "hidden"
    );

  document
    .getElementById(
      "messages"
    )
    ?.classList.remove(
      "hidden"
    );

  // Old typing bar no longer needed.
  document
    .getElementById(
      "typing-bar"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById(
      "input-bar"
    )
    ?.classList.remove(
      "hidden"
    );


  const name =
    document.getElementById(
      "chat-contact-name"
    );

  if (name) {
    name.textContent =
      contact.username;
  }


  setAvatar(
    document.getElementById(
      "chat-avatar"
    ),

    contact.username,
    contact.phone,
    38
  );


  showNormalStatus(
    phone
  );


  socket.emit(
    "load-messages",
    {
      otherPhone:
        phone,
    }
  );


  document
    .getElementById(
      "msg-input"
    )
    ?.focus();
}


// ======================================================
// MOBILE BACK
// ======================================================

document
  .getElementById(
    "chat-back-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      document
        .getElementById(
          "chat-area"
        )
        ?.classList.remove(
          "active-chat"
        );

      activePhone = null;
    }
  );


// ======================================================
// NORMAL ONLINE / LAST SEEN STATUS
// ======================================================

function showNormalStatus(
  phone
) {
  if (
    phone !== activePhone
  ) {
    return;
  }

  const contact =
    contacts[phone];

  if (!contact) return;

  const status =
    document.getElementById(
      "chat-contact-status"
    );

  if (!status) return;

  if (contact.online) {
    status.textContent =
      "online";

    return;
  }

  if (contact.lastSeen) {
    status.textContent =
      "last seen " +
      formatLastSeen(
        contact.lastSeen
      );

    return;
  }

  status.textContent =
    "offline";
}


function formatLastSeen(
  dateValue
) {
  const date =
    new Date(dateValue);

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return "";
  }

  const now =
    new Date();

  const time =
    date.toLocaleTimeString(
      [],
      {
        hour: "2-digit",
        minute: "2-digit",
      }
    );

  if (
    date.toDateString() ===
    now.toDateString()
  ) {
    return (
      "today at " +
      time
    );
  }

  const yesterday =
    new Date(now);

  yesterday.setDate(
    now.getDate() - 1
  );

  if (
    date.toDateString() ===
    yesterday.toDateString()
  ) {
    return (
      "yesterday at " +
      time
    );
  }

  return (
    date.toLocaleDateString() +
    " at " +
    time
  );
}


// ======================================================
// SEND MESSAGE
// ======================================================

document
  .getElementById(
    "send-btn"
  )
  ?.addEventListener(
    "click",
    sendMsg
  );


document
  .getElementById(
    "msg-input"
  )
  ?.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        event.preventDefault();

        sendMsg();
      }
    }
  );


document
  .getElementById(
    "msg-input"
  )
  ?.addEventListener(
    "input",
    function () {
      autoResize(this);

      if (
        !socket ||
        !activePhone
      ) {
        return;
      }

      if (!myTyping) {
        myTyping = true;

        socket.emit(
          "typing",
          {
            toPhone:
              activePhone,

            isTyping:
              true,
          }
        );
      }

      clearTimeout(
        myTypingTimer
      );

      const typingPhone =
        activePhone;

      myTypingTimer =
        setTimeout(
          () => {
            myTyping = false;

            if (
              socket &&
              typingPhone
            ) {
              socket.emit(
                "typing",
                {
                  toPhone:
                    typingPhone,

                  isTyping:
                    false,
                }
              );
            }
          },

          1200
        );
    }
  );


function sendMsg() {
  if (
    !socket ||
    !activePhone
  ) {
    return;
  }

  const input =
    document.getElementById(
      "msg-input"
    );

  const text =
    input.value.trim();

  if (!text) return;

  socket.emit(
    "send-message",
    {
      toPhone:
        activePhone,

      message:
        text,
    }
  );

  input.value = "";

  autoResize(input);

  myTyping = false;

  clearTimeout(
    myTypingTimer
  );

  socket.emit(
    "typing",
    {
      toPhone:
        activePhone,

      isTyping:
        false,
    }
  );
}


// ======================================================
// MESSAGE BUBBLE
// ======================================================

function appendBubble(
  message,
  scroll = true
) {
  const messagesElement =
    document.getElementById(
      "messages"
    );

  if (!messagesElement) return;


  // WRAPPER
  const wrapper =
    document.createElement("div");

  wrapper.className =
    "bubble-wrap " +
    (
      message.from === "me"
        ? "mine"
        : "theirs"
    );

  if (message.id) {
    wrapper.dataset.messageId =
      message.id;
  }


  // BUBBLE
  const bubble =
    document.createElement("div");

  bubble.className = "bubble";


  // TEXT
  const text =
    document.createElement("span");

  text.className =
    "message-text";

  text.textContent =
    message.text;


  // META
  const meta =
    document.createElement("span");

  meta.className =
    "message-meta";


  if (message.edited) {
    const edited =
      document.createElement("span");

    edited.className =
      "edited-label";

    edited.textContent =
      "edited";

    meta.appendChild(edited);
  }


  const time =
    document.createElement("span");

  time.className =
    "btime";

  time.textContent =
    message.timestamp || "";

  meta.appendChild(time);


  bubble.appendChild(text);
  bubble.appendChild(meta);


  // ==========================================
  // OWN MESSAGE → MENU
  // ==========================================

  if (
    message.from === "me" &&
    message.id
  ) {

    const menuButton =
      document.createElement(
        "button"
      );

    menuButton.className =
      "message-menu-btn";

    menuButton.type =
      "button";

    menuButton.textContent =
      "⋮";

    menuButton.title =
      "Message options";


    const menu =
      document.createElement(
        "div"
      );

    menu.className =
      "message-menu hidden";


    // EDIT
    const editButton =
      document.createElement(
        "button"
      );

    editButton.type =
      "button";

    editButton.textContent =
      "Edit";


    editButton.addEventListener(
      "click",
      () => {

        menu.classList.add(
          "hidden"
        );

        editMessage(
          message.id,
          message.text
        );
      }
    );


    // DELETE
    const deleteButton =
      document.createElement(
        "button"
      );

    deleteButton.type =
      "button";

    deleteButton.className =
      "delete-option";

    deleteButton.textContent =
      "Delete";


    deleteButton.addEventListener(
      "click",
      () => {

        menu.classList.add(
          "hidden"
        );

        deleteMessage(
          message.id
        );
      }
    );


    menu.appendChild(
      editButton
    );

    menu.appendChild(
      deleteButton
    );


    menuButton.addEventListener(
      "click",
      (event) => {

        event.stopPropagation();

        document
          .querySelectorAll(
            ".message-menu"
          )
          .forEach((otherMenu) => {

            if (
              otherMenu !== menu
            ) {
              otherMenu.classList.add(
                "hidden"
              );
            }

          });

        menu.classList.toggle(
          "hidden"
        );
      }
    );


    wrapper.appendChild(
      menuButton
    );

    wrapper.appendChild(
      menu
    );
  }


  wrapper.appendChild(
    bubble
  );

  messagesElement.appendChild(
    wrapper
  );


  if (scroll) {
    messagesElement.scrollTop =
      messagesElement.scrollHeight;
  }
}



function editMessage(
  messageId,
  currentText
) {
  if (
    !socket ||
    !messageId
  ) {
    return;
  }

  const newText =
    prompt(
      "Edit message:",
      currentText
    );

  // Cancel
  if (newText === null) {
    return;
  }

  const cleanText =
    newText.trim();

  if (!cleanText) {
    alert(
      "Message cannot be empty."
    );

    return;
  }

  if (
    cleanText === currentText
  ) {
    return;
  }

  socket.emit(
    "edit-message",
    {
      messageId,
      newMessage:
        cleanText,
    }
  );
}


function deleteMessage(
  messageId
) {
  if (
    !socket ||
    !messageId
  ) {
    return;
  }

  const confirmed =
    confirm(
      "Delete this message for everyone?"
    );

  if (!confirmed) {
    return;
  }

  socket.emit(
    "delete-message",
    {
      messageId,
    }
  );
}

// ======================================================
// UPDATE LAST MESSAGE
// ======================================================

function updateLastMsg(
  phone,
  text,
  time
) {
  const last =
    document.getElementById(
      "last_" + phone
    );

  const timeElement =
    document.getElementById(
      "time_" + phone
    );

  if (last) {
    last.textContent =
      text;
  }

  if (timeElement) {
    timeElement.textContent =
      time;
  }
}


// ======================================================
// CALL UI
// ======================================================

function initCallUI(
  peerPhone,
  peerName,
  type
) {
  document
    .getElementById(
      "call-overlay"
    )
    ?.classList.remove(
      "hidden"
    );

  const name =
    document.getElementById(
      "call-peer-name"
    );

  const status =
    document.getElementById(
      "call-status-text"
    );

  if (name) {
    name.textContent =
      peerName;
  }

  if (status) {
    status.textContent =
      "Connecting...";
  }


  const audioAvatar =
    document.getElementById(
      "audio-avatar"
    );

  const remoteVideo =
    document.getElementById(
      "remote-video"
    );

  const localVideo =
    document.getElementById(
      "local-video"
    );

  const btnCam =
    document.getElementById(
      "btn-cam"
    );

  const btnSpeaker =
    document.getElementById(
      "btn-spk"
    );


  setAvatar(
    audioAvatar,
    peerName,
    peerPhone,
    120
  );


  // Speaker button default OFF
  btnSpeaker?.classList.remove(
    "active"
  );

  if (remoteVideo) {
    remoteVideo.volume =
      0.4;
  }


  if (type === "video") {
    remoteVideo?.classList.remove(
      "hidden"
    );

    localVideo?.classList.remove(
      "hidden"
    );

    audioAvatar?.classList.add(
      "hidden"
    );

    btnCam?.classList.remove(
      "hidden"
    );

    btnCam?.classList.remove(
      "active"
    );
  } else {
    remoteVideo?.classList.add(
      "hidden"
    );

    localVideo?.classList.add(
      "hidden"
    );

    audioAvatar?.classList.remove(
      "hidden"
    );

    btnCam?.classList.add(
      "hidden"
    );
  }
}


// ======================================================
// VOICE CALL
// ======================================================

document
  .getElementById(
    "voice-call-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      if (
        !activePhone ||
        !rtc
      ) {
        return;
      }

      const contact =
        contacts[
          activePhone
        ];

      initCallUI(
        activePhone,
        contact.username,
        "audio"
      );

      rtc.startCall(
        activePhone,
        "audio"
      );
    }
  );


// ======================================================
// VIDEO CALL
// ======================================================

document
  .getElementById(
    "video-call-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      if (
        !activePhone ||
        !rtc
      ) {
        return;
      }

      const contact =
        contacts[
          activePhone
        ];

      initCallUI(
        activePhone,
        contact.username,
        "video"
      );

      rtc.startCall(
        activePhone,
        "video"
      );
    }
  );


// ======================================================
// ACCEPT CALL
// ======================================================

document
  .getElementById(
    "btn-accept"
  )
  ?.addEventListener(
    "click",
    async () => {
      stopRingtone();

      if (
        !pendingCall ||
        !rtc
      ) {
        return;
      }

      const call = {
        ...pendingCall,
      };

      pendingCall = null;

      document
        .getElementById(
          "modal-call"
        )
        ?.classList.add(
          "hidden"
        );

      initCallUI(
        call.fromPhone,
        call.fromName,
        call.callType
      );

      await rtc.acceptCall(
        call.fromPhone,
        call.offer,
        call.callType
      );
    }
  );


// ======================================================
// REJECT CALL
// ======================================================

document
  .getElementById(
    "btn-reject"
  )
  ?.addEventListener(
    "click",
    () => {
      stopRingtone();

      if (
        pendingCall &&
        socket
      ) {
        socket.emit(
          "reject-call",
          {
            toPhone:
              pendingCall
                .fromPhone,
          }
        );
      }

      pendingCall = null;

      document
        .getElementById(
          "modal-call"
        )
        ?.classList.add(
          "hidden"
        );
    }
  );


// ======================================================
// HANGUP
// ======================================================

document
  .getElementById(
    "btn-hangup"
  )
  ?.addEventListener(
    "click",
    () => {
      rtc?.hangup();

      closeCallOverlay();
    }
  );


// ======================================================
// MUTE
// RTC handles active class itself.
// DO NOT toggle it again here.
// ======================================================

document
  .getElementById(
    "btn-mute"
  )
  ?.addEventListener(
    "click",
    () => {
      rtc?.toggleMute();
    }
  );


// ======================================================
// CAMERA
// RTC handles UI itself.
// ======================================================

document
  .getElementById(
    "btn-cam"
  )
  ?.addEventListener(
    "click",
    () => {
      rtc?.toggleCam();
    }
  );


// ======================================================
// SPEAKER BUTTON
//
// IMPORTANT:
// Browser volume is controlled here.
// Physical phone speaker/earpiece routing depends on browser/device.
// ======================================================

document
  .getElementById(
    "btn-spk"
  )
  ?.addEventListener(
    "click",
    function () {
      const remoteVideo =
        document.getElementById(
          "remote-video"
        );

      if (!remoteVideo) {
        return;
      }

      this.classList.toggle(
        "active"
      );

      if (
        this.classList.contains(
          "active"
        )
      ) {
        remoteVideo.volume =
          1;
      } else {
        remoteVideo.volume =
          0.4;
      }
    }
  );


// ======================================================
// LOGOUT
// ======================================================

document
  .getElementById(
    "logout-btn"
  )
  ?.addEventListener(
    "click",
    () => {
      const confirmed =
        confirm(
          "Logout from FriendCall?"
        );

      if (!confirmed) {
        return;
      }

      localStorage.removeItem(
        "friendcall_token"
      );

      if (socket) {
        socket.disconnect();
      }

      location.reload();
    }
  );


// ======================================================
// STOP RINGTONE
// ======================================================

function stopRingtone() {
  ringtone.pause();

  ringtone.currentTime =
    0;
}


// ======================================================
// CLOSE CALL UI
// ======================================================

function closeCallOverlay() {
  document
    .getElementById(
      "call-overlay"
    )
    ?.classList.add(
      "hidden"
    );

  document
    .getElementById(
      "modal-call"
    )
    ?.classList.add(
      "hidden"
    );

  pendingCall = null;
}


// ======================================================
// HTML ESCAPE
// ======================================================

function escHtml(value) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#039;"
    )
    .replace(
      /\n/g,
      "<br>"
    );
}


// ======================================================
// TEXTAREA AUTO RESIZE
// ======================================================

function autoResize(element) {
  if (!element) return;

  element.style.height =
    "auto";

  element.style.height =
    Math.min(
      element.scrollHeight,
      120
    ) + "px";
}


// ======================================================
// SHAKE
// ======================================================

function shake(element) {
  if (!element) return;

  element.style.animation =
    "none";

  element.offsetHeight;

  element.style.animation =
    "shake .3s ease";

  setTimeout(() => {
    element.style.animation =
      "";
  }, 400);
}


// ======================================================
// SHAKE CSS
// ======================================================

const shakeStyle =
  document.createElement(
    "style"
  );

shakeStyle.textContent = `
@keyframes shake {
  0%, 100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-6px);
  }

  75% {
    transform: translateX(6px);
  }
}
`;

document.head.appendChild(
  shakeStyle
);