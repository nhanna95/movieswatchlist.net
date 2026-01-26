# Quick Start Deployment Guide

## 🚀 5-Minute Deployment Checklist

### Step 1: Create Accounts (2 minutes)
- [ ] Sign up at [vercel.com](https://vercel.com) (use GitHub)
- [ ] Sign up at [railway.app](https://railway.app) (use GitHub)

### Step 2: Deploy Backend to Railway (3 minutes)
1. Railway → "New Project" → "Deploy from GitHub repo"
2. Select your repository
3. Click "+ New" → "Database" → "Add PostgreSQL"
4. Go to backend service → "Variables" → Add:
   - `TMDB_API_KEY` = your TMDb API key
   - `DATABASE_URL` = (copy from PostgreSQL service variables)
   - `CORS_ORIGINS` = (leave empty for now)
5. Wait for deployment, copy Railway URL (e.g., `https://xxx.up.railway.app`)

### Step 3: Deploy Frontend to Vercel (2 minutes)
1. Vercel → "Add New Project" → Import your GitHub repo
2. Settings:
   - Root Directory: `frontend`
   - Framework: Create React App
3. Environment Variables → Add:
   - `REACT_APP_API_URL` = your Railway URL from Step 2
4. Click "Deploy"
5. Copy Vercel URL (e.g., `https://xxx.vercel.app`)

### Step 4: Connect Frontend to Backend (1 minute)
1. Go back to Railway → backend service → "Variables"
2. Update `CORS_ORIGINS` = your Vercel URL from Step 3
3. Railway auto-redeploys

### Step 5: Test (1 minute)
- [ ] Visit Vercel URL - app should load
- [ ] Visit Railway URL - should see `{"message":"Letterboxd Watchlist API"}`
- [ ] Try uploading a CSV in your app

## ✅ Done!

**Total time: ~10 minutes**

---

## 📋 Environment Variables Cheat Sheet

### Railway (Backend)
```
TMDB_API_KEY=your_key_here
DATABASE_URL=postgresql://... (from PostgreSQL service)
CORS_ORIGINS=https://your-app.vercel.app
```

### Vercel (Frontend)
```
REACT_APP_API_URL=https://your-backend.railway.app
```

---

## 🆘 Quick Troubleshooting

**CORS errors?**
→ Update `CORS_ORIGINS` in Railway to match your Vercel URL

**Frontend can't reach backend?**
→ Check `REACT_APP_API_URL` in Vercel matches Railway URL

**Backend won't start?**
→ Check Railway logs, verify all environment variables are set

---

For detailed instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)
