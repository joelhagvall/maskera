---
"@maskera/core": patch
---

The contextual `kontonummer` detector now masks a clearing number and account written apart by a comma and a space, as Swedbank prints them ("konto 3300-0, 032 3232 3232" with the registered test account). Before, only the clearing number was masked (as `PLUSGIRO`) and the account number leaked. A comma without a following space still ends the account.
