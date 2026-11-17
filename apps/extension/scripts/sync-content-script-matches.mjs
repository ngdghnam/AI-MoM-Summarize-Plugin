import { readFile, readdir, writeFile } from "node:fs/promises"

import ts from "typescript"

const extensionRoot = new URL("../", import.meta.url)
// Compile the TypeScript constant in memory, including on Node 18.
const constantsSource = await readFile(
  new URL("constants/meeting-url-matches.ts", extensionRoot),
  "utf8"
)
const { outputText } = ts.transpileModule(constantsSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext }
})
const { MEETING_URL_MATCHES } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
)

// Plasmo parses config without resolving imports. Materialize the shared list
// in each entry before running Plasmo so the manifest retains the correct URLs.
const declaration = `const MEETING_URL_MATCHES = ${JSON.stringify(MEETING_URL_MATCHES, null, 2)}`
const contentsDirectory = new URL("contents/", extensionRoot)

for (const entry of await readdir(contentsDirectory)) {
  if (!/\.tsx?$/.test(entry)) continue
  const file = new URL(entry, contentsDirectory)
  const source = await readFile(file, "utf8")
  const updated = source.replace(
    /const MEETING_URL_MATCHES = \[[\s\S]*?\]/,
    declaration
  )
  if (updated !== source) await writeFile(file, updated)
}
