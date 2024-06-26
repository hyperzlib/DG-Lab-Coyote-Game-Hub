from instances import loop
from service.DGLabPulse import dglab_pulse
import sys
import traceback
from aiohttp import web
from controller.DGLabWSController import DGLabWSController
from server.service.DGLabPulse import DGLabPulseService
import utils.web

@web.middleware
async def error_handler(request, handler):
    try:
        response = await handler(request)
        return response
    except utils.web.ParamInvalidException as ex:
        return await utils.web.api_response(
            -1,
            error={"code": "invalid-params", "message": "Invalid params.", "invalid_params": ex.param_list},
            http_status=400,
            request=request,
        )
    except web.HTTPException as ex:
        return await utils.web.api_response(
            -1,
            error={"code": f"http_{ex.status}", "message": ex.reason},
            http_status=ex.status,
            request=request,
        )
    except Exception as ex:
        error_id = utils.web.generate_uuid()
        err_msg = f"Server error [{error_id}]: {ex}"
        print(err_msg, file=sys.stderr)
        traceback.print_exc()
        print(f"End of error [{error_id}]", file=sys.stderr)

        return await utils.web.api_response(
            -1,
            error={"code": "internal-server-error", "message": err_msg},
            http_status=500,
            request=request,
        )

app = web.Application(
    middlewares=[
        error_handler,
    ]
)

dglab_ws = DGLabWSController()

# 生命周期
async def on_setup(app):
    await dglab_pulse.initialize()


async def on_cleanup(app):
    print("Stopping...")
    await dglab_pulse.destory()
    await dglab_ws.destory()


app.on_startup.append(on_setup)
app.on_cleanup.append(on_cleanup)


# 路由
async def http_index(request):
    return web.Response(status=307, headers={"Location": "/web/"})

app.router.add_get("/", http_index)
app.router.add_get("/dglab_ws/{id:.*}", dglab_ws.connection_handler)

try:
    web.run_app(
        app,
        host="0.0.0.0",
        port=5180,
        loop=loop,
    )
except KeyboardInterrupt:
    print("Server stopped by user.")
    loop.stop()
    loop.close()