# OAuth Callback Setup Guide

## What Happens Now

When users click "Continue with Google":
1. The OAuth URL opens in their default browser
2. They authenticate with Google
3. Supabase redirects to `/callback.html` at your configured web origin
4. The callback page:
   - **In Electron:** Shows success and closes after 3 seconds
   - **In Web Browser:** Shows success and redirects to dashboard after 3 seconds

## Required Supabase Configuration

You **must** add the redirect URLs to your Supabase project settings, or OAuth sign-ins will fail.

### Steps:

1. Go to your Supabase Dashboard
2. Navigate to **Authentication → Settings** (left sidebar under Authentication)
3. Scroll to **Redirect URLs** section
4. Add these URLs based on your deployment:

**For Development:**
```
http://localhost:3000/callback.html
http://localhost:3001/callback.html
```

**For Production (Web/GitHub Pages):**
```
https://your-domain.com/callback.html
https://yourusername.github.io/callback.html
```

**For Electron Desktop (development):**
```
http://localhost:3000/callback.html
```

5. Click **Save**

## Testing

### Local Development (Web)
```bash
npm run dev
# Visit http://localhost:3000
# Click "Continue with Google"
# Should redirect to http://localhost:3000/callback.html
```

### Local Development (Electron)
```bash
npm run desktop:dev
# Click "Continue with Google"
# Browser opens, sign in, then browser closes automatically
```

## Troubleshooting

**Issue:** "Redirect URL mismatch" error from Google
- **Solution:** The `redirectTo` URL doesn't match what's registered in Supabase. Check that `/callback.html` is listed in your Supabase redirect URLs and the domain matches (http vs https, exact domain).

**Issue:** Browser doesn't redirect after sign-in
- **Solution:** Check browser console for CORS errors. Ensure the redirect URL is whitelisted in Supabase settings.

**Issue:** User returns to Electron app but still sees login modal
- **Solution:** This is expected. The session is stored in the browser, not the Electron app directly. Users will need to refresh the Electron app (`Ctrl+R` or `Cmd+R`) for the session to be recognized.

## Alternative: Automatic Session Sync (Future)

For a more seamless experience where the Electron app automatically detects the login, we can implement:
- A custom protocol handler (`brainstorm://`) that captures OAuth redirect
- Session sync between browser and Electron app
- This requires more configuration in the Electron main process

Contact if you want to implement this for better UX.
