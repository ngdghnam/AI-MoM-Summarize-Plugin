import { Storage } from "@plasmohq/storage"

const storage = new Storage()

let recordingTabId: number | null = null;

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_RECORDING") {
    recordingTabId = message.tabId || sender.tab?.id || null;
    console.log("Started recording on tab:", recordingTabId);
  }
  
  if (message.action === "STOP_RECORDING") {
    recordingTabId = null;
    // Set storage values asynchronously
    storage.set("isRecording", false).then(() => {
      console.log("isRecording set to false");
    });
    console.log("Recording stopped due to:", message.reason);
  }
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingTabId === tabId) {
    recordingTabId = null;
    storage.set("isRecording", false).then(() => {
      console.log("Recording stopped because tab was closed");
    });
  }
})
