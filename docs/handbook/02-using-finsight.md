# 2. Using FinSight

FinSight reads a history of debits and credits and looks for repeated charges. It can help you answer three questions.

1. **What already happened?** Look up a posted transaction in **Transactions**.
2. **What might happen next?** Open **Forecast** and read the dates, amounts, and evidence warnings.
3. **What can I do?** Review the supporting charges, check with your provider, and track any actions you take in the commitment dialog.

You can follow this chapter with the built-in synthetic data. No programming or bank account is needed. When you are ready to use a file of your own, continue to [Importing statements](03-statement-import.md).

## Before interpreting a number

| Term | Meaning in FinSight | Where to check it |
| --- | --- | --- |
| Transaction | A row describing an observed debit or credit in the currently loaded data. | **Transactions** |
| Debit | Money going out of the statement account. FinSight displays a positive magnitude and records debit as the direction. | The transaction's direction and amount |
| Credit | Money coming into the account. A refund may appear as a credit. | The transaction's direction and any refund note |
| Commitment | A group of debits the detector inferred could be recurring. | **Recurring payments** and commitment details |
| Cadence | The inferred spacing between charges, such as monthly, quarterly, annual, or irregular. | Commitment details |
| Projection | An estimate computed by advancing an observed billing date or a fitted billing slot. | **Forecast** and the subscription timeline |
| Mandate | The payment authorization managed by your bank, issuer, UPI app, or other provider. | Your payment provider |
| User-reported revocation | Your record in FinSight that you saw revocation in the provider's system. | The commitment dialog and activity history |

A merchant can appear under several descriptions. Conversely, two subscriptions can share one merchant name. Look at dates, amounts, and descriptors together before acting on a commitment. A payment repeated on a schedule can still be a series of individually authorized purchases.

## First tour with sample data

1. Open the app in your browser. The source indicator should show **Synthetic transaction data** when no private statement is loaded.
2. In **Overview**, inspect the recurring charges and subscription timeline. Identify one item with a projected date and one with an observed billing event.
3. Click a milestone or open **Recurring payments** and choose a commitment. Inspect the merchant name, inferred cadence, amount, and linked history.
4. Open **Transactions** and look for the same merchant or descriptor. The bank export may use a different spelling from the name displayed in the commitment list.
5. Open **Review** to see what needs a closer look. A possible duplicate or amount shift is an invitation to inspect evidence. A legitimate second purchase can produce a duplicate warning.
6. Open **Forecast** to see which regular patterns project into the next 30 days. Sample records age as calendar time passes. A forecast window can be empty or carry stale warnings even when **Transactions** and **Recurring payments** have records.

Use **Evaluation & audit** to explore the labeled synthetic challenge. A false positive is a debit the detector marked recurring when its challenge label says otherwise. A false negative is a debit it missed. These counts describe that benchmark. They cannot tell you whether the app classified a particular debit in your own file correctly.

## Read a commitment without over-interpreting it

Start with the evidence in the commitment dialog.

- Compare the first and last observed dates with the period your statement actually covers.
- Read the cadence and linked charges. Variable amounts can result from plan changes, usage, taxes, or other adjustments. The amount pattern is a detector signal.
- Treat the latest projection as a planning estimate. A fitted date represents a calendar slot supported by the dates in your statement.
- Check your bank or provider for the exact mandate, payment amount, and next charge if you need a definitive answer.

