"use strict";

const codes = ["NOISE", "FRAME", "PROXY", "PULSE"];
const params = new URLSearchParams(location.search);
const projector = params.has("projector");
const live = projector || params.has("live") || (location.protocol !== "file:" && !params.has("standalone"));

const progress = document.querySelector("#progress");
const note = document.querySelector("#session-note");
const deck = document.querySelector("#deck");
const deckStatus = document.querySelector("#deck-status");
const slideNumber = document.querySelector("#slide-number");
const slideImage = document.querySelector("#slide-image");
const projection = document.querySelector("#projection");
const projectionTitle = document.querySelector("#projection-title");
const projectedCode = document.querySelector("#projected-code");
const directory = document.querySelector("#directory");
const challenge = document.querySelector("#challenge");
const failure = document.querySelector("#failure");
const verified = document.querySelector("#verified");
const wall = document.querySelector("#wall");
const wallTitle = document.querySelector("#wall-title");
const wallSummary = document.querySelector("#wall-summary");
const wallDetail = document.querySelector("#wall-detail");
const verificationHeading = document.querySelector("#verification-heading");
const sharedHints = document.querySelectorAll("#shared-hint, #retry-hint");
const connectionStatus = document.querySelector("#connection-status");
const ports = directory.querySelectorAll("[data-port]");
const hint = document.querySelector("#clue-hint");
const form = document.querySelector("#challenge-form");
const answer = document.querySelector("#answer");
const check = form.querySelector("button");
const feedback = document.querySelector("#feedback");
const failureHint = document.querySelector("#failure-hint");
const retry = document.querySelector("#retry");
const restart = document.querySelector("#restart");
const normalize = (text) => text.replace(/\s/g, "").toUpperCase();
const solutions = codes.map(normalize);
const storageKey = `human-by-human:${solutions.join("|")}`;
let room = null;

if (!live && (solutions.length !== ports.length || solutions.some((code) => !code || code.length > answer.maxLength))) {
  ports.forEach((port) => port.removeAttribute("href"));
  note.textContent = "The four codes need to be configured by the presenter.";
  throw new Error("Configure one non-empty code per challenge, up to 40 characters each.");
}

function loadProgress() {
  try {
    return new Set((sessionStorage.getItem(storageKey) ?? "").split(",")
      .filter((id) => /^[1-4]$/.test(id)).map(Number));
  } catch (error) {
    note.textContent = "Progress cannot be saved here. Keep this tab open.";
    console.warn("Could not load saved progress.", error);
    return new Set();
  }
}

let completed = live ? new Set() : loadProgress();
const identity = live && !projector ? participantIdentity() : "";
const liveHeaders = projector ? { Authorization: `Bearer ${location.hash.slice(1)}` } : { "X-Participant": identity };
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeScreen = directory;
let glitchTimer;

function participantIdentity() {
  const token = Array.from(crypto.getRandomValues(new Uint8Array(16)), (value) => value.toString(16).padStart(2, "0")).join("");
  const key = "human-by-human:participant";
  try {
    const saved = sessionStorage.getItem(key);
    if (/^[a-f0-9]{32}$/.test(saved ?? "")) return saved;
    sessionStorage.setItem(key, token);
  } catch (error) {
    note.textContent = "This browser cannot keep progress after a refresh.";
    console.warn("Could not keep the participant token.", error);
  }
  return token;
}

function stopGlitches() {
  window.clearTimeout(glitchTimer);
  activeScreen.removeAttribute("data-glitch");
}

function scheduleGlitch(immediate = false) {
  if (motion.matches || document.hidden || [deck, projection, wall].includes(activeScreen)) return;
  const strong = activeScreen === failure;
  const delay = immediate ? 0 : strong ? 1700 + Math.random() * 1900 : 3600 + Math.random() * 4200;
  glitchTimer = window.setTimeout(() => {
    const offset = (strong ? 8 + Math.random() * 5 : 2 + Math.random() * 3) * (Math.random() < 0.5 ? -1 : 1);
    activeScreen.style.setProperty("--tear-offset", `${offset}px`);
    activeScreen.style.setProperty("--tear-position", `${14 + Math.random() * 64}%`);
    activeScreen.setAttribute("data-glitch", "");
    glitchTimer = window.setTimeout(() => {
      activeScreen.removeAttribute("data-glitch");
      scheduleGlitch();
    }, strong ? 680 : 340);
  }, delay);
}

