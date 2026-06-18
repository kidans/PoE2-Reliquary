# Generated Candidate Assets

This folder is for raw or early candidate assets only. Nothing here should be referenced from production UI until it has been reviewed, cleaned, resized, and promoted.

## Current Candidate Sheet

- [runic-vector-candidate-sheet.svg](./runic-vector-candidate-sheet.svg)

This is a deterministic SVG candidate sheet created after the built-in bitmap image generator failed to follow the UI asset prompt. It is not intended to replace final raster/painted assets. Its purpose is to lock the asset inventory, silhouette language, cropping zones, and sizing expectations before spending time on high-detail generation.

## Bitmap Generation Attempt Log

Built-in image generation was attempted twice for a full Nordic relic UI asset sheet:

1. The first result ignored the prompt and produced an unrelated student poster.
2. The second result ignored the prompt and produced an unrelated food image.

Because those outputs were unusable, they were not saved into the project. If we want true painted/raster candidates next, use the CLI/API fallback path with an explicit image model workflow and save outputs here for review.

## Review Rules

- Test every candidate at 32px, 48px, 72px, and intended full size.
- Reject muddy silhouettes.
- Reject anything that uses red outside warning/danger states.
- Reject generic Viking cosplay, horned helmets, and unreadable ornamental noise.
- Promote only cleaned winners into a future production asset folder.
