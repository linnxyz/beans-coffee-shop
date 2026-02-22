import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  runTransaction,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-firestore.js";
import {
  getDatabase,
  ref,
  push,
  set,
  remove,
  query,
  limitToLast,
  onChildAdded,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

function requireFirebaseConfig(config, key) {
  const value = config && config[key];
  if (!value) {
    throw new Error(`Missing required Firebase config value: ${key}`);
  }
  return value;
}

const runtimeFirebaseConfig = window.__FIREBASE_CONFIG || {};

const firebaseConfig = {
  apiKey: requireFirebaseConfig(runtimeFirebaseConfig, "apiKey"),
  authDomain: requireFirebaseConfig(runtimeFirebaseConfig, "authDomain"),
  databaseURL: requireFirebaseConfig(runtimeFirebaseConfig, "databaseURL"),
  projectId: requireFirebaseConfig(runtimeFirebaseConfig, "projectId"),
  storageBucket: requireFirebaseConfig(runtimeFirebaseConfig, "storageBucket"),
  messagingSenderId: requireFirebaseConfig(runtimeFirebaseConfig, "messagingSenderId"),
  appId: requireFirebaseConfig(runtimeFirebaseConfig, "appId"),
  measurementId: requireFirebaseConfig(runtimeFirebaseConfig, "measurementId"),
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const rtdb = getDatabase(app);
const googleProvider = new GoogleAuthProvider();
const TABLE_TTL_MS = 10 * 60 * 1000;
const JOIN_MESSAGE_TEXT = "Hello! I just joined. (System Message)";
const LEAVE_MESSAGE_TEXT = "Bye! I just left. (System Message)";

const appRoot = document.getElementById("app");
const authView = document.getElementById("auth-view");
const dashboardView = document.getElementById("dashboard-view");
const tableView = document.getElementById("table-view");
const userName = document.getElementById("user-name");
const userEmail = document.getElementById("user-email");

const emailSignup = document.getElementById("email-signup");
const emailLogin = document.getElementById("email-login");
const googleLogin = document.getElementById("google-login");

const createTable = document.getElementById("create-table");
const memberJoin = document.getElementById("member-join");
const logoutButton = document.getElementById("logout");
const leaveTableButton = document.getElementById("leave-table");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const memberTableInput = document.getElementById("member-table");
const tableNameInput = document.getElementById("table-name");
const tableTitle = document.getElementById("table-title");
const tableCodeLabel = document.getElementById("table-code");
const copyTableCodeButton = document.getElementById("copy-table-code");
const tableCreatedAtLabel = document.getElementById("table-created-at");
const tableTimer = document.getElementById("table-timer");
const tableStageTitle = document.getElementById("table-stage-title");
const tableStageNote = document.getElementById("table-stage-note");
const tableImage = document.getElementById("table-image");

const chatEmpty = document.getElementById("chat-empty");
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendButton = document.getElementById("chat-send");

const musicUrlInput = document.getElementById("music-url");
const ambientMusicButton = document.getElementById("ambient-music");
const setMusicButton = document.getElementById("set-music");
const musicPlayer = document.getElementById("music-player");
const expiryModal = document.getElementById("expiry-modal");
const expiryMessage = document.getElementById("expiry-message");
const expiryOkButton = document.getElementById("expiry-ok");

const AMBIENT_CAFE_URL = "https://cdn.pixabay.com/audio/2022/03/15/audio_c8c8a73467.mp3";

const sessionClientId =
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const TABLE_IMAGE_BY_COUNT = {
  1: "assets/tables/table-1.png",
  2: "assets/tables/table-2.png",
  3: "assets/tables/table-3.png",
  4: "assets/tables/table-4.png",
  5: "assets/tables/table-5.png",
  6: "assets/tables/table-6.png",
};

let currentTableCode = "";
let joinedTableCode = "";
let stopChatListener = null;
let tableTimerInterval = null;
let tableExpiryTimeout = null;
let joinInFlight = null;
const announcedJoinTables = new Set();
const announcedLeaveTables = new Set();
let isSendingChat = false;
let lastChatSubmit = { key: "", at: 0 };
const renderedMessageIds = new Set();

function getAuthenticatedUid() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous || !user.uid) {
    return "";
  }
  return user.uid;
}