function refreshGlitches() {
  stopGlitches();
  scheduleGlitch();
}

function saveProgress() {
  try {
    sessionStorage.setItem(storageKey, [...completed].join(","));
  } catch (error) {
    note.textContent = "Progress cannot be saved here. Keep this tab open.";
    console.warn("Could not save progress.", error);
  }
}

function resetInput() {
  form.reset();
  answer.removeAttribute("aria-invalid");
  feedback.textContent = "";
}

function renderDeck() {
  const src = !room?.slide ? "" : hostedApi ? `./slides/${room.slide}.webp` : `/slides/${room.slide}?run=${room.run}`;
  slideNumber.textContent = room?.slide ? `Slide ${room.slide} of ${room.total}` : "";
  if (src && slideImage.getAttribute("src") !== src) {
    slideImage.alt = `Slide ${room.slide} of ${room.total}`;
    slideImage.hidden = true;
    deckStatus.textContent = "Loading slide…";
    slideImage.src = src;
  } else if (!src) {
    slideImage.hidden = true;
    slideImage.removeAttribute("src");
    deckStatus.textContent = room ? "No slide images loaded." : "Connecting to the presentation…";
  }
}

function updateLiveText() {
  for (const item of sharedHints) {
    const text = room?.hint ? `Hint: ${room.hint}` : "";
    if (item.textContent !== text) item.textContent = text;
    item.hidden = !text;
  }
  if (room?.phase === "verified_wall") {
    const title = !projector && completed.size === ports.length
      ? "you are verified as human, by humans" : "Verified by humans";
    const summary = `${room.verified} verified`;
    if (wallTitle.textContent !== title) wallTitle.textContent = title;
    if (wallSummary.textContent !== summary) wallSummary.textContent = summary;
    const detail = projector ? "" : `You matched ${completed.size} of ${ports.length} codes.`;
    if (wallDetail.textContent !== detail) wallDetail.textContent = detail;
  }
}

function render(focusHeading, showFailure = false) {
  let route = location.hash.slice(1);
  const allMatched = completed.size === ports.length;
  let screen = directory;
  if (live) {
    const number = room?.challenge;
    route = number ? String(number) : "";
    if (room?.phase === "verified_wall") screen = wall;
    else if (projector && number) screen = projection;
    else if (!number || (completed.has(number) && !allMatched)) screen = deck;
    else if (allMatched) screen = verified;
    else screen = showFailure ? failure : challenge;
  } else {
    if (allMatched) route = "verified";
    else if (!/^[1-4]$/.test(route)) route = "";

    if (location.hash.slice(1) !== route) {
      history.replaceState(null, "", route ? `#${route}` : location.href.split("#")[0]);
    }
    if (route === "verified") screen = verified;
    else if (route) screen = showFailure ? failure : challenge;
  }

  const number = Number(route);
  stopGlitches();
  const entering = screen !== activeScreen;
  activeScreen = screen;
  document.body.classList.toggle("slide-mode", screen === deck);
  document.body.classList.toggle("auth-mode", live && (screen === challenge || screen === failure));
  for (const panel of [directory, deck, projection, challenge, failure, verified, wall]) {
    panel.hidden = panel !== screen;
  }

  const progressLabel = `${completed.size} of ${ports.length} matched`;
  if (progress.textContent !== progressLabel) progress.textContent = progressLabel;
  for (const port of ports) {
    const id = Number(port.dataset.port);
    const match = completed.has(id);
    port.toggleAttribute("data-complete", match);
    port.setAttribute("aria-label", `Challenge ${id}, ${match ? "matched" : "unchecked"}`);
  }

  resetInput();
  if (screen === challenge) {
    const match = completed.has(number);
    verificationHeading.hidden = !live;
    hint.textContent = live ? `CAPTCHA ${number}. Look at the projector.` : `Image ${number} on the slide.`;
    answer.disabled = match;
    check.disabled = match;
    if (match) feedback.textContent = "This code is already matched.";
  } else if (screen === failure) {
    failureHint.textContent = live ? "Check the code on the projector." : `Check image ${number} on the slide.`;
  } else if (screen === projection) {
    projectionTitle.textContent = `CAPTCHA ${number}`;
    projectedCode.textContent = room.code;
  } else if (screen === deck) {
    renderDeck();
  }
  if (live) updateLiveText();
  if (focusHeading && (entering || screen === challenge)) {
    screen.querySelector("h1").focus();
  }
  scheduleGlitch(screen === failure || (live && screen === challenge));
}

