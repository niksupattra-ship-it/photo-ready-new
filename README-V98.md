# V98 — Clean Head integration fix

- Fix clean scalp drawn over donor back hair (the actual source of missing hairstyle).
- Veto known original hair when restoring visible original skin.
- Validate cached Clean Head after original-skin restoration.
- Dark shadows trigger a warning, not automatic rejection.
- Implement the Clean Head PNG download button (V97 release notes mentioned it but UI lacked it).
- Preserve locked transforms and fixed uniform templates.

Image quality is not verified against live API; review diagnostic PNG before relying on the result.