function getAuthenticatedCountFromRoomData(roomData) {
  if (roomData && Array.isArray(roomData.activeUserIds)) {
    return Math.max(1, roomData.activeUserIds.length);
  }
  const rawCount = Number((roomData && roomData.personCount) || 0);
  return Math.max(1, rawCount);
}

function getAuthenticatedUser() {
  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    return null;
  }
  return user;
}

function clearChatSubscription() {
  if (stopChatListener) {
    stopChatListener();
    stopChatListener = null;
  }
  currentTableCode = "";
}

function clearTableTimer() {
  if (tableTimerInterval) {
    clearInterval(tableTimerInterval);
    tableTimerInterval = null;
  }
  tableTimer.textContent = "00:00:00";
  tableCreatedAtLabel.textContent = "Started just now";
}

function clearTableExpiry() {
  if (tableExpiryTimeout) {
    clearTimeout(tableExpiryTimeout);
    tableExpiryTimeout = null;
  }
}

function resetChatUi() {
  chatLog.innerHTML = "";
  renderedMessageIds.clear();
  chatEmpty.textContent = "No messages yet.";
  chatEmpty.classList.remove("hidden");
}

function resetTableStage() {
  tableImage.src = TABLE_IMAGE_BY_COUNT[1];
  tableStageTitle.textContent = "Table for 1 guest";
  tableStageNote.textContent = "1 person at this table";
}

