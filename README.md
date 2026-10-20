# ms-search-mcp

个人 HTTP 搜索 MCP 服务（魔搭 MCP 广场「可托管部署」形态）。零密钥开箱即用。

## 工具

| 工具 | 说明 |
|---|---|
| `search_web(query, count=8)` | 网页搜索：cn.bing.com 抓取（零密钥）→ 百度兜底；服务端配置 `ANYSEARCH_API_KEY` 环境变量时自动升级 anysearch 引擎 |
| `fetch_page(url, max_chars=6000)` | 抓取网页正文并提取纯文本（去脚本/样式），用于阅读搜索结果 |

## 传输

Streamable HTTP（stateless），端点 `/mcp`，端口 `8000`（可用 `PORT` 环境变量覆盖）。

## 本地运行

```bash
pip install -r requirements.txt
python server.py            # http://112.90.76.170:15375/mcp
python test_client.py       # 协议级联调（列出工具+真搜一次）
```

MCP 客户端配置：

```json
{ "mcpServers": { "ms-web-search": { "url": "http://112.90.76.170:15375/mcp", "transport": "streamable_http" } } }
```

## 魔搭托管部署

GitHub 快速创建 → 可托管部署（来源：本仓库）。托管后端点形如
`https://mcp.api-inference.modelscope.net/<ID>/mcp`。

## 说明

- 搜索走搜索引擎抓取，仅个人学习研究用途；请遵守目标站点条款。
- 无任何硬编码密钥；`ANYSEARCH_API_KEY` 为可选环境变量，留空即纯零密钥模式。

## 公网部署（已上线）

- 2核机 systemd 常驻: `ms-search.service` @ `/opt/ms-search-mcp`, 端口 15375
- 公网端点: `http://112.90.76.170:15375/mcp` (Streamable HTTP, stateless)
