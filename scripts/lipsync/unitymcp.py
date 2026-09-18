#!/usr/bin/env python3
"""Drive the MCP for Unity server over HTTP JSON-RPC (stdlib only).

The server (`uvx --from mcpforunityserver mcp-for-unity --transport http
--http-url http://127.0.0.1:8080`) speaks Streamable HTTP: POST JSON-RPC to
/mcp, cache the Mcp-Session-Id header, responses arrive as SSE `data:` lines.
Used by the E5 lip-sync harness re-run when the session has no MCP tools loaded.

  python3 scripts/lipsync/unitymcp.py instances
  python3 scripts/lipsync/unitymcp.py state
  python3 scripts/lipsync/unitymcp.py exec 'return UnityEditor.EditorApplication.isPlaying;'
  python3 scripts/lipsync/unitymcp.py exec-file snippet.cs

execute_code uses codedom (C# 6): no `?.`, no `$"..."` string interpolation issues
are avoided by keeping snippets simple; `return` a string/bool/number.
"""
import json
import sys
import time
import urllib.request

URL = "http://127.0.0.1:8080/mcp"


class Unity:
    def __init__(self, url=URL):
        self.url = url
        self.sid = None
        self.n = 0
        self._init()

    def _post(self, body):
        self.n += 1
        headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
        if self.sid:
            headers["Mcp-Session-Id"] = self.sid
        req = urllib.request.Request(self.url, data=json.dumps(body).encode(), headers=headers)
        r = urllib.request.urlopen(req, timeout=120)
        self.sid = r.headers.get("Mcp-Session-Id") or self.sid
        raw = r.read().decode()
        msgs = []
        for line in raw.splitlines():
            if line.startswith("data:"):
                try:
                    msgs.append(json.loads(line[5:].strip()))
                except Exception:
                    pass
        if not msgs and raw.strip():
            try:
                msgs = [json.loads(raw)]
            except Exception:
                msgs = [{"raw": raw[:500]}]
        return msgs

    def _init(self):
        self._post({"jsonrpc": "2.0", "id": 1, "method": "initialize",
                    "params": {"protocolVersion": "2025-03-26", "capabilities": {},
                               "clientInfo": {"name": "unitymcp.py", "version": "1"}}})
        try:
            self._post({"jsonrpc": "2.0", "method": "notifications/initialized"})
        except Exception:
            pass

    def call(self, method, params=None):
        body = {"jsonrpc": "2.0", "id": self.n + 10, "method": method}
        if params is not None:
            body["params"] = params
        msgs = self._post(body)
        for m in msgs:
            if "result" in m or "error" in m:
                return m
        return {"messages": msgs}

    def resource(self, uri):
        m = self.call("resources/read", {"uri": uri})
        try:
            return json.loads(m["result"]["contents"][0]["text"])
        except Exception:
            return m

    def tool(self, name, arguments):
        m = self.call("tools/call", {"name": name, "arguments": arguments})
        if "error" in m:
            return {"success": False, "error": m["error"]}
        res = m.get("result", {})
        # Tool results carry a content list; the payload is JSON text in the first item.
        for c in res.get("content", []):
            if c.get("type") == "text":
                try:
                    return json.loads(c["text"])
                except Exception:
                    return {"text": c["text"]}
        return res

    def exec(self, code, retries=20):
        """execute_code with retry on no_unity_session / busy."""
        for i in range(retries):
            out = self.tool("execute_code", {"action": "execute", "code": code})
            data = out.get("data") if isinstance(out, dict) else None
            reason = (data or {}).get("reason") if isinstance(data, dict) else None
            if out.get("success") is False and reason in ("no_unity_session", "busy", "compiling"):
                time.sleep(max(0.25, ((data or {}).get("retry_after_ms") or 500) / 1000))
                continue
            return out
        return out


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 1
    u = Unity()
    cmd = argv[1]
    if cmd == "instances":
        print(json.dumps(u.resource("mcpforunity://instances"), indent=1))
    elif cmd == "state":
        print(json.dumps(u.resource("mcpforunity://editor/state"), indent=1)[:2000])
    elif cmd == "tools":
        print([t["name"] for t in u.call("tools/list")["result"]["tools"]])
    elif cmd == "exec":
        print(json.dumps(u.exec(argv[2]), indent=1)[:4000])
    elif cmd == "exec-file":
        print(json.dumps(u.exec(open(argv[2]).read()), indent=1)[:4000])
    else:
        print("unknown command", cmd)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