function formatMessageTime(timestamp) {
  if (!timestamp || Number.isNaN(Number(timestamp))) {
    return "";
  }
  const date = new Date(Number(timestamp));
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function appendChatMessage(message, messageId) {
  if (messageId && renderedMessageIds.has(messageId)) {
    return;
  }
  if (messageId) {
    renderedMessageIds.add(messageId);
  }

  chatEmpty.classList.add("hidden");

  const isOwn = auth.currentUser && message.senderUid && message.senderUid === auth.currentUser.uid;

  const item = document.createElement("div");
  item.className = `chat-message${isOwn ? " own" : ""}`;

  const meta = document.createElement("div");
  meta.className = "chat-message-meta";

  const sender = document.createElement("span");
  sender.textContent = message.senderName || "Guest";

  const time = document.createElement("span");
  time.textContent = formatMessageTime(message.timestamp);

  meta.appendChild(sender);
  meta.appendChild(time);

  const text = document.createElement("div");
  text.className = "chat-message-text";
  text.textContent = message.text || "";

  item.appendChild(meta);
  item.appendChild(text);
  chatLog.appendChild(item);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function getDisplayName(user) {
  if (user.displayName && user.displayName.trim()) {
    return user.displayName;
  }
  if (user.email) {
    return user.email.split("@")[0];
  }
  return "Customer";
}

function getImageTierForCount(count) {
  const safeCount = Number.isFinite(Number(count)) ? Math.max(1, Math.floor(Number(count))) : 1;
  return Math.min(6, safeCount);
}

function updateTableImageByCount(count) {
  const displayCount = Number.isFinite(Number(count)) ? Math.max(1, Math.floor(Number(count))) : 1;
  const tier = getImageTierForCount(displayCount);
  const imagePath = TABLE_IMAGE_BY_COUNT[tier] || TABLE_IMAGE_BY_COUNT[1];

  tableImage.src = imagePath;
  tableStageTitle.textContent = `Table for ${tier} ${tier === 1 ? "guest" : "guests"}`;
  tableStageNote.textContent = `${displayCount} ${displayCount === 1 ? "person" : "people"} at this table`;
}

function hashText(text) {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function buildChatMessageKey(tableCode, text) {
  const uidPart = (getAuthenticatedUid() || sessionClientId).replace(/[^a-zA-Z0-9_-]/g, "");
  const tablePart = tableCode.replace(/[^a-zA-Z0-9_-]/g, "");
  const timeBucket = Math.floor(Date.now() / 1500);
  const textHash = hashText(text.toLowerCase());
  return `${tablePart}_${uidPart}_${timeBucket}_${textHash}`;
}

function padTime(value) {
  return String(value).padStart(2, "0");
}

function formatElapsed(elapsedMs) {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
}

function formatCreatedAt(createdAtMs) {
  const date = new Date(createdAtMs);
  return `Started ${date.toLocaleString()}`;
}

function resolveCreatedAtMs(table) {
  if (!table) {
    return Date.now();
  }

  if (table.createdAtMs && Number.isFinite(Number(table.createdAtMs))) {
    return Number(table.createdAtMs);
  }

  const createdAt = table.createdAt;
  if (!createdAt) {
    return Date.now();
  }

  if (typeof createdAt.toMillis === "function") {
    return createdAt.toMillis();
  }

  if (createdAt.seconds && Number.isFinite(Number(createdAt.seconds))) {
    return Number(createdAt.seconds) * 1000;
  }

  return Date.now();
}

function startTableTimer(createdAtMs) {
  clearTableTimer();

  const baseCreatedAt = Number(createdAtMs) || Date.now();
  tableCreatedAtLabel.textContent = formatCreatedAt(baseCreatedAt);

  const update = () => {
    tableTimer.textContent = formatElapsed(Date.now() - baseCreatedAt);
  };

  update();
  tableTimerInterval = setInterval(update, 1000);
}

function handleAuthError(error) {
  alert(error.message || "Authentication failed.");
}

function showExpiryModal(customMessage) {
  if (customMessage) {
    expiryMessage.textContent = customMessage;
  } else {
    expiryMessage.textContent =
      "You've been cozy at this table for quite a while. The coffee shop is kindly asking you to move to a fresh table so others can sit too.";
  }
  expiryModal.classList.remove("hidden");
}

function hideExpiryModal() {
  expiryModal.classList.add("hidden");
}

async function clearTableRealtimeData(tableCode) {
  if (!tableCode) {
    return;
  }
  try {
    await remove(ref(rtdb, `roomMessages/${tableCode}`));
  } catch (error) {
    // noop
  }
}

function normalizeTableCode(rawCode) {
  return rawCode.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

function getRoomCodeText() {
  if (joinedTableCode) {
    return joinedTableCode;
  }
  const labelText = (tableCodeLabel && tableCodeLabel.textContent) || "";
  return normalizeTableCode(labelText.replace(/^\s*Code:\s*/i, ""));
}

function getTableCodeFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) {
    return "";
  }
  return normalizeTableCode(hash.split("/")[0]);
}

function setTableUrl(code) {
  const normalized = normalizeTableCode(code);
  window.location.hash = normalized;
}

function setBaseUrl() {
  window.location.hash = "";
}

async function getTableCountFromDb(tableCode) {
  const snap = await getDoc(doc(db, "rooms", tableCode));
  if (!snap.exists()) {
    return 1;
  }
  return getAuthenticatedCountFromRoomData(snap.data());
}

async function incrementTableCount(tableCode) {
  const authenticatedUid = getAuthenticatedUid();
  if (!authenticatedUid) {
    return getTableCountFromDb(tableCode);
  }

  const tableRef = doc(db, "rooms", tableCode);
  return runTransaction(db, async (transaction) => {
    const tableSnap = await transaction.get(tableRef);
    if (!tableSnap.exists()) {
      throw new Error("Table code not found.");
    }

    const tableData = tableSnap.data() || {};
    const activeUserIds = Array.isArray(tableData.activeUserIds) ? [...tableData.activeUserIds] : [];
    if (!activeUserIds.includes(authenticatedUid)) {
      activeUserIds.push(authenticatedUid);
    }
    const nextCount = activeUserIds.length;

    transaction.update(tableRef, {
      activeUserIds,
      personCount: nextCount,
    });

    return nextCount;
  });
}

async function decrementTableCount(tableCode) {
  if (!tableCode) {
    return;
  }

  const authenticatedUid = getAuthenticatedUid();
  if (!authenticatedUid) {
    return;
  }

  const tableRef = doc(db, "rooms", tableCode);
  try {
    await runTransaction(db, async (transaction) => {
      const tableSnap = await transaction.get(tableRef);
      if (!tableSnap.exists()) {
        return;
      }

      const tableData = tableSnap.data() || {};
      const activeUserIds = Array.isArray(tableData.activeUserIds)
        ? tableData.activeUserIds.filter((uid) => uid !== authenticatedUid)
        : [];
      const nextCount = activeUserIds.length;

      transaction.update(tableRef, {
        activeUserIds,
        personCount: nextCount,
      });
    });
  } catch (error) {
    // noop
  }
}

async function leaveJoinedTable() {
  if (!joinedTableCode) {
    return;
  }
  const codeToLeave = joinedTableCode;
  joinedTableCode = "";
  announcedJoinTables.delete(codeToLeave);
  await decrementTableCount(codeToLeave);
  if (getAuthenticatedUid()) {
    await announceLeaveToChat(codeToLeave);
  }
}

async function ensureJoinedTable(tableCode) {
  if (joinedTableCode === tableCode) {
    return getTableCountFromDb(tableCode);
  }

  if (joinInFlight && joinInFlight.code === tableCode) {
    return joinInFlight.promise;
  }

  const promise = (async () => {
    await leaveJoinedTable();
    const updatedCount = await incrementTableCount(tableCode);
    joinedTableCode = tableCode;
    if (getAuthenticatedUid()) {
      await announceJoinToChat(tableCode);
    }
    return updatedCount;
  })().finally(() => {
    if (joinInFlight && joinInFlight.code === tableCode) {
      joinInFlight = null;
    }
  });

  joinInFlight = { code: tableCode, promise };
  return promise;
}

async function announceJoinToChat(tableCode) {
  if (announcedJoinTables.has(tableCode)) {
    return;
  }
  try {
    await push(ref(rtdb, `roomMessages/${tableCode}`), {
      text: JOIN_MESSAGE_TEXT,
      type: "join_announce",
      senderName: getDisplayName(auth.currentUser),
      senderUid: auth.currentUser ? auth.currentUser.uid : null,
      senderId: sessionClientId,
      timestamp: Date.now(),
    });
    announcedJoinTables.add(tableCode);
    announcedLeaveTables.delete(tableCode);
  } catch (error) {
    // noop
  }
}

async function announceLeaveToChat(tableCode) {
  if (announcedLeaveTables.has(tableCode)) {
    return;
  }
  try {
    await push(ref(rtdb, `roomMessages/${tableCode}`), {
      text: LEAVE_MESSAGE_TEXT,
      type: "leave_announce",
      senderName: getDisplayName(auth.currentUser),
      senderUid: auth.currentUser ? auth.currentUser.uid : null,
      senderId: sessionClientId,
      timestamp: Date.now(),
    });
    announcedLeaveTables.add(tableCode);
  } catch (error) {
    // noop
  }
}

async function refreshTableCountAndImage(tableCode) {
  try {
    const count = await getTableCountFromDb(tableCode);
    updateTableImageByCount(count);
  } catch (error) {
    updateTableImageByCount(1);
  }
}

async function handleExpiredTable(tableCode, message) {
  await clearTableRealtimeData(tableCode);
  await leaveJoinedTable();
  showExpiryModal(message);
  clearChatSubscription();
  clearTableTimer();
  clearTableExpiry();
  setBaseUrl();
  const user = getAuthenticatedUser();
  if (user) {
    showDashboard({ name: getDisplayName(user), email: user.email || "" });
    return;
  }
  showAuth();
}

function getTableExpiryMs(table) {
  const createdAtMs = resolveCreatedAtMs(table);
  return createdAtMs + TABLE_TTL_MS;
}

function scheduleTableExpiry(table) {
  clearTableExpiry();
  const expiresAtMs = getTableExpiryMs(table);
  const remainingMs = expiresAtMs - Date.now();
  const tableCode = table.code;

  if (remainingMs <= 0) {
    handleExpiredTable(
      tableCode,
      "This table has reached the 10-minute café testing limit. The coffee shop is kindly asking everyone to move to a fresh table."
    );
    return;
  }

  tableExpiryTimeout = setTimeout(() => {
    handleExpiredTable(
      tableCode,
      "You've been hogging this table for so long that the coffee shop is asking you to leave:( Seems like your hard work annoyed them!"
    );
  }, remainingMs);
}

async function startTableChat(tableCode) {
  clearChatSubscription();
  resetChatUi();

  currentTableCode = tableCode;
  const tableMessagesRef = query(ref(rtdb, `roomMessages/${tableCode}`), limitToLast(100));

  stopChatListener = onChildAdded(
    tableMessagesRef,
    (snapshot) => {
      const messageId = snapshot.key;
      const message = snapshot.val();
      if (!message) {
        return;
      }
      appendChatMessage(message, messageId);
      if (
        (message.type === "join_announce" || message.type === "leave_announce") &&
        message.senderId !== sessionClientId
      ) {
        refreshTableCountAndImage(tableCode);
      }
    },
    (error) => {
      chatEmpty.textContent = error?.message || "Chat unavailable due to database permission settings.";
      chatEmpty.classList.remove("hidden");
    }
  );
}

function showDashboard(profile) {
  clearChatSubscription();
  clearTableTimer();
  clearTableExpiry();
  resetChatUi();
  resetTableStage();
  userName.textContent = profile.name;
  userEmail.textContent = profile.email;
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  tableView.classList.add("hidden");
  appRoot.classList.remove("room-active");
}

function showAuth() {
  clearChatSubscription();
  clearTableTimer();
  clearTableExpiry();
  resetChatUi();
  resetTableStage();
  authView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  tableView.classList.add("hidden");
  appRoot.classList.remove("room-active");
}

function showTable(table) {
  startTableChat(table.code);
  startTableTimer(resolveCreatedAtMs(table));
  scheduleTableExpiry(table);
  updateTableImageByCount(table.personCount || 1);
  tableTitle.textContent = table.name || "Coffee Table";
  tableCodeLabel.textContent = `Code: ${table.code}`;
  authView.classList.add("hidden");
  dashboardView.classList.add("hidden");
  tableView.classList.remove("hidden");
  appRoot.classList.add("room-active");
}

async function openTable(code, options = {}) {
  const shouldAlertWhenUnauthenticated = options.alertOnUnauthenticated !== false;
  const user = getAuthenticatedUser();
  if (!user) {
    if (shouldAlertWhenUnauthenticated) {
      alert("Please log in to join or create a table.");
    }
    showAuth();
    return;
  }

  const normalized = normalizeTableCode(code);
  if (!normalized) {
    alert("Invalid table code.");
    return;
  }

  try {
    const tableRef = doc(db, "rooms", normalized);
    const tableSnap = await getDoc(tableRef);
    if (!tableSnap.exists()) {
      alert("Table code not found.");
      return;
    }

    const tableData = tableSnap.data();
    const hydratedTable = { code: normalized, ...tableData };

    if (Date.now() >= getTableExpiryMs(hydratedTable)) {
      await handleExpiredTable(
        normalized,
        "This table has already closed after 10 minutes (testing mode). Please create or join a new table."
      );
      return;
    }

    hydratedTable.personCount = await ensureJoinedTable(normalized);

    if (!options.skipPush) {
      setTableUrl(normalized);
    }

    showTable(hydratedTable);
  } catch (error) {
    alert(error.message || "Unable to open table.");
  }
}

async function routeFromUrl(user) {
  const routeCode = getTableCodeFromHash();
  if (routeCode) {
    await openTable(routeCode, { skipPush: true, alertOnUnauthenticated: false });
    return;
  }

  await leaveJoinedTable();

  if (user && !user.isAnonymous) {
    showDashboard({ name: getDisplayName(user), email: user.email || "" });
    return;
  }
  showAuth();
}

function generateTableCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function checkUniqueTable(code) {
  const tableRef = doc(db, "rooms", code);
  const tableSnap = await getDoc(tableRef);
  return !tableSnap.exists();
}

emailSignup.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    alert("Please enter an email and password.");
    return;
  }

  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error) {
    handleAuthError(error);
  }
});

