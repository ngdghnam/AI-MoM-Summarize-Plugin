import type { PlasmoCSConfig } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: [
    "https://meet.google.com/*",
    "https://teams.microsoft.com/*",
    "https://*.zoom.us/*"
  ],
  all_frames: true
}

let hasLeftMeeting = false

// Set up MutationObserver to watch for meeting end UI changes
const observer = new MutationObserver((mutations) => {
  if (hasLeftMeeting) return;

  const bodyText = document.body.innerText || "";
  
  // 1. Dựa vào Text (Vẫn giữ để back-up cho Tiếng Anh/Việt)
  const hasLeaveText = 
    bodyText.includes("You left the meeting") || 
    bodyText.includes("Bạn đã rời khỏi") || 
    bodyText.includes("Return to home screen");

  // 2. Dựa vào Cấu trúc (Language-agnostic - Hoạt động cho mọi Quốc gia)
  // Khi ở trong phòng, Google Meet luôn có thanh điều khiển (role="toolbar" hoặc aria-label chứa cụm từ liên quan tới microphone/camera)
  // Và luôn có các khung video của người tham gia. Khi out ra, các thành phần này biến mất hoàn toàn.
  const isToolbarMissing = document.querySelectorAll('[role="toolbar"]').length === 0;
  
  // Tổng hợp điều kiện Google Meet
  const isGoogleMeetLeave = 
    window.location.hostname === "meet.google.com" && 
    (hasLeaveText || isToolbarMissing);

  if (isGoogleMeetLeave) {
    hasLeftMeeting = true;
    notifyBackground();
    return;
  }
  
  // Basic check for title change (often switches back to generic app name when leaving)
  const isMeetAndTitleChanged = window.location.hostname === "meet.google.com" && document.title === "Google Meet";
  if (isMeetAndTitleChanged) {
    hasLeftMeeting = true;
    notifyBackground();
  }
})

function notifyBackground() {
  chrome.runtime.sendMessage({ action: "STOP_RECORDING", reason: "MEETING_ENDED" }, (response) => {
    if (chrome.runtime.lastError) {
      // Ignore background not active errors
    }
  })
}

// Start observing the body for changes
window.addEventListener("load", () => {
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
});
