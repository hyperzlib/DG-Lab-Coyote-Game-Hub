# MCP (Model Context Protocol) API 文档

本文档描述了基于 JSON-RPC 2.0 的 Model Context Protocol API，用于控制郊狼游戏。

## 基础信息

- **协议版本**: JSON-RPC 2.0
- **基础路径**: `/api/mcp/{gameId}`
- **游戏ID**: 可以是具体的游戏ID或 `all`（表示所有游戏）

## 端点

### 1. MCP 主接口
```
POST /api/mcp/{gameId}
```

### 2. 获取 MCP API 信息
```
GET /api/mcp/{gameId}/info
```

## 支持的方法

### 1. 获取游戏状态 (`game.getStatus`)

获取指定游戏的当前状态信息。

**请求示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "method": "game.getStatus",
  "params": {}
}
```

**响应示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "result": {
    "gameId": "client123",
    "isConnected": true,
    "currentStrength": 15,
    "strengthLimit": 200,
    "currentPulseId": "basic_pulse",
    "lastActivity": "2024-06-29T10:30:00.000Z"
  }
}
```

### 2. 设置强度 (`game.setStrength`)

设置游戏的当前强度值。

**请求示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "method": "game.setStrength",
  "params": {
    "strength": 25
  }
}
```

**响应示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "2",
  "result": {
    "success": true,
    "newStrength": 25
  }
}
```

### 3. 设置波形 (`game.setPulse`)

设置游戏使用的波形。

**请求示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "method": "game.setPulse",
  "params": {
    "pulseId": "intense_pulse"
  }
}
```

**响应示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "3",
  "result": {
    "success": true,
    "newPulseId": "intense_pulse"
  }
}
```

### 4. 开火动作 (`game.fire`)

执行一键开火操作。

**请求示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "method": "game.fire",
  "params": {
    "strength": 50,
    "duration": 3000,
    "pulseId": "fire_pulse"
  }
}
```

**响应示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "4",
  "result": {
    "success": true,
    "fireId": "fire_1719659400000_abc123def",
    "actualDuration": 3000
  }
}
```

### 5. 获取波形列表 (`game.getPulseList`)

获取所有可用的波形列表。

**请求示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "method": "game.getPulseList",
  "params": {}
}
```

**响应示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "5",
  "result": {
    "pulses": [
      {
        "id": "basic_pulse",
        "name": "基础波形"
      },
      {
        "id": "intense_pulse",
        "name": "强烈波形"
      },
      {
        "id": "fire_pulse",
        "name": "开火波形"
      }
    ]
  }
}
```

### 6. 列出方法 (`mcp.listMethods`)

获取所有支持的方法列表。

**请求示例:**
```json
{
  "jsonrpc": "2.0",
  "id": "6",
  "method": "mcp.listMethods",
  "params": {}
}
```

## 错误处理

### 错误代码

- `-32700`: 解析错误
- `-32600`: 无效请求
- `-32601`: 方法不存在
- `-32602`: 无效参数
- `-32603`: 内部错误
- `-32001`: 游戏不存在
- `-32002`: 游戏未连接
- `-32003`: 无效强度值
- `-32004`: 无效波形ID
- `-32005`: 操作失败

### 错误响应示例

```json
{
  "jsonrpc": "2.0",
  "id": "1",
  "error": {
    "code": -32001,
    "message": "游戏 invalid_game 不存在"
  }
}
```

## 使用示例

### Python 示例

```python
import requests
import json

# 获取游戏状态
def get_game_status(game_id):
    url = f"http://localhost:8080/api/mcp/{game_id}"
    payload = {
        "jsonrpc": "2.0",
        "id": "1",
        "method": "game.getStatus",
        "params": {}
    }
    response = requests.post(url, json=payload)
    return response.json()

# 设置强度
def set_strength(game_id, strength):
    url = f"http://localhost:8080/api/mcp/{game_id}"
    payload = {
        "jsonrpc": "2.0",
        "id": "2",
        "method": "game.setStrength",
        "params": {"strength": strength}
    }
    response = requests.post(url, json=payload)
    return response.json()

# 执行开火
def fire_action(game_id, strength, duration=5000):
    url = f"http://localhost:8080/api/mcp/{game_id}"
    payload = {
        "jsonrpc": "2.0",
        "id": "3",
        "method": "game.fire",
        "params": {
            "strength": strength,
            "duration": duration
        }
    }
    response = requests.post(url, json=payload)
    return response.json()

# 使用示例
game_id = "client123"
print(get_game_status(game_id))
print(set_strength(game_id, 30))
print(fire_action(game_id, 50, 3000))
```

### JavaScript 示例

```javascript
// MCP API 客户端类
class McpApiClient {
    constructor(baseUrl, gameId) {
        this.baseUrl = baseUrl;
        this.gameId = gameId;
        this.requestId = 1;
    }

    async request(method, params = {}) {
        const url = `${this.baseUrl}/api/mcp/${this.gameId}`;
        const payload = {
            jsonrpc: "2.0",
            id: this.requestId++,
            method,
            params
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        return await response.json();
    }

    async getStatus() {
        return await this.request('game.getStatus');
    }

    async setStrength(strength) {
        return await this.request('game.setStrength', { strength });
    }

    async setPulse(pulseId) {
        return await this.request('game.setPulse', { pulseId });
    }

    async fire(strength, duration = 5000, pulseId = null) {
        const params = { strength, duration };
        if (pulseId) params.pulseId = pulseId;
        return await this.request('game.fire', params);
    }

    async getPulseList() {
        return await this.request('game.getPulseList');
    }

    async listMethods() {
        return await this.request('mcp.listMethods');
    }
}

// 使用示例
const client = new McpApiClient('http://localhost:8080', 'client123');

// 获取游戏状态
client.getStatus().then(result => console.log(result));

// 设置强度
client.setStrength(25).then(result => console.log(result));

// 执行开火
client.fire(50, 3000).then(result => console.log(result));
```

## 注意事项

1. **游戏ID**: 确保使用正确的游戏ID，可以通过其他API接口获取当前连接的游戏列表。

2. **强度限制**: 强度值必须在 0-200 之间，超出范围将返回错误。

3. **连接状态**: 某些操作需要游戏处于连接状态，未连接时会返回相应错误。

4. **波形验证**: 设置波形时会验证波形ID是否存在，不存在的波形ID会返回错误。

5. **并发请求**: API支持并发请求，但建议合理控制请求频率以避免对系统造成压力。
