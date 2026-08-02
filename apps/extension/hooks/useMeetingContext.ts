import { useState, useEffect } from "react"

const isMeetingUrl = (urlStr: string) => {
  try {
    const url = new URL(urlStr)
    
    // Google Meet: Must match /xxx-xxxx-xxx (e.g., /whj-fjzc-vsh)
    if (url.hostname === "meet.google.com") {
      return /^\/[a-z0-9]{3}-[a-z0-9]{4}-[a-z0-9]{3}/i.test(url.pathname)
    }
    
    // Microsoft Teams
    if (url.hostname.includes("teams.microsoft.com") || url.hostname.includes("teams.live.com")) {
      return url.pathname.includes("/meetup-join") || url.pathname.includes("/meet/") || url.searchParams.has("meetingjoin")
    }
    
    // Zoom
    if (url.hostname.includes("zoom.us")) {
      return url.pathname.includes("/wc/") || url.pathname.includes("/j/")
    }
    
    return false
  } catch (e) {
    return false
  }
}

export function useMeetingContext() {
  const [isMeetingPage, setIsMeetingPage] = useState<boolean | null>(null)

  useEffect(() => {
    // Check if we are in the chrome extension environment
    if (typeof chrome !== "undefined" && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const url = tabs[0]?.url || ""
        setIsMeetingPage(isMeetingUrl(url))
      })
    } else {
      // Fallback for non-extension environment
      setIsMeetingPage(false)
    }
  }, [])

  return { isMeetingPage }
}
