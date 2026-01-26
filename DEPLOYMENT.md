# Deployment Guide: Vercel + Railway

This guide walks you through deploying your Movies Watchlist application using **Vercel** for the frontend and **Railway** for the backend.

## Architecture Overview

```
┌─────────────────┐         ┌─────────────────┐
│  Vercel         │         │  Railway        │
│  (Frontend)     │────────▶│  (Backend + DB)  │
│  - React App    │  API    │  - FastAPI      │
│  - Free tier    │  Calls  │  - PostgreSQL   │
│  - CDN          │         │  - $5-15/month   │
└─────────────────┘         └─────────────────┘
```

## Prerequisites

Before starting, ensure you have:
- ✅ A GitHub account
- ✅ Your code pushed to a GitHub repository
- ✅ A TMDb API key ([Get one here](https://www.themoviedb.org/settings/api))
- ✅ Your TMDb API key ready

## Step 1: Create Accounts

### 1.1 Create Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"**
3. Choose **"Continue with GitHub"** (recommended)
4. Authorize Vercel to access your GitHub account

### 1.2 Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click **"Start a New Project"**
3. Choose **"Login with GitHub"**
4. Authorize Railway to access your GitHub account

---

## Step 2: Deploy Backend to Railway

### 2.1 Create New Project on Railway

1. In Railway dashboard, click **"New Project"**
2. Select **"Deploy from GitHub repo"**
3. Choose your repository
4. Railway will detect it's a Python project

### 2.2 Configure Backend Service

1. Railway will create a service automatically
2. Click on the service to open settings
3. Go to **"Settings"** tab
4. Set the following:

   **Root Directory:** `backend`
   
   **Start Command:** (leave empty, Procfile will handle it)

### 2.3 Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Wait for database to provision (takes ~1 minute)
4. Click on the PostgreSQL service
5. Go to **"Variables"** tab
6. Copy the **`DATABASE_URL`** value (you'll need this)

### 2.4 Set Environment Variables

1. Go back to your backend service
2. Click **"Variables"** tab
3. Click **"+ New Variable"**
4. Add the following variables:

   | Variable Name | Value | Notes |
   |--------------|-------|-------|
   | `TMDB_API_KEY` | `your_tmdb_api_key` | Your TMDb API key |
   | `DATABASE_URL` | `(from PostgreSQL service)` | Copy from PostgreSQL variables |
   | `CORS_ORIGINS` | `(leave empty for now)` | We'll update this after frontend deploys |
   | `PORT` | `(auto-set by Railway)` | Railway sets this automatically |

5. Click **"Add"** for each variable

### 2.5 Deploy Backend

1. Railway will automatically deploy when you push to GitHub
2. Or click **"Deploy"** button to trigger manual deployment
3. Wait for deployment to complete (~2-3 minutes)
4. Once deployed, click on the service
5. Go to **"Settings"** → **"Domains"**
6. Copy the **Railway URL** (e.g., `https://your-app.up.railway.app`)
   - **Save this URL** - you'll need it for the frontend!

---

## Step 3: Deploy Frontend to Vercel

### 3.1 Import Project to Vercel

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click **"Add New..."** → **"Project"**
3. Import your GitHub repository
4. Vercel will auto-detect it's a React app

### 3.2 Configure Frontend Build Settings

1. In the project configuration:
   - **Framework Preset:** Create React App (auto-detected)
   - **Root Directory:** `frontend`
   - **Build Command:** `npm run build` (auto-filled)
   - **Output Directory:** `build` (auto-filled)
   - **Install Command:** `npm install` (auto-filled)

2. Click **"Environment Variables"**

### 3.3 Set Frontend Environment Variables

1. Click **"+ Add"** for each variable:

   | Variable Name | Value | Notes |
   |--------------|-------|-------|
   | `REACT_APP_API_URL` | `https://your-backend.railway.app` | Your Railway backend URL from Step 2.5 |

2. Click **"Add"** for each variable

### 3.4 Deploy Frontend

1. Click **"Deploy"**
2. Wait for build to complete (~2-3 minutes)
3. Once deployed, Vercel will show your app URL
   - Example: `https://your-app.vercel.app`
   - **Save this URL** - you'll need it for backend CORS!

---

## Step 4: Update Backend CORS

Now that both are deployed, we need to allow the Vercel frontend to communicate with the Railway backend.

### 4.1 Update Railway Environment Variables

1. Go back to Railway dashboard
2. Open your backend service
3. Go to **"Variables"** tab
4. Find `CORS_ORIGINS` variable
5. Click **"Edit"**
6. Set value to your Vercel URL:
   ```
   https://your-app.vercel.app
   ```
   - If you have multiple domains, separate with commas:
   ```
   https://your-app.vercel.app,https://www.yourdomain.com
   ```
7. Click **"Update"**
8. Railway will automatically redeploy with new CORS settings

---

## Step 5: Test Your Deployment

### 5.1 Test Frontend

1. Open your Vercel URL in a browser
2. The app should load
3. Open browser DevTools (F12) → Console tab
4. Check for any errors

### 5.2 Test Backend API

1. Visit your Railway backend URL directly:
   ```
   https://your-backend.railway.app
   ```
2. You should see: `{"message":"Letterboxd Watchlist API"}`
3. Visit API docs:
   ```
   https://your-backend.railway.app/docs
   ```

### 5.3 Test Frontend-Backend Connection

1. In your Vercel app, try uploading a CSV or adding a movie
2. Check browser DevTools → Network tab
3. API calls should go to your Railway backend
4. If you see CORS errors, double-check `CORS_ORIGINS` in Railway

---

## Step 6: (Optional) Add Custom Domain

### 6.1 Add Domain to Vercel

1. In Vercel dashboard, go to your project
2. Click **"Settings"** → **"Domains"**
3. Enter your domain (e.g., `movieswatchlist.com`)
4. Follow DNS configuration instructions
5. Wait for DNS propagation (~5-60 minutes)

### 6.2 Add Domain to Railway (if needed)

1. In Railway dashboard, go to backend service
2. Click **"Settings"** → **"Domains"**
3. Click **"Generate Domain"** or add custom domain
4. Update `CORS_ORIGINS` to include your custom domain

### 6.3 Update Frontend Environment Variable

1. In Vercel, update `REACT_APP_API_URL` if you added a custom domain to Railway
2. Redeploy frontend

---

## Troubleshooting

### Frontend shows "Network Error"

**Problem:** Frontend can't reach backend

**Solutions:**
1. Check `REACT_APP_API_URL` in Vercel matches your Railway URL
2. Verify Railway backend is running (visit Railway URL directly)
3. Check Railway logs for errors

### CORS Errors in Browser Console

**Problem:** Browser blocks requests due to CORS

**Solutions:**
1. Verify `CORS_ORIGINS` in Railway includes your Vercel URL
2. Make sure URL matches exactly (including `https://`)
3. No trailing slashes in CORS_ORIGINS
4. Redeploy Railway backend after updating CORS_ORIGINS

### Backend Won't Start

**Problem:** Railway deployment fails

**Solutions:**
1. Check Railway logs (click on service → "Deployments" → "View Logs")
2. Verify all environment variables are set
3. Check `DATABASE_URL` is correct PostgreSQL connection string
4. Verify `TMDB_API_KEY` is valid

### Database Connection Errors

**Problem:** Backend can't connect to PostgreSQL

**Solutions:**
1. Verify PostgreSQL service is running in Railway
2. Check `DATABASE_URL` is correct (copy from PostgreSQL service variables)
3. Ensure PostgreSQL service is in same Railway project

### Build Fails on Vercel

**Problem:** Frontend build fails

**Solutions:**
1. Check Vercel build logs
2. Verify `Root Directory` is set to `frontend`
3. Ensure all dependencies are in `package.json`
4. Check for TypeScript/ESLint errors

---

## Environment Variables Reference

### Backend (Railway)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `TMDB_API_KEY` | ✅ Yes | `abc123...` | Your TMDb API key |
| `DATABASE_URL` | ✅ Yes | `postgresql://...` | PostgreSQL connection string |
| `CORS_ORIGINS` | ✅ Yes | `https://app.vercel.app` | Comma-separated frontend URLs |
| `PORT` | ❌ No | `8000` | Auto-set by Railway |

### Frontend (Vercel)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| `REACT_APP_API_URL` | ✅ Yes | `https://backend.railway.app` | Your Railway backend URL |

---

## Cost Estimate

### Vercel (Frontend)
- **Free tier:** Unlimited for personal projects
- **Cost:** $0/month

### Railway (Backend + Database)
- **Hobby plan:** $5/month minimum
- **PostgreSQL:** Included in usage or ~$7/month for dedicated
- **Estimated cost:** $5-15/month for 1,000 weekly users

**Total:** ~$5-15/month

---

## Updating Your Deployment

### Automatic Deployments

Both Vercel and Railway automatically deploy when you push to GitHub:

1. Make changes to your code
2. Commit and push to GitHub:
   ```bash
   git add .
   git commit -m "Your changes"
   git push origin main
   ```
3. Vercel and Railway will automatically detect and deploy

### Manual Deployments

**Vercel:**
- Go to project → "Deployments" → "Redeploy"

**Railway:**
- Go to service → "Deployments" → "Redeploy"

---

## Next Steps

After deployment:

1. ✅ Test all features (CSV upload, adding movies, filtering)
2. ✅ Monitor Railway logs for any errors
3. ✅ Set up monitoring/alerts (optional)
4. ✅ Consider adding PostgreSQL for production (if using SQLite)
5. ✅ Plan for account system implementation

---

## Support

If you encounter issues:

1. Check Railway logs: Service → Deployments → View Logs
2. Check Vercel logs: Project → Deployments → View Logs
3. Check browser console for frontend errors
4. Verify all environment variables are set correctly

---

## Summary Checklist

- [ ] Created Vercel account
- [ ] Created Railway account
- [ ] Deployed backend to Railway
- [ ] Added PostgreSQL database
- [ ] Set backend environment variables
- [ ] Got Railway backend URL
- [ ] Deployed frontend to Vercel
- [ ] Set frontend environment variables
- [ ] Got Vercel frontend URL
- [ ] Updated CORS_ORIGINS in Railway
- [ ] Tested frontend-backend connection
- [ ] (Optional) Added custom domain

---

**Congratulations! Your app is now live! 🎉**
