"""Private NDJSON worker. One serialized capture at a time; token never leaves."""
import json
import sys
from .capture_session import CaptureSession
from .selected_source_once import collect_selected


def main():
    owner = CaptureSession()
    while True:
        line = sys.stdin.buffer.readline(65538)
        if not line:
            return 0
        try:
            if len(line) > 65536 or not line.endswith(b'\n'):
                raise ValueError('invalid_input')
            data = json.loads(line)
            if data.get('mode') not in ('catalog-contracts', 'catalog-discovery'):
                raise ValueError('invalid_mode')
            events = []
            capture = collect_selected(data, diagnostics=events, session_owner=owner)
            result = {'schemaVersion':'ainuoke-session-diagnostics.v1','capture':capture,'requests':events}
            sys.stdout.write(json.dumps(result, ensure_ascii=False) + '\n')
            sys.stdout.flush()
            if owner.stopped:
                return 0
        except (Exception, KeyboardInterrupt):
            owner.stop()
            sys.stdout.write('{"error":"capture_session_stopped"}\n')
            sys.stdout.flush()
            return 1


if __name__ == '__main__':
    sys.exit(main())
