import cssText from "data-text:~/style.css"
import type { PlasmoCSConfig } from "plasmo"

import { LiveCaptionsSidebarView } from "~/views/LiveCaptionsSidebarView"
import { MEETING_URL_MATCHES } from "~constants/meeting-url-matches"

export const config: PlasmoCSConfig = {
  matches: MEETING_URL_MATCHES
}

export const getStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export default LiveCaptionsSidebarView
