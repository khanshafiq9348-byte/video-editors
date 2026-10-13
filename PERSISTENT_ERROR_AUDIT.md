# PERSISTENT ERROR AUDIT REPORT

## 1. Overview
This audit identifies the recurring errors that previously surfaced in AutoVideo Studio across runtime logs and the user interface, investigates their root causes, and details the permanent fixes applied.

---

## 2. Identified Persistent Errors & Root Causes

### Error A: "Rendered fewer hooks than expected" (React Runtime Crash)
- **Source**: `frontend/src/components/timeline/TimelineTrack.tsx`
- **Trigger**: Opening the video editor or switching between projects.
- **Root Cause**: An early return statement (`if (!timeline) return null;`) was placed at line 38 before hook declarations (`useEffect`, `useCallback`) at line 102. When timeline loaded asynchronously, React detected a change in the total number of executed hooks and crashed with an Error Boundary exception.
- **Fix**: Re-ordered all React hooks to run unconditionally at the top of the component before any early returns.

### Error B: HTTP 404 Logging on Initial Project Load
- **Source**: `GET /api/projects/{id}/latest-render-job` and `GET /api/projects/{id}/captions`
- **Trigger**: Opening an existing project or navigating to the editor before exporting or generating captions.
- **Root Cause**: Backend endpoints raised `HTTPException(status_code=404)` whenever a project had no render jobs or captions yet. The frontend attempted to fetch these on load, flooding the console and network tab with red 404 errors.
- **Fix**: Updated `get_latest_render_job_for_project` and `get_captions` to return `200 OK` with `null`, which cleanly indicates the absence of records without throwing HTTP errors.

### Error C: Constant Polling Network Spam & 502 Warnings
- **Source**: `frontend/src/stores/exportStore.ts`
- **Trigger**: Dashboard mounting initiated an unconditional `setInterval` polling `/api/render-jobs` every 2 seconds.
- **Root Cause**: If the backend underwent a momentary reload or the user was on the dashboard with no active exports, polling repeated continuously, throwing `AxiosError: Request failed with status code 502` and `ECONNREFUSED` in console logs.
- **Fix**: Implemented adaptive polling: export job polling only occurs when the Exports Drawer is open or when there are active (`rendering`, `queued`, `pending`) jobs in flight. Background errors are caught quietly without spamming the console.

### Error D: FastAPI Import NameError on Startup
- **Source**: `backend/app/api/captions.py`
- **Trigger**: Server startup / reload.
- **Root Cause**: `Optional` was used in `response_model=Optional[TimelineCaptions]` without being imported from `typing`.
- **Fix**: Added `from typing import Optional` to `captions.py`.

---

## 3. Verification & Current Status
- **Backend Logs**: Clear of exceptions. Health check returns `{"status":"healthy","ffmpeg_available":true}`.
- **Frontend Logs**: Zero hook errors, zero unhandled promise rejections, zero Vite HMR exceptions.
- **Build Status**: `npm run build` succeeds cleanly with 0 TypeScript/bundling errors.
- **Export Test**: E2E render completed successfully at 100% progress without error alerts.
