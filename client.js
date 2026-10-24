/**
 * Conversation file menu — the browser half.
 *
 * Right-click a file named in the conversation and get: open it, open it with
 * the default application, show Windows' own "Open with" dialog, copy its
 * absolute path, or reveal it in Explorer.
 *
 * Two surfaces are recognised, both inside the chat flow:
 *   - a Markdown file link, which DSH renders as a button whose class list
 *     carries the `fileLink` local name and whose `title` is the authored path;
 *   - an `@` reference chip, which carries `data-ref-chip="file"`.
 * Neither surface advertises its path in a stable attribute, so the path is
 * read from `title` first and from the React fiber props (`file.path`) when the
 * link is an image. The owning Session id comes from the same fiber walk.
 *
 * Absolute paths come from the Session Remote; nothing here guesses a root.
 */
window.__ModuleLoader__.load({
  id: 'dsh-file-menu',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    const NS = 'file-menu'
    const OPEN_WITH_ROUTE = '/dsh-file-menu/open-with'

    const DICTS = {
      'zh-CN': {
        title: '文件操作',
        openFile: '打开文件',
        openDefault: '在默认应用打开',
        openWith: '选择其他应用打开',
        copyPath: '复制路径',
        reveal: '在资源管理器中打开',
        copied: '路径已复制',
        copyFailed: '复制失败，请重试',
        openFailed: '打开失败，请重试',
        revealFailed: '无法在资源管理器中打开',
        openWithFailed: '无法打开系统「打开方式」对话框',
        noPath: '无法解析这个文件的绝对路径',
        unsupported: '当前环境不支持这个操作',
      },
      'en-US': {
        title: 'File actions',
        openFile: 'Open file',
        openDefault: 'Open with default app',
        openWith: 'Choose another app…',
        copyPath: 'Copy path',
        reveal: 'Show in Explorer',
        copied: 'Path copied',
        copyFailed: 'Could not copy the path',
        openFailed: 'Could not open the file',
        revealFailed: 'Could not show the file in Explorer',
        openWithFailed: 'Could not open the system "Open with" dialog',
        noPath: 'Could not resolve the file path',
        unsupported: 'This action is not available here',
      },
    }

    // ── helpers ──────────────────────────────────────────────────────────────

    function fallbackTranslate(key) {
      const dict = DICTS['zh-CN']
      return dict[key] !== undefined ? dict[key] : (DICTS['en-US'][key] !== undefined ? DICTS['en-US'][key] : key)
    }

    function makeTranslator(locale) {
      let bound = null
      if (locale !== undefined && locale !== null && typeof locale.bind === 'function') {
        try { bound = locale.bind(NS) } catch { bound = null }
      }
      return (key) => {
        if (bound !== null) {
          try {
            const value = bound(key)
            if (typeof value === 'string' && value !== '' && value !== key) return value
          } catch { /* fall back to the built-in dictionary */ }
        }
        return fallbackTranslate(key)
      }
    }

    function clamp(value, min, max) {
      return Math.min(Math.max(value, min), max)
    }

    function fileBaseName(path) {
      const text = String(path)
      const parts = text.split(/[\\/]/u)
      return parts[parts.length - 1] || text
    }

    function looksLikePath(value) {
      if (typeof value !== 'string') return false
      const text = value.trim()
      if (text === '' || text.length > 500) return false
      if (/[\u0000-\u001f\u007f]/.test(text)) return false
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) return false
      return /[/\\]/.test(text) || /\.[A-Za-z0-9]{1,8}$/.test(text)
    }

    function normalizeReference(raw) {
      let text = String(raw === null || raw === undefined ? '' : raw).trim()
      if (text === '') return null
      if (text.startsWith('@')) text = text.slice(1)
      if (text.startsWith('"') && text.endsWith('"') && text.length > 1) text = text.slice(1, -1)
      return text === '' ? null : text
    }

    /** Read a `{ ok, value }` Remote answer, a bare value, or nothing. */
    function unwrap(answer) {
      if (answer === null || answer === undefined) return undefined
      if (typeof answer === 'object' && typeof answer.ok === 'boolean') return answer.ok ? answer.value : undefined
      return answer
    }

    // ── React identity: session id and the authored path ─────────────────────

    function fiberOf(element) {
      for (const key of Object.getOwnPropertyNames(element)) {
        if (key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$')) return element[key]
      }
      return null
    }

    function fiberInfo(element) {
      const info = { sessionId: null, path: null }
      let fiber = fiberOf(element)
      let hops = 0
      while (fiber !== null && fiber !== undefined && hops < 150) {
        const props = fiber.memoizedProps
        if (props !== null && typeof props === 'object') {
          if (info.sessionId === null && typeof props.sessionId === 'string') info.sessionId = props.sessionId
          if (info.path === null) {
            const file = props.file
            if (file !== null && typeof file === 'object' && looksLikePath(file.path)) info.path = file.path
            else if (looksLikePath(props.filePath)) info.path = props.filePath
            else if (looksLikePath(props.path)) info.path = props.path
          }
        }
        fiber = fiber.return
        hops += 1
      }
      return info
    }

    // ── which right-click owns the menu ──────────────────────────────────────

    function resolveTarget(event) {
      const target = event.target instanceof Element ? event.target : null
      if (target === null) return null
      if (target.closest('[data-file-menu-ui]') !== null) return null
      if (target.closest('[data-composer-card]') !== null) return null
      if (target.closest('[data-tool]') !== null) return null
      if (target.closest('[data-chat-flow]') === null) return null
      const selection = window.getSelection()
      if (selection !== null && !selection.isCollapsed) return null

      const chip = target.closest('[data-ref-chip="file"]')
      if (chip !== null) {
        const info = fiberInfo(chip)
        const path = info.path !== null
          ? info.path
          : normalizeReference(chip.getAttribute('title') || chip.textContent || '')
        if (path === null) return null
        return { path, sessionId: info.sessionId, element: chip.tagName === 'BUTTON' ? chip : null }
      }

      const button = target.closest('button')
      if (button === null) return null
      const className = typeof button.className === 'string' ? button.className : ''
      if (!className.includes('fileLink')) return null
      const info = fiberInfo(button)
      const title = button.getAttribute('title')
      const path = looksLikePath(title) ? title : info.path
      if (path === null) return null
      return { path, sessionId: info.sessionId, element: button }
    }

    // ── menu state shared with the overlay component ─────────────────────────

    const menuStore = { current: null, listeners: new Set() }

    function setMenu(next) {
      menuStore.current = next
      for (const listener of Array.from(menuStore.listeners)) {
        try { listener() } catch { /* one bad listener must not stop the rest */ }
      }
    }

    function useMenu() {
      const [state, setState] = React.useState(menuStore.current)
      React.useEffect(() => {
        const listener = () => setState(menuStore.current)
        menuStore.listeners.add(listener)
        return () => { menuStore.listeners.delete(listener) }
      }, [])
      return state
    }

    // ── menu component ───────────────────────────────────────────────────────

    function placeMenu(x, y) {
      const width = 216
      const height = 236
      return {
        left: clamp(x, 8, Math.max(8, window.innerWidth - width - 8)) + 'px',
        top: clamp(y, 8, Math.max(8, window.innerHeight - height - 8)) + 'px',
      }
    }

    function MenuHost(props) {
      const t = props.t
      const state = useMenu()
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')

      React.useEffect(() => {
        setBusy(false)
        setError('')
      }, [state])

      // Resolve the absolute path as soon as the menu opens, so the action the
      // user picks does not wait for the Host on the click itself.
      React.useEffect(() => {
        if (state === null) return
        props.prefetch(state)
      }, [state])

      if (state === null) return null

      const close = () => setMenu(null)

      const run = (operation, onDone) => {
        if (busy) return
        setBusy(true)
        setError('')
        Promise.resolve()
          .then(operation)
          .then(() => {
            setBusy(false)
            if (typeof onDone === 'function') onDone()
          }, (failure) => {
            setBusy(false)
            setError(failure !== null && failure !== undefined && typeof failure.message === 'string' && failure.message !== ''
              ? failure.message
              : t('openFailed'))
          })
      }

      const item = (id, label, operation, options) => {
        const settings = options === undefined ? {} : options
        if (settings.hidden === true) return null
        return h('button', {
          key: id,
          type: 'button',
          role: 'menuitem',
          className: 'dfmItem',
          'data-disabled': busy || settings.disabled === true ? '' : undefined,
          disabled: busy || settings.disabled === true,
          onClick: (event) => {
            event.preventDefault()
            event.stopPropagation()
            run(operation, settings.after)
          },
        }, h('span', { className: 'dfmItemLabel' }, label))
      }

      const hint = error !== ''
        ? h('div', { className: 'dfmHint dfmHintError', role: 'alert' }, error)
        : null

      return h('div', {
        'data-file-menu-ui': '',
        className: 'dfmMenu',
        role: 'menu',
        'aria-label': t('title'),
        style: placeMenu(state.x, state.y),
        onContextMenu: (event) => event.preventDefault(),
      },
      h('div', { className: 'dfmHeader', title: state.path }, h('span', { className: 'dfmIcon', 'aria-hidden': true }, '📄'), h('span', { className: 'dfmName' }, fileBaseName(state.path))),
      item('open', t('openFile'), () => props.actions.openFile(state), { hidden: state.element === null, after: close }),
      item('default', t('openDefault'), () => props.actions.openDefault(state), { disabled: props.hostAvailable !== true, after: close }),
      item('with', t('openWith'), () => props.actions.openWith(state), { disabled: props.hostAvailable !== true, after: close }),
      h('div', { className: 'dfmSep', key: 'sep' }),
      item('copy', t('copyPath'), () => props.actions.copyPath(state), { after: close }),
      item('reveal', t('reveal'), () => props.actions.reveal(state), { disabled: props.hostAvailable !== true, after: close }),
      hint)
    }

    // ── styles ───────────────────────────────────────────────────────────────

    const CSS = `
.dfmMenu{
  position:fixed; z-index:80; box-sizing:border-box; min-width:216px; max-width:320px; padding:5px;
  pointer-events:auto; border-radius:10px; font-size:12.5px;
  background:var(--dsw-alias-bg-overlay); color:var(--dsw-alias-label-primary);
  border:1px solid var(--dsw-alias-border-l1); box-shadow:0 12px 34px rgba(0,0,0,.22);
}
.dfmHeader{
  display:flex; align-items:center; gap:6px; padding:5px 9px 7px;
  color:var(--dsw-alias-label-secondary); font-size:11.5px; line-height:1.4;
}
.dfmIcon{flex:none; font-size:11px; line-height:1}
.dfmName{overflow:hidden; text-overflow:ellipsis; white-space:nowrap}
.dfmItem{
  display:flex; align-items:center; width:100%; box-sizing:border-box;
  height:30px; padding:0 10px; border:0; border-radius:6px; cursor:pointer;
  background:transparent; color:var(--dsw-alias-label-primary); font:inherit; text-align:left;
  white-space:nowrap;
}
.dfmItem:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.dfmItem:focus-visible{outline:2px solid var(--dsw-alias-brand-primary); outline-offset:-2px}
.dfmItem:disabled{opacity:.45; cursor:default}
.dfmItemLabel{overflow:hidden; text-overflow:ellipsis}
.dfmSep{height:1px; margin:5px 6px; background:var(--dsw-alias-border-l1)}
.dfmHint{padding:5px 10px 3px; font-size:11px; line-height:1.4; color:var(--dsw-alias-label-secondary)}
.dfmHintError{color:var(--dsw-alias-state-error-primary)}
`

    // ── plugin entry ─────────────────────────────────────────────────────────

    function apply(ctx) {
      const style = document.createElement('style')
      style.setAttribute('data-dsh-file-menu', '')
      style.textContent = CSS
      document.head.appendChild(style)
      ctx.effect(() => () => {
        if (style.parentNode !== null) style.parentNode.removeChild(style)
      })

      const locale = ctx.get('locale')
      if (locale !== undefined && locale !== null && typeof locale.register === 'function') {
        ctx.effect(() => {
          const disposers = []
          for (const id of ['zh-CN', 'zh', 'en-US', 'en']) {
            const dict = id.indexOf('zh') === 0 ? DICTS['zh-CN'] : DICTS['en-US']
            try {
              const dispose = locale.register(NS, id, dict)
              if (typeof dispose === 'function') disposers.push(dispose)
            } catch { /* custom namespaces may not be registrable in every profile */ }
          }
          return () => { for (const dispose of disposers) dispose() }
        })
      }
      const t = makeTranslator(locale)

      const pathCache = new Map()

      /** The Session Remote, when this composition has one. */
      const sessionApi = () => {
        try {
          const remote = ctx.remote
          return remote !== undefined && remote !== null ? remote.session : undefined
        } catch {
          return undefined
        }
      }

      const hostAvailable = () => {
        const session = sessionApi()
        return session !== undefined && session !== null && typeof session.openWorkspacePath === 'function'
      }

      /** Resolve the authored path against its Session's workspace root. */
      async function absoluteOf(state) {
        if (state.absolute !== undefined) return state.absolute
        if (typeof state.sessionId !== 'string' || state.sessionId === '') return undefined
        const key = state.sessionId + '\u0000' + state.path
        if (pathCache.has(key)) return pathCache.get(key)
        let files
        try {
          files = ctx.remote === undefined || ctx.remote === null ? undefined : ctx.remote.workspaceFiles
        } catch {
          files = undefined
        }
        if (files === undefined || files === null || typeof files.stat !== 'function') return undefined
        const answer = unwrap(await files.stat(state.sessionId, state.path, new AbortController().signal))
        const absolute = answer !== null && typeof answer === 'object' && typeof answer.absolutePath === 'string'
          ? answer.absolutePath
          : undefined
        if (absolute !== undefined) pathCache.set(key, absolute)
        return absolute
      }

      async function requireAbsolute(state) {
        const absolute = await absoluteOf(state)
        if (absolute === undefined) throw new Error(t('noPath'))
        return absolute
      }

      async function openInDefault(state) {
        const session = sessionApi()
        if (session === undefined || session === null) throw new Error(t('unsupported'))
        const absolute = await requireAbsolute(state)
        const result = await session.openWorkspacePath({ path: absolute })
        if (result === null || result === undefined || result.ok !== true) throw new Error(t('openFailed'))
      }

      async function openWithDialog(state) {
        const absolute = await requireAbsolute(state)
        const response = await fetch(OPEN_WITH_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: absolute }),
        })
        if (!response.ok) throw new Error(t('openWithFailed'))
      }

      async function copyPath(state) {
        const absolute = await absoluteOf(state)
        const text = absolute === undefined ? state.path : absolute
        try {
          if (navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text)
            return text
          }
        } catch { /* fall through to the legacy path */ }
        try {
          const area = document.createElement('textarea')
          area.value = text
          area.setAttribute('readonly', '')
          area.style.position = 'fixed'
          area.style.opacity = '0'
          document.body.appendChild(area)
          area.select()
          document.execCommand('copy')
          document.body.removeChild(area)
          return text
        } catch {
          throw new Error(t('copyFailed'))
        }
      }

      async function revealInExplorer(state) {
        const session = sessionApi()
        if (session === undefined || session === null) throw new Error(t('unsupported'))
        const absolute = await requireAbsolute(state)
        const result = await session.openWorkspacePath({ path: absolute, action: 'reveal' })
        if (result === null || result === undefined || result.ok !== true) throw new Error(t('revealFailed'))
      }

      function openFile(state) {
        const element = state.element
        if (element === null) return Promise.resolve()
        element.click()
        return Promise.resolve()
      }

      const actions = {
        openFile,
        openDefault: openInDefault,
        openWith: openWithDialog,
        copyPath,
        reveal: revealInExplorer,
      }

      /** Warm the absolute path while the menu is open; failures stay silent here. */
      const prefetch = (state) => {
        absoluteOf(state).catch(() => {})
      }

      ctx.effect(() => {
        const onContextMenu = (event) => {
          if (event.defaultPrevented) return
          const resolved = resolveTarget(event)
          if (resolved === null) return
          event.preventDefault()
          event.stopPropagation()
          event.stopImmediatePropagation()
          setMenu({
            x: event.clientX,
            y: event.clientY,
            path: resolved.path,
            sessionId: resolved.sessionId,
            element: resolved.element,
          })
        }
        const onPointerDown = (event) => {
          const target = event.target
          if (target instanceof Element && target.closest('[data-file-menu-ui]') !== null) return
          if (menuStore.current !== null) setMenu(null)
        }
        const onKeyDown = (event) => {
          if (event.key !== 'Escape' || menuStore.current === null) return
          event.stopPropagation()
          setMenu(null)
        }
        const onDismiss = () => {
          if (menuStore.current !== null) setMenu(null)
        }
        document.addEventListener('contextmenu', onContextMenu, true)
        document.addEventListener('mousedown', onPointerDown, true)
        document.addEventListener('keydown', onKeyDown, true)
        window.addEventListener('scroll', onDismiss, true)
        window.addEventListener('resize', onDismiss)
        return () => {
          document.removeEventListener('contextmenu', onContextMenu, true)
          document.removeEventListener('mousedown', onPointerDown, true)
          document.removeEventListener('keydown', onKeyDown, true)
          window.removeEventListener('scroll', onDismiss, true)
          window.removeEventListener('resize', onDismiss)
        }
      })

      ctx.slots.inject('shell.overlay', () => ctx.slots.register({
        name: 'shell.overlay',
        id: 'file-menu',
        order: 40,
      }, () => h(MenuHost, { t, actions, prefetch, hostAvailable: hostAvailable() })))
    }

    return {
      name: 'dsh-file-menu-client',
      // Cordis resolves every Remote namespace as its own injectable service, so
      // the two this module calls are named explicitly beside `remote` itself.
      inject: ['slots', 'remote', 'remote.session', 'remote.workspaceFiles'],
      apply,
    }
  },
})
