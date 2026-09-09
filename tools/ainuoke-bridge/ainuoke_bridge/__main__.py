from __future__ import annotations

import argparse
import os

from .ainuoke_client import AinuokeClient
from .credential_store import KeyringCredentialStore
from .http_server import BridgeApplication, create_http_server
from .security import DEFAULT_ALLOWED_ORIGINS, SecurityContract
from .service import AinuokeBridgeService
from .session_store import AinuokeTokenCache, BrowserSessionStore


def main() -> None:
    parser = argparse.ArgumentParser(description="Zhixu local Ainuoke read bridge")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8765, type=int)
    parser.add_argument("--ainuoke-base-url", default=os.environ.get("ZHIXU_AINUOKE_BASE_URL", AinuokeClient.DEFAULT_BASE_URL))
    parser.add_argument("--ainuoke-report-path", default=os.environ.get("ZHIXU_AINUOKE_REPORT_PATH", AinuokeClient.REPORT_PATH))
    parser.add_argument("--allow-origin", action="append", dest="allowed_origins")
    arguments = parser.parse_args()
    security = SecurityContract(arguments.host, frozenset(arguments.allowed_origins or DEFAULT_ALLOWED_ORIGINS))
    service = AinuokeBridgeService(
        credentials=KeyringCredentialStore(),
        token_cache=AinuokeTokenCache(),
        client=AinuokeClient(base_url=arguments.ainuoke_base_url, report_path=arguments.ainuoke_report_path),
    )
    server = create_http_server(arguments.host, arguments.port, BridgeApplication(security=security, sessions=BrowserSessionStore(), service=service))
    print(f"Zhixu Ainuoke Bridge listening on {arguments.host}:{arguments.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
