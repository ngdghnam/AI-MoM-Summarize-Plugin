const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const ts = require('typescript')
const path = require('node:path')

function load(file, globals) {
  const source = fs.readFileSync(path.join(__dirname, '..', file), 'utf8')
  const code = ts.transpileModule(source, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText
  const exports = {}
  vm.runInNewContext(code, { exports, console, setTimeout, ...globals })
  return exports
}

function background(initialValues = {}) {
  let listener, removed
  let active = false
  let starts = 0
  const values = { ...initialValues }
  let startError = ''
  const errorsAtStart = []
  const watches = new Set()
  const setValues = items => {
    const previous = { ...values }
    Object.assign(values, items)
    for (const watch of watches) {
      for (const key of Object.keys(items)) {
        if (previous[key] !== items[key]) watch[key]?.({ newValue: items[key], oldValue: previous[key] })
      }
    }
  }
  const forwarded = []
  const chrome = {
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      onMessage: { addListener(fn) { listener = fn } },
      getContexts: async () => [{}],
      async sendMessage(message) {
        if (message.type === 'capture-status') return { active, tabId: active ? 7 : null }
        if (message.type === 'start-capture') {
          starts++
          errorsAtStart.push(values.recordingError)
          if (startError) return { ok: false, error: startError }
          active = true
          return { ok: true }
        }
        if (message.type === 'stop-capture') { active = false; return { ok: true } }
      }
    },
    tabCapture: { getMediaStreamId(options, callback) { callback('stream') } },
    tabs: {
      sendMessage: async (...args) => { forwarded.push(args) },
      onRemoved: { addListener(fn) { removed = fn } }
    },
    offscreen: { Reason: { USER_MEDIA: 'USER_MEDIA' } }
  }
  class Storage { async setMany(items) { setValues(items) } }
  load('background.ts', { chrome, require: () => ({ Storage }) })
  const send = (action, sender = {}, extra = {}) => new Promise(resolve => listener({ action, tabId: 7, ...extra }, sender, resolve))
  return { send, values, forwarded, errorsAtStart, get starts() { return starts },
    setActive(value) { active = value }, failStart(error) { startError = error },
    setValues, watches }
}

function recordingHook(app) {
  const states = [], effects = [], pending = []
  let cursor = 0, firstRender = true
  const react = {
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], value => { states[index] = value }]
    },
    useRef(initial) { return react.useState({ current: initial })[0] },
    useCallback(fn) { return fn },
    useEffect(fn) { if (firstRender) effects.push(fn) }
  }
  const useStorage = ({ key }, initial) => [app.values[key] ?? initial, async value => { app.values[key] = value }]
  const { useRecording } = load('hooks/useRecording.ts', {
    require(name) {
      if (name === 'react') return react
      if (name === '@plasmohq/storage/hook') return { useStorage }
      return { Storage: class {
        async set(key, value) { app.setValues({ [key]: value }) }
        watch(watch) { app.watches.add(watch) }
        unwatch(watch) { app.watches.delete(watch) }
      } }
    },
    chrome: {
      runtime: { sendMessage(message) {
        const response = app.send(message.action, {}, message)
        pending.push(response)
        return response
      } },
      tabs: { query: async () => [{ id: 7 }] }
    }
  })
  return {
    render() { cursor = 0; const result = useRecording(false); firstRender = false; return result },
    async mount() { effects.forEach(fn => fn()); await Promise.all(pending) }
  }
}

test('new UI clears a persisted disconnect error before displaying recording state', async () => {
  const app = background({ recordingError: 'STT disconnected (1006): connection closed', isRecording: true, recordingStartedAt: 123 })
  const hook = recordingHook(app)
  assert.equal(hook.render().recordingError, '')
  await hook.mount()
  assert.equal(hook.render().recordingError, '')
  assert.equal(app.values.recordingError, '')
  assert.equal(app.values.isRecording, false)
  assert.equal(app.values.recordingStartedAt, 0)
})

