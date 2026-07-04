---
"@maskera/core": patch
"maskera": patch
---

Three detector fixes found by stress-testing with real user input: the `EMAIL` regex now matches addresses with å/ä/ö ("åsa.öberg@example.se" was previously split and partially leaked), the `PHONE` regex no longer starts matching inside a longer digit run ("kundnummer 100200-3000" fired a false phone match), and the `ADRESS` heuristic covers all-caps and all-lowercase addresses ("STORGATAN 12", "björkvägen 21") so the house number is no longer left exposed when the NER model only catches the street name.
