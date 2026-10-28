# Premium download support grants

The approved server batch in `premium-download-batches.js` gives each specified account **two additional premium download credits**. It contains recipient hashes rather than customer emails. Server startup activates existing registered accounts after a successful deployment; authenticated activation covers later account creation. This operator command provides an immediate runtime alternative and inspection tool. Redeploying or rerunning the command preserves the remaining balance.

One credit unlocks one owned, completed work under the normal 159-baht conditions: watermark-free downloads in all supported formats, premium hairstyles, and five suit choices for that work. Repeated downloads and later renders of the same work consume no additional credit. Two credits cover two distinct works. An existing basic work uses a premium credit only through an explicit premium upgrade. Existing premium rights reuse their grant for free.

While the verified account has at least one premium download credit remaining, it can select and process premium hairstyles in EasyMode and Studio, including before the first result. Selecting or processing hair does not spend a download credit or unlock a watermark-free export. After the balance reaches zero, new unpaid works need another premium entitlement; works already unlocked with a premium credit retain their premium hairstyles and download rights.

The grant preserves existing balances, generation counters, saving permissions and purchase records. It creates no Stripe payment and supplies no unlimited owner access.

## Run inside the Railway service runtime

Use the deployed revision containing this script and its approved batch. Run in the service runtime that already has its normal `DATABASE_URL`; do not paste a database URL into a command, document or chat.

Inspect first; this default command uses a read-only database transaction and performs no schema setup or grants:

```sh
node scripts/grant-premium-download-credits.mjs
```

Apply the approved grants to existing registered accounts:

```sh
node scripts/grant-premium-download-credits.mjs --apply
```

Run the default command again to inspect the resulting ledger and `premiumDownloadRemaining`. Output identifies recipients by hash and account IDs, never email. `missing` means no matching registered account exists yet; no account is created. `conflict` requires checking the account binding before proceeding. The command rejects ambiguous normalized account matches. Each account commits independently, so a later failure can leave earlier grants applied; rerunning safely resumes through the persistent batch markers. Existing grant quantities are never reset.

Explicit apply can initialize the download policy and premium grant tables. Use an initialized application database with its existing wallet, account and saved-work tables. The command grants credits; it does not unlock a specific work until that account redeems a credit.

## Deployment and verification status

The support-credit/auth implementation was deployed successfully with revision `067aaa64655f7376830f2c687e6cf09f2719d0d8`; its exact production asset hashes and health endpoint were verified. The session has no production database, Stripe or Railway credential bindings. Local isolated SQL and PostgreSQL concurrency tests passed, but **production balances have not been verified or changed by this operator command**. Confirm the server's `Premium download support activation:` log or inspect the runtime ledger before reporting either recipient's exact remaining balance. Retain the hash-only output as verification evidence. The separate premium-hairstyle-before-redemption change requires its own deployment verification.
