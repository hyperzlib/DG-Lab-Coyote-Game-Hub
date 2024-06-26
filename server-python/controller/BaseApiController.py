from uuid import uuid4
from aiohttp.web import Request, WebSocketResponse
import utils.web

class BaseApiController:
    @staticmethod
    async def create_client_id(request: Request):
        client_id = uuid4()
        return await utils.web.api_response(0, {"client_id": str(client_id)}, request=request)
    

    @staticmethod
    async def get_websocket_urls(request: Request):
        client_id = request.query.get("client_id")
        ip_list = utils.web.get_outgoing_ip()

        return await utils.web.api_response(0, {"client_id": client_id, "ip_list": ip_list}, request=request)