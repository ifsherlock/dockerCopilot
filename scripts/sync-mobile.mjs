import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')
const sourceDir = path.join(projectRoot, 'web-mobile', 'out')
const targetDir = path.join(projectRoot, 'front', 'mobile')

if (!existsSync(sourceDir)) {
  throw new Error(`mobile export output not found: ${sourceDir}`)
}

rmSync(targetDir, { recursive: true, force: true })
mkdirSync(targetDir, { recursive: true })
cpSync(sourceDir, targetDir, { recursive: true })

console.log(`mobile frontend synced: ${sourceDir} -> ${targetDir}`)
