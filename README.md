# dsh-file-menu

在 DeepSeek Harness **桌面客户端**里，右键对话中的文件名，弹出文件操作菜单。

## 功能

对话里这两处可以右键：

- 回复正文里的 Markdown 文件链接，例如 `[app.ts](src/app.ts)`（带 `#L10-L20` 也行）
- `@` 引用的文件

右键后弹出菜单：

| 菜单项 | 作用 |
|---|---|
| 打开文件 | 走 DSH 自己的文档预览 |
| 在默认应用打开 | 用系统默认程序打开 |
| 选择其他应用打开 | 弹 Windows 自带的「打开方式」对话框 |
| 复制路径 | 复制文件绝对路径 |
| 在资源管理器中打开 | 在资源管理器里定位该文件 |

## 安装

```bash
dsh plugin --profile desktop add github:starash07/dsh-file-menu
```

或者把仓库下载到本地，用 `link:` 指向目录：

```bash
dsh plugin --profile desktop add link:<本目录的绝对路径>
```

安装后重启桌面客户端。

## 说明

- 只做 Windows。Mac / Linux 没有开发，也没验证。
- 工具调用行、交付卡片里的文件不接管（它们各自已有入口）。
- 依赖桌面端的渲染结构：DSH 改了文件链接的类名或 `data-ref-chip` 属性后需要适配。
- 打开 / 定位走 DSH 自带的 Session Remote；只有「选择其他应用打开」由本插件的一小段后台代码调 `rundll32.exe shell32.dll,OpenAs_RunDLL` 完成，路径会先经过文件系统校验。

## 结构

| 文件 | 作用 |
|---|---|
| `client.js` | 浏览器端：右键识别、菜单、调用现有接口 |
| `index.js` | 宿主端：只有 `选择其他应用打开` 这一条路由 |
| `cordis.patch.yml` | 插件注册 |

## License

MIT
