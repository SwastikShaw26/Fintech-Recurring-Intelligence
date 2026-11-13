# 3. Importing and managing statements

This chapter teaches CSV import from the beginning. You can work through it with the invented data below. The exercise does not require a bank login, and you should use synthetic files while learning the workflow.

If your copy of FinSight shows no **Import statement** menu, check which mode you are using. The synthetic deployment profile hides import. The loopback local app supports import without a hosted account. The hosted app requires an operator-issued sign-in credential before it shows the file picker.

## 3.1 Understand the file

A CSV is a plain-text table. Its first row is a header that names the columns. Every following row should describe one transaction. FinSight needs a date, a description, and the information needed to determine both the amount and direction. A payment method is optional.

The description may be called **Narration**, **Particulars**, **Merchant**, or another name in your export. The header does not change the values underneath it. A mapping tells FinSight which column plays which role.

The current import accepts UTF-8, comma-delimited CSV. If your bank supplies a spreadsheet or PDF, first produce a CSV with a header and one transaction per row. A filename ending in `.csv` does not change the underlying format. Do not rename a PDF or spreadsheet to make it look like a CSV. Preserve the original file and edit a separate copy.

### Pick the right amount layout

| Layout | Required amount inputs | Example |
| --- | --- | --- |
| Signed amount | One amount column with the sign convention selected in FinSight | `-125.00` can represent a debit under **Debits are negative** |
| Amount and direction | An amount column plus a debit/credit column | `125.00,DR` can represent a debit |
| Separate debit and credit | Both amount columns, with a positive value in exactly one column for each row | `125.00,` is a debit when the first column is mapped to debit |

For explicit direction, accepted labels are `debit`, `credit`, `DR`, `CR`, `D`, and `C`, with case ignored. The explicit direction decides the direction when mapped. For split columns, a blank or zero means no amount on that side. Both positive or both zero will fail validation.

Use a period for decimal fractions and at most two decimal digits. A thousands separator belongs inside a quoted field so its comma is treated as part of the amount. INR mode accepts a leading rupee sign. Plain numeric values are the simplest input for other currencies. The UI accepts INR, GBP, USD, EUR, or **Unspecified (statement units)**. Use unspecified when the source units are unknown. FinSight does not convert currencies.

### Choose the date format

| UI choice | Example | Reading |
| --- | --- | --- |
| **YYYY-MM-DD** | `2026-01-05` | January 5, 2026 |
| **DD/MM/YYYY** | `05/01/2026` | January 5, 2026 |
| **MM/DD/YYYY** | `01/05/2026` | January 5, 2026 |

A value such as `05/01/2026` is ambiguous without the source convention. Check a transaction whose day exceeds 12, or check the format specified by your bank. The application expects one convention per import. Future transaction dates are rejected.

### Handle commas and quotes

A description containing a comma must be quoted. Double an embedded quotation mark to keep it inside a quoted field.

```csv
date,description,amount
2026-01-05,"Audio, Books & News",-125.00
2026-01-06,"Merchant ""Online""",-40.00
```

The preview parser handles quoted multiline values. If validation reports a row with the wrong number of fields, look at quoting in and around the reported line.

## 3.2 First exercise — analyze an invented statement

Create a new plain-text file. Paste the following lines and save it as `finsight-practice.csv` using UTF-8. In a text editor that automatically appends `.txt`, select the save option that preserves the exact filename.

```csv
date,description,amount,payment_method,private_reference
2026-01-05,Example Learning,-125.00,Card,DEMO-101
2026-02-05,Example Learning,-125.00,Card,DEMO-102
2026-03-05,Example Learning,-125.00,Card,DEMO-103
2026-04-05,Example Learning,-125.00,Card,DEMO-104
2026-04-06,Example Cafe,-20.00,UPI,DEMO-105
2026-04-07,Example Cafe Refund,20.00,UPI,DEMO-106
```

1. Open **Import statement**.
2. Select the file under **Statement CSV**. The browser reads it and shows up to five records. All valid records are eligible for analysis, including rows beyond the preview.
3. Under **CSV layout preset**, try **ISO date with signed amount · v1**. Presets fill in suggestions. Inspect each field before sending the file.
4. Confirm **One amount column**, **Date** → `date`, **Merchant or description** → `description`, **Amount** → `amount`, and **Payment method** → `payment_method`. Leave **Debit or credit** unmapped because the amount sign carries the direction. Choose **YYYY-MM-DD** and **Debits are negative**.
5. Choose the currency you want to use for this exercise. These example numbers are invented, so either your preferred supported currency or unspecified units is suitable.
6. Leave the sample `private_reference` column unmapped. The preview can display it locally. The analysis request excludes it.
7. Choose **Analyze statement** and look for **Private statement data**. Open **Transactions**. You should find six rows, including one credit. The recurring list should identify the repeated learning charges, and the refund may be linked as possible evidence.
8. Go back to **Overview** and compare the first and last observed dates with the dates you supplied. In a later month, the pattern can carry a stale warning. The input has no evidence after April 2026.

