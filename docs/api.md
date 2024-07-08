# 第三方插件接口

## 获取游戏信息

```sh
GET /api/game/{clientId}
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "gameConfig": {
        "strength": {
            "strength": 1, // 基础强度
            "randomStrength": 10, // 随机强度，最终强度 = 基础强度 + random(0, 随机强度)
            "minInterval": 10, // 最小随机间隔
            "maxInterval": 15, // 最大随机间隔
            "bChannelMultiplier": 1.0, // B通道强度倍数，如果存在此参数，则会启动B通道
        },
        "pulseId": "pulse-1" // 脉冲ID
    },
    "clientStrength": {
        "strength": 0, // 当前强度
        "limit": 20 // 强度上限
    }
}
```

## 获取脉冲列表

```sh
GET /api/game/{clientId}/pulse_list
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "pulseList": [
        {
            "id": "pulse-1",
            "name": "脉冲1"
        },
        {
            "id": "pulse-2",
            "name": "脉冲2"
        }
    ]
}
```

## 获取游戏强度配置

```sh
GET /api/game/{clientId}/strength_info
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "strengthConfig": { // 强度配置，同上
        "strength": 5,
        "randomStrength": 10,
        "minInterval": 10,
        "maxInterval": 15
    }
}
```

## 设置游戏强度配置

```sh
POST /api/game/{clientId}/strength_info
```

### 请求参数

如果服务器配置```allowBroadcastToClients: true```，可以将请求地址中的```{clientId}```设置为```all```，将设置到所有客户端。


以下是请求参数的类型定义：

```typescript
type SetStrengthConfigRequest = {
    strength?: {
        add?: number; // 增加基础强度
        sub?: number; // 减少强度
        set?: number; // 设置强度
    },
    randomStrength?: {
        add?: number; // 增加随机强度
        sub?: number; // 减少强度
        set?: number; // 设置强度
    },
    minInterval?: {
        set?: number; // 设置最低随机间隔
    },
    maxInterval?: {
        set?: number; // 设置最高随机间隔
    },
}
```

发送请求时，需要发送 JSON POST 请求，例如：

```json5
{
    "strength": {
        "add": 1
    }
}
```

强度配置在服务端已做限制，不会超出范围。插件可以随意发送请求，不需要担心超出范围。

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "message": "成功设置了 1 个游戏的强度配置",
    "successNum": 1
}
```

## 获取游戏当前脉冲ID

```sh
GET /api/game/{clientId}/pulse_id
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "pulseId": "pulse-1"
}
```

## 设置游戏当前脉冲ID

```sh
POST /api/game/{clientId}/pulse_id
```

### 请求参数

如果服务器配置```allowBroadcastToClients: true```，可以将请求地址中的```{clientId}```设置为```all```，将设置到所有客户端。

```json5
{
    "pulseId": "pulse-1" // 脉冲ID
}
```

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "message": "成功设置了 1 个游戏的脉冲ID",
    "successNum": 1
}
```

## 请求错误响应

```json5
{
    "status": 0,
    "code": "ERR::INVALID_REQUEST",
    "message": "请求参数不正确"
}
```
