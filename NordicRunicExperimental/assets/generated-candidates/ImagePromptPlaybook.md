# Reliquary Runic Asset Prompt Playbook

This document tracks prompt strategy for generated Nordic relic assets. It exists because broad asset-sheet prompts failed badly in the built-in image generator, so future attempts must be smaller, testable, and reviewable.

## Current Tool Status

Built-in image generation is currently not reliable for this project. It ignored multiple asset prompts and returned unrelated outputs:

- full asset sheet prompt -> unrelated student poster
- stricter asset sheet prompt -> unrelated food image
- single compass icon prompt -> unrelated chibi sprite sheet
- visible SVG candidate-sheet edit prompt -> unrelated science/classroom poster

Those failed outputs are intentionally not saved into the project as candidates.

The CLI/API fallback is available at:

```text
C:\Users\Kidans\.codex\skills\.system\imagegen\scripts\image_gen.py
```

But `OPENAI_API_KEY` is not currently set in this environment, so CLI generation cannot run yet.

## Strategy Change

Do not ask for a whole UI pack first. Generate one asset family at a time:

1. One corner piece.
2. One horizontal border strip.
3. One tab/socket plate.
4. One button frame.
5. One warning button frame.
6. One icon at a time.

Only after the single-asset prompts work should we batch them.

## Base Style Contract

Use this exact style language across every prompt:

```text
Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, tiny rivets, scratched forged metal, sparse cyan-blue rune inlay. Low-glare dark fantasy interface asset. Red appears only for warning/danger assets. Crop-friendly, strong silhouette, readable at 48px.
```

Avoid this exact drift:

```text
No humans, no characters, no animals unless specifically requested, no food, no classroom, no poster, no infographic, no UI screen, no full scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## Built-In Prompt Pattern

Use this shape for one-off built-in attempts:

```text
One isolated [ASSET NAME] only.

Subject: [specific object].
Style: Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, tiny rivets, scratched forged metal, sparse cyan-blue rune inlay. Low-glare dark fantasy interface asset.
Composition: centered single object, square crop, generous padding, plain dark neutral background.
Usability: strong silhouette, readable at 48px, crop-friendly.
Color: black iron, dark slate, aged bronze, muted bone highlights, sparse cyan-blue glow. No red unless this is a warning asset.
Avoid: no humans, no characters, no animals, no food, no classroom, no poster, no infographic, no UI screen, no scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## Prompt 01: Corner Piece

```text
One isolated ornate top-left UI corner piece only.

Subject: an L-shaped forged metal corner bracket for a dark fantasy overlay panel, with angular Nordic carving, aged bronze outer edge, blackened iron inner plate, tiny rivets, and one small cyan-blue rune gemstone.
Style: Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, scratched forged metal, sparse cyan-blue rune inlay. Low-glare dark fantasy interface asset.
Composition: centered single corner piece, square crop, generous padding, plain dark neutral background.
Usability: strong silhouette, readable when scaled down, crop-friendly, no protrusions that require a huge transparent canvas.
Color: black iron, dark slate, aged bronze, muted bone highlights, sparse cyan-blue glow. No red.
Avoid: no humans, no characters, no animals, no food, no classroom, no poster, no infographic, no UI screen, no full scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## Prompt 02: Horizontal Border Strip

```text
One isolated horizontal UI border strip only.

Subject: a long narrow forged metal border strip for a dark fantasy overlay panel, blackened iron center, aged bronze/gold bevels, small rivets, angular carved notches, and two subtle cyan-blue rune inlays near the ends.
Style: Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, scratched forged metal, sparse cyan-blue rune inlay. Low-glare dark fantasy interface asset.
Composition: centered single long horizontal strip, wide crop, generous padding, plain dark neutral background.
Usability: left and right ends are visually distinct; middle section can be sliced/repeated; crop-friendly.
Color: black iron, dark slate, aged bronze, muted bone highlights, sparse cyan-blue glow. No red.
Avoid: no humans, no characters, no animals, no food, no classroom, no poster, no infographic, no UI screen, no full scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## Prompt 03: Spine Socket Plate

```text
One isolated vertical navigation tab socket only.

Subject: a compact forged plate for an overlay side tab, dark blackened iron face, aged bronze rim, beveled angular ends, small rivets, and a circular cyan-blue rune socket on the left side.
Style: Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, scratched forged metal, sparse cyan-blue rune inlay. Low-glare dark fantasy interface asset.
Composition: centered single tab plate, horizontal rectangular crop, generous padding, plain dark neutral background.
Usability: strong silhouette at 48px height, can hold a simple icon, crop-friendly.
Color: black iron, dark slate, aged bronze, muted bone highlights, sparse cyan-blue glow. No red.
Avoid: no humans, no characters, no animals, no food, no classroom, no poster, no infographic, no UI screen, no full scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## Prompt 04: Warning Button

```text
One isolated warning button frame only.

Subject: a compact dark fantasy warning button frame, forged black iron base, aged bronze bevel, red inner glow, red warning rune inlay, tiny rivets, angular cut corners.
Style: Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, scratched forged metal. Red is intentional because this is a warning asset.
Composition: centered single button frame, horizontal rectangular crop, generous padding, plain dark neutral background.
Usability: strong silhouette at small size, crop-friendly, no text.
Color: black iron, dark slate, aged bronze, muted bone highlights, restrained red danger glow. No cyan-blue except tiny metal highlights.
Avoid: no humans, no characters, no animals, no food, no classroom, no poster, no infographic, no UI screen, no full scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## Prompt 05: Atlas Icon

```text
One isolated compass/atlas icon only.

Subject: a circular blackened iron compass medallion with four sharp cardinal points, aged bronze rim, tiny rivets, carved slate face, and one small cyan-blue rune gemstone in the center.
Style: Reliquary Nordic relic game UI asset. Blackened iron, carved dark slate, worn bronze/gold trim, scratched forged metal, sparse cyan-blue rune inlay. Low-glare dark fantasy interface asset.
Composition: centered single icon, square crop, generous padding, plain dark neutral background.
Usability: strong silhouette, readable at 32px and 48px, crop-friendly.
Color: black iron, dark slate, aged bronze, muted bone highlights, sparse cyan-blue glow. No red.
Avoid: no humans, no characters, no animals, no food, no classroom, no poster, no infographic, no UI screen, no full scene, no readable text, no labels, no watermark, no cute chibi style, no modern sci-fi plastic, no purple glow.
```

## CLI Batch Plan

Once `OPENAI_API_KEY` is available, generate a small batch using the prompts above and save raw outputs into:

```text
NordicRunicExperimental/assets/generated-candidates/raw/
```

Then create cleaned alpha candidates in:

```text
NordicRunicExperimental/assets/generated-candidates/alpha/
```

Use chroma-key prompts only after a dark-background candidate proves the model can stay on task.

## Review Gate

An asset generation pass is considered successful only if at least three of the following are usable:

- corner piece
- border strip
- tab/socket plate
- warning button
- one navigation icon

Every usable asset must pass:

- recognizable at 48px
- no unrelated subject matter
- no readable accidental text
- no red outside warning assets
- visually compatible with `runic-presentation.html`
