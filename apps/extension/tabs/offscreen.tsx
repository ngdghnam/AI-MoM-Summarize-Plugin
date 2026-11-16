import { useEffect, useRef } from "react"

export default function OffscreenPage() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const tabStreamRef = useRef<MediaStream | null>(null)
  const tabIdRef = useRef<number | null>(null)
  const startingRef = useRef(false)

  useEffect(() => {
    console.log("Offscreen document loaded.")

    const handleMessages = (message: any, sender: any, sendResponse: any) => {
      if (message.target !== "offscreen") return

      console.log("Offscreen received message:", message)
      if (message.type === "capture-status") {
        sendResponse({ active: startingRef.current || wsRef.current?.readyState === WebSocket.OPEN, tabId: tabIdRef.current })
      } else if (message.type === "start-capture") {
        startCapture(message.streamId, message.tabId).then(
          () => sendResponse({ ok: true }),
          (error) => sendResponse({ ok: false, error: error.message })
        )
        return true
      } else if (message.type === "stop-capture") {
        stopCapture()
        sendResponse({ ok: true })
      }
    }

    chrome.runtime.onMessage.addListener(handleMessages)

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessages)
      stopCapture()
    }
  }, [])

  const startCapture = async (streamId: string, tabId: number) => {
    if (startingRef.current || wsRef.current?.readyState === WebSocket.OPEN) return
    startingRef.current = true
    tabIdRef.current = tabId
    try {
      // 1. Get Tab stream using streamId from background
      tabStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: "tab",
            chromeMediaSourceId: streamId
          }
        } as any,
        video: false
      })

      // 2. Get Local Mic stream
      micStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false
      })

      // 3. Setup AudioContext at 16000 Hz
      audioCtxRef.current = new AudioContext({ sampleRate: 16000 })
      const audioCtx = audioCtxRef.current
      await audioCtx.resume()

      const micSource = audioCtx.createMediaStreamSource(micStreamRef.current)
      const tabSource = audioCtx.createMediaStreamSource(tabStreamRef.current)

      // 4. Merge them: Mic -> Left (0), Tab -> Right (1)
      const merger = audioCtx.createChannelMerger(2)
      micSource.connect(merger, 0, 0)
      tabSource.connect(merger, 0, 1)
      // Keep meeting audio audible while tabCapture redirects its output.
      tabSource.connect(audioCtx.destination)

      // 5. Process PCM (buffer size 4096, 2 input channels, 2 output channels)
      const processor = audioCtx.createScriptProcessor(4096, 2, 2)
      scriptProcessorRef.current = processor
      
      merger.connect(processor)
      processor.connect(audioCtx.destination) // Required for script processor to work

      // 6. Setup WebSocket
      const wsUrl = process.env.PLASMO_PUBLIC_WS_URL
      if (!wsUrl) {
        throw new Error("PLASMO_PUBLIC_WS_URL is not defined in environment variables.")
      }
      const ws = new WebSocket(`${wsUrl}/ws/transcribe`)
      wsRef.current = ws

      ws.onmessage = (event) => {
        try {
          void chrome.runtime.sendMessage({ action: "STT_RESULT", tabId, data: JSON.parse(event.data) }).catch(console.error)
        } catch (error) { console.error("Invalid STT response", error) }
      }

      let rejectConnection: ((error: Error) => void) | undefined
      const failCapture = (error: string) => {
        if (wsRef.current !== ws) return
        rejectConnection?.(new Error(error))
        stopCapture()
        void chrome.runtime.sendMessage({ action: "CAPTURE_FAILED", error }).catch(() => {})
      }
      ws.onclose = (event) => {
        const detail = `STT disconnected (${event.code}): ${event.reason || "connection closed"}`
        rejectConnection?.(new Error(detail))
        failCapture(detail)
      }
      for (const stream of [micStreamRef.current, tabStreamRef.current]) {
        stream.getAudioTracks().forEach(track => {
          track.onended = () => failCapture("Microphone or meeting audio capture ended")
        })
      }

      processor.onaudioprocess = (e) => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return
        if (ws.bufferedAmount > 16000 * 4 * 5) {
          failCapture("Audio upload stalled for over 5 seconds. Check the STT service.")
          return
        }

        const left = e.inputBuffer.getChannelData(0)
        const right = e.inputBuffer.getChannelData(1)
        
        // Convert Float32 to Int16
        const buffer = new Int16Array(left.length * 2)
        for (let i = 0; i < left.length; i++) {
          // Left
          let s = Math.max(-1, Math.min(1, left[i]))
          buffer[i * 2] = s < 0 ? s * 0x8000 : s * 0x7fff
          // Right
          s = Math.max(-1, Math.min(1, right[i]))
          buffer[i * 2 + 1] = s < 0 ? s * 0x8000 : s * 0x7fff
        }

        ws.send(buffer.buffer)
      }
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("STT connection timed out. Check the AI service.")), 10000)
        rejectConnection = (error) => { clearTimeout(timeout); reject(error) }
        ws.onopen = () => {
          clearTimeout(timeout)
          console.log("WebSocket connected to STT backend.")
          resolve()
        }
        ws.onerror = () => {
          clearTimeout(timeout)
          reject(new Error("Cannot connect to STT backend. Check PLASMO_PUBLIC_WS_URL and the AI service."))
        }
      })
      rejectConnection = undefined
      startingRef.current = false
    } catch (error) {
      console.error("Failed to start capture:", error)
      stopCapture()
      throw error
    }
  }

  const stopCapture = () => {
    startingRef.current = false
    tabIdRef.current = null
    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.onaudioprocess = null
      scriptProcessorRef.current.disconnect()
      scriptProcessorRef.current = null
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => {})
      audioCtxRef.current = null
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => { track.onended = null; track.stop() })
      micStreamRef.current = null
    }
    if (tabStreamRef.current) {
      tabStreamRef.current.getTracks().forEach((track) => { track.onended = null; track.stop() })
      tabStreamRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.onclose = null
      wsRef.current.onmessage = null
      wsRef.current.onerror = null
      wsRef.current.onopen = null
      wsRef.current.close()
      wsRef.current = null
    }
    console.log("Capture stopped.")
  }

  return (
    <div>
      <h1>Offscreen STT Processor</h1>
      <p>This page runs in the background and processes audio streams.</p>
    </div>
  )
}
