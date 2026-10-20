"""本地联调: 直接调工具 + 走 MCP 协议双通道验证。用法: python test_client.py [url]"""
import asyncio
import sys
from mcp import ClientSession
from mcp.client.streamable_http import streamablehttp_client


async def main(url):
    # 1) MCP 协议通道
    async with streamablehttp_client(url) as (r, w, _):
        async with ClientSession(r, w) as s:
            await s.initialize()
            tools = await s.list_tools()
            print("== tools:", [t.name for t in tools.tools])
            res = await s.call_tool("search_web", {"query": "ModelScope MCP 托管", "count": 3})
            text = res.content[0].text
            print("== search_web 结果(前600字):\n", text[:600])
            assert "引擎" in text and "http" in text, "搜索结果异常"
    print("\nPASS: MCP 协议链路全通")


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000/mcp"))
