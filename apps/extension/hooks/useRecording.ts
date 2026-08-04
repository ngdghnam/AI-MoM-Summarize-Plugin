import { useEffect, useCallback } from "react"
import { useStorage } from "@plasmohq/storage/hook"

import { Storage } from "@plasmohq/storage"

export function useRecording() {
  const [isRecording, setIsRecording] = useStorage("isRecording", false)
  const [recordTime, setRecordTime] = useStorage({
    key: "recordTime",
    instance: new Storage({
      area: "local"
    })
  }, 0)

  // Timer logic for mockup
  useEffect(() => {
    let interval: NodeJS.Timeout
    if (isRecording) {
      interval = setInterval(() => {
        setRecordTime((prev) => prev + 1)
      }, 1000)
    } else {
      setRecordTime(0)
    }
    return () => clearInterval(interval)
  }, [isRecording])

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0")
    const s = (seconds % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }, [])

  const handleToggleRecord = useCallback(async () => {
    const newState = !isRecording
    await setIsRecording(newState)
    
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        if (newState) {
          chrome.runtime.sendMessage({ action: "START_RECORDING", tabId: activeTabId });
        } else {
          chrome.runtime.sendMessage({ action: "STOP_RECORDING", reason: "USER_TOGGLED" });
        }
      });
    }
  }, [isRecording, setIsRecording])

  return {
    isRecording,
    recordTime,
    formatTime,
    handleToggleRecord,
  }
}
