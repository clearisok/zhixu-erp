# Zhixu Ainuoke Local Bridge

This directory contains the loopback-only Python bridge for the local Windows prototype. It is not a production identity or multi-user security boundary.

The fixed read catalog contains only reports `6086103`, `6086997`, and `6087050`. Browser callers select a catalog key and cannot submit an arbitrary report ID. Ainuoke passwords are reserved for the OS credential store and Ainuoke JWT/session data is process memory only.

Run the contract tests from the repository root:

```powershell
python -m unittest discover -s tools/ainuoke-bridge/tests -v
```
