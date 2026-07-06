import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const contractPath = path.join(root, 'docs/contracts/update-api-contracts.json')

const contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'))

const sourceCache = new Map()

function readSource(relativePath) {
  if (!sourceCache.has(relativePath)) {
    sourceCache.set(relativePath, fs.readFileSync(path.join(root, relativePath), 'utf8'))
  }
  return sourceCache.get(relativePath)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function typeOf(value) {
  if (Array.isArray(value)) return 'array'
  if (value === null) return 'null'
  return typeof value
}

function assertFields(object, fields, label) {
  for (const field of fields || []) {
    assert(Object.prototype.hasOwnProperty.call(object, field), `${label} missing field ${field}`)
  }
}

function assertNestedFields(data, nested, label) {
  for (const [selector, fields] of Object.entries(nested || {})) {
    if (selector.endsWith('[]')) {
      const key = selector.slice(0, -2)
      assert(Array.isArray(data[key]), `${label}.${key} must be an array`)
      if (data[key].length > 0) {
        assertFields(data[key][0], fields, `${label}.${key}[0]`)
      }
      continue
    }
    assert(data[selector] && typeof data[selector] === 'object' && !Array.isArray(data[selector]), `${label}.${selector} must be an object`)
    assertFields(data[selector], fields, `${label}.${selector}`)
  }
}

function assertRoute(method, pathValue) {
  const routes = readSource('internal/handler/routes.go')
  const routePath = pathValue.split('?')[0].replace('/api', '')
  assert(routes.includes(`Method:  http.Method${method[0] + method.slice(1).toLowerCase()}`), `routes.go missing method ${method}`)
  assert(routes.includes(`Path:    "${routePath}"`), `routes.go missing path ${routePath}`)
}

const expectedContracts = [
  'containers.list',
  'containers.checkUpdate',
  'images.list',
  'bot.updateBlacklist.get',
  'bot.updateBlacklist.save',
  'version.local',
  'version.remote',
  'overview.resources'
]

assert(contract.version === 1, 'contract version must be 1')
assert(Array.isArray(contract.contracts), 'contracts must be an array')
assertFields(Object.fromEntries(contract.contracts.map(item => [item.name, item])), expectedContracts, 'contracts')

for (const item of contract.contracts) {
  assertRoute(item.method, item.path)
  assert(item.sample && typeof item.sample === 'object', `${item.name} sample must be an object`)
  const envelope = item.responseEnvelope
  assert(envelope && typeof envelope === 'object', `${item.name} responseEnvelope is required`)
  assertFields(item.sample, envelope.required, `${item.name}.sample`)
  assert(typeOf(item.sample.code) === envelope.codeType, `${item.name}.code must be ${envelope.codeType}`)
  assert(typeOf(item.sample.msg) === envelope.msgType, `${item.name}.msg must be ${envelope.msgType}`)
  assert(typeOf(item.sample.data) === envelope.dataType, `${item.name}.data must be ${envelope.dataType}`)

  if (item.dataItemRequiredFields) {
    assert(Array.isArray(item.sample.data), `${item.name}.sample.data must be an array`)
    assert(item.sample.data.length > 0, `${item.name}.sample.data must include at least one item`)
    assertFields(item.sample.data[0], item.dataItemRequiredFields, `${item.name}.sample.data[0]`)
  }
  if (item.dataRequiredFields) {
    assertFields(item.sample.data, item.dataRequiredFields, `${item.name}.sample.data`)
  }
  if (item.dataItemType) {
    assert(Array.isArray(item.sample.data), `${item.name}.sample.data must be an array`)
    for (const [index, value] of item.sample.data.entries()) {
      assert(typeOf(value) === item.dataItemType, `${item.name}.sample.data[${index}] must be ${item.dataItemType}`)
    }
  }
  assertNestedFields(item.sample.data, item.nestedRequiredFields, `${item.name}.sample.data`)
}

const sourceAssertions = [
  ['internal/logic/container/containerslistlogic.go', ['json:"id"', 'json:"haveUpdate"', 'json:"isSelf"', 'json:"ignored,omitempty"', 'json:"updateStatus,omitempty"', 'json:"endpointLink"']],
  ['internal/logic/container/checkupdatelogic.go', ['"running": true']],
  ['internal/logic/image/imageslistlogic.go', ['json:"haveUpdate"', 'json:"ignored,omitempty"', 'json:"updateStatus,omitempty"', 'json:"repoLinks"', 'json:"cleanupCandidate"']],
  ['internal/logic/bot/configlogic.go', ['GetUpdateBlacklist', 'SaveUpdateBlacklist', 'update_blacklist']],
  ['internal/logic/version/versionlogic.go', ['"version"', '"buildDate"', '"remoteVersion"']],
  ['internal/utiles/resources.go', ['json:"updateAvailable,omitempty"', 'json:"quickLinks"', 'json:"runningContainers"']]
]

for (const [relativePath, snippets] of sourceAssertions) {
  const source = readSource(relativePath)
  for (const snippet of snippets) {
    assert(source.includes(snippet), `${relativePath} missing source marker ${snippet}`)
  }
}

console.log(`Verified ${contract.contracts.length} update API contracts from ${path.relative(root, contractPath)}`)
