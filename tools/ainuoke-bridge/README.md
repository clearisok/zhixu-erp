# Zhixu Ainuoke Local Bridge

This directory contains the loopback-only Python bridge for the local Windows prototype. It is not a production identity or multi-user security boundary.

The fixed read catalog contains reports `6086103`, `6086997`, `6087050`, and the candidate garment color/size source `6087105`. Browser callers select a catalog key and cannot submit an arbitrary report ID. `6087105` is validation-only and has not replaced the existing `6086997` contract-color path. Ainuoke passwords are reserved for the OS credential store and Ainuoke JWT/session data is process memory only.

Run the contract tests from the repository root:

```powershell
python -m unittest discover -s tools/ainuoke-bridge/tests -v
```

Install the runtime dependency without creating or committing an `.env` file:

```powershell
python -m pip install ./tools/ainuoke-bridge
```

Start the bridge with the confirmed defaults:

```powershell
./tools/ainuoke-bridge/start.ps1
```

The 2026-09-08 requests/Scanner evidence confirms:

- base URL: `http://61.164.81.194:9043`
- login: `GET /kaijin/system/user/loginsys2`
- generic report read: `POST /kaijin/report/report/getReportObjAndData`
- running system context: Cookie `rungingSysId=6080183`

The base URL and report path remain overridable by command-line parameter or current-process environment variable, but the confirmed values above are the defaults. The upstream link is plain HTTP and does not protect credentials or report data with TLS. Startup rejects non-loopback hosts and non-Windows-Credential-Manager keyring backends.

Login requires `data.isOk === true`, a non-empty `data.jwtToken`, and a non-empty `data.sessionId`. Report reads send the token exactly as captured in `Authorization`, `Token`, and `kaijin_my_token`; they never use `Bearer`. Browser input is restricted to `insideOrderNo`, which a report-specific adapter converts to the captured `sqlCdtn.conditionList` contract. Browser callers cannot supply raw `reportId`, `formId`, `sqlCdtn`, or `conditionList`.

The response parser requires `dataList` to be a JSON string containing `rows`, reads `dataCount`, and validates paging metadata. The confirmed endpoint returns top-level `pageIndex=0` and `pageSize=0` sentinels even for successful reads, so the adapter explicitly retains the validated request `sqlCdtn.pageIndex/pageSize` in that case. Malformed or missing fields fail closed.

The browser API is `http://127.0.0.1:8765`. It creates an HttpOnly bridge session with `POST /v1/session`, then exposes only the four personal-account endpoints and `POST /v1/ainuoke/reports/{catalogKey}/query`.

On 2026-09-09 the local UI and Bridge completed a real read-only D1935 validation: login succeeded; 6086103 returned HTTP 200 with 1/1 row, 6086997 returned page 1 with 50/187 rows, and 6087050 returned page 1 with 50/262 rows. The 6087050 page contained one repeated-`id` group while all 50 generated source identities remained unique. No Ainuoke mutation or Zhixu business commit endpoint was called. Counts are observations from that validation and may change upstream.
