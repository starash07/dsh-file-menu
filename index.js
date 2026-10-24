/**
 * Host half of the conversation file menu.
 *
 * The browser half opens files, copies paths and reveals them through the
 * Session Remote that DSH already exposes. Windows' own "Open with" dialog has
 * no such endpoint — the host can launch one named application, not that
 * dialog — so this half adds exactly one route for it.
 *
 * The route follows the same fence as the rest of the web surface: POST only,
 * same-origin JSON only, a tiny body, and a path the composed filesystem can
 * map back to itself. Nothing here accepts a command or an argument list.
 */
import { spawn } from "node:child_process"
import { resolve } from "node:path"

const OPEN_WITH_ROUTE = "/dsh-file-menu/open-with"
const MAX_BODY_BYTES = 8 * 1024

/** The web carrier plus the filesystem that verifies a path before the shell sees it. */
export const inject = ["webServer", "fs"]

function readJsonBody(request) {
  return new Promise((resolveBody, reject) => {
    let data = ""
    request.on("data", (chunk) => {
      data += chunk
      if (data.length > MAX_BODY_BYTES) {
        request.destroy()
        reject(new Error("request body too large"))
      }
    })
    request.on("end", () => {
      try { resolveBody(data ? JSON.parse(data) : {}) } catch { reject(new Error("invalid JSON body")) }
    })
    request.on("error", reject)
  })
}

function respond(response, status, payload) {
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  })
  response.end(body)
}

function isSameOriginJsonRequest(request) {
  const contentType = request.headers?.["content-type"] || ""
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) return { ok: false, status: 415, error: "unsupported-media-type" }
  const origin = request.headers?.origin
  const host = request.headers?.host
  if (origin && host) {
    let sameOrigin = false
    try { sameOrigin = new URL(origin).host === host } catch {}
    if (!sameOrigin) return { ok: false, status: 403, error: "cross-origin-request" }
  }
  return { ok: true }
}

/**
 * Normalize and verify one path through the composed filesystem.
 * @returns the verified host path, or null when the request names none.
 */
async function verifyPath(ctx, value) {
  if (typeof value !== "string") return null
  const raw = value.trim()
  if (raw === "" || /[\u0000-\u001f\u007f]/.test(raw)) return null
  const hostPath = resolve(raw)
  const mapped = ctx.fs.processPathFromHostPath(hostPath)
  if (mapped === undefined) return null
  const target = await ctx.fs.resolve(mapped)
  if (ctx.fs.processPath(target) !== hostPath) return null
  return hostPath
}

function spawnDetached(command, args) {
  return new Promise((resolveSpawn, reject) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true })
    child.once("error", reject)
    child.once("spawn", () => {
      child.unref()
      resolveSpawn()
    })
  })
}

export function apply(ctx) {
  const disposeRoute = ctx.webServer.register({
    kind: "exact",
    path: OPEN_WITH_ROUTE,
    handler: async (request, response) => {
      if (request.method !== "POST") return respond(response, 405, { ok: false, error: "method-not-allowed" })
      if (process.platform !== "win32") return respond(response, 501, { ok: false, error: "unsupported-platform" })
      const validation = isSameOriginJsonRequest(request)
      if (!validation.ok) return respond(response, validation.status, { ok: false, error: validation.error })

      let body
      try { body = await readJsonBody(request) } catch { return respond(response, 400, { ok: false, error: "bad-request" }) }

      let hostPath = null
      try { hostPath = await verifyPath(ctx, body?.path) } catch { hostPath = null }
      if (hostPath === null) return respond(response, 400, { ok: false, error: "invalid-path" })

      try {
        await spawnDetached("rundll32.exe", ["shell32.dll,OpenAs_RunDLL", hostPath])
        respond(response, 200, { ok: true })
      } catch (error) {
        ctx.logger?.warn?.(`[dsh-file-menu] failed to show the Open-with dialog for ${hostPath}:`, error)
        respond(response, 500, { ok: false, error: "open-with-failed" })
      }
    },
  })

  return () => { disposeRoute?.() }
}