test('fresh capture failures stay visible until the next UI opening or retry', async () => {
  const app = background()
  const hook = recordingHook(app)
  hook.render()
  await hook.mount()
  await app.send('START_RECORDING')
  app.setActive(false)
  await app.send('CAPTURE_FAILED', {}, { error: 'STT disconnected (1006): connection closed' })
  assert.match(hook.render().recordingError, /1006/)
  await app.send('RECORDING_STATUS')
  assert.match(hook.render().recordingError, /1006/)
  const reopened = recordingHook(app)
  assert.equal(reopened.render().recordingError, '')
  await reopened.mount()
  assert.equal(reopened.render().recordingError, '')
})

test('retry clears the old error before connecting but still reports a new start failure', async () => {
  const app = background({ recordingError: 'old error' })
  const hook = recordingHook(app)
  hook.render()
  await hook.mount()
  app.failStart('Cannot connect to STT backend')
  await hook.render().handleToggleRecord()
  assert.equal(app.errorsAtStart[0], '')
  assert.equal(hook.render().recordingError, 'Cannot connect to STT backend')
  app.failStart('')
  await hook.render().handleToggleRecord()
  assert.equal(hook.render().recordingError, '')
  assert.equal(hook.render().isRecording, true)
})

test('opening a new UI clears only old errors while keeping active capture and duration', async () => {
  const app = background()
  await app.send('START_RECORDING')
  const startedAt = app.values.recordingStartedAt
  app.values.recordingError = 'old error'
  await app.send('RECORDING_STATUS', {}, { clearError: true })
  assert.equal(app.values.recordingError, '')
  assert.equal(app.values.isRecording, true)
  assert.equal(app.values.recordingStartedAt, startedAt)
  assert.equal(app.starts, 1)
})

test('concurrent Start commands create one capture and Stop stays stopped', async () => {
  const app = background()
  await Promise.all([app.send('START_RECORDING'), app.send('START_RECORDING'), app.send('STOP_RECORDING')])
  assert.equal(app.starts, 1)
  assert.equal(app.values.isRecording, false)
  assert.equal(app.values.recordingStartedAt, 0)
})

test('another meeting tab and delayed failure cannot stop an active capture', async () => {
  const app = background()
  await app.send('START_RECORDING')
  await app.send('STOP_RECORDING', { tab: { id: 8 } })
  await app.send('CAPTURE_FAILED', {}, { error: 'old connection' })
  assert.equal(app.values.isRecording, true)
})

test('opening popup does not reset recording start time', async () => {
  const app = background()
  await app.send('START_RECORDING')
  const startedAt = app.values.recordingStartedAt
  await app.send('RECORDING_STATUS')
  await app.send('START_RECORDING')
  assert.equal(app.values.recordingStartedAt, startedAt)
  assert.equal(app.starts, 1)
})

test('sidebar start and popup stop publish the same shared recording state', async () => {
  const app = background()
  await app.send('START_RECORDING', { tab: { id: 7 } }, { tabId: undefined })
  assert.equal(app.values.isRecording, true)
  assert.ok(app.values.recordingStartedAt > 0)
  assert.equal(app.values.isSidebarOpen, true)
  assert.equal(app.values.isRecordingChanging, false)
  const startedAt = app.values.recordingStartedAt
  await app.send('RECORDING_STATUS')
  assert.equal(app.values.isRecording, true)
  assert.equal(app.values.recordingStartedAt, startedAt)
  await app.send('STOP_RECORDING')
  assert.equal(app.values.isRecording, false)
  assert.equal(app.values.recordingStartedAt, 0)
  assert.equal(app.values.isRecordingChanging, false)
})

test('transcripts are forwarded through background tabs API', async () => {
  const app = background()
  // This message deliberately has no asynchronous response.
  void app.send('STT_RESULT', {}, { data: { text: 'hello' } })
  assert.equal(app.forwarded[0][0], 7)
  assert.equal(app.forwarded[0][1].data.text, 'hello')
})

test('missing toolbar and transient leave screen do not stop capture', () => {
  let tick, now = 1000
  const messages = []
  const document = { body: { innerText: '' } }
  load('contents/meeting-end-detector.ts', {
    require: name => name === '~constants/meeting-url-matches'
      ? load('constants/meeting-url-matches.ts', {}) : require(name), document,
    window: { location: { hostname: 'meet.google.com' }, addEventListener() {} },
    Date: { now: () => now },
    setInterval(fn) { tick = fn }, clearInterval() {},
    chrome: { runtime: { sendMessage: async message => { messages.push(message) } } }
  })
  tick()
  assert.equal(messages.length, 0)
  document.body.innerText = 'You left the meeting'
  tick()
  now += 2000
  document.body.innerText = ''
  tick()
  assert.equal(messages.length, 0)
  document.body.innerText = 'Bạn đã rời khỏi cuộc họp'
  tick()
  now += 3000
  tick()
  tick()
  assert.equal(messages.length, 1)
})

