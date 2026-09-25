# Stimulus Image Attribution — Target Categories (Iranian / Afghan)

This file records the provenance of the 16 target-category face photographs
shipped with test definition **v1.5.0** of the IAT Research Platform.

## Sourcing method

- Images were located with a standard web image search and via the Wikimedia
  Commons / Flickr (CC) catalogs, then manually vetted for:
  real photograph (not AI/CGI), frontal face-dominant crop, adult subject,
  clear gender presentation, no watermarks/text overlays, no sunglasses,
  and group-distinctive cues (Iranian vs Afghan) per `STIMULUS_SPEC_GENERAL`
  in `src/config/iat/test-definition.ts`.
- Each file was normalized to 480×600 JPEG (EXIF-rotated, face-centered
  crop, quality 88) with `sharp`.
- Composition per category: 4 men + 4 women (7-block standard, gender-balanced).

## Per-slot provenance

| Slot | File | Subject | Source / Creator | License / status |
|------|------|---------|------------------|------------------|
| iranian-01 | `iranian/iranian-01.jpg` | Iranian man (young adult, frontal) | Web image search result (origin: Reddit community photo) | License unknown — **vetting required** |
| iranian-02 | `iranian/iranian-02.jpg` | Iranian man (young adult, smiling) | Web image search result (origin: "Kaleidoscope" blog) | License unknown — **vetting required** |
| iranian-03 | `iranian/iranian-03.jpg` | Iranian man (moustache, frontal) | Flickr "Mustache man" by *hapal* — https://live.staticflickr.com/2009/2488100923_8bf6b1f623_b.jpg | CC BY-ND 2.0 (ND: cropping is a derivative — verify research-use interpretation) |
| iranian-04 | `iranian/iranian-04.jpg` | Iranian man (middle-aged, direct gaze) | Flickr "Abdarchi" by *kamshots* — https://live.staticflickr.com | CC BY 2.0 |
| iranian-05 | `iranian/iranian-05.jpg` | Iranian woman (light-blue roosari) | Flickr "Persian Beauty" by *Hamed Saber* — https://live.staticflickr.com | CC BY 2.0 |
| iranian-06 | `iranian/iranian-06.jpg` | Iranian woman (blue roosari + glasses) | Flickr "Sweetheart" by *Hamed Saber* — https://live.staticflickr.com/175/423874909_175edca3b7_b.jpg | CC BY 2.0 |
| iranian-07 | `iranian/iranian-07.jpg` | Iranian woman (smiling, winter headwear) | Flickr "Smiling Parisa" by *Hamed Saber* — https://live.staticflickr.com | CC BY 2.0 |
| iranian-08 | `iranian/iranian-08.jpg` | Iranian woman (dark roosari, direct gaze) | Wikimedia Commons "Iranian girl (357469977).jpg" (Flickr import) | CC BY-SA 2.0 |
| afghan-01 | `afghan/afghan-01.jpg` | Afghan man (keffiyeh/shemagh, smiling) | Wikimedia Commons "Man in Kabul.jpg" (Flickr import) | CC BY 2.0 |
| afghan-02 | `afghan/afghan-02.jpg` | Afghan man (weathered face, beard, smiling) | Flickr "Afghan man smiles for a photo" by *DVIDSHUB* (US Dept. of Defense) — https://live.staticflickr.com/5021/5556125796_679078968b_b.jpg | CC BY 2.0 (US Gov work) |
| afghan-03 | `afghan/afghan-03.jpg` | Afghan man (white turban, long beard) | Flickr "Pashtun man, Kabul" by *Jeremy Weate* — https://live.staticflickr.com/1024/683 | CC BY 2.0 |
| afghan-04 | `afghan/afghan-04.jpg` | Afghan man (grey turban, white beard) | Wikimedia Commons "Afghanistan man.jpg" (Flickr import) | CC BY 2.0 |
| afghan-05 | `afghan/afghan-05.jpg` | Afghan woman (brown patterned shawl; Hazara features) | Web image search result (origin: The New York Times photo) | License unknown — **vetting required** |
| afghan-06 | `afghan/afghan-06.jpg` | Afghan woman (teal embroidered dress + headscarf) | Web image search result (origin: Eurac Research) | License unknown — **vetting required** |
| afghan-07 | `afghan/afghan-07.jpg` | Afghan woman (dark teal scarf, direct gaze; Hazara features) | Web image search result (origin: The Guardian photo) | License unknown — **vetting required** |
| afghan-08 | `afghan/afghan-08.jpg` | Afghan woman (brown headscarf + jacket, direct gaze) | Flickr "Women owned businesses succeeding…" by *ResoluteSupportMedia* (NATO) — https://live.staticflickr.com/4110/5032021831_1f2c4fcba9_b.jpg | CC BY 2.0 |

## Known methodological caveats (disclose in thesis)

1. **Age distribution**: Afghan men skew older (≈40–70) than Iranian men
   (≈20–55), because photographs of young Afghan men in traditional dress
   with free licenses are scarce. If age matching is required, replace the
   affected slots via **admin → محرک‌ها** (uploads take effect for new
   sessions without code changes).
2. **iranian-07** wears a winter beanie rather than a roosari (all other
   women wear head coverings). Replace if this is undesirable.
3. **Group-distinctiveness**: Afghan slots use traditional clothing cues
   (pakol/turban/keffiyeh, embroidered dresses, Hazara features); Iranian
   slots use everyday urban Iranian styling. Two slots (afghan-05,
   afghan-07) rely on facial features + headscarf styling rather than
   distinctive clothing.
4. Four slots (iranian-01, iranian-02, afghan-05, afghan-06) come from
   general web image search with **unknown licenses** — these must either
   be cleared or replaced before final data collection.

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
