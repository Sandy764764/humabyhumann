"use strict";

// Set this to the public Render HTTPS URL before publishing. Never put the presenter key here.
const hostedApi = "";
const syncInterval = 300;

function roomFetch(path, options) {
  if (!hostedApi && location.hostname.endsWith(".github.io")) {
    throw new Error("The live room is not configured yet.");
  }
  return fetch(hostedApi ? new URL(path, hostedApi) : path, {
    signal: AbortSignal.timeout(5000),
    ...options,
  });
}
