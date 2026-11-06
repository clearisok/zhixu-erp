"""Process-local authentication ownership; never serialize credentials or tokens."""
import base64
import json
import time
import math


class CaptureSession:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.identity = None
        self.session = None
        self.expires = None
        self.stopped = False

    def bind(self, data):
        identity = (data['baseUrl'].rstrip('/'), data['username'], data['password'])
        if self.stopped or self.identity is not None and self.identity != identity:
            raise ValueError('capture_session_stopped_or_identity_changed')
        self.identity = identity

    def valid(self):
        return self.session is not None and (self.expires is None or self.clock() < self.expires)

    def accept(self, session):
        self.session, self.expires = session, None
        # exp is only a conservative reuse deadline, never an authentication proof.
        try:
            payload = session.jwt_token.split('.')[1]
            claims = json.loads(base64.urlsafe_b64decode(payload + '=' * (-len(payload) % 4)))
            exp = claims.get('exp')
            if type(exp) in (int, float) and math.isfinite(exp) and exp > 0:
                self.expires = exp
        except (ValueError, IndexError, UnicodeError, AttributeError, TypeError):
            pass

    def stop(self):
        self.stopped = True
        self.session = None

