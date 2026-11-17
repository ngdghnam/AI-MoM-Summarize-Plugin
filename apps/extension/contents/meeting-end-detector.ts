import type { PlasmoCSConfig } from "plasmo"

import { MEETING_URL_MATCHES } from "~constants/meeting-url-matches"

export const config: PlasmoCSConfig = {
  matches: MEETING_URL_MATCHES,
  all_frames: false
}

// Controls may disappear during loading; only a stable end screen stops capture.
let endedSince = 0
let notified = false
const timer = setInterval(() => {
  if (window.location.hostname !== "meet.google.com") return
  const text = document.body?.innerText || ""
  const ended =
    text.includes("You left the meeting") ||
    text.includes("Bạn đã rời khỏi cuộc họp")
  if (!ended) {
    endedSince = 0
    notified = false
    return
  }
  if (!endedSince) endedSince = Date.now()
  if (!notified && Date.now() - endedSince >= 3000) {
    notified = true
    chrome.runtime
      .sendMessage({ action: "STOP_RECORDING", reason: "MEETING_ENDED" })
      .catch(() => {})
  }
}, 1000)
window.addEventListener("pagehide", () => clearInterval(timer), { once: true })