This exercise teaches the mapping flow. If the example dates are in the future when you run it, adjust all six consistently to past dates before importing.

### Preset reference

- **Day-first withdrawal / deposit · v1** sets separate debit and credit columns and a day-first date format. Confirm the withdrawal and deposit fields before analyzing.
- **ISO date with signed amount · v1** sets one signed amount column with ISO dates and negative debits.
- **Day-first amount with Dr/Cr · v1** looks for an amount field and a separate direction field.
- **Custom mapping** lets you select every field yourself. Use it when a header does not match the preset or more than one plausible column appears.

Presets are versioned layouts. They do not establish that a particular bank export is supported as-is. If a file begins with report metadata before the header, create a new copy that begins with the header. Keep your input under the 2 MB browser limit. The server accepts at most 10,000 transactions and 64 columns, and it bounds the request body as well. An overlap request can be larger than either individual file because it contains the mapped incoming data and currently loaded transactions.

## 3.3 Review overlapping exports

Use overlap review only when the current statement and the new export cover the same account and currency and include complete days. This is useful when a bank provides two date ranges that share part of their coverage. Filtered exports, partial-day files, and different accounts can contain similar rows that represent different payments.

FinSight compares exact occurrences using date, description, amount, direction, and payment method. If the current history has one occurrence and the new file has two, it can skip the one matched occurrence and retain the other. A changed amount or method on the same day with a matching normalized descriptor may appear as a conflict. The application keeps the incoming row unless you exclude it.

### Exercise — review before merging

1. Keep the invented statement loaded. Create a second file with the same header and with the April 5 learning debit copied exactly.
2. Add a second April 5 learning debit with a changed amount, and add an unrelated new row. Think of the changed amount as an intentionally ambiguous example.
3. Open **Import statement**, select the second file, and inspect the mapping.
4. Select **Combine with the current statement** only after confirming the account and coverage conditions.
5. Click **Review overlap**. Inspect the counts for exact matches to skip, other rows to add, and possible conflicts.
6. Compare the incoming and existing amounts, payment methods, and descriptions. Use **Exclude incoming row** only if you have evidence that it should be omitted. A similar entry can be legitimate.
7. Choose **Edit mapping** if the evidence suggests a mapping error. Choose **Apply reviewed overlap** to apply your choices and rerun analysis.
8. Verify the count in **Transactions** and read the combined-export message on **Overview**.

FinSight shows up to 100 conflicts. When more exist, unlisted incoming rows are kept. If the exports have different descriptions, the row might not be recognized as a possible conflict. The feature cannot recover missing fields or prove that a same-day payment is duplicated.

## 3.4 Review merchant suggestions

A merchant description in an export is often abbreviated. The app can offer a link when two descriptions share a configured alias, look the same after normalization, or have strong spelling similarity and compatible numeric tokens. You decide whether the labels identify the same business or subscription context.

1. Return to **Import statement** after loading a private statement.
2. Under **Review merchant descriptors**, inspect each suggestion and its reason.
3. Choose **Confirm link** only after checking that the variant belongs with the displayed target. Use **Dismiss** to hide a suggestion. Dismissed links can be restored to the suggestion list.
4. To add your own link, select **Variant descriptor** and **Keep as merchant**, then click **Link and reanalyze**.
5. To undo a confirmed link, use its **Remove** control.
6. Inspect **Transactions** and **Recurring payments** again. The original descriptions remain visible as evidence. Grouping and commitment evidence may change after reanalysis.

For example, `EXAMPLE LEARNING` and `EXAMPLE-LEARNING` may be the same provider. `EXAMPLE LEARNING 1` and `EXAMPLE LEARNING 2` might identify separate accounts or plans. Match the real history rather than relying on the spelling.

## 3.5 Choose what to save

Start with transient import when you only need one analysis. The current browser tab holds results for review. **Clear private statement** and reload clear that open analysis. Your original file stays on disk, and previously saved copies and downloaded files have their own lifecycle.

| Storage choice | When to use it | What to remember |
| --- | --- | --- |
| Transient local import | Analyze on your own machine without keeping a saved app copy. | Analysis runs on the loopback backend and results stay in the tab. |
| Local saved account | Reopen a mapped copy later using the same local SQLite configuration. | A nickname refers to a saved copy on this machine. The database file relies on filesystem permissions. |
| Hosted saved copy | Use an explicitly configured hosted workspace with credentials. | The server stores an encrypted, owner-scoped snapshot with expiry. A save is a separate action from analysis. |
| Downloaded JSON | Keep or share a copy of mapped data after inspecting it. | The file can contain financial details. It remains wherever you saved or synced it. |

