; =============================================================================
; AutoHotKey functions for Coyote Game Hub
; =============================================================================

global CoyoteControllerURL := "http://127.0.0.1:8920"
global CoyoteTargetClientId := "all"

HttpPost(url, body) {
    ; https://learn.microsoft.com/en-us/windows/win32/winhttp/winhttprequest
    web := ComObject('WinHttp.WinHttpRequest.5.1')
    web.Open("POST", url, false)
    web.SetRequestHeader("Content-Type", "application/x-www-form-urlencoded")
    web.Send(body)
    return web.ResponseText
}

CoyoteUpdateGameConfig(paramStr)
{
    global CoyoteControllerURL, CoyoteTargetClientId

    url := CoyoteControllerURL . "/api/game/" . CoyoteTargetClientId . "/strength_config"
    return HttpPost(url, paramStr)
}

CoyoteAddStrength(value)
{
    return CoyoteUpdateGameConfig("strength.add=" . value)
}

CoyoteSubStrength(value)
{
    return CoyoteUpdateGameConfig("strength.sub=" . value)
}

CoyoteSetStrength(value)
{
    return CoyoteUpdateGameConfig("strength.set=" . value)
}

CoyoteAddRandomStrength(value)
{
    return CoyoteUpdateGameConfig("randomStrength.add=" . value)
}

CoyoteSubRandomStrength(value)
{
    return CoyoteUpdateGameConfig("randomStrength.sub=" . value)
}

CoyoteSetRandomStrength(value)
{
    return CoyoteUpdateGameConfig("randomStrength.set=" . value)
}

CoyoteFire(strength, time)
{
    global CoyoteControllerURL, CoyoteTargetClientId

    timeMs := time * 1000
    url := CoyoteControllerURL . "/api/game/" . CoyoteTargetClientId . "/fire"
    return HttpPost(url, "strength=" . strength . "&time=" . timeMs)
}

; Example usage:
; F1::
; {
;     CoyoteAddStrength(1)
;     return
; }