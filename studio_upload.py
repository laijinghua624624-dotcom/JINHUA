"""Bounded streaming uploads and durable, retryable reverse-video preparation.

Originals are never replaced. Processing does not call an AI provider.
"""
import concurrent.futures
import ipaddress
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time
import uuid

FILE_LIMIT = 250 * 1024 * 1024
LOCAL_VIDEO_LIMIT = 4 * 1024**3
VIDEO_EXTENSIONS = {'.mp4', '.mov', '.webm'}
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=1)
ACTIVE = set()
LOCK = threading.RLock()
RECEIVERS = threading.BoundedSemaphore(2)


class UploadError(ValueError):
    def __init__(self, message, code='UPLOAD_FAILED', status=400):
        super().__init__(message)
        self.code, self.status = code, status


def limits(handler):
    # Never grant a public reverse proxy the desktop limit, even if its peer is loopback.
    peer = handler.client_address[0] if isinstance(handler.client_address, tuple) else ''
    try:
        local = ipaddress.ip_address(peer).is_loopback
    except ValueError:
        local = False
    host = handler.headers.get('Host', '').split(':')[0]
    origin = handler.headers.get('Origin', '')
    local = local and host in {'localhost', '127.0.0.1'} and not os.environ.get('LANCE_PUBLIC_ORIGIN') and not os.environ.get('RENDER')
    if origin and not re.fullmatch(r'http://(?:localhost|127\.0\.0\.1)(?::\d+)?', origin):
        local = False
    return {'fileBytes': FILE_LIMIT, 'reverseVideoBytes': LOCAL_VIDEO_LIMIT if local else FILE_LIMIT,
            'localLargeVideo': bool(local), 'reversePreparation': True}


def receive(stream, length, target):
    """Read at most 1 MiB at a time; incomplete files never become media assets."""
    part = target.with_suffix(target.suffix + '.part')
    if shutil.disk_usage(target.parent).free < length * 2 + 512 * 1024**2:
        raise UploadError('磁盘空间不足：需要为原片与处理副本预留空间，请清理其他文件后再试。', 'DISK_FULL', 507)
    try:
        with part.open('xb') as output:
            remaining = length
            while remaining:
                block = stream.read(min(1024 * 1024, remaining))
                if not block:
                    raise UploadError('上传连接中断，文件未完整接收；请重新选择原片上传。', 'UPLOAD_INTERRUPTED')
                output.write(block)
                remaining -= len(block)
            output.flush()
            os.fsync(output.fileno())
        os.replace(part, target)
    except Exception:
        part.unlink(missing_ok=True)
        raise


def record_path(server, uid):
    if not re.fullmatch(r'[a-f0-9]{32}', str(uid)):
        raise UploadError('无效的上传记录', 'INVALID_UPLOAD')
    folder = server.DATA / 'video-preparations'
    folder.mkdir(parents=True, exist_ok=True)
    return folder / (uid + '.json')


def write_record(server, record):
    path = record_path(server, record['uploadId'])
    part = path.with_suffix('.' + uuid.uuid4().hex + '.tmp')
    try:
        part.write_text(json.dumps(record, ensure_ascii=False), encoding='utf-8')
        os.replace(part, path)
    finally:
        part.unlink(missing_ok=True)


def status(server, uid):
    path = record_path(server, uid)
    if not path.is_file():
        raise UploadError('找不到上传记录；请在原上传的本机工作台重试。', 'UPLOAD_NOT_FOUND', 404)
    record = json.loads(path.read_text(encoding='utf-8'))
    if record['status'] in {'queued', 'processing'} and uid not in ACTIVE:
        record.update(status='interrupted', error='处理因服务重启中断；原片已保留，点击继续处理，无需重传。')
    return record


