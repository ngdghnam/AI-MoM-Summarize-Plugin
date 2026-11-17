import { Mic, MicOff, Settings, X, MoreHorizontal, Bot, Square, Loader2 } from "lucide-react"

import { Button } from "~/components/ui/button"
import { useLiveCaptionsSidebar } from "~/hooks/useLiveCaptionsSidebar"

export function LiveCaptionsSidebarView() {
  const {
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
    openSidebar,
    closeSidebar
  } = useLiveCaptionsSidebar()

  // Hide entirely if not in an active meeting
  if (!isActiveMeeting) return null;

  if (!isOpen) {
    return (
      <div className="fixed right-4 bottom-20 z-[9999]">
        <Button 
          onClick={openSidebar}
          className="w-12 h-12 rounded-full shadow-lg p-0"
          title="Mở Live Captions (AI-MoM)"
        >
          <Bot size={24} />
        </Button>
      </div>
    )
  }

  return (
    <div className="fixed right-0 top-0 h-screen w-[360px] bg-background border-l border-border shadow-2xl flex flex-col z-[9999] font-sans text-foreground">
      <div className="flex items-center justify-between p-4 border-b border-border bg-background">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isRecording ? 'bg-destructive animate-pulse' : 'bg-muted-foreground'}`}></div>
          <h2 className="font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-orange-500">
            Live Captions
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost"
            size="icon"
            onClick={handleToggleRecord}
            disabled={isStarting}
            aria-label={isRecording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}
            title={isRecording ? "Stop Recording" : "Start Recording"}
          >
            {isRecording ? <Mic size={18} className="text-destructive" /> : <MicOff size={18} className="text-slate-500" />}
          </Button>
          <Button variant="ghost" size="icon">
            <Settings size={18} className="text-slate-500" />
          </Button>
          <Button variant="ghost" size="icon" onClick={closeSidebar}>
            <X size={18} className="text-slate-500" />
          </Button>
        </div>
      </div>

      {recordingError && <p role="alert" className="p-3 text-sm text-destructive">{recordingError}</p>}
      {isRecording && (
        <div className="flex items-center justify-between gap-3 border-b border-orange-100 bg-orange-50/70 px-4 py-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary" role="status">
            <span className="h-2 w-2 rounded-full bg-primary motion-safe:animate-pulse" />
            Đang ghi âm
            <span className="ml-1 font-mono tabular-nums text-slate-600">{formatTime(recordTime)}</span>
          </div>
          <Button onClick={handleToggleRecord} disabled={isStarting} variant="ghost" className="h-8 gap-1.5 rounded-lg px-2 text-xs text-primary hover:bg-orange-100">
            {isStarting ? <Loader2 size={12} className="animate-spin" /> : <Square size={10} fill="currentColor" />}
            Dừng
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col bg-slate-50">
        {messages.length === 0 ? (
          isRecording || isStarting ? (
          <div className="flex flex-1 flex-col items-center justify-center px-3 py-8 text-center" role="status" aria-live="polite">
            <div className="relative mb-7 flex h-28 w-28 items-center justify-center">
              <div className="absolute inset-0 rounded-full border border-orange-100 bg-orange-50" />
              <div className="absolute inset-3 rounded-full border border-orange-200/70 motion-safe:animate-pulse" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500 to-primary text-white shadow-lg shadow-orange-200/60">
                {isStarting ? <Loader2 size={28} className="animate-spin" /> : <Mic size={28} strokeWidth={1.75} />}
              </div>
            </div>
            <span className="mb-3 rounded-full border border-orange-200/60 bg-orange-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-primary">
              {isStarting ? "Đang kết nối" : "Ghi âm đang bật"}
            </span>
            <h3 className="text-lg font-semibold tracking-tight text-slate-800">
              {isStarting ? "Chuẩn bị lắng nghe…" : "AI-MoM đang lắng nghe"}
            </h3>
            <p className="mt-2 max-w-[260px] text-xs leading-relaxed text-slate-500">
              {isStarting ? "Đang kết nối âm thanh cuộc họp. Chờ một chút nhé." : "Bạn cứ trò chuyện tự nhiên. Nội dung sẽ xuất hiện tại đây sau mỗi đoạn nói."}
            </p>
            <div className="mt-6 flex h-8 items-center justify-center gap-1" aria-hidden="true">
              {[12, 20, 14, 28, 18, 32, 22, 14, 26, 18, 10].map((height, index) => (
                <span key={index} className="listening-bar w-1 rounded-full bg-gradient-to-t from-primary to-orange-300" style={{ height, animationDelay: `${index * 110}ms` }} />
              ))}
            </div>
            <p className="mt-3 text-[11px] text-slate-400">{isStarting ? "Đang chuẩn bị âm thanh" : "Đang chờ lời nói…"}</p>
          </div>
          ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 px-4">
            <div className="w-16 h-16 rounded-full bg-slate-200/50 flex items-center justify-center text-slate-400">
              <Bot size={32} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-1">{isRecording ? "Đang ghi âm" : "AI-MoM Đang Chờ Lệnh"}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                {isRecording ? "Đang nghe và xử lý âm thanh. Transcript sẽ xuất hiện khi bạn nói xong." : "Cuộc họp này chưa được ghi âm. Hãy bật Micro để bắt đầu tạo Transcript."}
              </p>
            </div>
            <Button onClick={handleToggleRecord} disabled={isStarting || isRecording} variant="outline" className="mt-2 text-primary border-primary/20 hover:bg-primary/5">
              <Mic size={16} className="mr-2" /> Bắt đầu ghi âm
            </Button>
          </div>
          )
        ) : (
          <div className="space-y-4">
            {messages.map((msg, index) => {
              const isConsecutive = index > 0 && messages[index - 1].isMe === msg.isMe;
              
              return (
                <div key={msg.id} className={`flex flex-col ${msg.isMe ? 'items-end' : 'items-start'} ${isConsecutive ? 'mt-1' : 'mt-4'}`}>
                  {!isConsecutive && (
                    <div className="flex items-center gap-2 mb-1 px-1">
                      <span className="text-xs font-semibold text-slate-500">{msg.speaker}</span>
                      <span className="text-[10px] text-slate-400">{msg.timestamp}</span>
                    </div>
                  )}
                  <div 
                    className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                      msg.isMe 
                        ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-sm' 
                        : 'bg-white text-slate-800 shadow-sm border border-slate-100 rounded-tl-sm'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        
        {isRecording && messages.length > 0 && (
          <div className="flex items-center gap-2 text-slate-400 text-xs px-2 animate-pulse mt-4">
            <MoreHorizontal size={16} />
            <span>Đang nghe...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-3 border-t border-border bg-background text-xs text-slate-500 flex justify-between items-center">
        <span>Powered by AI-MoM</span>
        {isRecording ? (
          <span className="flex items-center gap-1 text-green-600 font-medium">
            <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
            Connected
          </span>
        ) : (
          <span className="text-slate-400">Paused</span>
        )}
      </div>
    </div>
  )
}
