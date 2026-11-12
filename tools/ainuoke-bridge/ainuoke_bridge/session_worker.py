"""Private NDJSON worker. One serialized capture at a time; token never leaves."""
import json
import sys
from .capture_session import CaptureSession
from .selected_source_once import collect_selected


def main():
    owner = CaptureSession()
    while True:
        line = sys.stdin.buffer.readline(32*1024*1024+2)
        if not line:
            return 0
        try:
            if len(line) > 32*1024*1024 or not line.endswith(b'\n'):
                raise ValueError('invalid_input')
            data = json.loads(line)
            progress = data.pop('catalogProgress', False)
            audit_progress = data.pop('auditProgress', False)
            if type(audit_progress) is not bool:
                raise ValueError('invalid_audit_progress')
            resume = data.pop('catalogResume', [])
            if (type(progress) is not bool or not isinstance(resume,list)
                    or (progress or resume) and data.get('mode') != 'catalog-discovery'
                    or not progress and (resume or len(line) > 65536)):
                raise ValueError('invalid_catalog_checkpoint')
            if data.get('mode') not in ('catalog-contracts', 'catalog-discovery'):
                raise ValueError('invalid_mode')
            events = []
            def page_saved(phase, page):
                from .selected_source_once import reject_secret_values
                secrets = [data['password']]
                if owner.session:
                    secrets.append(owner.session.jwt_token)
                reject_secret_values(page, secrets)
                sys.stdout.write(json.dumps({'schemaVersion':'ainuoke-catalog-page.v1','phase':phase,'page':page},ensure_ascii=False)+'\n')
                sys.stdout.flush()
            def request_saved(phase, diagnostic):
                from .selected_source_once import reject_secret_values
                secrets = [data['password']]
                if owner.session:
                    secrets.append(owner.session.jwt_token)
                reject_secret_values(diagnostic, secrets)
                sys.stdout.write(json.dumps({'schemaVersion':'ainuoke-request-event.v1','phase':phase,'diagnostic':diagnostic},ensure_ascii=False)+'\n')
                sys.stdout.flush()
            capture = collect_selected(data, diagnostics=events, session_owner=owner,
                                       catalog_progress=page_saved if progress else None, catalog_resume=resume,
                                       request_progress=request_saved if audit_progress else None)
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
