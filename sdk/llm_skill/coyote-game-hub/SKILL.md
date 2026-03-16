---
name: coyote-game-hub
description: 这是用于通过 Coyote Game Hub API 控制 DG-Lab 郊狼电击设备的 SKILL
metadata:
  {
    "openclaw":
      {
        "requires": { "env": ["CGH_BASE_URL"] },
        "primaryEnv": "CGH_BASE_URL",
      },
  }
---

# Coyote Game Hub

这是用于控制 **DG-Lab 郊狼电击设备**的技能。通过调用 `coyote_http_api.py` 脚本向本地 Coyote Game Hub 服务器发送 HTTP 请求，可以连接郊狼控制器、查询状态、调整电击强度、切换波形、执行开火动作。

## 推荐工作流

1. **获取当前状态**：操作前先调用 `get-game-info` 了解各通道强度、强度上限、B 通道模式（是否可独立控制）、当前波形。
2. **可选：调整强度**：根据需要使用 `set-strength`（精确设置）、`increase-strength`（增加）或 `decrease-strength`（减少）。
3. **可选：切换波形**：先用 `get-pulse-list` 获取可用波形 ID，再用 `set-pulse` 切换。
4. **可选：开火动作**：`fire-action` 在当前强度基础上叠加临时强度，持续指定时间后自动恢复。

建议每次对话最多执行一次动作，且仅在必要时进行调整强度、切换波形、开火动作。

## 关键约束

- **强度范围**：0–200，但实际上限由用户设备的 `strengthLimit` 决定，超出上限会被自动截断（clamp）。A 通道和 B 通道各有独立的强度和上限，操作前须先确认目标通道的上限。
- **B 通道可控性**：B 通道（`channelB`）仅在 `bChannelMode` 为 `discrete`（独立控制）时可以单独操控。若模式为 `off`（已关闭）或 `sync`（与 A 通道同步），则 B 通道无法独立控制，此时只需关注 A 通道状态。
- **fire-action 是临时叠加而非设置**：开火动作会在当前强度基础上叠加指定值，持续结束后自动恢复，不会永久改变强度。叠加量一般建议不超过 30，但以用户要求为准。
- **game_id**：前端显示为“游戏ID”，是一串 UUID 字符串，须由用户提供。

## 命令参考

所有命令通过以下方式调用（`$CGH_BASE_URL` 默认为 `http://127.0.0.1:8920`）：

```bash
python coyote_http_api.py [--base-url $CGH_BASE_URL] <command> [参数...]
```

### get-game-info

获取游戏状态信息。返回内容包括：各通道当前强度、强度上限、随机强度范围、B 通道模式、当前波形 ID、电击是否已启动等。**推荐在每次操作前调用此命令了解当前状态。**

```bash
python coyote_http_api.py get-game-info <game_id>
```

### set-strength

将指定通道强度**精确设置**为某个值。超过通道上限时会自动截断，建议先获取状态确认 `strengthLimit` 后再设置。

```bash
python coyote_http_api.py set-strength <game_id> --channel main|channelB --strength <0-200>
```

### increase-strength

**增加**指定通道的电击强度，增加后不超过该通道上限。

```bash
python coyote_http_api.py increase-strength <game_id> --channel main|channelB --amount <1-200>
```

### decrease-strength

**减少**指定通道的电击强度，减少后不低于 0。

```bash
python coyote_http_api.py decrease-strength <game_id> --channel main|channelB --amount <1-200>
```

### get-pulse

获取指定通道的当前波形信息及可用波形 ID 列表。

```bash
python coyote_http_api.py get-pulse <game_id> --channel main|channelB
```

### set-pulse

设置指定通道的电击波形（pulseId 可从 `get-pulse-list` 获取）。

```bash
python coyote_http_api.py set-pulse <game_id> --channel main|channelB --pulse-id <pulseId>
```

### get-pulse-list

获取服务器上所有可用的波形列表（包含 id 和 name）。

```bash
python coyote_http_api.py get-pulse-list <game_id> [--full]
```

### fire-action

对指定通道执行**一键开火动作**：在当前强度基础上临时叠加 `strength` 点，持续 `time` 毫秒后自动恢复原强度。`--channel all` 表示同时对 A 通道和 B 通道触发。

```bash
python coyote_http_api.py fire-action <game_id> \
  --channel main|channelB|all \
  --strength <叠加强度，推荐 1-30，但以用户要求为准> \
  [--time <持续毫秒，默认 5000>] \
  [--override] \
  [--pulse-id <pulseId>]
```

## 返回格式

所有命令均输出 JSON。`status=1` 表示成功，`status=0` 表示失败。`message` 字段包含自然语言描述，方便直接判断结果及当前状态。

**成功示例（increase-strength）：**
```json
{
  "status": 1,
  "code": "OK",
  "gameId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "channel": "main",
  "message": "强度增加成功。通道：A通道，当前强度: 15/上限: 20，随机强度范围: ±0，电击状态: 已启动。 当前电击强度较高。"
}
```

**失败示例：**
```json
{
  "status": 0,
  "code": "ERR::GAME_NOT_FOUND",
  "message": "Game not reachable via HTTP API"
}
```