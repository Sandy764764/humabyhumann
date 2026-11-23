"use strict";

const codes = ["NOISE", "FRAME", "PROXY", "PULSE"];
const params = new URLSearchParams(location.search);
const projector = params.has("projector");
const live = projector || params.has("live") || (hostedApi !== "" && !params.has("standalone"));

const progress = document.querySelector("#progress");
const note = document.querySelector("#session-note");
const deck = document.querySelector("#deck");
const deckStatus = document.querySelector("#deck-status");
const slideImage = document.querySelector("#slide-image");
const projection = document.querySelector("#projection");
const projectionTitle = document.querySelector("#projection-title");
const projectedCode = document.querySelector("#projected-code");
const directory = document.querySelector("#directory");
const challenge = document.querySelector("#challenge");
const failure = document.querySelector("#failure");
const verified = document.querySelector("#verified");
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
let storageKey = `human-by-human:${solutions.join("|")}`;
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
const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
let activeScreen = directory;
let glitchTimer;

function stopGlitches() {
  window.clearTimeout(glitchTimer);
  activeScreen.removeAttribute("data-glitch");
}

function scheduleGlitch(immediate = false) {
  if (motion.matches || document.hidden || activeScreen === deck || activeScreen === projection) return;
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

function render(focusHeading, showFailure = false) {
  let route = location.hash.slice(1);
  const allMatched = completed.size === ports.length;
  let screen = directory;
  if (live) {
    const number = room?.challenge;
    route = number ? String(number) : "";
    if (projector && number) screen = projection;
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
  activeScreen = screen;
  for (const panel of [directory, deck, projection, challenge, failure, verified]) {
    panel.hidden = panel !== screen;
  }

  progress.textContent = `${completed.size} of ${ports.length} matched`;
  for (const port of ports) {
    const id = Number(port.dataset.port);
    const match = completed.has(id);
    port.toggleAttribute("data-complete", match);
    port.setAttribute("aria-label", `Challenge ${id}, ${match ? "matched" : "unchecked"}`);
  }

  resetInput();
  if (screen === challenge) {
    const match = completed.has(number);
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
  if (focusHeading) {
    screen.querySelector("h1").focus();
  }
  scheduleGlitch(screen === failure || (live && screen === challenge));
}

function finishAttempt(id, matched) {
  if (!matched) {
    render(true, true);
    return;
  }
  completed.add(id);
  saveProgress();
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
  check.disabled = true;
  try {
    const response = await roomFetch("/api/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run: attempt.run, revision: attempt.revision, answer: answer.value }),
    });
    if (attempt !== room) return;
    const result = await response.json();
    if (attempt !== room) return;
    if (!response.ok) {
      feedback.textContent = result.error;
      return;
    }
    finishAttempt(id, result.matched);
  } catch (error) {
    if (attempt === room) feedback.textContent = "Could not check the code. Try again.";
    console.warn("Could not check the code.", error);
  } finally {
    if (attempt === room) check.disabled = false;
  }
});

retry.addEventListener("click", () => render(true));
restart.addEventListener("click", () => {
  completed.clear();
  saveProgress();
  location.hash = "";
});

async function pollRoom() {
  try {
    const response = await roomFetch(projector ? "/api/projector" : "/api/state", {
      cache: "no-store",
      headers: projector ? { Authorization: `Bearer ${location.hash.slice(1)}` } : {},
    });
    if (!response.ok) {
      const { error } = await response.json();
      throw new Error(error);
    }
    const next = await response.json();
    if (!projector && next.run !== room?.run) {
      storageKey = `human-by-human:live:${next.run}`;
      completed = loadProgress();
    }
    if (next.run !== room?.run || next.revision !== room.revision) {
      room = next;
      render(true);
    }
    document.querySelector("#connection-status").textContent = "";
  } catch (error) {
    const status = document.querySelector("#connection-status");
    status.textContent = error instanceof TypeError ? "Cannot reach the presentation. Reconnecting…" : error.message;
  } finally {
    window.setTimeout(pollRoom, 700);
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
