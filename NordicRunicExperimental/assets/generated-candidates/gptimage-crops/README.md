# GPT Image Atlas Crops

This folder is generated from the GPT Image 2 atlas sheets in `NordicRunicExperimental/gptimage/`.

Run:

```powershell
python NordicRunicExperimental/tools/extract_gptimage_assets.py
```

The extractor writes:

- `manifest.json`: crop coordinates, source sheet, category, and review status.
- `contact-sheet.png`: quick visual review sheet for all candidate crops.
- `*.png`: section-level candidate crops.

These crops are intentionally coarse. They are meant for fast visual review and direction-setting before we spend time micro-cropping individual icons, making masks, or converting pieces into production-ready transparent assets.

The `micro_*` crops are a first-pass index of likely icon candidates. Some may include labels, separators, or surrounding atlas texture because the source sheets were generated as presentation atlases rather than clean sprite sheets. Promote only after visual review and, if needed, a tighter manual crop or alpha cleanup pass.
