import { Storage } from "@plasmohq/storage"

const storage = new Storage()

let recordingTabId: number | null = null;

async function setupOffscreenDocument(path: string) {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
    documentUrls: [chrome.runtime.getURL(path)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: path,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Recording from microphone and tab for AI transcription"
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "START_RECORDING") {
    recordingTabId = message.tabId || sender.tab?.id || null;
    console.log("Started recording on tab:", recordingTabId);
    
    if (recordingTabId) {
      chrome.tabCapture.getMediaStreamId({ targetTabId: recordingTabId }, async (streamId) => {
        if (chrome.runtime.lastError) {
          console.error("Tab capture error:", chrome.runtime.lastError.message);
          return;
        }
        
        await setupOffscreenDocument("tabs/offscreen.html");
        
        // Wait 500ms for React offscreen component to mount and register listener
        await new Promise(r => setTimeout(r, 500));

        // Send streamId to offscreen document
        chrome.runtime.sendMessage({
          target: "offscreen",
          type: "start-capture",
          streamId: streamId,
          tabId: recordingTabId
        }).catch(err => console.log("Failed to send start-capture:", err));
      });
    }
  }
  
  if (message.action === "STOP_RECORDING") {
    recordingTabId = null;
    
    // Stop offscreen capture
    chrome.runtime.sendMessage({ target: "offscreen", type: "stop-capture" }).catch(() => {});
    
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
    chrome.runtime.sendMessage({ target: "offscreen", type: "stop-capture" });
    storage.set("isRecording", false).then(() => {
      console.log("Recording stopped because tab was closed");
    });
  }
})

