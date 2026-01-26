# Quick Testing Checklist

This is a condensed checklist for quick reference during testing sessions. For detailed test cases, see `TESTING_PROTOCOL.md`.

## Critical Path Testing (Must Pass Before Shipping)

### Setup & Initialization
- [ ] Backend starts without errors
- [ ] Frontend starts without errors
- [ ] Database initializes correctly
- [ ] API connection works
- [ ] No console errors on startup

### CSV Upload & Processing
- [ ] Upload valid CSV file
- [ ] Preview shows movies to add/remove
- [ ] Select movies and process
- [ ] Movies are added to database
- [ ] TMDb enrichment works
- [ ] Progress updates display correctly
- [ ] Error handling for invalid files

### Core Movie Operations
- [ ] View movie list
- [ ] Open movie modal
- [ ] Toggle favorite
- [ ] Toggle seen-before
- [ ] Add/edit notes
- [ ] Delete movie
- [ ] Add new movie via search

### Filtering & Search
- [ ] Filter by year
- [ ] Filter by director
- [ ] Filter by country
- [ ] Filter by genre
- [ ] Filter by runtime
- [ ] Search by title
- [ ] Multiple filters combined
- [ ] Clear filters
- [ ] Filter persistence on refresh

### Sorting
- [ ] Sort by title (asc/desc)
- [ ] Sort by year (asc/desc)
- [ ] Sort by runtime (asc/desc)
- [ ] Sort by rating (asc/desc)
- [ ] Multiple column sorting

### Statistics
- [ ] Statistics dashboard opens
- [ ] All statistics display correctly
- [ ] Statistics update with filters
- [ ] Charts render correctly

### Settings & Customization
- [ ] Column visibility toggle
- [ ] Column reordering
- [ ] Settings persist on refresh

### Directors & Countries
- [ ] Add favorite director
- [ ] Remove favorite director
- [ ] Filter by favorite directors
- [ ] Add seen country
- [ ] Remove seen country
- [ ] Exclude seen countries filter

### Profile Management
- [ ] Export profile
- [ ] Import profile
- [ ] Data is restored correctly

### Streaming Information
- [ ] View streaming availability
- [ ] Filter by availability type
- [ ] Country detection works

## Performance Checks
- [ ] Page loads in < 3 seconds
- [ ] Filter updates in < 500ms
- [ ] List renders smoothly with 100+ movies
- [ ] CSV processing shows progress
- [ ] No memory leaks during long session

## Error Handling
- [ ] Network errors show message
- [ ] Invalid inputs show validation errors
- [ ] 404 errors handled gracefully
- [ ] 500 errors show user-friendly message
- [ ] Empty states display correctly

## Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)
- [ ] Mobile Chrome
- [ ] Mobile Safari

## Security
- [ ] No SQL injection vulnerabilities
- [ ] No XSS vulnerabilities
- [ ] File upload validation works
- [ ] CORS configured correctly
- [ ] No sensitive data in logs

## Data Integrity
- [ ] No duplicate movies created
- [ ] Data persists correctly
- [ ] Updates don't corrupt data
- [ ] Tracked lists match correctly

## UI/UX
- [ ] Responsive on mobile
- [ ] Responsive on tablet
- [ ] Responsive on desktop
- [ ] Keyboard navigation works
- [ ] Loading states visible
- [ ] Error messages clear
- [ ] Consistent styling

## Pre-Shipment Final Checks
- [ ] All critical tests pass
- [ ] No console errors
- [ ] No linter errors
- [ ] README updated
- [ ] Environment variables documented
- [ ] Production build tested
- [ ] Performance acceptable
- [ ] Security review completed

---

**Quick Test Scenarios:**

1. **Happy Path:** Upload CSV → Filter → View Movie → Toggle Favorite → Export Profile
2. **Error Path:** Upload invalid file → See error → Upload valid file → Success
3. **Performance:** Load 1000 movies → Apply filters → Verify responsiveness
4. **Data Integrity:** Upload same CSV twice → Verify no duplicates
5. **Cross-browser:** Test all features in Chrome, Firefox, Safari

---

**Notes:**
- Mark items as you test
- Document any issues found
- Re-test after fixes
- Update this checklist as needed
