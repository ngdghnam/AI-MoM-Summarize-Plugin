import { Play, Square, History, Settings, Users, ChevronRight, AlertCircle, MessageSquareText, Mic } from "lucide-react"
import "./style.css"
import { Button } from "~/components/ui/button"
import { useRecording } from "~/hooks/useRecording"
import { useMeetingContext } from "~/hooks/useMeetingContext"
import { useStorage } from "@plasmohq/storage/hook"
import { Storage } from "@plasmohq/storage"
import { useEffect, useState } from "react"

function IndexPopup() {
  const { isRecording, recordTime, formatTime, handleToggleRecord } = useRecording()
  const { isMeetingPage } = useMeetingContext()
  const [hasMicPermission, setHasMicPermission] = useState<boolean>(true)
  
  useEffect(() => {
    // Check mic permission on load
    navigator.permissions.query({ name: "microphone" as PermissionName })
      .then(status => {
        setHasMicPermission(status.state === "granted")
        status.onchange = () => setHasMicPermission(status.state === "granted")
      })
      .catch(() => {
        // Fallback if permissions.query fails
      })
  }, [])

  const handleRequestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setHasMicPermission(true)
    } catch (err: any) {
      console.error("Popup mic request failed:", err)
      // Fallback: If Chrome strict blocks popup prompts, open a small centered window
      chrome.windows.create({
        url: chrome.runtime.getURL("options.html"),
        type: "popup",
        width: 450,
        height: 500,
        focused: true
      })
    }
  }
  
  const [isActiveMeeting] = useStorage({
    key: "isActiveMeeting",
    instance: new Storage({ area: "local" })
  }, false)
  
  const [isSidebarOpen, setIsSidebarOpen] = useStorage({
    key: "isSidebarOpen",
    instance: new Storage({ area: "local" })
  }, false)

  const handleToggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen)
  }

  if (isMeetingPage === null) {
    return (
      <div className="w-[360px] h-[300px] bg-background flex items-center justify-center">
         <span className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></span>
      </div>
    )
  }

  if (isMeetingPage === false || isActiveMeeting === false) {
    return (
      <div className="w-[360px] min-h-[250px] bg-background text-foreground font-sans flex flex-col items-center justify-center rounded-xl overflow-hidden shadow-sm p-6 text-center gap-4">
        <div className="w-16 h-16 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-500 mb-2">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-orange-500">
          Meeting Not Detected
        </h2>
        <p className="text-sm leading-relaxed">
          {isMeetingPage 
            ? "Bạn đang ở phòng chờ. Vui lòng Join (Tham gia) vào cuộc họp chính thức để sử dụng Live Captions." 
            : "You must be in an active meeting room (Google Meet, Zoom, or Teams) to activate this plugin."}
        </p>
      </div>
    )
  }

  return (
    <div className="w-[360px] bg-background text-foreground font-sans flex flex-col rounded-xl overflow-hidden shadow-sm rounded-sm">
      <header className="px-5 pt-5 pb-4">
        <h1 className="text-lg font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-primary to-orange-500 flex items-center gap-2 whitespace-nowrap">
          <Users className="w-5 h-5 text-primary shrink-0" />
          AI MoM Summarize Plugin
        </h1>
      </header>
      
      <main className="px-5 pb-6 flex flex-col gap-3">
        {!hasMicPermission ? (
          <div className="flex flex-col items-center justify-center p-5 bg-orange-50 dark:bg-orange-950/30 rounded-xl border border-orange-100 dark:border-orange-900 mb-2">
            <Mic className="w-8 h-8 text-orange-500 mb-3" />
            <h3 className="font-bold text-center mb-2">Microphone Access Required</h3>
            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-4">
              We need microphone access to capture your voice for the STT service.
            </p>
            <Button className="w-full font-bold shadow-md rounded-xl" onClick={handleRequestMic}>
              Grant Permission
            </Button>
          </div>
        ) : isRecording ? (
          <div className="flex flex-col items-center justify-center p-5 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-900 mb-2">
            <div className="flex items-center gap-2 text-destructive font-bold mb-4 text-lg">
              <span className="w-3 h-3 rounded-full bg-destructive animate-pulse"></span>
              {formatTime(recordTime)}
            </div>
            
            <div className="flex gap-2 w-full">
               <Button 
                 variant="outline" 
                 className="flex-1 rounded-xl h-11 shadow-sm font-semibold"
                 onClick={handleToggleSidebar}
               >
                 <MessageSquareText className="w-4 h-4 mr-2" />
                 {isSidebarOpen ? "Hide Transcript" : "Show Transcript"}
               </Button>
               <Button 
                 variant="destructive" 
                 className="flex-1 rounded-xl h-11 shadow-sm font-semibold text-md"
                 onClick={handleToggleRecord}
               >
                 <Square className="w-4 h-4 mr-2 fill-current" />
                 End
               </Button>
            </div>
          </div>
        ) : (
          <Button 
            className="w-full h-12 text-md font-bold bg-gradient-to-r from-primary to-orange-500 hover:opacity-90 shadow-md rounded-xl transition-transform hover:scale-[1.02]"
            onClick={handleToggleRecord}
          >
            <Play className="w-5 h-5 mr-2 fill-current" />
            Start Live Captions
          </Button>
        )}

        {!isRecording && (
          <div className="flex flex-col gap-2 mt-2">
            <Button variant="outline" className="w-full justify-between h-11 rounded-xl text-slate-700 dark:text-slate-300 hover:text-foreground font-medium bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800">
              <div className="flex items-center">
                <History className="w-4 h-4 mr-2" />
                Previous Meetings
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </Button>
            
            <Button variant="outline" className="w-full justify-between h-11 rounded-xl text-slate-700 dark:text-slate-300 hover:text-foreground font-medium bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800">
              <div className="flex items-center">
                <Settings className="w-4 h-4 mr-2" />
                Settings & Preferences
              </div>
              <ChevronRight className="w-4 h-4 opacity-50" />
            </Button>
          </div>
        )}
      </main>
    </div>
  )
}

export default IndexPopup
