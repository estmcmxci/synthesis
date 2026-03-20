Investigate stuck runs and execution failures.

## Steps

1. Identify the ticket key or session ID to trace.
2. Search logs for the ticket: `rg -n "issue_identifier=<KEY>" log/app.log*`
3. Extract session IDs: `rg -o "session_id=[^ ;]+" log/app.log* | sort -u`
4. Trace one session end-to-end: `rg -n "session_id=<ID>" log/app.log*`
5. Focus on failure signals: `rg -n "stalled|retry|timeout|failed|error" log/app.log*`
6. Classify: timeout/stall, startup failure, turn failure, or retry loop.
7. Check rotated logs (`log/app.log*`) before concluding data is missing.
