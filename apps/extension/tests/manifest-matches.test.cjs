const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

test('production content scripts target the configured meeting URLs', t => {
  const root = path.join(__dirname, '..')
  const manifestPath = path.join(root, 'build/chrome-mv3-prod/manifest.json')
  if (!fs.existsSync(manifestPath)) return t.skip('Run pnpm build before checking the generated manifest')
  const source = fs.readFileSync(path.join(root, 'constants/meeting-url-matches.ts'), 'utf8')
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } })
  const exports = {}
  vm.runInNewContext(outputText, { exports })
  const expected = Array.from(exports.MEETING_URL_MATCHES).sort()
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  assert.equal(manifest.content_scripts.length, 2)
  for (const script of manifest.content_scripts) {
    assert.deepEqual([...script.matches].sort(), expected)
  }
})
