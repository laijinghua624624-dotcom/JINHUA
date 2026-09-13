#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Lance智能裤 - 即梦AI视频生成本地代理
用法: python3 jimeng_proxy.py
默认端口: 8765
"""

import hashlib
import hmac
import json
import datetime
import os
import re
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

# ========== 配置 ==========
HOST = os.environ.get("JIMENG_PROXY_HOST", "127.0.0.1")
PORT = int(os.environ.get("JIMENG_PROXY_PORT", "8765"))
AK = os.environ.get("VOLC_ACCESS_KEY_ID", "").strip()
SK = os.environ.get("VOLC_SECRET_ACCESS_KEY", "").strip()
MAX_BODY_BYTES = 1_000_000
DEFAULT_ALLOWED_ORIGINS = (
    "http://127.0.0.1:8000,http://localhost:8000,"
    "https://laijinghua624624-dotcom.github.io"
)
ALLOWED_ORIGINS = {
    origin.strip()
    for origin in os.environ.get("JIMENG_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS).split(",")
    if origin.strip()
}

# ========== 火山引擎V4签名 ==========
def sign(key, msg):
    return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

def get_signature_key(secret_key, date_stamp, region, service):
    k_date = sign(secret_key.encode('utf-8'), date_stamp)
    k_region = sign(k_date, region)
    k_service = sign(k_region, service)
    k_signing = sign(k_service, 'request')
    return k_signing

def call_volc_api(action, body):
    """调用火山引擎视觉API"""
    service = "cv"
    host = "visual.volcengineapi.com"
    region = "cn-north-1"
    endpoint = f"https://{host}"
    method = "POST"
    version = "2022-08-31"
    content_type = "application/json"

    now = datetime.datetime.now(datetime.UTC)
    date_stamp = now.strftime('%Y%m%d')
    amz_date = now.strftime('%Y%m%dT%H%M%SZ')

    request_body = json.dumps(body, ensure_ascii=False)
    payload_hash = hashlib.sha256(request_body.encode('utf-8')).hexdigest()

    canonical_uri = "/"
    canonical_querystring = f"Action={action}&Version={version}"
    canonical_headers = f"content-type:{content_type}\nhost:{host}\nx-content-sha256:{payload_hash}\nx-date:{amz_date}\n"
    signed_headers = "content-type;host;x-content-sha256;x-date"
    canonical_request = f"{method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"

    algorithm = "HMAC-SHA256"
    credential_scope = f"{date_stamp}/{region}/{service}/request"
    string_to_sign = f"{algorithm}\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"

    signing_key = get_signature_key(SK, date_stamp, region, service)
    signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()
    authorization_header = f"{algorithm} Credential={AK}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"

    url = f"{endpoint}?{canonical_querystring}"
    headers = {
        "Content-Type": content_type,
        "X-Date": amz_date,
        "X-Content-Sha256": payload_hash,
        "Authorization": authorization_header
    }

    req = urllib.request.Request(url, data=request_body.encode('utf-8'), headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=60) as response:
        return json.loads(response.read().decode('utf-8'))

# ========== HTTP代理服务 ==========
class ProxyHandler(BaseHTTPRequestHandler):
    def _origin_allowed(self):
        origin = self.headers.get("Origin")
        return not origin or "*" in ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS

    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        origin = self.headers.get("Origin")
        if origin and self._origin_allowed():
            self.send_header('Access-Control-Allow-Origin', '*' if "*" in ALLOWED_ORIGINS else origin)
            self.send_header('Vary', 'Origin')
            self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        if not self._origin_allowed():
            self._send_json({"error": "该页面来源未被允许"}, status=403)
            return
        self._send_json({}, status=200)

    def do_POST(self):
        try:
            if not self._origin_allowed():
                self._send_json({"error": "该页面来源未被允许"}, status=403)
                return
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length <= 0 or content_length > MAX_BODY_BYTES:
                self._send_json({"error": "请求体为空或超过 1MB 限制"}, status=413)
                return
            body = json.loads(self.rfile.read(content_length).decode('utf-8')) if content_length else {}

            if self.path == '/submit':
                # 提交图片或视频生成任务
                prompt = body.get('prompt', '')
                req_key = body.get('req_key', 'jimeng_t2v_v30')

                if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 10_000:
                    self._send_json({"error": "prompt 必须是 1–10000 字符的文本"}, status=400)
                    return
                if not isinstance(req_key, str) or not re.fullmatch(r"jimeng_[a-z0-9_]{1,40}", req_key):
                    self._send_json({"error": "req_key 格式不正确"}, status=400)
                    return

                api_body = {"req_key": req_key, "prompt": prompt.strip()}
                if req_key.startswith("jimeng_t2i_"):
                    width = int(body.get('width', 1024))
                    height = int(body.get('height', 1536))
                    if not (256 <= width <= 4096 and 256 <= height <= 4096):
                        self._send_json({"error": "图片宽高必须在 256–4096 像素之间"}, status=400)
                        return
                    api_body.update({
                        "width": width,
                        "height": height,
                        "return_url": bool(body.get('return_url', True)),
                    })
                else:
                    duration = int(body.get('duration', 5))
                    ratio = body.get('ratio', '9:16')
                    if duration < 1 or duration > 30:
                        self._send_json({"error": "duration 必须在 1–30 秒之间"}, status=400)
                        return
                    if ratio not in {"16:9", "9:16", "1:1", "4:3", "3:4"}:
                        self._send_json({"error": "不支持的画幅比例"}, status=400)
                        return
                    api_body.update({"duration": duration, "ratio": ratio})

                result = call_volc_api("CVSync2AsyncSubmitTask", api_body)
                self._send_json(result)

            elif self.path == '/query':
                # 查询任务结果
                task_id = body.get('task_id', '')
                req_key = body.get('req_key', 'jimeng_t2v_v30')

                if not isinstance(task_id, str) or not task_id or len(task_id) > 200:
                    self._send_json({"error": "task_id 不正确"}, status=400)
                    return
                if not isinstance(req_key, str) or not re.fullmatch(r"jimeng_[a-z0-9_]{1,40}", req_key):
                    self._send_json({"error": "req_key 格式不正确"}, status=400)
                    return

                api_body = {"req_key": req_key, "task_id": task_id}
                result = call_volc_api("CVSync2AsyncGetResult", api_body)
                self._send_json(result)

            else:
                self._send_json({"error": "未知路径"}, status=404)

        except (ValueError, json.JSONDecodeError):
            self._send_json({"error": "请求格式不正确"}, status=400)
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            self._send_json({"error": f"上游API错误 {e.code}", "detail": error_body[:1000]}, status=502)
        except Exception as e:
            print(f"代理请求失败: {e}")
            self._send_json({"error": str(e)}, status=500)

    def log_message(self, format, *args):
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {format % args}")

if __name__ == '__main__':
    if not AK or not SK:
        raise SystemExit(
            "未检测到火山引擎凭据。\n"
            "请先设置 VOLC_ACCESS_KEY_ID 和 VOLC_SECRET_ACCESS_KEY 环境变量。"
        )
    print("=" * 50)
    print("Lance智能裤 - 即梦AI视频生成代理")
    print(f"代理地址: http://{HOST}:{PORT}")
    print(f"已允许的页面来源: {', '.join(sorted(ALLOWED_ORIGINS))}")
    print("=" * 50)
    print("保持此窗口运行，在Lance智能裤中即可使用AI视频生成")
    print("按 Ctrl+C 停止服务")
    print()
    server = ThreadingHTTPServer((HOST, PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()
