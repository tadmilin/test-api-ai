# Webhook Signature Debug Guide

## Issue
Webhook verification failing with "Invalid webhook signature" causing upscale process to stop.

## Changes Made

### 1. Enhanced Logging in `verifyWebhook.ts`
Added detailed debug logs to track:
- Secret existence and prefix
- Signed content construction
- Secret key extraction and bytes
- Computed vs expected signatures
- Comparison results

### 2. Enhanced Logging in `route.ts`  
Added logs to see:
- Incoming webhook body length
- All request headers
- Extracted webhook headers

### 3. Created Debug Endpoint
New endpoint: `/api/webhooks/debug`
- Shows if REPLICATE_WEBHOOK_SECRET exists
- Shows secret prefix and length
- Lists all REPLICATE/WEBHOOK env keys

**⚠️ REMOVE THIS ENDPOINT IN PRODUCTION!**

## Testing Steps

### Step 1: Deploy to Vercel
```bash
git add .
git commit -m "Add webhook signature debugging"
git push
```

### Step 2: Check Environment Variable
Visit your debug endpoint:
```
https://your-domain.vercel.app/api/webhooks/debug
```

Expected output:
```json
{
  "hasSecret": true,
  "secretPrefix": "whsec_C2F...",
  "secretLength": 44,
  "allEnvKeys": ["REPLICATE_API_TOKEN", "REPLICATE_WEBHOOK_SECRET"]
}
```

If `hasSecret: false`, the environment variable is not set correctly in Vercel.

### Step 3: Trigger a Job
Submit a new text-to-image request and watch the Vercel logs.

### Step 4: Analyze Logs
Look for these new log entries in order:
```
[Webhook] 📥 Received webhook request
[Webhook] 🔍 Body length: ...
[Webhook] 🔍 All headers: ...
[Webhook] 🔍 Extracted headers: ...
[Webhook] 🔍 Secret exists: ...
[Webhook] 🔍 Secret prefix: ...
[Webhook] 🔍 Signed content length: ...
[Webhook] 🔍 Webhook ID: ...
[Webhook] 🔍 Webhook timestamp: ...
[Webhook] 🔍 Secret key length after prefix removal: ...
[Webhook] 🔍 Secret bytes length: ...
[Webhook] 🔍 Computed signature: ...
[Webhook] 🔍 Expected signature header: ...
[Webhook] 🔍 Parsed signatures: ...
[Webhook] 🔍 Comparing: ...
```

## Common Issues & Solutions

### Issue 1: `hasSecret: false`
**Solution:** Set `REPLICATE_WEBHOOK_SECRET` in Vercel:
1. Go to Vercel Dashboard → Your Project → Settings → Environment Variables
2. Add `REPLICATE_WEBHOOK_SECRET` with value `whsec_C2FVsBQIhrscChlQIMV+b5sSYspob7oD`
3. Redeploy

### Issue 2: Secret exists but signature still fails
**Possible causes:**
- Wrong secret value in Vercel (doesn't match Replicate)
- Secret was regenerated on Replicate but not updated in Vercel
- Base64 decoding issue

**Solution:** Fetch the correct secret from Replicate:
```bash
curl -s -X GET \
  -H "Authorization: Bearer $REPLICATE_API_TOKEN" \
  https://api.replicate.com/v1/webhooks/default/secret
```

Then update Vercel with the correct value.

### Issue 3: Headers not received correctly
**Check logs for:**
- `webhook-id`, `webhook-timestamp`, `webhook-signature` in headers
- If missing, webhook might not be configured in Replicate

**Solution:** Verify webhook URL in Replicate:
1. Go to https://replicate.com/account/webhooks
2. Ensure webhook URL is: `https://your-domain.vercel.app/api/webhooks/replicate`
3. Ensure "Sign webhooks" is enabled

### Issue 4: Timestamp too old
If logs show: "Webhook timestamp too old: X seconds"

**Solution:** This means:
- Webhook delivery is delayed > 5 minutes
- Or server time is incorrect

Check Vercel function execution time and increase `MAX_TIMESTAMP_DIFF_SECONDS` if needed.

## After Debugging

Once issue is resolved:

1. **Remove debug endpoint:**
   ```bash
   rm src/app/(frontend)/api/webhooks/debug/route.ts
   ```

2. **Reduce logging (optional):**
   Remove or comment out the detailed `console.log` statements added for debugging.

3. **Redeploy:**
   ```bash
   git add .
   git commit -m "Remove webhook debugging"
   git push
   ```

## Expected Flow After Fix

1. ✅ Job created
2. ✅ Predictions created on Replicate  
3. ✅ Webhook received
4. ✅ Signature verified
5. ✅ Initial image saved to Cloudinary
6. ✅ Upscale prediction created
7. ✅ Webhook received for upscale
8. ✅ Signature verified
9. ✅ Upscaled image saved to Cloudinary
10. ✅ Job status updated to "completed"
11. ✅ Dashboard refreshes with final image

## Need More Help?

Share the full webhook logs from Vercel after triggering a job, especially:
- The debug endpoint response
- The webhook signature verification logs
- Any error messages
