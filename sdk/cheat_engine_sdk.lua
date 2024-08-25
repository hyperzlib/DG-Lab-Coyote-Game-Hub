local coyote_controller_url = "http://127.0.0.1:8920/" -- 控制器地址，本地使用时无需修改
local coyote_target_client_id = "all" -- 填写你的客户端ID，本地使用时使用“all”即可

-------------------------------------------------------------------------------
-- 以下为 Coyote-Streaming-Widget SDK
-------------------------------------------------------------------------------
-- 更新游戏配置，参考api.md中的“设置游戏强度配置”
-- @param param_str string query格式的参数字符串
local function coyote_update_game_config(param_str)
    local http = getInternet()

    local api_url = coyote_controller_url .. "api/game/" .. coyote_target_client_id .. "/strength_config"
    local response = http.postURL(api_url, param_str)

    return response
end

-- 增加强度
-- @param value number 强度值
local function coyote_add_strength(value)
    local param_str = "strength.add=" .. value
    return coyote_update_game_config(param_str)
end

-- 减少强度
-- @param value number 强度值
local function coyote_sub_strength(value)
    local param_str = "strength.sub=" .. value
    return coyote_update_game_config(param_str)
end

-- 设置强度
-- @param value number 强度值
local function coyote_set_strength(value)
    local param_str = "strength.set=" .. value
    return coyote_update_game_config(param_str)
end

-- 增加随机强度
-- @param value number 强度值
local function coyote_add_random_strength(value)
    local param_str = "randomStrength.add=" .. value
    return coyote_update_game_config(param_str)
end

-- 减少随机强度
-- @param value number 强度值
local function coyote_sub_random_strength(value)
    local param_str = "randomStrength.sub=" .. value
    return coyote_update_game_config(param_str)
end

-- 设置随机强度
-- @param value number 强度值
local function coyote_set_random_strength(value)
    local param_str = "randomStrength.set=" .. value
    return coyote_update_game_config(param_str)
end

-- 一键开火
-- @param strength number 强度值
-- @param time number 持续时间，单位秒
-- @param overrideTime boolean 是否覆盖时间
local function coyote_fire(strength, time, overrideTime)
    overrideTime = overrideTime or false
    time = time or 5
    time = time * 1000
    local http = getInternet()
    local param_str = "strength=" .. strength .. "&time=" .. time
    if overrideTime then
        param_str = param_str .. "&override=1"
    end
    local api_url = coyote_controller_url .. "api/game/" .. coyote_target_client_id .. "/fire"
    local response = http.postURL(api_url, param_str)
    return response
end