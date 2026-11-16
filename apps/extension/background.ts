import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })
let commands: Promise<unknown> = Promise.resolve()

async function captureStatus() {
  try {
    return await chrome.runtime.sendMessage({ target: "offscreen", type: "capture-status" })
  } catch { return null }
}

async function stopRecording(error = "") {
  await chrome.runtime.sendMessage({ target: "offscreen", type: "stop-capture" }).catch(() => {})
  await storage.setMany({ isRecording: false, recordingStartedAt: 0, recordingError: error })
}

async function startRecording(tabId?: number) {
  if ((await captureStatus())?.active) return { ok: true }
  if (tabId == null) throw new Error("No meeting tab selected")
  const contexts = await chrome.runtime.getContexts({ contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT] })
  if (!contexts.length) {
    await chrome.offscreen.createDocument({
      url: "tabs/offscreen.html", reasons: [chrome.offscreen.Reason.USER_MEDIA],
      justification: "Recording microphone and meeting audio"
    })
  }
  let ready = false
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await captureStatus()) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  if (!ready) throw new Error("Offscreen capture is not ready")
  const streamId = await new Promise<string>((resolve, reject) => {
    chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, streamId => {
      const error = chrome.runtime.lastError
      if (error) reject(new Error(error.message || "Tab capture failed"))
      else resolve(streamId)
    })
  })
  const result = await chrome.runtime.sendMessage({ target: "offscreen", type: "start-capture", streamId, tabId })
  if (!result?.ok) throw new Error(result?.error || "Capture did not start")
  await storage.setMany({ isRecording: true, recordingStartedAt: Date.now(), recordingError: "", isSidebarOpen: true })
  return { ok: true }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "STT_RESULT") {
    void chrome.tabs.sendMessage(message.tabId, { target: "content", type: "stt-result", data: message.data }).catch(() => {})
    return
  }
  if (!["START_RECORDING", "STOP_RECORDING", "CAPTURE_FAILED", "RECORDING_STATUS"].includes(message.action)) return
  const operation = commands.catch(() => {}).then(async () => {
    if (message.action === "START_RECORDING" || message.action === "STOP_RECORDING") {
      await storage.setMany({ isRecordingChanging: true })
    }
    try {
    if (message.action === "START_RECORDING") return await startRecording(message.tabId ?? sender.tab?.id)
    const status = await captureStatus()
    if (message.action === "RECORDING_STATUS") {
      if (!status?.active) await storage.setMany({ isRecording: false, recordingStartedAt: 0 })
      return { ok: true }
    }
    if (message.action === "CAPTURE_FAILED") {
      if (status?.active) return { ok: true }
      await stopRecording(message.error)
    } else {
      if (sender.tab && status?.active && status.tabId !== sender.tab.id) return { ok: true }
      await stopRecording()
    }
    return { ok: true }
    } finally {
      await storage.setMany({ isRecordingChanging: false })
    }
  })
  commands = operation.then(result => { sendResponse(result) }, async error => {
    const detail = error instanceof Error ? error.message : String(error)
    await stopRecording(detail)
    sendResponse({ ok: false, error: detail })
  })
  return true
})

chrome.tabs.onRemoved.addListener(tabId => {
  commands = commands.catch(() => {}).then(async () => {
    if ((await captureStatus())?.tabId === tabId) await stopRecording()
  })
})
