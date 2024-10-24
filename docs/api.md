# 第三方插件接口

## 获取游戏信息

```sh
GET /api/v2/game/{clientId}
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "strengthConfig": {
        "strength": 5, // 基础强度
        "randomStrength": 5 // 随机强度，（强度范围：[strength, strength+randomStrength]）
    },
    "gameConfig": {
        "strengthChangeInterval": [15, 30], // 随机强度变化间隔，单位：秒
        "enableBChannel": false, // 是否启用B通道
        "bChannelStrengthMultiplier": 1, // B通道强度倍数
        "pulseId": "d6f83af0", // 当前波形列表，可能是string或者string[]
        "pulseMode": "single", // 波形播放模式，single: 单个波形, sequence: 列表顺序播放, random: 随机播放
        "pulseChangeInterval": 60
    },
    "clientStrength": {
        "strength": 0, // 客户端当前强度
        "limit": 20 // 客户端强度上限
    },
    "currentPulseId": "d6f83af0" // 当前正在播放的波形ID
}
```

## 获取波形列表

```sh
GET /api/v2/pulse_list # 获取服务器配置的波形列表
GET /api/v2/game/{clientId}/pulse_list # 获取完整的波形列表（包括客户端自定义波形）
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
            "id": "d6f83af0", // 波形ID
            "name": "呼吸" // 波形名称
        },
        // ...
    ]
}
```

## 获取游戏强度信息

```sh
GET /api/v2/game/{clientId}/strength
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "strengthConfig": {
        "strength": 5, // 基础强度
        "randomStrength": 5 // 随机强度，（强度范围：[strength, strength+randomStrength]）
    }
}
```

## 设置游戏强度配置

```sh
POST /api/v2/game/{clientId}/strength
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
    }
}
```

使用JSON POST格式发送请求的Post Body：

```json5
{
    "strength": {
        "add": 1
    }
}
```

使用x-www-form-urlencoded格式发送请求的Post Body：

```html
strength.add=1
```

强度配置在服务端已做限制，不会超出范围。插件可以随意发送请求，不需要担心超出范围。

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "message": "成功设置了 1 个游戏的强度配置",
    "successClientIds": [
        "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
    ]
}
```

## 获取游戏当前波形ID

```sh
GET /api/v2/game/{clientId}/pulse
```

### 请求参数

无

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "pulseId": "d6f83af0"
}
```

或

```json5
{
    "status": 1,
    "code": "OK",
    "pulseId": [
        "d6f83af0",
        "7eae1e5f",
        "eea0e4ce",
        "2cbd592e"
    ]
}
```

## 设置游戏当前波形ID

```sh
POST /api/v2/game/{clientId}/pulse
```

### 请求参数

如果服务器配置```allowBroadcastToClients: true```，可以将请求地址中的```{clientId}```设置为```all```，将设置到所有客户端。

使用JSON POST格式发送请求的Post Body：

```json5
{
    "pulseId": "d6f83af0" // 波形ID
}
```

或

```json5
{
    "pulseId": [
        "d6f83af0",
        "7eae1e5f",
        "eea0e4ce",
        "2cbd592e"
    ] // 波形ID列表
}
```

使用x-www-form-urlencoded格式发送请求的Post Body：

```html
pulseId=d6f83af0
```

或

```html
pulseId[]=d6f83af0&pulseId[]=7eae1e5f&pulseId[]=eea0e4ce&pulseId[]=2cbd592e
```

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "message": "成功设置了 1 个游戏的波形ID",
    "successClientIds": [
        "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
    ]
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


## 一键开火

```sh
POST /api/v2/game/{clientId}/action/fire
```

### 请求参数

如果服务器配置```allowBroadcastToClients: true```，可以将请求地址中的```{clientId}```设置为```all```，将设置到所有客户端。


以下是请求参数的类型定义：

```json5
{
    "strength": 20, // 一键开火强度，最高40
    "time": 5000, // （可选）一键开火时间，单位：毫秒，默认为5000，最高30000（30秒）
    "override": false, // （可选）多次一键开火时，是否重置时间，true为重置时间，false为叠加时间，默认为false
    "pulseId": "d6f83af0" // （可选）一键开火的波形ID
}
```

使用JSON POST格式发送请求的Post Body：

```json5
{
    "strength": 20,
    "time": 5000
}
```

使用x-www-form-urlencoded格式发送请求的Post Body：

```html
strength=20&time=5000
```

强度配置在服务端已做限制，不会超出范围。

### 响应

```json5
{
    "status": 1,
    "code": "OK",
    "message": "成功向 1 个游戏发送了一键开火指令",
    "successClientIds": [
        "3ab0773d-69d0-41af-b74b-9c6ce6507f65"
    ]
}
```
