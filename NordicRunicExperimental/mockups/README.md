# Mockups

## Current Primary Mockup

[runic-presentation.html](./runic-presentation.html)

This is the first inspectable implementation-style mockup. It is dependency-free HTML/CSS/JS and should be used for presentation review before touching production.

It is based on the newer Reliquary UI kit references:

- forged black iron and carved slate panels
- bronze/gold worn edges as material, not flat accent color
- controlled blue/frost rune light
- physical relic-style icons and sockets
- compact line mode retained
- scan/readability preserved as a hard constraint

Open it directly in a browser:

```text
C:\Projects\Kalandra\NordicRunicExperimental\mockups\runic-presentation.html
```

Current implemented behaviors:

- Real tab switching for Scan, Trade, Atlas, Campaign, Temple, Profile, and Settings.
- Scan modifiers can be selected, deselected, and cleared to test highlight readability.
- Settings sliders update hue, panel transparency, and saturation in the prototype.
- GPT Image 2 atlas crops are referenced as candidate navigation/status/market assets.
- The prototype remains static and isolated from production Tauri code.

## Previous SVG Direction

[full-nordic-runic-scan.svg](./full-nordic-runic-scan.svg)

This pass goes deliberately farther into Nordic/runic identity than the previous rough board:

- angular runestone shell
- floating spine as carved rune-stones
- actual scan card frame treatment
- item rarity banner preserved
- trade/result sample preserved as readable data
- line mode preserved as compact safety output
- user hue represented by cyan accent marks
- red reserved only for danger

## What This Mockup Is Testing

1. Can Reliquary go fully runic without losing scan/read speed?
2. Can atlas-cropped relic icons hold up at actual navigation/status sizes?
3. Can the existing hue and transparency settings still own the chrome?
4. Can red stay sacred for hazards while the rest of the UI changes identity?
5. Does this feel like a real overlay shell rather than a decorative fantasy poster?

## Things To Judge Next

- Is this too Nordic, or finally Nordic enough?
- Should the cropped icon candidates become the basis for production assets?
- Should user hue replace all cyan marks exactly, or should frost-cyan remain the default accent preset?
- Should the floating spine stay circular/socket-like or move closer to forged rectangular plates?
