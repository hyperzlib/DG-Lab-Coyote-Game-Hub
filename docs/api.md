# 第三方游戏 API

启动服务后可访问：

- Swagger UI：`/api/docs`
- OpenAPI JSON：`/api/openapi.json`

本文主要说明当前 V2 HTTP API 的双通道约定。V1 路由仍保留兼容，但新接入建议使用 V2。

## 通道约定

设备包含 A、B 两个通道。HTTP API 通过游戏 ID 后缀选择通道：

| 目标通道 | `{id}` 格式 |
| --- | --- |
| A 通道 | `{clientId}` 或 `{clientId}.main` |
| B 通道 | `{clientId}.channelB` |

未指定后缀时默认操作 A 通道。

服务端内部的 B 通道模式有三种：

| 模式 | 说明 |
| --- | --- |
| `off` | B 通道关闭，不进行默认输出 |
| `sync` | B 通道强度跟随 A 通道，并乘以 `bChannelStrengthMultiplier` |
| `discrete` | A、B 通道可以分别设置强度和波形 |

当前 V2 HTTP 响应为了兼容旧插件，仍将指定通道投影为单通道结构，并通过 `enableBChannel` 表示 B 通道是否开启。需要分别读取 A/B 状态时，应分别请求 `{clientId}` 和 `{clientId}.channelB`。

## 通用响应

```json5
{
  "status": 1, // 1 表示成功，0 表示失败
  "code": "OK",
  "message": "可选消息",
  "warnings": [
    {
      "code": "WARN::EXAMPLE",
      "message": "非阻断警告"
    }
  ]
}
```

警告不会改变成功状态或 HTTP 状态码。存在警告时，响应还会包含：

- `X-Api-Warning-Code`
- `X-Api-Warning-Message`

## 获取游戏信息

```http
GET /api/v2/game/{id}
```

示例：

```http
GET /api/v2/game/01234567-89ab-cdef-0123-456789abcdef
GET /api/v2/game/01234567-89ab-cdef-0123-456789abcdef.channelB
```

响应：

```json5
{
  "status": 1,
  "code": "OK",
  "isConnected": true,
  "isRunning": true,
  "strengthConfig": {
    "strength": 5,
    "randomStrength": 5
  },
  "gameConfig": {
    "fireStrengthLimit": 30,
    "strengthChangeInterval": [15, 30],
    "enableBChannel": true,
    "bChannelStrengthMultiplier": 1,
    "pulseId": "d6f83af0",
    "firePulseId": "d6f83af0",
    "pulseMode": "single",
    "pulseChangeInterval": 60
  },
  "clientStrength": {
    "strength": 0,
    "limit": 20
  },
  "currentPulseId": "d6f83af0"
}
```

## 获取与设置强度

### 获取强度配置

```http
GET /api/v2/game/{id}/strength
```

### 设置强度配置

```http
POST /api/v2/game/{id}/strength
Content-Type: application/json
```

```json5
{
  "strength": {
    "add": 1
    // 也可以使用 "sub" 或 "set"
  },
  "randomStrength": {
    "set": 5
  }
}
```

使用 `{clientId}.channelB` 可更新 B 通道。B 通道只有在 `discrete` 模式下才会被独立输出；`sync` 模式的实际 B 通道强度由 A 通道和倍率决定。

如果服务器启用了 `allowBroadcastToClients`，可将 `{clientId}` 替换为 `all`。广播到 B 通道时使用 `all.channelB`。

## 获取与设置波形

### 获取波形配置

```http
GET /api/v2/game/{id}/pulse
```

响应中的 `pulseId` 可以是单个字符串，也可以是播放列表：

```json5
{
  "status": 1,
  "code": "OK",
  "currentPulseId": "d6f83af0",
  "pulseId": [
    "d6f83af0",
    "7eae1e5f"
  ]
}
```

### 设置波形

```http
POST /api/v2/game/{id}/pulse
Content-Type: application/json
```

```json5
{
  "pulseId": [
    "d6f83af0",
    "7eae1e5f"
  ]
}
```

使用 `{clientId}.channelB` 可只更新 B 通道波形。

### 获取可用波形列表

```http
GET /api/v2/game/{id}/pulse_list
```

该列表包含服务端波形以及对应游戏的自定义波形。

## 一键开火

```http
POST /api/v2/game/{id}/action/fire
Content-Type: application/json
```

```json5
{
  "strength": 20,
  "time": 5000,
  "override": false,
  "pulseId": "d6f83af0"
}
```

字段说明：

- `strength`：临时增加的强度。
- `time`：持续时间，单位毫秒。
- `override`：`true` 覆盖现有开火结束时间；`false` 累加持续时间。
- `pulseId`：可选，临时使用的开火波形。

对 `{clientId}.channelB` 单独开火时：

- `discrete`：B 通道独立提升强度并输出波形。
- `off`：动作会被接受，但 B 通道不会输出。
- `sync`：动作会被接受并保持成功状态，但返回
  `WARN::B_CHANNEL_SYNC_FIRE`。由于 B 通道强度由 A 通道同步控制，单独对 B 通道开火不会独立提升 B 通道强度，实际输出可能仅包含 B 通道波形。

## MCP API

MCP 端点：

```text
/api/mcp/{clientId}
```

双通道参数使用：

- `aChannel`
- `bChannel`
- `all`，仅部分工具支持

`set_strength`、`increase_strength`、`decrease_strength` 和 `set_pulse` 只允许在 `discrete` 模式下独立控制 B 通道。

`fire_action` 在 B 通道为 `sync` 时仍返回成功，并在结果的 `warnings` 中附加 `WARN::B_CHANNEL_SYNC_FIRE`，不会转换成 MCP error。
