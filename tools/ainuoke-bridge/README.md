# Zhixu Ainuoke Local Bridge

This directory contains the loopback-only Python bridge for the local Windows prototype. It is not a production identity or multi-user security boundary.

The fixed read catalog contains only reports `6086103`, `6086997`, and `6087050`. Browser callers select a catalog key and cannot submit an arbitrary report ID. Ainuoke passwords are reserved for the OS credential store and Ainuoke JWT/session data is process memory only.

Run the contract tests from the repository root:

```powershell
python -m unittest discover -s tools/ainuoke-bridge/tests -v
```

Install the runtime dependency without creating or committing an `.env` file:

```powershell
python -m pip install ./tools/ainuoke-bridge
```

Start the bridge with the confirmed Ainuoke host and read-report path. Both values can be passed as parameters or supplied only in the current process environment:

```powershell
./tools/ainuoke-bridge/start.ps1 -AinuokeBaseUrl http://ainuoke-host -AinuokeReportPath /confirmed/read/report/path
```

The login path is fixed at `/kaijin/system/user/loginsys2`. The report path is intentionally required at runtime because the current repository contains no confirmed upstream report-data path. Startup rejects non-loopback hosts and non-Windows-Credential-Manager keyring backends.

The browser API is `http://127.0.0.1:8765`. It creates an HttpOnly bridge session with `POST /v1/session`, then exposes only the four personal-account endpoints and `POST /v1/ainuoke/reports/{catalogKey}/query`.
