import { useEffect, useState, useRef } from "react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"

import { useRecording } from "~/hooks/useRecording"

interface TranscriptMessage {
  id: number;
  speaker: string;
  text: string;
  timestamp: string;
  isMe: boolean;
}


export function useLiveCaptionsSidebar() {
  const [isOpen, setIsOpen] = useStorage({
    key: "isSidebarOpen",
    instance: new Storage({ area: "local" })
  }, false)
  
  const { isRecording, isStarting, recordingError, recordTime, formatTime, handleToggleRecord } = useRecording()
  
  const [isActiveMeeting, setIsActiveMeeting] = useStorage({
    key: "isActiveMeeting",
    instance: new Storage({ area: "local" })
  }, false)
  
  const [messages, setMessages] = useState<TranscriptMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Listen for real STT messages from offscreen
  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const messageListener = (message: any) => {
      if (message.target === "content" && message.type === "stt-result") {
        const result = message.data
        if (result.text) {
          setMessages(prev => {
            const now = new Date();
            const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
            
            return [...prev, {
              id: Date.now() + Math.random(),
              speaker: result.channel === "left" ? "Tôi" : "Người khác",
              text: result.text,
              timestamp: timeStr,
              isMe: result.channel === "left"
            }]
          })
        }
      }
    }

    chrome.runtime.onMessage.addListener(messageListener)
    return () => {
      chrome.runtime.onMessage.removeListener(messageListener)
    }
  }, [isRecording])

  // Polling to detect if we are in an active meeting
  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    const checkActive = async () => {
      try {
        let active = false;
        if (window.location.hostname === "meet.google.com") {
          const bodyText = document.body.innerText || "";
          const isWaitingRoom = bodyText.includes("Sẵn sàng tham gia") || bodyText.includes("Ready to join") || bodyText.includes("Ask to join") || bodyText.includes("Yêu cầu tham gia");
          const isLeftScreen = bodyText.includes("Bạn đã rời khỏi") || bodyText.includes("You left the meeting") || bodyText.includes("Return to home screen") || bodyText.includes("Trở lại màn hình chính");
          
          // We are active if we are NOT in the waiting room and NOT on the "left meeting" screen
          active = !isWaitingRoom && !isLeftScreen;
        } else {
          active = true;
        }
        
        await setIsActiveMeeting(active);
        
        if (!active) {
          await setIsOpen(false);
        }
      } catch (e: any) {
        if (e.message?.includes("Extension context invalidated")) {
          clearInterval(interval);
        }
      }
    };

    checkActive();
    interval = setInterval(checkActive, 1000);
    return () => clearInterval(interval);
  }, []);

  // Scroll to bottom and handle responsive Meet squeeze
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
      
      // Squeeze Google Meet to make room for our sidebar
      if (window.location.hostname === "meet.google.com") {
        document.body.style.width = 'calc(100vw - 360px)';
        // Dispatch resize event so Google Meet JS recalculates video tiles
        window.dispatchEvent(new Event('resize'));
      }
    } else {
      // Restore Google Meet width
      if (window.location.hostname === "meet.google.com") {
        document.body.style.width = '';
        window.dispatchEvent(new Event('resize'));
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (window.location.hostname === "meet.google.com") {
        document.body.style.width = '';
        window.dispatchEvent(new Event('resize'));
      }
    }
  }, [isOpen])

  return {
    isOpen,
    isActiveMeeting,
    isRecording,
    isStarting,
    recordingError,
    recordTime,
    formatTime,
    handleToggleRecord,
    messages,
    messagesEndRef,
    openSidebar: () => setIsOpen(true),
    closeSidebar: () => setIsOpen(false)
  }
}
