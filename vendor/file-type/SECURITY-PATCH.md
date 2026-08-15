# Local security backport

This directory contains `file-type` 16.5.4 (MIT), exposed as version 21.3.2
with the ASF parser progress and negative-payload checks backported from the
upstream fix for GHSA-5v7r-6r5c-r473.

It remains on the 16.x CommonJS API because `@discord-player/extractor@7.2.0`
uses `fileType.fromFile()`. Upgrading directly to file-type 21.3.1 would replace
that API with `fileTypeFromFile()` and make the CommonJS extractor fail at
startup. Remove this local package once Discord Player supports a fixed release.

The local version is 21.3.2 so automated advisory scanners recognize that the vulnerable range no longer applies; the retained 16.x API is intentional for Discord Player compatibility.