If a merchant shows multiple commitments, review the linked debits under each one. A merchant descriptor alone does not identify a plan. When a merchant appears under several descriptions, see the [merchant-review exercise](03-statement-import.md#34-review-merchant-suggestions).

## Forecast and savings

**Estimated obligations** includes a 30-day calendar, an annualized estimate, and a monthly equivalent. The monthly equivalent spreads estimated annual obligations over twelve months. A yearly payment can therefore increase the monthly equivalent even if no debit for it is projected this month.

The calendar can flag short history, variable amounts, or a lack of recent supporting debits. In the current implementation, an annualized total or savings scenario can still include an old pattern with an available cadence and amount. Read the individual evidence before relying on headline totals. A price change can also leave the estimated amount based on historical observations.

**Recorded debits by month** summarizes gross debits for the latest observed month and the preceding month. Credits are excluded from this comparison. A month marked **No records loaded** may simply be outside the imported coverage.

### Try a savings scenario

1. Scroll to **Explore potential savings**.
2. Check one commitment under **Commitments to compare**.
3. Read the change in estimated annual savings and check that commitment's history.
4. Deselect it and compare a different candidate.

The calculation assumes selected commitments stop before the next charge and incur no fees. Toggling a checkbox changes the scenario. It has no effect on a provider or payment authorization.

## Cash buffer planner

Use this when you want to ask, “If only these estimated debits occurred, how much would remain after each charge day?”

1. Open **Forecast → Cash buffer planner**.
2. Enter a **Starting balance** in the currency of the current view.
3. Enter a **Minimum balance buffer**. A buffer of 100 means you want to flag days where the estimated balance falls below 100.
4. Under **Include these projected commitments**, keep or remove the estimates you want in your scenario.
5. Read the displayed charge days, estimated debits, and resulting balance.

For example, if your entered balance is 150 and selected estimates total 60 on the first day and 50 on a later day, the displayed path would be 90 then 40. With a 50-unit buffer, the second day is below buffer. Multiple selected charges on the same date are combined before calculating that day's balance.

FinSight uses the amount you enter in the current planner view. It does not retrieve bank balances or add income and other expenses. The planner excludes stale estimates and entries without amounts. It also excludes commitments you reported as revoked. This scenario remains uncertain because a provider can post earlier, later, or for a different amount.

## Reminders and calendar files

### In-app reminders

In **Forecast**, turn on **Show in-app reminders**, choose the **Reminder window**, and optionally select **Annual renewals only**. The list appears on the Forecast screen. Your preferences are saved in the browser when storage is available. No background email or device notification is scheduled.

### Export a private calendar file

1. In **Forecast**, expand **Export calendar reminders**.
2. Select payments under **Payments to export**. The list is restricted to supported estimates. Stale, uncertain, unsupported, and user-reported revoked commitments are excluded.
3. Check the **Calendar file preview**. The default event title is **Estimated payment**, with no merchant name or amount.
4. Only if you want those details in the destination calendar, select **Include merchant names** or **Include estimated amounts**. Read the preview again.
5. Choose **Download calendar file** to download `finsight-estimated-payments.ics`.
6. If you want to use the file, import it using your calendar application's file-import option. Confirm that the events are on the intended dates. Calendar applications differ in how they handle duplicate imports, alerts, and synchronization.

The file contains estimates as of export. Regenerating a forecast in FinSight does not update a file already imported elsewhere. An imported calendar may sync to your provider and be visible to people who have access to that calendar.

## Revocation checklist and commitment activity

FinSight can organize your work while you use the relevant payment provider. You may see different instructions depending on whether a commitment is associated with UPI AutoPay, a card, a bank mandate, or a payment method that needs further investigation.

1. Open the commitment dialog and read the guidance and checklist.
2. Find the relevant mandate in the provider's app or website. Complete the provider's own flow.
3. Check each FinSight checklist item when you have done it. Use **Reset checklist** if you need to clear your progress and any recorded report.
4. Where the flow offers **Mark as revoked**, use it only after the provider shows that the mandate was revoked. FinSight records **Marked as revoked (user-reported)**.
5. Reopen the commitment and look for **Commitment activity**. If no relevant evidence or report exists, this section may be absent.

Activity can include a sustained observed price change, a possible skipped billing cycle, your report, and linked debits posted after the report day. Gaps can arise from missing statement coverage. A later debit can have explanations that require checking the provider's records. No later linked debit in the loaded file means exactly that.

Use **Download this activity** to save a JSON file containing events scoped to the selected commitment. It can include dates and amounts. Review it before sharing. Downloads remain wherever you saved them until you remove them.

For the synthetic workspace, checklist progress can persist in the current browser. Private statement checklist progress is held in the current tab. Avoid treating either as the record of an issuer action.

## Ask FinSight

Use **Ask FinSight** to explore supported questions about upcoming estimates, sustained price increases, possible duplicate charges, and billing gaps. Choose one of the offered questions, or phrase a question around one of those topics. The assistant uses records already loaded into the view and can link to evidence.

For example, ask which debits might be duplicates, then inspect their dates, amounts, and payment methods. An unsupported question may return a list of topics the assistant can handle. The feature uses deterministic rules in the browser. It does not query your bank or send statement data to a generative AI provider.

## End a session intentionally

| Action | Effect |
| --- | --- |
| **Clear private statement** | Clears the currently open private analysis from the tab and returns to the synthetic view. |
| Reload the browser tab | Clears an unsaved private analysis and tab-local session state. |
| Delete a saved copy | Removes the selected saved copy through the applicable local or hosted storage flow. |
| Sign out of the hosted workspace | Clears the private view and requests session revocation. If the server cannot confirm revocation, the UI reports that the session may remain valid until expiry. |
| Delete a downloaded file | Removes that copy through your operating system. Files shared or synced elsewhere follow the destination's controls. |

Clearing the tab and deleting an explicitly saved copy are separate actions. The original bank export remains under your control. See [Importing statements](03-statement-import.md#35-choose-what-to-save) for storage options.
