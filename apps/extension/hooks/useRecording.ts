import { useState, useEffect, useCallback } from "react"

export function useRecording() {
  const [isRecording, setIsRecording] = useState(false)
  const [recordTime, setRecordTime] = useState(0)

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

  const handleToggleRecord = useCallback(() => {
    setIsRecording((prev) => !prev)
  }, [])

  return {
    isRecording,
    recordTime,
    formatTime,
    handleToggleRecord,
  }
}
