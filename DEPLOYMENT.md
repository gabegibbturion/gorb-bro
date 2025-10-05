# GitHub Pages Deployment Guide 🚀

## Automatic Deployment Setup

Your project is now configured to automatically deploy to GitHub Pages whenever you push to the `master` or `main` branch!

## Initial Setup (One-Time)

### 1. Enable GitHub Pages in Repository Settings

1. Go to your GitHub repository: https://github.com/gabegibbturion/gorb-bro
2. Click on **Settings** → **Pages** (in the left sidebar)
3. Under **Source**, select:
   - **Source**: GitHub Actions
4. Save the settings

### 2. Push Your Changes

```bash
cd /home/ggibb/Desktop/code/CesiumReact
git add .
git commit -m "Add GitHub Pages deployment"
git push origin master
```

## How It Works

### Automatic Deployment

Every time you push to `master` or `main`:

1. **GitHub Actions** automatically triggers the deployment workflow
2. The workflow:
   - Checks out your code
   - Sets up Node.js
   - Installs dependencies (`npm ci`)
   - Builds your project (`npm run build`)
   - Deploys the `test-three/dist` folder to GitHub Pages
3. Your site will be live at: **https://gabegibbturion.github.io/gorb-bro/**

### Workflow File

Location: `.github/workflows/deploy.yml`

The workflow runs on:
- Push to `master` or `main` branch
- Manual trigger (workflow_dispatch)

## Configuration Files

### 1. `vite.config.ts`
```typescript
base: '/gorb-bro/', // Base path for GitHub Pages
```

### 2. `.github/workflows/deploy.yml`
GitHub Actions workflow that handles the deployment

### 3. `public/.nojekyll`
Prevents Jekyll processing on GitHub Pages

## Manual Deployment (Optional)

If you want to manually deploy without GitHub Actions:

```bash
cd test-three
npm run deploy
```

**Note**: This requires the `gh-pages` package. Install it if needed:
```bash
npm install -D gh-pages
```

## Viewing Your Deployment

### Check Deployment Status

1. Go to your repository on GitHub
2. Click the **Actions** tab
3. You'll see your deployment workflow running/completed
4. Click on a workflow run to see detailed logs

### Access Your Site

Once deployment is complete (usually 2-5 minutes):
- **Live Site**: https://gabegibbturion.github.io/gorb-bro/

### View Deployment Details

In your repository:
1. Go to **Settings** → **Pages**
2. You'll see: "Your site is live at https://gabegibbturion.github.io/gorb-bro/"

## Troubleshooting

### Deployment Fails

**Check the Actions tab for error logs:**
1. Go to **Actions** tab
2. Click on the failed workflow
3. Expand the failed step to see error details

**Common Issues:**

1. **Build errors**: Check if `npm run build` works locally
2. **Permission errors**: Make sure GitHub Actions has write permissions (should be set automatically)
3. **404 on assets**: Verify the `base` path in `vite.config.ts` matches your repo name

### Assets Not Loading

If CSS/JS files don't load:
1. Check browser console for 404 errors
2. Verify `base: '/gorb-bro/'` in `vite.config.ts` matches your repo name exactly
3. Make sure `.nojekyll` file exists in `public/` folder

### Site Shows Old Version

GitHub Pages caching:
1. Hard refresh: `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac)
2. Wait a few minutes for CDN to update
3. Check the Actions tab to ensure deployment completed successfully

## Development vs Production

### Local Development
```bash
cd test-three
npm run dev
```
Runs at: `http://localhost:5173`

### Preview Production Build Locally
```bash
cd test-three
npm run build
npm run preview
```

### Production (GitHub Pages)
Automatically deployed at: `https://gabegibbturion.github.io/gorb-bro/`

## Updating Your Site

Just push to master:
```bash
git add .
git commit -m "Update satellite visualization"
git push origin master
```

The site will automatically rebuild and deploy in 2-5 minutes!

## Environment-Specific Configuration

If you need different settings for dev vs production:

```typescript
// vite.config.ts
export default defineConfig({
  base: process.env.NODE_ENV === 'production' ? '/gorb-bro/' : '/',
  // ... other config
})
```

## Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file to `public/` with your domain:
   ```
   example.com
   ```

2. In GitHub Settings → Pages:
   - Enter your custom domain
   - Enable "Enforce HTTPS"

3. Update your DNS:
   - Add a CNAME record pointing to: `gabegibbturion.github.io`

## Summary

✅ Automatic deployment configured  
✅ Push to master = instant deployment  
✅ Live at: https://gabegibbturion.github.io/gorb-bro/  
✅ No manual steps needed  

Just code, commit, and push! 🎉