function finishAttempt(id, matched, synced = []) {
  if (!matched) {
    render(true, true);
    return;
  }
  completed.add(id);
  for (const item of synced) completed.add(item);
  if (!live) saveProgress();
  if (live) render(true);
  else location.hash = completed.size === ports.length ? "verified" : "";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = live ? room?.challenge : Number(location.hash.slice(1));
  if (!Number.isInteger(id) || id < 1 || id > ports.length || check.disabled) return;

  if (!normalize(answer.value)) {
    answer.setAttribute("aria-invalid", "true");
    feedback.textContent = "Enter a code first.";
    answer.focus();
    answer.select();
    return;
  }

  if (!live) {
    finishAttempt(id, normalize(answer.value) === solutions[id - 1]);
    return;
  }

  const attempt = room;
  const currentAttempt = () => room?.run === attempt.run && room.revision === attempt.revision;
  check.disabled = true;
  try {
    const response = await roomFetch("/api/check", {
      method: "POST",
      headers: { ...liveHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ run: attempt.run, revision: attempt.revision, answer: answer.value }),
    });
    const result = await response.json();
    if (!currentAttempt()) return;
    if (!response.ok) {
      feedback.textContent = result.error;
      return;
    }
    finishAttempt(id, result.matched, result.completed);
  } catch (error) {
    if (currentAttempt()) feedback.textContent = "Could not check the code. Try again.";
    console.warn("Could not check the code.", error);
  } finally {
    if (currentAttempt()) check.disabled = false;
  }
});

retry.addEventListener("click", () => render(true));
restart.addEventListener("click", () => {
  completed.clear();
  saveProgress();
  location.hash = "";
});

async function pollRoom() {
  const start = performance.now();
  let delay = syncInterval;
  try {
    const response = await roomFetch(projector ? "/api/projector" : "/api/state", {
      cache: "no-store",
      headers: liveHeaders,
    });
    if (!response.headers.get("Content-Type")?.includes("application/json")) {
      throw new Error("No live-room response. Check the backend URL.");
    }
    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error);
    }
    const next = await response.json();
    if (!next.phase || (!projector && !Array.isArray(next.matched))) {
      throw new Error("Update the live-room backend to match this website.");
    }
    const newRun = next.run !== room?.run;
    const changed = newRun || next.revision !== room.revision;
    const previousSize = completed.size;
    if (!projector) {
      if (newRun) completed = new Set();
      for (const item of next.matched) completed.add(item);
    }
    room = next;
    if (changed || completed.size !== previousSize) render(true);
    else updateLiveText();
    if (connectionStatus.textContent) connectionStatus.textContent = "";
  } catch (error) {
    const message = error instanceof TypeError || error.name === "TimeoutError"
      ? "Cannot reach the presentation. Reconnecting…" : error.message;
    if (connectionStatus.textContent !== message) connectionStatus.textContent = message;
    delay = 1500;
  } finally {
    window.setTimeout(pollRoom, Math.max(50, delay - (performance.now() - start)));
  }
}

if (live) {
  document.querySelectorAll(".back, #restart").forEach((control) => { control.hidden = true; });
  slideImage.addEventListener("load", () => {
    slideImage.hidden = false;
    deckStatus.textContent = "";
  });
  slideImage.addEventListener("error", () => {
    slideImage.hidden = true;
    deckStatus.textContent = "This slide image could not be loaded.";
  });
  pollRoom();
} else {
  window.addEventListener("hashchange", () => render(true));
}
document.addEventListener("visibilitychange", refreshGlitches);
motion.addEventListener("change", refreshGlitches);
render(location.hash.length > 1);
