"""Open the standalone site through HTTP so editable JSON and videos work."""
from functools import partial
from http.server import ThreadingHTTPServer
from pathlib import Path
import errno
import webbrowser
from serve import RangeHandler

handler = partial(RangeHandler, directory=str(Path(__file__).resolve().parent))
for port in range(8766, 8787):
    try:
        server = ThreadingHTTPServer(('127.0.0.1', port), handler)
        break
    except OSError as error:
        if error.errno != errno.EADDRINUSE:
            raise
else:
    raise SystemExit('Preview ports are busy. Run serve.py with another --port.')
url = f'http://127.0.0.1:{port}/#benchmark'
print(f'Local preview: {url}\nKeep this window open. Press Ctrl-C to stop.', flush=True)
try:
    opened = webbrowser.open(url)
except webbrowser.Error:
    opened = False
if not opened:
    print('Open the URL above in your browser.', flush=True)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