emailLogin.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();
  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    handleAuthError(error);
  }
});

googleLogin.addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    handleAuthError(error);
  }
});

createTable.addEventListener("click", async () => {
  const user = getAuthenticatedUser();
  if (!user) {
    alert("Please log in to create a table.");
    showAuth();
    return;
  }

  const tableName = tableNameInput.value.trim();
  if (!tableName) {
    alert("Enter a table name.");
    return;
  }

  let attempts = 0;
  let code = generateTableCode();
  while (!(await checkUniqueTable(code)) && attempts < 10) {
    code = generateTableCode();
    attempts += 1;
  }

  if (attempts >= 10) {
    alert("Unable to create a unique table code. Try again.");
    return;
  }

  try {
    const createdAtMs = Date.now();
    const tableRef = doc(db, "rooms", code);
    await setDoc(tableRef, {
      code,
      name: tableName,
      activeUserIds: [],
      personCount: 0,
      createdAtMs,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
    });
    setTableUrl(code);
    await openTable(code, { skipPush: true });
  } catch (error) {
    alert(error.message || "Unable to create table.");
  }
});

memberJoin.addEventListener("click", () => {
  if (!getAuthenticatedUser()) {
    alert("Please log in to join a table.");
    showAuth();
    return;
  }

  const code = memberTableInput.value.trim();
  if (!code) {
    alert("Enter a table code to join.");
    return;
  }
  openTable(code);
});

