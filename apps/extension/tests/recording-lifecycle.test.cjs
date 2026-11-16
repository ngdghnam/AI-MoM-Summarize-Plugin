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

function background() {
  let listener, removed
  let active = false
  let starts = 0
  const values = {}
  const forwarded = []
  const chrome = {
    runtime: {
      ContextType: { OFFSCREEN_DOCUMENT: 'OFFSCREEN_DOCUMENT' },
      onMessage: { addListener(fn) { listener = fn } },
      getContexts: async () => [{}],
      async sendMessage(message) {
        if (message.type === 'capture-status') return { active, tabId: active ? 7 : null }
        if (message.type === 'start-capture') { starts++; active = true; return { ok: true } }
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
  class Storage { async setMany(items) { Object.assign(values, items) } }
  load('background.ts', { chrome, require: () => ({ Storage }) })
  const send = (action, sender = {}, extra = {}) => new Promise(resolve => listener({ action, tabId: 7, ...extra }, sender, resolve))
  return { send, values, forwarded, get starts() { return starts } }
}

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
    require, document,
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
  let stopped = 0
  const sent = []
  const track = () => ({ onended: null, stop() { stopped++ } })
  const stream = () => {
    const audioTrack = track()
    return { getTracks: () => [audioTrack], getAudioTracks: () => [audioTrack] }
  }
  class AudioContext {
    async resume() {}
    async close() {}
    createMediaStreamSource() { return { connect() {} } }
    createChannelMerger() { return { connect() {} } }
    createScriptProcessor() { return { connect() {}, disconnect() {} } }
  }
  class WebSocket {
    static OPEN = 1
    constructor() {
      socket = this
      this.readyState = 0
      queueMicrotask(() => { this.readyState = 1; this.onopen?.() })
    }
    close() { this.readyState = 3 }
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
  const component = load('tabs/offscreen.tsx', globals)
  component.default()
  effect()
  const send = message => new Promise(resolve => listener({ target: 'offscreen', ...message }, {}, resolve))
  assert.equal((await send({ type: 'start-capture', tabId: 7, streamId: 'stream' })).ok, true)
  assert.equal((await send({ type: 'capture-status' })).active, true)
  socket.onmessage({ data: JSON.stringify({ text: 'hello' }) })
  assert.equal(sent[0].action, 'STT_RESULT')
  socket.onclose({ code: 1013, reason: 'overloaded' })
  assert.equal((await send({ type: 'capture-status' })).active, false)
  assert.equal(stopped, 2)
  assert.match(sent[1].error, /1013.*overloaded/)
  assert.equal((await send({ type: 'stop-capture' })).ok, true)
  assert.equal(stopped, 2)
})
