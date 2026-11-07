"""Opt-in fixed-scope operator diagnostics; the normal capture envelope is unchanged.

Report ID, page, elapsed milliseconds, HTTP status, closed error categories and
bounded redacted login fields leave the transport. Credentials, URLs, conditions,
headers and complete responses never do.
"""
import json
import sys
from time import monotonic
from .login_evidence import login_evidence, login_details
from .ainuoke_client import AuthExpiredError, NetworkAinuokeError, UpstreamSchemaError, _looks_like_auth_expired

CATEGORIES = frozenset({'http_error','timeout','dns_error','tls_error','connection_refused','connection_reset','network_error'})

class DiagnosticTransport:
    def __init__(self, transport, events, clock=monotonic):
        if type(events) is not list or events:
            raise ValueError('empty_diagnostic_buffer_required')
        self.transport, self.events, self.clock = transport, events, clock

    def request(self, **request):
        if len(self.events) >= 81:
            raise ValueError('diagnostic_request_limit')
        body = request.get('body')
        body = body if isinstance(body, dict) else {}
        report = body.get('reportId')
        report = report if type(report) is int and report in (6086103,6087105,6087050,6087051,6086405,6086408,6086875,6086354) else None
        query = body.get('sqlCdtn')
        page = query.get('pageIndex') if isinstance(query, dict) else None
        page = page if report is not None and type(page) is int and 1 <= page <= (28 if report == 6086103 else 20) else None
        event = {'kind':'login' if request.get('method') == 'GET' else 'report',
                 'reportId':report,'page':page,'elapsedMs':0,'outcome':'complete','httpStatus':None}
        started = self.clock()
        try:
            response = self.transport.request(**request)
            if event['kind'] == 'report' and _looks_like_auth_expired(response):
                event['outcome'] = 'auth_error'
            if event['kind'] == 'login':
                event['loginEvidence'] = login_evidence(response)
                event['loginDetails'] = login_details(response, body)
                if event['loginEvidence']['result'] == 'rejected':
                    event['outcome'] = 'auth_error'
                elif event['loginEvidence']['result'] == 'malformed':
                    event['outcome'] = 'schema_error'
            return response
        except NetworkAinuokeError as error:
            category = getattr(error, 'transport_category', None)
            event['outcome'] = category if type(category) is str and category in CATEGORIES else 'network_error'
            status = getattr(error, 'http_status', None)
            event['httpStatus'] = status if type(status) is int and 100 <= status <= 599 else None
            raise
        except AuthExpiredError:
            event['outcome'] = 'auth_error'
            raise
        except UpstreamSchemaError:
            event['outcome'] = 'schema_error'
            raise
        except Exception:
            event['outcome'] = 'unknown_error'
            raise
        finally:
            status = getattr(self.transport, 'last_http_status', None)
            if type(status) is int and 100 <= status <= 599:
                event['httpStatus'] = status
            event['elapsedMs'] = max(0,min(180000,int((self.clock()-started)*1000)))
            self.events.append(event)

def run_diagnostic(data):
    from .selected_source_once import collect_selected
    from .server_source import validate_input
    checked = validate_input(data)
    if checked.get('mode') not in ('catalog-discovery','catalog-contracts'):
        raise ValueError('diagnostic_scope_invalid')
    events = []
    capture = collect_selected(checked, diagnostics=events)
    return {'schemaVersion':'ainuoke-request-diagnostics.v1','capture':capture,'requests':events}

def main():
    try:
        if sys.argv[1:]:raise ValueError('no_arguments_allowed')
        raw = sys.stdin.buffer.read(65537)
        if len(raw)>65536:raise ValueError('diagnostic_input_limit')
        result = run_diagnostic(json.loads(raw))
        sys.stdout.write(json.dumps(result,ensure_ascii=False))
        return 0 if result['capture']['result']=='complete' else 1
    except (Exception,KeyboardInterrupt):
        sys.stdout.write('{"error":"diagnostic_input_or_result_invalid"}')
        return 1

if __name__=='__main__':sys.exit(main())