### Local saved accounts

With local storage enabled by your operator, open **Import statement → Local saved statement**. Enter a **Saved account nickname**, choose **Save locally**, and confirm. Use **List saved accounts** to find it later. Select its nickname and choose **Restore saved statement** to open that analysis.

Select two to eight saved accounts under **Accounts to compare**, then choose **Compare selected accounts**. The overview shows each analysis independently and groups totals by known currency. Its estimates cover the full saved statements. It does not align those records to a common date range. Use **Delete saved statement** only after checking the selected nickname. Deleting a saved copy does not delete a downloaded JSON file or the original CSV.

### Hosted Account History

1. In the hosted workspace, enter your operator-issued credential and click **Connect hosted workspace**. It starts an expiring browser session. Keep this credential private and never paste a bank password into the form.
2. Import and analyze a statement. The browser preview runs before any upload. Analysis and overlap review send mapped fields to the configured host.
3. Open **Import statement → Hosted workspace**. Set **Snapshot name**, **Keep saved copy for**, and optionally **Statement start** and **Statement end**. Supply both dates or leave both blank. A declared period must contain all recorded dates. Use the actual export coverage if known. If left blank, the period is derived from the earliest and latest recorded rows.
4. Under **Save as**, pick **New snapshot history** for a separate copy or **Next version of selected copy** to keep the prior copy and add an updated version. **Replace selected copy** deletes the selected saved copy as part of saving its successor. Verify the selected copy and confirm the action with **Save hosted copy**.
5. Use the saved-copy menu and **Next saved statements** to navigate pages. **Refresh hosted statements** returns to the first page. **Restore hosted statement** opens the selected copy. **Delete hosted statement** removes the selected copy.
6. To compare, select a saved copy and click **Add selected copy to comparison**. Repeat with up to four copies, then choose **Compare selected periods**.
7. Read the **Shared period** and per-copy debits, credits, and net outflow grouped by currency. Net outflow is debits minus credits for that copy in the shared period. An observed period can omit unrecorded days. Different versions may contain some of the same transactions, so comparisons present values per copy without summing versions together.

Sign out when you finish. The app clears the private view and requests server revocation. Reload also clears the current tab, while the server session can remain valid until its expiry. See [Using FinSight](02-using-finsight.md#end-a-session-intentionally) for the effects of clearing, deletion, and downloads.

## 3.6 Diagnose common import problems

| Symptom | What to check |
| --- | --- |
| The file picker is missing | Synthetic deployment hides imports. Hosted mode requires sign-in. Local mode should be opened using the supported loopback setup. |
| No preview appears | Check UTF-8 encoding, the 2 MB limit, and whether the file is a CSV with a header. |
| Analyze is disabled | Assign all required fields for the selected layout. If you are reviewing overlap, use the review controls. |
| Date validation fails | Check the selected date convention, mixed formats, invalid calendar dates, and future dates. |
| Amount validation fails | Check for currency prefixes, comma quoting, zeros, and both debit and credit populated on the same split row. |
| Payments appear as credits | Check the signed convention or the mapped debit/credit column. Review a known payment before trusting totals. |
| An expected recurring charge is missing | Check the date range, aliases, amount variation, and whether there are enough observed debits. A short or incomplete statement can leave valid commitments undetected. |
| A likely match was skipped or retained unexpectedly | Compare fields in both exports and verify complete coverage. Exact occurrence matching preserves legitimate repeats when the input supports them. |
| Saving or restoring fails locally | Verify that the local storage path is configured outside the repository and that you are using the same-origin local app. |
| The hosted operation fails after inactivity | The hosted session can expire. Reconnect and restore an explicitly saved snapshot if available. |

## 3.7 Privacy checklist

- Keep the original export in a location you control and use a copy for experiments.
- Map only the fields you need. If a descriptor field itself includes an account number or another identifier, remove it from the copy first if it is unnecessary. Unmapped-column exclusion does not redact values embedded in mapped fields.
- Keep private files, snapshot exports, and credentials out of source control and shared issue reports. Use synthetic examples when reporting problems.
- Check the configured hosted origin before sending mapped financial records. Data minimization limits the payload to mapped fields. The hosted server still receives those fields for analysis.
- Review calendar and JSON downloads before sharing them. Files already sent to another person or service follow that destination's privacy and retention controls.

Continue to [Using FinSight](02-using-finsight.md#forecast-and-savings) to interpret the results.
