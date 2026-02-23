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
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  runTransaction,
  query as firestoreQuery,
  where,
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
const CHAT_COOLDOWN_MS = 15 * 1000;
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
const roomHistoryList = document.getElementById("room-history-list");
const roomHistoryEmpty = document.getElementById("room-history-empty");
const tableTitle = document.getElementById("table-title");
const tableCodeLabel = document.getElementById("table-code");
const copyTableCodeButton = document.getElementById("copy-table-code");
const tableCreatedAtLabel = document.getElementById("table-created-at");
const tableTimer = document.getElementById("table-timer");
const darkModeToggleButton = document.getElementById("toggle-dark-mode");
const tableStageTitle = document.getElementById("table-stage-title");
const tableStageNote = document.getElementById("table-stage-note");
const tableImage = document.getElementById("table-image");

const chatEmpty = document.getElementById("chat-empty");
const chatLog = document.getElementById("chat-log");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const chatSendButton = document.getElementById("chat-send");
const chatCooldownLabel = document.getElementById("chat-cooldown");

const ambientMusicButton = document.getElementById("ambient-music");
const jazzMusicButton = document.getElementById("jazz-music");
const ambientVolumeWrap = document.getElementById("ambient-volume-wrap");
const jazzVolumeWrap = document.getElementById("jazz-volume-wrap");
const ambientVolumeStepsRoot = document.getElementById("ambient-volume-steps");
const jazzVolumeStepsRoot = document.getElementById("jazz-volume-steps");
const ambientVolumeSteps = Array.from(document.querySelectorAll("#ambient-volume-steps .volume-step"));
const jazzVolumeSteps = Array.from(document.querySelectorAll("#jazz-volume-steps .volume-step"));
const ambientPlayer = document.getElementById("ambient-player");
const jazzPlayer = document.getElementById("jazz-player");
const expiryModal = document.getElementById("expiry-modal");
const expiryMessage = document.getElementById("expiry-message");
const expiryOkButton = document.getElementById("expiry-ok");

const AMBIENT_CAFE_URL = "assets/music/ambient/cafe-ambient.mp3";
const JAZZ_TRACK_URLS = [
  "assets/music/jazz/jazz-1.mp3",
  "assets/music/jazz/jazz-2.mp3",
  "assets/music/jazz/jazz-3.mp3",
];
const DEFAULT_LOGO_URL = "assets/beans-logo.svg";
const DARK_MODE_LOGO_URL = "assets/beans-logo-light.svg";

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
let chatCooldownUntil = 0;
let chatCooldownInterval = null;
let isRoomDarkMode = false;
let isAmbientOn = false;
let isJazzOn = false;
let ambientVolume = 0.5;
let jazzVolume = 0.6;
let lastJazzTrackIndex = -1;
const renderedMessageIds = new Set();
const themedLogos = Array.from(document.querySelectorAll(".logo, .table-logo"));

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

function stopChatCooldownTicker() {
  if (chatCooldownInterval) {
    clearInterval(chatCooldownInterval);
    chatCooldownInterval = null;
  }
}

function getChatCooldownRemainingMs() {
  return Math.max(0, chatCooldownUntil - Date.now());
}

function updateChatSendUi() {
  const remainingMs = getChatCooldownRemainingMs();
  const isCoolingDown = remainingMs > 0;
  const secondsLeft = Math.ceil(remainingMs / 1000);

  if (chatCooldownLabel) {
    if (isCoolingDown) {
      chatCooldownLabel.textContent = `Wait ${secondsLeft}s before sending another message.`;
      chatCooldownLabel.classList.remove("hidden");
    } else {
      chatCooldownLabel.classList.add("hidden");
    }
  }

  if (chatSendButton) {
    if (isSendingChat) {
      chatSendButton.textContent = "Sending...";
      chatSendButton.disabled = true;
      return;
    }

    if (isCoolingDown) {
      chatSendButton.textContent = `Wait ${secondsLeft}s`;
      chatSendButton.disabled = true;
      return;
    }

    chatSendButton.textContent = "Send";
    chatSendButton.disabled = false;
  }
}

