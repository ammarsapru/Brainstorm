# Brainstorm

A collaborative brainstorming application with real-time sync capabilities powered by Supabase.

## Features

- 🎨 Visual brainstorming canvas
- 🔄 Real-time synchronization
- 🔐 Authentication (Email/Password, Magic Links, Google OAuth)
- 💾 Persistent storage with Supabase
- 📁 File system organization
- 🎯 Collections and connections

## Setup Instructions

### Prerequisites

- Node.js 16+ and npm
- A Supabase account (free tier available at [supabase.com](https://supabase.com))

### 1. Clone the Repository

```bash
git clone https://github.com/ammarsapru/Brainstorm.git
cd Brainstorm
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Supabase credentials:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
GEMINI_API_KEY=your-gemini-api-key-here
```

#### Where to Find Supabase Credentials:

1. Go to [app.supabase.com](https://app.supabase.com)
2. Select your project (or create a new one)
3. Go to **Settings** → **API**
4. Copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon/public key** → `VITE_SUPABASE_ANON_KEY`

### 4. Set Up Supabase Database

Run the SQL commands in `SUPABASE_UPDATE.sql` in your Supabase SQL Editor:

1. Go to your Supabase project dashboard
2. Click on **SQL Editor**
3. Create a new query
4. Copy and paste the contents of `SUPABASE_UPDATE.sql`
5. Click **Run** to create the necessary tables and schemas

### 5. Configure Authentication Providers

#### Email/Password & Magic Links

These are enabled by default in Supabase.

#### Google OAuth (Optional)

1. Go to **Authentication** → **Providers** in your Supabase dashboard
2. Enable Google provider
3. Add your Google OAuth credentials
4. Set the redirect URL to: `https://your-project-id.supabase.co/auth/v1/callback`

### 6. Configure Redirect URLs

For production deployment, add your domain to allowed redirect URLs:

1. Go to **Authentication** → **URL Configuration**
2. Add your site URL(s) to **Site URL** and **Redirect URLs**
3. For GitHub Pages: `https://yourusername.github.io/Brainstorm`

### 7. Run Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### 8. Build for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## Deployment

### GitHub Pages

1. **Set GitHub Secrets**:
   - Go to your repository **Settings** → **Secrets and variables** → **Actions**
   - Add these secrets:
     - `VITE_SUPABASE_URL`: Your Supabase project URL
     - `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key
     - `GEMINI_API_KEY`: Your Gemini API key

2. **Configure Supabase Redirect URLs**:
   - Add `https://yourusername.github.io/Brainstorm` to allowed redirect URLs in Supabase

3. **Deploy**:
   - Push to main branch to trigger automatic deployment
   - Or manually trigger the workflow from Actions tab

### Other Platforms

The app can be deployed to any static hosting service:

- Vercel
- Netlify
- Cloudflare Pages
- AWS S3 + CloudFront

Make sure to:
1. Set the environment variables in your hosting platform
2. Add your deployment URL to Supabase redirect URLs

## Troubleshooting

### "Supabase is not configured" Warning

- Ensure `.env.local` file exists and contains valid credentials
- Restart the dev server after creating/editing `.env.local`
- Check that variable names start with `VITE_` prefix

### "Multiple GoTrueClient instances" Warning

This issue has been fixed by consolidating to a single Supabase client in `lib/supabase.ts`.

### Build Errors

- Run `npm install` to ensure all dependencies are installed
- Clear the build cache: `rm -rf dist node_modules/.vite`
- Rebuild: `npm run build`

### Authentication Not Working

- Verify Supabase credentials are correct
- Check that redirect URLs are properly configured
- Ensure the authentication provider is enabled in Supabase

## License

MIT