leaveTableButton.addEventListener("click", async () => {
  await leaveJoinedTable();
  clearChatSubscription();
  clearTableTimer();
  clearTableExpiry();
  resetChatUi();
  resetTableStage();
  setBaseUrl();

  const user = getAuthenticatedUser();
  if (user) {
    showDashboard({ name: getDisplayName(user), email: user.email || "" });
    return;
  }
  showAuth();
});

logoutButton.addEventListener("click", async () => {
  try {
    await leaveJoinedTable();
    clearChatSubscription();
    clearTableTimer();
    clearTableExpiry();
    resetChatUi();
    resetTableStage();
    await signOut(auth);
  } catch (error) {
    handleAuthError(error);
  }
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (isSendingChat) {
    return;
  }

  if (!currentTableCode) {
    alert("Join a table first.");
    return;
  }

  const text = chatInput.value.trim();
  if (!text) {
    return;
  }

  const dedupeKey = `${currentTableCode}::${text}`;
  const now = Date.now();
  if (lastChatSubmit.key === dedupeKey && now - lastChatSubmit.at < 1200) {
    return;
  }

  isSendingChat = true;
  if (chatSendButton) {
    chatSendButton.disabled = true;
  }

  try {
    const user = getAuthenticatedUser();
    if (!user) {
      alert("Please log in to send a message.");
      showAuth();
      return;
    }

    const tableRef = doc(db, "rooms", currentTableCode);
    const tableSnap = await getDoc(tableRef);
    if (!tableSnap.exists()) {
      alert("This table is no longer available.");
      return;
    }
    const tableData = { code: currentTableCode, ...tableSnap.data() };
    if (Date.now() >= getTableExpiryMs(tableData)) {
      await handleExpiredTable(
        currentTableCode,
        "This table has reached the 10-minute testing limit. Time to move to a new one."
      );
      return;
    }
    const messageKey = buildChatMessageKey(currentTableCode, text);
    await set(ref(rtdb, `roomMessages/${currentTableCode}/${messageKey}`), {
      text,
      senderName: getDisplayName(user),
      senderUid: user.uid,
      senderId: sessionClientId,
      timestamp: Date.now(),
      type: "chat",
    });
    lastChatSubmit = { key: dedupeKey, at: Date.now() };
    chatInput.value = "";
    chatInput.focus();
  } catch (error) {
    alert(error.message || "Unable to send message.");
  } finally {
    isSendingChat = false;
    if (chatSendButton) {
      chatSendButton.disabled = false;
    }
  }
});