function clearChatCooldown() {
  chatCooldownUntil = 0;
  stopChatCooldownTicker();
  updateChatSendUi();
}

function startChatCooldown() {
  chatCooldownUntil = Date.now() + CHAT_COOLDOWN_MS;
  updateChatSendUi();
  stopChatCooldownTicker();
  chatCooldownInterval = setInterval(() => {
    if (getChatCooldownRemainingMs() <= 0) {
      clearChatCooldown();
      return;
    }
    updateChatSendUi();
  }, 250);
}

function updateRoomThemeUi() {
  appRoot.classList.toggle("room-dark", isRoomDarkMode);
  if (darkModeToggleButton) {
    darkModeToggleButton.textContent = `Dark mode: ${isRoomDarkMode ? "On" : "Off"}`;
  }
  const logoSrc = isRoomDarkMode ? DARK_MODE_LOGO_URL : DEFAULT_LOGO_URL;
  themedLogos.forEach((logo) => {
    logo.src = logoSrc;
  });
}

function resetRoomTheme() {
  isRoomDarkMode = false;
  updateRoomThemeUi();
}

function updateMusicModeUi() {
  if (ambientMusicButton) {
    ambientMusicButton.classList.toggle("is-on", isAmbientOn);
  }
  if (jazzMusicButton) {
    jazzMusicButton.classList.toggle("is-on", isJazzOn);
  }
  if (ambientVolumeWrap) {
    ambientVolumeWrap.classList.toggle("hidden", !isAmbientOn);
  }
  if (jazzVolumeWrap) {
    jazzVolumeWrap.classList.toggle("hidden", !isJazzOn);
  }
  updateVolumeStepsUi(ambientVolumeSteps, ambientVolume);
  updateVolumeStepsUi(jazzVolumeSteps, jazzVolume);
}

function getVolumeLevel(volume) {
  return Math.max(1, Math.min(10, Math.round(volume * 10)));
}

