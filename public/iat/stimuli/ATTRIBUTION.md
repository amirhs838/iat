# Stimulus Image Attribution — Target Categories (Iranian / Afghan)

This file records the provenance of the 16 target-category face photographs
shipped with test definition **v1.4.0** of the IAT Research Platform.

## Sourcing method

- Images were located with a standard web image search (English queries,
  region: US) and manually vetted by the platform operator for:
  real photograph (not AI/CGI), frontal face-only crop, adult subject,
  clear gender presentation, no watermarks/text overlays, no sunglasses,
  and group-distinctive cues (Iranian vs Afghan) per `STIMULUS_SPEC_GENERAL`
  in `src/config/iat/test-definition.ts`.
- Each file was normalized to 480×600 JPEG (EXIF-rotated, face-centered
  attention crop, quality 85) with `sharp`.
- `candidates manifest` (original URLs + source site per slot) is retained in
  the project working notes; the table below maps each shipped file to its
  origin.

## Per-slot provenance

<!-- FILLED DURING CURATION -->

## Researcher obligations (methodological disclosure)

1. **Licensing vetting**: These photographs are real images of real people
   collected from the public web. Before final data collection, verify the
   usage license of every image (e.g. via reverse image search / source site)
   and, where required, obtain permission. If an image cannot be cleared,
   replace that slot via **admin → محرک‌ها** (uploads take effect for new
   sessions without code changes).
2. **Thesis disclosure**: Document the stimulus sourcing method and the
   vetting procedure in the thesis (stimulus section), including this file's
   provenance table.
3. **Versioning**: Any replacement of shipped reference files is a stimulus-set
   change — bump the test definition version and re-seed (see README →
   Versioning) so every session remains reproducible.
4. **Ethics**: Faces of identifiable private individuals are used as category
   exemplars only; no caption or metadata linking identity to category is
   shown to participants. Note this in the ethics submission.
