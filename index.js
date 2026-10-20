#!/usr/bin/env node
/** ms-web-search-mcp — 零依赖 MCP STDIO 服务器: 网页搜索(bing抓取零密钥+baidu兜底) + 网页正文提取
 * 协议: MCP stdio (newline-delimited JSON-RPC)。用法: npx ms-web-search-mcp@latest
 * 可选环境变量: ANYSEARCH_API_KEY (存在时 search_web 优先走 anysearch 引擎)
 */
import readline from "node:readline";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const HEADERS = { "User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6" };

// ---------- 工具函数 ----------
const stripTags = (s) =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x?27;|&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/\s+/g, " ")
    .trim();

async function fetchText(url, timeout = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeout);
  try {
    const r = await fetch(url, { headers: HEADERS, redirect: "follow", signal: ac.signal });
    const ct = r.headers.get("content-type") || "";
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const body = await r.text();
    return { body, ct, finalUrl: r.url };
  } finally {
    clearTimeout(t);
  }
}

async function anysearch(query, count) {
  const key = (process.env.ANYSEARCH_API_KEY || "").trim();
  if (!key) return null;
  try {
    const r = await fetch("https://api.anysearch.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "search", arguments: { query, count: Math.min(count, 20) } },
      }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    const text = j?.result?.content?.[0]?.text;
    if (typeof text === "string" && text.trim()) return `引擎: anysearch\n\n${text.slice(0, count * 400)}`;
  } catch {}
  return null;
}

async function bing(query, count) {
  const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${Math.min(Math.max(count, 1), 20)}&setlang=zh-hans`;
  const { body } = await fetchText(url);
  const out = [];
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/g;
  let m;
  while ((m = re.exec(body)) && out.length < count) {
    const href = m[1];
    const seg = m[0];
    const title = stripTags(m[2]);
    if (!title || !href) continue;
    const p = seg.match(/<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = p ? stripTags(p[1]).slice(0, 200) : "";
    const n = out.length + 1;
    out.push(`[${n}] ${title}\n    ${href}\n    ${snippet}`);
  }
  if (!out.length) throw new Error("bing 解析为空(可能触发风控)");
  return "引擎: bing\n\n" + out.join("\n");
}

async function baidu(query, count) {
  const url = `https://www.baidu.com/s?wd=${encodeURIComponent(query)}&rn=${Math.min(Math.max(count, 1), 20)}`;
  const { body } = await fetchText(url);
  const out = [];
  const re = /<h3[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(body)) && out.length < count) {
    const title = stripTags(m[2]);
    if (!title) continue;
    const n = out.length + 1;
    out.push(`[${n}] ${title}\n    ${m[1]}\n    `);
  }
  if (!out.length) throw new Error("baidu 解析为空");
  return "引擎: baidu\n\n" + out.join("\n");
}

async function searchWeb(args) {
  const query = String(args.query || "").trim();
  const count = Math.max(1, Math.min(parseInt(args.count, 10) || 8, 20));
  if (!query) return { isError: true, content: [{ type: "text", text: "错误: query 不能为空" }] };
  const errors = [];
  const up = await anysearch(query, count);
  if (up) return { content: [{ type: "text", text: up }] };
  for (const eng of [bing, baidu]) {
    try {
      return { content: [{ type: "text", text: await eng(query, count) }] };
    } catch (e) {
      errors.push(`${eng.name}: ${e.message}`);
    }
  }
  return { isError: true, content: [{ type: "text", text: "全部搜索引擎失败:\n" + errors.join("\n") }] };
}

async function fetchPage(args) {
  const url = String(args.url || "").trim();
  const maxChars = Math.max(500, Math.min(parseInt(args.max_chars, 10) || 6000, 20000));
  if (!/^https?:\/\//.test(url)) return { isError: true, content: [{ type: "text", text: "错误: 仅支持 http(s) URL" }] };
  try {
    const { body, ct, finalUrl } = await fetchText(url, 25000);
    if (!/html|text/.test(ct)) return { content: [{ type: "text", text: `非文本内容(${ct || "unknown"})` }] };
    const cleaned = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(nav|footer|header|aside|noscript)[\s\S]*?<\/\1>/gi, " ");
    const text = stripTags(cleaned).replace(/ {3,}/g, "  ");
    return { content: [{ type: "text", text: `URL: ${finalUrl}\n\n${text.slice(0, maxChars)}` }] };
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `抓取失败: ${e.message}` }] };
  }
}

// ---------- MCP 协议 ----------
const TOOLS = [
  {
    name: "search_web",
    description:
      "网页搜索。返回标题+链接+摘要列表。零密钥可用(必应抓取, 百度兜底); 服务端配置 ANYSEARCH_API_KEY 环境变量时自动升级为 anysearch 引擎。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "搜索关键词" },
        count: { type: "number", description: "结果条数(1-20, 默认8)" },
      },
      required: ["query"],
    },
  },
  {
    name: "fetch_page",
    description: "抓取网页正文并提取纯文本(去除脚本/样式), 用于阅读搜索结果链接。",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "http(s) 网页地址" },
        max_chars: { type: "number", description: "返回正文最大字符数(默认6000)" },
      },
      required: ["url"],
    },
  },
];

async function callTool(name, args) {
  if (name === "search_web") return searchWeb(args || {});
  if (name === "fetch_page") return fetchPage(args || {});
  return { isError: true, content: [{ type: "text", text: `未知工具: ${name}` }] };
}

const SERVER_INFO = { name: "ms-web-search", version: "1.0.0" };

function handle(msg) {
  if (!msg || typeof msg !== "object") return null;
  const { id, method, params } = msg;
  if (id === undefined || id === null) return null; // notification
  try {
    if (method === "initialize")
      return {
        id,
        result: {
          protocolVersion: params?.protocolVersion || "2025-03-26",
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
        },
      };
    if (method === "ping") return { id, result: {} };
    if (method === "tools/list") return { id, result: { tools: TOOLS } };
    if (method === "tools/call") {
      // 异步执行, 完成后由调用方发送
      callTool(params?.name, params?.arguments)
        .then((result) => send({ id, result }))
        .catch((e) => send({ id, result: { isError: true, content: [{ type: "text", text: String(e) }] } }));
      return null; // async
    }
    return { id, error: { code: -32601, message: `method not found: ${method}` } };
  } catch (e) {
    return { id, error: { code: -32603, message: String(e) } };
  }
}

const send = (obj) => {
  if (obj) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", ...obj }) + "\n");
};

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const s = line.trim();
  if (!s) return;
  let msg;
  try {
    msg = JSON.parse(s);
  } catch {
    return;
  }
  send(handle(msg));
});
rl.on("close", () => process.exit(0));
