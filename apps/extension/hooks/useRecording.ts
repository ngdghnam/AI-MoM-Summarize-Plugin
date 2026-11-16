import { useEffect, useCallback, useState, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"

import { Storage } from "@plasmohq/storage"
const recordingStorage = new Storage({ area: "local" })

export function useRecording(trackDuration = true) {
  const [isRecording] = useStorage({ key: "isRecording", instance: recordingStorage }, false)
  const [startedAt] = useStorage({ key: "recordingStartedAt", instance: recordingStorage }, 0)
  const [recordTime, setRecordTime] = useState(0)

  const [isPending, setIsPending] = useState(false)
  const [isRecordingChanging] = useStorage({ key: "isRecordingChanging", instance: recordingStorage }, false)
  const isStarting = isPending || isRecordingChanging
  const pendingRef = useRef(false)
  const [recordingError, setRecordingError] = useStorage({ key: "recordingError", instance: recordingStorage }, "")

  useEffect(() => {
    void chrome.runtime.sendMessage({ action: "RECORDING_STATUS" }).catch(() => {})
  }, [])

  // Recording duration
  useEffect(() => {
    if (!trackDuration) return
    const update = () => setRecordTime(isRecording && startedAt ? Math.max(0, Math.floor((Date.now() - startedAt) / 1000)) : 0)
    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [isRecording, startedAt, trackDuration])

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0")
    const s = (seconds % 60).toString().padStart(2, "0")
    return `${m}:${s}`
  }, [])

  const handleToggleRecord = useCallback(async () => {
    if (pendingRef.current || isRecordingChanging) return
    pendingRef.current = true
    setIsPending(true)
    try {
      void setRecordingError("")
      if (isRecording) {
        const response = await chrome.runtime.sendMessage({ action: "STOP_RECORDING", reason: "USER_TOGGLED" })
        if (!response?.ok) throw new Error(response?.error || "Recording did not stop")
      } else {
        const tabs = chrome.tabs?.query
          ? await chrome.tabs.query({ active: true, currentWindow: true })
          : []
        const response = await chrome.runtime.sendMessage({ action: "START_RECORDING", tabId: tabs[0]?.id })
        if (!response?.ok) throw new Error(response?.error || "Recording did not start")
      }
    } catch (error) {
      await setRecordingError(error instanceof Error ? error.message : String(error))
    } finally {
      pendingRef.current = false
      setIsPending(false)
    }
  }, [isRecording, isRecordingChanging, setRecordingError])

  return {
    isRecording,
    isStarting,
    recordingError,
    recordTime,
    formatTime,
    handleToggleRecord,
  }
}