function updateVolumeStepsUi(stepButtons, volume) {
  const activeLevel = getVolumeLevel(volume);
  stepButtons.forEach((step) => {
    const level = Number(step.dataset.level || "0");
    const isActive = Number.isFinite(level) && level <= activeLevel;
    step.classList.toggle("is-active", isActive);
    step.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setAmbientVolumeFromLevel(level) {
  const normalizedLevel = Math.max(1, Math.min(10, Number(level) || 1));
  ambientVolume = normalizedLevel / 10;
  if (ambientPlayer) {
    ambientPlayer.volume = ambientVolume;
  }
  updateVolumeStepsUi(ambientVolumeSteps, ambientVolume);
}

function setJazzVolumeFromLevel(level) {
  const normalizedLevel = Math.max(1, Math.min(10, Number(level) || 1));
  jazzVolume = normalizedLevel / 10;
  if (jazzPlayer) {
    jazzPlayer.volume = jazzVolume;
  }
  updateVolumeStepsUi(jazzVolumeSteps, jazzVolume);
}

function wireVolumeStepControls() {
  ambientVolumeSteps.forEach((step) => {
    step.addEventListener("click", () => {
      setAmbientVolumeFromLevel(step.dataset.level);
    });
  });

  jazzVolumeSteps.forEach((step) => {
    step.addEventListener("click", () => {
      setJazzVolumeFromLevel(step.dataset.level);
    });
  });

  function handlePointerVolumeUpdate(container, event, setter) {
    if (!container) {
      return;
    }
    const rect = container.getBoundingClientRect();
    if (!rect.width) {
      return;
    }
    const relativeX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const ratio = relativeX / rect.width;
    const level = Math.max(1, Math.min(10, Math.ceil(ratio * 10)));
    setter(level);
  }

  function wireStepDrag(container, setter) {
    if (!container) {
      return;
    }

    container.addEventListener("pointerdown", (event) => {
      handlePointerVolumeUpdate(container, event, setter);
      if (typeof container.setPointerCapture === "function") {
        container.setPointerCapture(event.pointerId);
      }
    });

    container.addEventListener("pointermove", (event) => {
      if (event.buttons === 0 && event.pointerType !== "touch") {
        return;
      }
      handlePointerVolumeUpdate(container, event, setter);
    });
  }

  wireStepDrag(ambientVolumeStepsRoot, setAmbientVolumeFromLevel);
  wireStepDrag(jazzVolumeStepsRoot, setJazzVolumeFromLevel);
}

function applyMusicVolumes() {
  if (ambientPlayer) {
    ambientPlayer.volume = ambientVolume;
  }
  if (jazzPlayer) {
    jazzPlayer.volume = jazzVolume;
  }
}

function stopMusicPlayback() {
  if (ambientPlayer) {
    ambientPlayer.pause();
    ambientPlayer.removeAttribute("src");
    ambientPlayer.load();
  }

  if (jazzPlayer) {
    jazzPlayer.pause();
    jazzPlayer.removeAttribute("src");
    jazzPlayer.load();
  }
}

function resetMusicMode() {
  isAmbientOn = false;
  isJazzOn = false;
  lastJazzTrackIndex = -1;
  stopMusicPlayback();
  applyMusicVolumes();
  updateMusicModeUi();
}

function toggleAmbientMode() {
  isAmbientOn = !isAmbientOn;
  updateMusicModeUi();
  if (!ambientPlayer) {
    return;
  }

  if (!isAmbientOn) {
    ambientPlayer.pause();
    return;
  }

  if (ambientPlayer.src !== new URL(AMBIENT_CAFE_URL, window.location.href).toString()) {
    ambientPlayer.src = AMBIENT_CAFE_URL;
  }
  ambientPlayer.loop = true;
  ambientPlayer.volume = ambientVolume;
  ambientPlayer.play().catch(() => {
    isAmbientOn = false;
    updateMusicModeUi();
    alert("Tap again to enable audio playback.");
  });
}

function getNextJazzTrackIndex() {
  if (!JAZZ_TRACK_URLS.length) {
    return -1;
  }
  if (JAZZ_TRACK_URLS.length === 1) {
    return 0;
  }

  let candidate = Math.floor(Math.random() * JAZZ_TRACK_URLS.length);
  while (candidate === lastJazzTrackIndex) {
    candidate = Math.floor(Math.random() * JAZZ_TRACK_URLS.length);
  }
  return candidate;
}

function playJazzTrack() {
  if (!JAZZ_TRACK_URLS.length) {
    alert("No jazz tracks configured yet.");
    return;
  }

  if (!jazzPlayer || !isJazzOn) {
    return;
  }

  const nextIndex = getNextJazzTrackIndex();
  if (nextIndex < 0) {
    return;
  }

  lastJazzTrackIndex = nextIndex;
  jazzPlayer.loop = false;
  jazzPlayer.src = JAZZ_TRACK_URLS[nextIndex];
  jazzPlayer.volume = jazzVolume;
  jazzPlayer.play().catch(() => {
    isJazzOn = false;
    updateMusicModeUi();
    alert("Tap again to enable audio playback.");
  });
}

function toggleJazzMode() {
  if (!isJazzOn && !JAZZ_TRACK_URLS.length) {
    alert("No jazz tracks configured yet.");
    return;
  }

  isJazzOn = !isJazzOn;
  updateMusicModeUi();

  if (!jazzPlayer) {
    return;
  }

  if (!isJazzOn) {
    jazzPlayer.pause();
    return;
  }

  playJazzTrack();
}

function resetChatUi() {
  chatLog.innerHTML = "";
  renderedMessageIds.clear();
  chatEmpty.textContent = "No messages yet.";
  chatEmpty.classList.remove("hidden");
}

function resetTableStage() {
  tableImage.src = TABLE_IMAGE_BY_COUNT[1];
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

function formatRoomHistoryCreatedAt(createdAtMs) {
  if (!Number.isFinite(Number(createdAtMs))) {
    return "Started recently";
  }
  return `Created ${new Date(Number(createdAtMs)).toLocaleString()}`;
}

function clearRoomHistoryUi(message = "No tables created yet.") {
  if (roomHistoryList) {
    roomHistoryList.innerHTML = "";
  }
  if (roomHistoryEmpty) {
    roomHistoryEmpty.textContent = message;
    roomHistoryEmpty.classList.remove("hidden");
  }
}

function renderRoomHistory(rooms) {
  if (!roomHistoryList || !roomHistoryEmpty) {
    return;
  }

  roomHistoryList.innerHTML = "";
  if (!rooms.length) {
    clearRoomHistoryUi("No tables created yet.");
    return;
  }

  roomHistoryEmpty.classList.add("hidden");

  rooms.forEach((room) => {
    const item = document.createElement("div");
    item.className = "room-history-item";

    const name = document.createElement("div");
    name.className = "room-history-name";
    name.textContent = room.name || "Untitled table";

    const when = document.createElement("div");
    when.className = "room-history-time";
    when.textContent = formatRoomHistoryCreatedAt(room.createdAtMs);

    item.appendChild(name);
    item.appendChild(when);
    roomHistoryList.appendChild(item);
  });
}

async function loadCreatedRoomHistory() {
  const user = getAuthenticatedUser();
  if (!user) {
    clearRoomHistoryUi("Log in to see your table history.");
    return;
  }

  try {
    const roomsRef = collection(db, "rooms");
    const roomsQuery = firestoreQuery(roomsRef, where("createdBy", "==", user.uid));
    const snap = await getDocs(roomsQuery);

    const rooms = snap.docs
      .map((roomDoc) => {
        const data = roomDoc.data() || {};
        return {
          name: data.name || "Coffee Table",
          createdAtMs: Number(data.createdAtMs) || 0,
        };
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 12);

    renderRoomHistory(rooms);
  } catch (error) {
    clearRoomHistoryUi("Unable to load table history right now.");
  }
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
  clearChatCooldown();
  resetRoomTheme();
  resetMusicMode();
  resetChatUi();
  resetTableStage();
  userName.textContent = profile.name;
  userEmail.textContent = profile.email;
  authView.classList.add("hidden");
  dashboardView.classList.remove("hidden");
  tableView.classList.add("hidden");
  appRoot.classList.remove("room-active");
  loadCreatedRoomHistory();
}

function showAuth() {
  clearChatSubscription();
  clearTableTimer();
  clearTableExpiry();
  clearChatCooldown();
  resetRoomTheme();
  resetMusicMode();
  resetChatUi();
  resetTableStage();
  authView.classList.remove("hidden");
  dashboardView.classList.add("hidden");
  tableView.classList.add("hidden");
  appRoot.classList.remove("room-active");
  clearRoomHistoryUi("Log in to see your table history.");
}

function showTable(table) {
  startTableChat(table.code);
  startTableTimer(resolveCreatedAtMs(table));
  scheduleTableExpiry(table);
  updateRoomThemeUi();
  updateChatSendUi();
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
  clearChatCooldown();
  resetRoomTheme();
  resetMusicMode();
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

  if (getChatCooldownRemainingMs() > 0) {
    updateChatSendUi();
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
  updateChatSendUi();

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
    startChatCooldown();
    chatInput.value = "";
    chatInput.focus();
  } catch (error) {
    alert(error.message || "Unable to send message.");
  } finally {
    isSendingChat = false;
    updateChatSendUi();
  }
});

darkModeToggleButton.addEventListener("click", () => {
  if (!appRoot.classList.contains("room-active")) {
    return;
  }
  isRoomDarkMode = !isRoomDarkMode;
  updateRoomThemeUi();
});

ambientMusicButton.addEventListener("click", () => {
  toggleAmbientMode();
});

jazzMusicButton.addEventListener("click", () => {
  toggleJazzMode();
});

jazzPlayer.addEventListener("ended", () => {
  if (isJazzOn) {
    playJazzTrack();
  }
});

wireVolumeStepControls();
applyMusicVolumes();
updateMusicModeUi();

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
