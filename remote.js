"use strict";

const key = location.hash.slice(1);
const status = document.querySelector("#remote-status");
const error = document.querySelector("#remote-error");
const controls = document.querySelector("#remote-controls");
const projector = document.querySelector("#projector-link");
const auth = { Authorization: `Bearer ${key}` };

function updateControls(state) {
  const slide = state.total ? `Slide ${state.slide} of ${state.total}` : "No slide images loaded";
  status.textContent = state.challenge ? `${slide} | CAPTCHA ${state.challenge} active` : slide;
  controls.querySelector('[data-action="previous"]').disabled = state.slide <= 1;
  controls.querySelector('[data-action="next"]').disabled = state.slide >= state.total;
  controls.querySelector('[data-action="resume"]').disabled = !state.challenge;
}

async function request(path, data) {
  const response = await roomFetch(path, data ? {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(data),
  } : { headers: auth });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Presenter command failed.");
  return result;
}

async function connect() {
  if (!key) {
    status.textContent = hostedApi ? "Open your private presenter URL." : "Open the private presenter URL printed in the terminal.";
    return;
  }
  try {
    const state = await request("/api/projector");
    projector.href = `./?projector=1#${key}`;
    updateControls(state);
    controls.disabled = false;
  } catch (problem) {
    status.textContent = problem.message;
  }
}

controls.addEventListener("click", async (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button || controls.disabled) return;
  const { action, number } = button.dataset;
  if (action === "reset" && !window.confirm("Reset the slide and everyone's matches?")) return;
  controls.disabled = true;
  error.textContent = "";
  try {
    updateControls(await request("/api/control", { action, number: Number(number) }));
  } catch (problem) {
    error.textContent = problem.message;
  } finally {
    controls.disabled = false;
  }
});

connect();
