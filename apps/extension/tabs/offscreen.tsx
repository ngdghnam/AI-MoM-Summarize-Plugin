import { useOffscreenCapture } from "~/hooks/useOffscreenCapture"

export default function OffscreenPage() {
  useOffscreenCapture()

  return (
    <div>
      <h1>Offscreen STT Processor</h1>
      <p>This page runs in the background and processes audio streams.</p>
    </div>
  )
}
