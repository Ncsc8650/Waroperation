# Waroperation

One-page Salvo Equation combat dashboard for the workbook `salvo equation .xlsx`.

## Online preview

GitHub Pages URL:

https://ncsc8650.github.io/Waroperation/

The online page is a static preview from `data.json`. It can recalculate values in the browser, but it cannot save edits back to Excel.

## Local Excel-connected app

Run this mode when you want to edit values on the web page and save them back into `salvo equation .xlsx`.

```powershell
pip install -r requirements.txt
python server/app.py
```

Then open:

```text
http://127.0.0.1:8765
```

## Features

- Shows Combat Model results at the top, split into Red Force and Blue Force.
- Edits Red Force and Blue Force settings in one page.
- Recalculates Salvo Equation results immediately in the browser.
- Saves edited inputs back into the Excel workbook in local-server mode.
- Creates an Excel backup in `backups/` before saving.