setMusicButton.addEventListener("click", () => {
  const url = musicUrlInput.value.trim();
  if (!url) {
    alert("Paste a music URL first.");
    return;
  }

  musicPlayer.src = url;
  musicPlayer.play().catch(() => {
    // noop
  });
});

ambientMusicButton.addEventListener("click", () => {
  musicPlayer.src = AMBIENT_CAFE_URL;
  musicPlayer.play().catch(() => {
    alert("Tap play on the audio player if autoplay is blocked.");
  });
});

copyTableCodeButton.addEventListener("click", async () => {
  const code = getRoomCodeText();
  if (!code) {
    alert("No room code available yet.");
    return;
  }

  try {
    await navigator.clipboard.writeText(code);
    copyTableCodeButton.textContent = "Copied";
    setTimeout(() => {
      copyTableCodeButton.textContent = "Copy";
    }, 1200);
  } catch (error) {
    alert("Unable to copy automatically. Please copy the room code manually.");
  }
});

expiryOkButton.addEventListener("click", () => {
  hideExpiryModal();
});

onAuthStateChanged(auth, async (user) => {
  routeFromUrl(user);
});

window.addEventListener("hashchange", () => {
  routeFromUrl(auth.currentUser);
});

window.addEventListener("load", () => {
  routeFromUrl(auth.currentUser);
});

window.addEventListener("pagehide", () => {
  if (joinedTableCode) {
    decrementTableCount(joinedTableCode);
  }
});
