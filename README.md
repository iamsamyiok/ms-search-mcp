# ms-web-search-mcp

个人网页搜索 MCP 服务(npm 零依赖 STDIO 包, 魔搭 MCP 广场托管部署形态)。

## 工具

| 工具 | 说明 |
|---|---|
| `search_web(query, count=8)` | 网页搜索: cn.bing.com 抓取(零密钥) → 百度兜底; 配置 `ANYSEARCH_API_KEY` 环境变量自动升级 anysearch 引擎 |
| `fetch_page(url, max_chars=6000)` | 抓取网页正文并提取纯文本, 用于阅读搜索结果 |

## 使用

MCP 客户端配置(STDIO):

```json
{
  "mcpServers": {
    "ms-web-search": {
      "command": "npx",
      "args": ["-y", "ms-web-search-mcp@latest"]
    }
  }
}
```

要求 Node.js >= 18。零第三方依赖, npx 直接拉起, 无需构建。

## 魔搭托管部署

GitHub 快速创建 → 托管类型「可托管部署」→ 平台以 STDIO 配置(npx)容器化托管,
托管后端点形如 `https://mcp.api-inference.modelscope.net/<ID>/mcp`。

## 说明

- 搜索走搜索引擎抓取, 仅个人学习研究用途; 请遵守目标站点条款。
- 无任何硬编码密钥; `ANYSEARCH_API_KEY` 为可选环境变量, 留空即纯零密钥模式。
