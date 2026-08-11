import { useState, useEffect } from "react"
import "./style.css"
import { Button } from "~/components/ui/button"
import { Mic, CheckCircle } from "lucide-react"

export default function OptionsPage() {
  const [hasPermission, setHasPermission] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    navigator.permissions.query({ name: "microphone" as PermissionName })
      .then(status => {
        setHasPermission(status.state === "granted")
        status.onchange = () => setHasPermission(status.state === "granted")
      })
  }, [])

  const requestPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      setHasPermission(true)
      setError(null)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "Failed to get permission")
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-sans p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-2xl shadow-xl flex flex-col items-center text-center">
        {!hasPermission ? (
          <>
            <div className="w-20 h-20 bg-orange-100 text-orange-500 rounded-full flex items-center justify-center mb-6">
              <Mic size={40} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">Microphone Access</h1>
            <p className="text-slate-600 mb-8 leading-relaxed">
              AI-MoM requires microphone access to capture your voice during meetings. Please grant permission to continue.
            </p>
            <Button onClick={requestPermission} className="w-full h-12 text-lg font-bold bg-orange-500 hover:bg-orange-600 text-white rounded-xl">
              Grant Permission
            </Button>
            {error && <p className="text-red-500 mt-4 text-sm font-semibold">{error}</p>}
          </>
        ) : (
          <>
            <div className="w-20 h-20 bg-green-100 text-green-500 rounded-full flex items-center justify-center mb-6">
              <CheckCircle size={40} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 mb-2">You're all set!</h1>
            <p className="text-slate-600 mb-8 leading-relaxed">
              Microphone access is granted. You can now close this tab and start Live Captions from the extension popup.
            </p>
            <Button onClick={() => window.close()} className="w-full h-12 text-lg font-bold" variant="outline">
              Close Tab
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
