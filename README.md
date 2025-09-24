# CodeLingoProject

## Frontend Setup

1. Open `Frontend/index.html` in browser (or use a simple HTTP server).
2. Make sure backend is running and accessible at `/upload` and `/search`.

## Backend Setup

1. Open solution in Visual Studio or VS Code.
2. Run backend (`dotnet run` or similar).
3. Endpoints:
   - POST `/upload` to upload ZIP projects.
   - GET `/search?projectID=...&keyword=...` to search functions/classes.

## Testing

- Try uploading valid/invalid ZIP files.
- Use search box to test keyword searches.
- See `Frontend/assets/script.js` for integration logic.

## Docs

- See `docs/screenshots/upload_ui.png` for UI screenshots.