def prepare(server, record):
    original = record['original']
    source = server.media_path(original['localId'])
    target = server.MEDIA / (uuid.uuid4().hex + '.mp4')
    temporary = target.with_suffix('.part.mp4')
    proc = None
    try:
        record.update(status='processing', progress=0, error='')
        write_record(server, record)
        duration = float(original['duration'])
        # Aim near 220 MiB for longer clips, without chopping time or dropping audio.
        bitrate = max(200, min(3000, int(220 * 1024**2 * 8 / duration / 1000) - 128))
        width, height = (1920, 1080) if bitrate >= 1000 else (1280, 720)
        scale = f"scale=w='min({width},iw)':h='min({height},ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1"
        command = ['ffmpeg', '-hide_banner', '-v', 'error', '-nostdin', '-i', str(source),
                   '-map', '0:V:0', '-map', '0:a:0?', '-vf', scale, '-c:v', 'libx264',
                   '-threads', '2', '-preset', 'veryfast', '-b:v', f'{bitrate}k',
                   '-maxrate', f'{bitrate}k', '-bufsize', f'{bitrate*2}k', '-pix_fmt', 'yuv420p',
                   '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart',
                   '-progress', 'pipe:1', '-nostats', '-n', str(temporary)]
        # Drain progress continuously; stderr goes to a bounded-by-run temporary file.
        import tempfile
        with tempfile.TemporaryFile() as errors:
            proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=errors, text=True)
            timer = threading.Timer(6 * 3600, proc.kill)
            timer.start()
            try:
                last = -1
                for line in proc.stdout:
                    if line.startswith('out_time_us='):
                        try:
                            percent = max(0, min(99, int(float(line.split('=')[1]) / 1e6 / duration * 100)))
                        except ValueError:
                            continue
                        if percent != last:
                            last = percent
                            record['progress'] = percent
                            write_record(server, record)
                if proc.wait() != 0:
                    raise UploadError('视频压缩未完成，可能是编码损坏、磁盘不足或处理超时。原片已保留，可点击重试处理。', 'PREPARATION_FAILED')
            finally:
                timer.cancel()
                proc.stdout.close()
        result = server.describe(temporary)
        if result['kind'] != 'video' or abs(result['duration'] - duration) > max(1, duration * .001):
            raise UploadError('处理副本时长核验失败，原片已保留，请重试处理。', 'VERIFY_FAILED')
        if original.get('hasAudio') and not result.get('hasAudio'):
            raise UploadError('处理副本缺少音轨，原片已保留，请重试处理。', 'VERIFY_FAILED')
        os.replace(temporary, target)
        result.update(localId=target.name, name=original['name'], bytes=target.stat().st_size,
                      originalLocalId=source.name, originalBytes=original['bytes'],
                      originalWidth=original['width'], originalHeight=original['height'],
                      uploadId=record['uploadId'], reverseProxy=True)
        record.update(status='succeeded', progress=100, result=result)
    except Exception as error:
        record.update(status='failed', error=server.safe_error(error), code=getattr(error, 'code', 'PREPARATION_FAILED'))
    finally:
        if proc and proc.poll() is None:
            proc.kill(); proc.wait()
        try:
            temporary.unlink(missing_ok=True)
            write_record(server, record)
        finally:
            with LOCK:
                ACTIVE.discard(record['uploadId'])


def start(server, uid):
    with LOCK:
        record = status(server, uid)
        if uid in ACTIVE or record['status'] == 'succeeded':
            return record
        server.media_path(record['original']['localId'])
        ACTIVE.add(uid)
        record.update(status='queued', progress=0, error='')
        try:
            write_record(server, record)
            POOL.submit(prepare, server, record.copy())
        except Exception:
            ACTIVE.discard(uid)
            raise
        return record


def accept_reverse(server, target, name):
    original = server.describe(target)
    if original['kind'] != 'video':
        raise UploadError('文件没有有效视频画面；请上传MP4、MOV或WebM原片。', 'INVALID_VIDEO')
    original.update(name=name, bytes=target.stat().st_size, localOnly=True)
    uid = target.stem
    record = {'uploadId': uid, 'status': 'uploaded', 'original': original, 'createdAt': time.time()}
    write_record(server, record)
    return start(server, uid)
