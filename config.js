"use strict";

// Leave blank for local rehearsal. Set this to the HTTPS backend origin on GitHub Pages.
const hostedApi = "";

function roomFetch(path, options) {
  return fetch(hostedApi ? new URL(path, hostedApi) : path, options);
}
