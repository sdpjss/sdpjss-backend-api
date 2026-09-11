# Donation calculation v2 migration

Donation categories now separate the donation amount rule (`fixed` or
`minimum`) from the Prasad entitlement (`grams`, `packet`, or `none`). New v2
donations store category and Prasad snapshots so later configuration changes do
not alter historical receipts.

Minimum-amount categories can optionally enable `minimumAmountPerUnit`. When
enabled, quantity is collected and the required donation is the configured
minimum multiplied by that quantity. When disabled, the existing single
minimum-amount behavior is retained.

For gram-based categories, the calculation is:

```text
calculated grams = (eligible donation amount / price per 100 grams) * 100
final grams = max(rounded-down calculated grams, configured minimum grams)
```

The minimum applies only when the eligible donation amount is positive. Packet
and no-Prasad categories are normally excluded from this calculation.

A packet category can additionally allow Halwa by weight for in-person
collection. Professional donations use this exception. Their amount is included
in the gram calculation when Halwa is selected, while packet selection uses the
configured packet quantity. Courier collection always provides a packet only.

Courier eligibility uses the year-wise `minimumCourierDonationAmount`. The API
sums only items whose category Prasad type is not `none`. If that eligible total
is below the configured minimum, courier is rejected and in-person collection
must be used. An eligible courier donation receives one Prasad packet.

## Rollout

1. Deploy the additive database and API changes.
2. In the admin portal, configure the price per 100 grams, minimum Prasad
   quantity, and rounding unit for the current year.
3. Run the migration report in dry-run mode:

   ```sh
   npm run migration:donation-v2
   ```

4. Review every category reported with `requiresAdminReview: true`. Dynamic and
   Service categories cannot be converted safely without an admin confirming
   their minimum amount and Prasad entitlement.
5. Edit and save each category in the admin portal to confirm it as
   `category-v2`. Until then it continues to use the legacy calculation.
6. After backing up the database, snapshot the currently visible entitlement
   of completed historical donations:

   ```sh
   npm run migration:donation-v2 -- --apply
   ```

The migration is idempotent: donations that already have an entitlement
snapshot are skipped. It does not change receipt IDs, donation amounts, payment
status, transaction IDs, donor details, or addresses.

Pending donations retain the calculation and category snapshots captured when
their payment order was created.
