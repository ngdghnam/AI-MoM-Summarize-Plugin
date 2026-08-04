import cssText from "data-text:~/style.css"
import type { PlasmoCSConfig } from "plasmo"
import { useEffect, useState, useRef } from "react"
import { Mic, MicOff, Settings, X, MoreHorizontal, Bot } from "lucide-react"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import { Button } from "~/components/ui/button"

export const config: PlasmoCSConfig = {
  matches: ["https://meet.google.com/*", "https://*.zoom.us/*", "https://teams.microsoft.com/*"]
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

import { LiveCaptionsSidebarView } from "~/views/LiveCaptionsSidebarView"

export default LiveCaptionsSidebarView
