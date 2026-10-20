"""ms-search-mcp — 个人 HTTP 搜索 MCP 服务 (魔搭可托管部署形态)

传输: streamable-http, stateless
引擎: cn.bing.com 抓取(零密钥) → 百度兜底; 可选 anysearch(环境变量 ANYSEARCH_API_KEY 存在时优先)
启动: python server.py  (监听 0.0.0.0:8000, 端点 /mcp)
"""
import os
import re
import json
import urllib.parse

import httpx
from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
HEADERS = {"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6"}

mcp = FastMCP(
    "ms-search",
    host="0.0.0.0",
    port=int(os.environ.get("PORT", "8000")),
    stateless_http=True,
)


# ---------- 引擎实现 ----------

def _anysearch(query: str, count: int) -> str | None:
    """可选引擎: 配了 ANYSEARCH_API_KEY 才启用。失败返回 None 静默降级。"""
    key = os.environ.get("ANYSEARCH_API_KEY", "").strip()
    if not key:
        return None
    payload = {"jsonrpc": "2.0", "id": 1, "method": "tools/call",
               "params": {"name": "search",
                          "arguments": {"query": query, "count": min(count, 20)}}}
    try:
        r = httpx.post("https://api.anysearch.com/mcp", json=payload,
                       headers={"Authorization": f"Bearer {key}"}, timeout=20)
        content = r.json()["result"]["content"][0]["text"]
        if isinstance(content, str) and content.strip():
            return f"引擎: anysearch\n\n{content[:count * 400]}"
    except Exception:
        pass
    return None


def _bing(query: str, count: int) -> str:
    q = urllib.parse.quote(query)
    url = f"https://cn.bing.com/search?q={q}&count={min(max(count, 1), 20)}&setlang=zh-hans"
    r = httpx.get(url, headers=HEADERS, timeout=20, follow_redirects=True)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for li in soup.select("li.b_algo")[:count]:
        a = li.select_one("h2 a")
        if not a or not a.get("href"):
            continue
        title = a.get_text(" ", strip=True)
        sn = li.select_one(".b_caption p") or li.select_one("p")
        snippet = sn.get_text(" ", strip=True) if sn else ""
        n = len(out) + 1
        out.append(f"[{n}] {title}\n    {a['href']}\n    {snippet[:200]}")
    if not out:
        raise RuntimeError("bing 解析为空(可能触发风控)")
    return f"引擎: bing\n\n" + "\n".join(out)


def _baidu(query: str, count: int) -> str:
    q = urllib.parse.quote(query)
    url = f"https://www.baidu.com/s?wd={q}&rn={min(max(count, 1), 20)}"
    r = httpx.get(url, headers=HEADERS, timeout=20, follow_redirects=True)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    out = []
    for div in soup.select("div.result, div.c-container")[:count]:
        a = div.select_one("h3 a")
        if not a:
            continue
        title = a.get_text(" ", strip=True)
        href = a.get("href", "")
        sn = div.select_one(".c-abstract, [class*=content]")
        snippet = sn.get_text(" ", strip=True) if sn else ""
        n = len(out) + 1
        out.append(f"[{n}] {title}\n    {href}\n    {snippet[:200]}")
    if not out:
        raise RuntimeError("baidu 解析为空")
    return f"引擎: baidu\n\n" + "\n".join(out)


# ---------- MCP 工具 ----------

@mcp.tool()
def search_web(query: str, count: int = 8) -> str:
    """网页搜索。返回标题+链接+摘要列表。零密钥可用(必应抓取, 百度兜底);
    服务端配置 ANYSEARCH_API_KEY 环境变量时自动升级为 anysearch 引擎。"""
    query = query.strip()
    if not query:
        return "错误: query 不能为空"
    count = max(1, min(int(count), 20))
    errors = []
    up = _anysearch(query, count)
    if up:
        return up
    for eng in (_bing, _baidu):
        try:
            return eng(query, count)
        except Exception as e:
            errors.append(f"{eng.__name__}: {e}")
    return "全部搜索引擎失败:\n" + "\n".join(errors)


@mcp.tool()
def fetch_page(url: str, max_chars: int = 6000) -> str:
    """抓取网页正文并提取纯文本(去除脚本/样式), 用于阅读搜索结果链接。"""
    url = url.strip()
    if not re.match(r"^https?://", url):
        return "错误: 仅支持 http(s) URL"
    try:
        r = httpx.get(url, headers=HEADERS, timeout=25, follow_redirects=True)
        r.raise_for_status()
    except Exception as e:
        return f"抓取失败: {e}"
    ctype = r.headers.get("content-type", "")
    if "html" not in ctype and "text" not in ctype:
        return f"非文本内容({ctype or 'unknown'}), 大小 {len(r.content)} 字节"
    soup = BeautifulSoup(r.text, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
        tag.decompose()
    text = soup.get_text("\n", strip=True)
    text = re.sub(r"\n{3,}", "\n\n", text)
    head = f"URL: {r.url}\n状态: {r.status_code}\n\n"
    return head + text[: max(500, min(int(max_chars), 20000))]


if __name__ == "__main__":
    mcp.run(transport="streamable-http")
