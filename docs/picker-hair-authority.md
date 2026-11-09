# Hair guides follow the exact picker images

The legacy catalogue cutouts differ from the menu pictures. Several long examples lose their actual ends and waves, and the cleanup masks omit fringe or temple pieces. The generic compact-hair wording also ordered removal of some details present in the selected picture. Original-upload identity conditioning contained the old source hair a second time.

Current selected catalogue jobs use the versioned `picker-hair-v1` protocol. Each of the 35 catalogue guides is extracted from its actual picker photograph at native size. Opaque RGB samples remain exactly those of the picker; removed pixels have zero alpha and white hidden RGB. Donor eyes, mouth, chin and clothing are removed. Guide 7 retains its existing reviewed picker extraction. Fine cheek pieces on style 20 receive a bounded connected-strand recovery. The 35 PNGs and their source/guide hashes, dimensions and face-check anchors are committed together. Prebuild rejects a changed picker or guide until its mapping has been regenerated and reviewed.

The selected picture controls its own parting, fringe, waves, braids, crown and cut endpoints. Reference-specific wording replaces generic ear opening, fringe deletion, bob/updo conversion and long-hair truncation. The neckline guide still bounds skin, not hair. Compact styles still remove obsolete source lengths and retain continuous skin. The new reference descriptions include the intentional short cheek pieces in gathered style 20; strict gathered-tail validation is retained.

The client keeps `image` and `originalSource` unchanged and adds a face bounding box measured from that same submitted image. The server derives its additional identity-conditioning crop from those original pixels. This avoids reinforcing source crown/rear hair in a second full-image identity reference. Original source ownership, canonical-input checks and job settlement remain intact. Female generation remains skin/light preparation, then head/hair/neck; male generation retains its single edit. Makeup uses the same completed Natural base and existing v7 palette.

New selected results are compared against their picker on first processing and later hairstyle changes. Existing conservative fringe/endpoint checks remain; a clearly long reference with no lower hair in a sufficiently visible output frame is also rejected. Unreadable or cropped endpoint evidence does not become a guessed exact style judgment. This checks obvious contradictions, not exact recognition of every strand or a guarantee of provider fidelity. No automatic regeneration loop is added.

The v12 hair policy excludes historical selected female/male heads from new hair caches; the unselected male base remains compatible. Old work remains visible and local makeup retains its existing base. Re-select a hairstyle to regenerate it under the new guide policy. Versioned picker URLs prevent browser caches from showing an old example during comparison.

Validation covers every guide's native pixels, source/guide SHA-256, donor-feature removal, all 35 actual provider request payloads with inert transport and original identity crops, reference-specific instruction precedence, first-upload acceptance/rejection, conservative mask scenarios, immutable source multipart transport and existing shared-base/cache/transaction behavior. Historical requests without the new protocol keep the pre-change payloads. Previously stale compatibility snapshots are recorded from commit `101a810`, before this change.

To rebuild after changing picker pictures, start Vite, then run:

```
python scripts/generate-catalogue-hair-masks.py --output-dir /tmp/idprom-picker-guides
node scripts/build-catalogue-hair-guides.mjs /tmp/idprom-picker-guides
node scripts/check-catalogue-picker-guides.mjs
```

Review every regenerated guide before committing. Authoring uses the pinned local segmentation/landmark models and never submits an AI portrait request. Production only reads the reviewed guide PNG.