test('offscreen relays captions using runtime and cleans up on remote close', async () => {
  let effect, listener, socket
  let processor
  const pcmSent = []
  let stopped = 0
  const sent = []
  const track = () => ({ onended: null, stop() { stopped++ } })
  const stream = () => {
    const audioTrack = track()
    return { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] }
  }
  class AudioContext {
    sampleRate = 16000
    async resume() {}
    async close() {}
    createMediaStreamSource() { return { connect() {} } }
    createChannelMerger() { return { connect() {} } }
    createScriptProcessor() { processor = { connect() {}, disconnect() {} }; return processor }
  }
  class WebSocket {
    static OPEN = 1
    constructor() {
      socket = this
      this.readyState = 0
      queueMicrotask(() => { this.readyState = 1; this.onopen?.() })
    }
    close() { this.readyState = 3 }
    send(raw) { pcmSent.push(new Int16Array(raw)) }
  }
  const react = {
    useEffect(fn) { effect = fn }, useRef(value) { return { current: value } },
    createElement() { return null }
  }
  const globals = {
    require: () => react, React: react, AudioContext, WebSocket, clearTimeout,
    process: { env: { PLASMO_PUBLIC_WS_URL: 'ws://localhost' } },
    navigator: { mediaDevices: { getUserMedia: async () => stream() } },
    chrome: { runtime: {
      onMessage: { addListener(fn) { listener = fn }, removeListener() {} },
      sendMessage: async message => { sent.push(message) }
    } }
  }
  const { useOffscreenCapture } = load('hooks/useOffscreenCapture.ts', globals)
  useOffscreenCapture()
  effect()
  const send = message => new Promise(resolve => listener({ target: 'offscreen', ...message }, {}, resolve))
  assert.equal((await send({ type: 'start-capture', tabId: 7, streamId: 'stream' })).ok, true)
  assert.equal((await send({ type: 'capture-status' })).active, true)
  processor.onaudioprocess({ inputBuffer: {
    length: 2,
    getChannelData: channel => new Float32Array(channel === 0 ? [-1, 0.5] : [1, -0.5])
  } })
  assert.deepEqual(Array.from(pcmSent[0]), [-32768, 32767, 16383, -16384])
  socket.onmessage({ data: JSON.stringify({ text: 'hello' }) })
  assert.equal(sent[0].action, 'STT_RESULT')
  socket.onclose({ code: 1013, reason: 'overloaded' })
  assert.equal((await send({ type: 'capture-status' })).active, false)
  assert.equal(stopped, 2)
  assert.match(sent[1].error, /1013.*overloaded/)
  assert.equal((await send({ type: 'stop-capture' })).ok, true)
  assert.equal(stopped, 2)
})

test('offscreen rejects a mismatched actual sample rate and releases tracks', async () => {
  let effect, listener
  let stopped = 0, closed = 0
  const track = { stop() { stopped++ } }
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] }
  class AudioContext {
    sampleRate = 48000
    async resume() {}
    async close() { closed++ }
  }
  const react = { useEffect(fn) { effect = fn }, useRef(value) { return { current: value } } }
  const { useOffscreenCapture } = load('hooks/useOffscreenCapture.ts', {
    require: () => react, AudioContext, WebSocket: { OPEN: 1 },
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    chrome: { runtime: { onMessage: { addListener(fn) { listener = fn }, removeListener() {} } } }
  })
  useOffscreenCapture()
  effect()
  const result = await new Promise(resolve => listener({ target: 'offscreen', type: 'start-capture', streamId: 'stream', tabId: 7 }, {}, resolve))
  assert.equal(result.ok, false)
  assert.match(result.error, /actual 16000 Hz/)
  assert.equal(stopped, 2)
  assert.equal(closed, 1)
})
