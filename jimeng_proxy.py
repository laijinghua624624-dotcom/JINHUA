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
import urllib.request
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# ========== 配置 ==========
PORT = 8765
AK = "AKLTOGY0ODAwYWI4MGZiNDFlZTkxMzI1OTVhY2MwZWQxZDM"
SK = "TldFMU16TXdaV0ZpTmpZMk5HTTJaRGcyWTJJd01URTBZbUV4TWpRMVpqVQ=="

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
    def _send_json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(content_length).decode('utf-8')) if content_length else {}

            if self.path == '/submit':
                # 提交视频生成任务
                prompt = body.get('prompt', '')
                duration = int(body.get('duration', 5))
                ratio = body.get('ratio', '9:16')
                req_key = body.get('req_key', 'jimeng_t2v_v30')

                api_body = {"req_key": req_key, "prompt": prompt, "duration": duration, "ratio": ratio}
                result = call_volc_api("CVSync2AsyncSubmitTask", api_body)
                self._send_json(result)

            elif self.path == '/query':
                # 查询任务结果
                task_id = body.get('task_id', '')
                req_key = body.get('req_key', 'jimeng_t2v_v30')

                api_body = {"req_key": req_key, "task_id": task_id}
                result = call_volc_api("CVSync2AsyncGetResult", api_body)
                self._send_json(result)

            else:
                self._send_json({"error": "未知路径"}, status=404)

        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            self._send_json({"error": f"API错误 {e.code}", "detail": error_body}, status=500)
        except Exception as e:
            self._send_json({"error": str(e)}, status=500)

    def log_message(self, format, *args):
        print(f"[{datetime.datetime.now().strftime('%H:%M:%S')}] {format % args}")

if __name__ == '__main__':
    print("=" * 50)
    print("Lance智能裤 - 即梦AI视频生成代理")
    print(f"代理地址: http://localhost:{PORT}")
    print(f"AK: {AK[:10]}...")
    print("=" * 50)
    print("保持此窗口运行，在Lance智能裤中即可使用AI视频生成")
    print("按 Ctrl+C 停止服务")
    print()
    server = HTTPServer(('0.0.0.0', PORT), ProxyHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n服务已停止")
        server.server_close()
