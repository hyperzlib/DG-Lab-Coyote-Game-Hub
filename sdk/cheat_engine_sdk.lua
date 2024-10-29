local coyote_connect_code = "all@http://127.0.0.1:8920/" -- 控制器链接码，本地使用时无需修改

-------------------------------------------------------------------------------
-- 以下为 Coyote Game Hub SDK
-- 本SDK提供了一些常用的接口，用于与Coyote Game Hub进行交互
-------------------------------------------------------------------------------

-- 获取controller_url和target_client_id
---@param coyote_connect_code string
---@return string, string
local function coyote_get_connect_info(coyote_connect_code)
    local coyote_target_client_id, coyote_controller_url = coyote_connect_code:split("@")
    if not coyote_controller_url then
        coyote_controller_url = coyote_target_client_id
        coyote_target_client_id = "all"
    end
    return coyote_target_client_id, coyote_controller_url
end

-- 获取controller_url和target_client_id
coyote_target_client_id, coyote_controller_url = coyote_get_connect_info(coyote_connect_code)

-- 更新当前强度，参考api.md中的“设置游戏强度配置”
---@param param_str string query格式的参数字符串
---@return unknown
function coyote_api_update_strength(param_str)
    local http = getInternet()

    local api_url = coyote_controller_url .. "api/v2/game/" .. coyote_target_client_id .. "/strength"
    local response = http.postURL(api_url, param_str)

    return response
end

-- 增加强度
---@param value number 强度值
function coyote_add_strength(value)
    local param_str = "strength.add=" .. value
    return coyote_api_update_strength(param_str)
end

-- 减少强度
---@param value number 强度值
function coyote_sub_strength(value)
    local param_str = "strength.sub=" .. value
    return coyote_api_update_strength(param_str)
end

-- 设置强度
---@param value number 强度值
function coyote_set_strength(value)
    local param_str = "strength.set=" .. value
    return coyote_api_update_strength(param_str)
end

-- 增加随机强度
---@param value number 强度值
function coyote_add_random_strength(value)
    local param_str = "randomStrength.add=" .. value
    return coyote_api_update_strength(param_str)
end

-- 减少随机强度
---@param value number 强度值
function coyote_sub_random_strength(value)
    local param_str = "randomStrength.sub=" .. value
    return coyote_api_update_strength(param_str)
end

-- 设置随机强度
---@param value number 强度值
function coyote_set_random_strength(value)
    local param_str = "randomStrength.set=" .. value
    return coyote_api_update_strength(param_str)
end

-- 一键开火
---@param strength number 强度值
function coyote_api_action_fire(strength, time, overrideTime, pulseId)
    overrideTime = overrideTime or false
    pulseId = pulseId or nil

    time = time or 5
    time = time * 1000
    local http = getInternet()

    local param_str = "strength=" .. strength .. "&time=" .. time

    if overrideTime then
        param_str = param_str .. "&override=true"
    end
    if pulseId then
        param_str = param_str .. "&pulseId=" .. pulseId
    end

    local api_url = coyote_controller_url .. "api/v2/game/" .. coyote_target_client_id .. "/action/fire"
    local response = http.postURL(api_url, param_str)
    return response
end