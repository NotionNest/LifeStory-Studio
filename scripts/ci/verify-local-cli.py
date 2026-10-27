# Run explicitly with: python3 scripts/ci/verify-local-cli.py
# Isolated CLI home and a loopback provider; no model credentials are inherited.
import http.server, threading, tempfile, pathlib, json, os, subprocess, shutil
received = []

class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, *args):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        received.append({'tools': body.get('tools', []), 'model': body.get('model')})
        msg = {'id': 'msg_synthetic', 'type': 'message', 'role': 'assistant', 'status': 'completed', 'content': [{'type': 'output_text', 'text': '合成正文', 'annotations': []}]}
        response = {'id': 'resp_synthetic', 'object': 'response', 'created_at': 0, 'status': 'completed', 'model': 'synthetic-model', 'output': [msg], 'usage': {'input_tokens': 1, 'output_tokens': 1, 'total_tokens': 2}}
        events = [('response.created', {'response': dict(response, status='in_progress', output=[])}), ('response.output_item.added', {'output_index': 0, 'item': dict(msg, status='in_progress', content=[])}), ('response.content_part.added', {'output_index': 0, 'item_id': msg['id'], 'content_index': 0, 'part': {'type': 'output_text', 'text': '', 'annotations': []}}), ('response.output_text.delta', {'output_index': 0, 'item_id': msg['id'], 'content_index': 0, 'delta': '合成正文'}), ('response.output_text.done', {'output_index': 0, 'item_id': msg['id'], 'content_index': 0, 'text': '合成正文'}), ('response.output_item.done', {'output_index': 0, 'item': msg}), ('response.completed', {'response': response})]
        # Interrupt the first synthetic stream to exercise the CLI's own recovery.
        if len(received) == 1:
            events = events[:1]
        payload = ''.join(('event: ' + name + '\ndata: ' + json.dumps(dict(type=name, **data), ensure_ascii=False) + '\n\n' for name, data in events)).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory(prefix='lifestory-cli-synthetic-') as folder:
    pathlib.Path(folder, 'config.toml').write_text('model="synthetic-model"\nmodel_provider="lifestory_synthetic"\n[model_providers.lifestory_synthetic]\nname="Synthetic local test"\nbase_url="http://127.0.0.1:' + str(server.server_port) + '/v1"\nwire_api="responses"\nrequires_openai_auth=false\nsupports_websockets=false\nrequest_max_retries=0\nstream_max_retries=1\n')
    env = {key: os.environ[key] for key in ['PATH', 'HOME', 'TMPDIR', 'USER', 'LANG', 'CARGO_HOME', 'RUSTUP_HOME'] if key in os.environ}
    env.update(CODEX_HOME=folder, LIFESTORY_CODEX_TEST_BINARY=shutil.which('codex'))
    result = subprocess.run(['cargo', 'test', '--locked', '--manifest-path', 'src-tauri/Cargo.toml', '--lib', 'installed_cli_with_synthetic_provider', '--', '--ignored', '--nocapture'], env=env, timeout=120)
    print('Synthetic requests:', len(received), 'tool counts:', [len(r['tools']) for r in received])
    assert result.returncode == 0
    assert len(received) == 2 and all((not r['tools'] for r in received)), 'Expected one interrupted stream and one completed stream, both without tools'
server.shutdown()
