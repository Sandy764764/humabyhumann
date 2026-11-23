"use strict";

const key = location.hash.slice(1);
const status = document.querySelector("#remote-status");
const error = document.querySelector("#remote-error");
const controls = document.querySelector("#remote-controls");
const projector = document.querySelector("#projector-link");
const online = document.querySelector("#online-count");
const verified = document.querySelector("#verified-count");
const auth = { Authorization: `Bearer ${key}` };
const hint = controls.querySelector('[data-action="hint"]');
const advance = controls.querySelector('[data-action="advance"]');
let commandVersion = 0;
let sending = false;

function updateControls(state) {
  const slide = state.total ? `Slide ${state.slide} of ${state.total}` : "No slide images loaded";
  const challenge = state.phase === "glitch_auth";
  const wall = state.phase === "verified_wall";
  const label = challenge ? `${slide} | CAPTCHA ${state.challenge} active` : wall ? "Verified wall" : slide;
  if (status.textContent !== label) status.textContent = label;
  if (online.textContent !== String(state.online)) online.textContent = state.online;
  if (verified.textContent !== String(state.verified)) verified.textContent = state.verified;
  controls.querySelector('[data-action="previous"]').disabled = state.slide <= 1;
  controls.querySelector('[data-action="next"]').disabled = state.slide >= state.total;
  controls.querySelector('[data-action="resume"]').disabled = state.phase === "slide";
  controls.querySelector('[data-action="wall"]').disabled = wall;
  hint.disabled = !challenge;
  hint.setAttribute("aria-pressed", String(Boolean(state.hint)));
  const hintLabel = state.hint ? "Hide hint" : "Show hint";
  if (hint.textContent !== hintLabel) hint.textContent = hintLabel;
  advance.disabled = !challenge;
}

async function request(path, data) {
  const response = await roomFetch(path, data ? {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  } : { headers: auth, cache: "no-store" });
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new Error("No live-room response. Check the backend URL.");
  }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Presenter command failed.");
  return result;
}

async function connect() {
  if (!key) {
    status.textContent = hostedApi ? "Open your private presenter URL." : "Open the private presenter URL printed in the terminal.";
    return;
  }
  const version = commandVersion;
  let delay = syncInterval;
  try {
    const state = await request("/api/host");
    if (!sending && version === commandVersion) {
      projector.href = `./?projector=1#${key}`;
      updateControls(state);
      controls.disabled = false;
    }
  } catch (problem) {
    if (!sending && version === commandVersion && status.textContent !== problem.message) {
      status.textContent = problem.message;
    }
    delay = 1500;
  } finally {
    window.setTimeout(connect, delay);
  }
}

controls.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || controls.disabled || sending) return;
  const { action, number } = button.dataset;
  if (action === "reset" && !window.confirm("Reset the slide and everyone's matches?")) return;
  commandVersion++;
  sending = true;
  controls.disabled = true;
  error.textContent = "";
  try {
    updateControls(await request("/api/control", { action, number: Number(number) }));
  } catch (problem) {
    error.textContent = problem.message;
  } finally {
    sending = false;
    controls.disabled = false;
  }
});

connect();
