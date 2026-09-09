📋 Trackable — Personal Life Manager

A fully offline, zero-dependency personal life tracking web app. One HTML file. No installs, no accounts, no cloud. Just open it and start.

✨ What Is This?
Trackable is a single-file personal dashboard built for students who want to take control of their daily life — habits, money, study, health, and more — without handing their data to any server. Everything runs entirely in your browser. Close the tab, reopen it, your data is still there.
Built in 2 days using AI-assisted development. ~9,000 lines of vanilla JavaScript, HTML, and CSS. Zero frameworks. Zero backend. Zero cost.

🚀 Getting Started
1. Download trackable.html
2. Open it in any modern browser (Chrome, Firefox, Edge, Safari)
3. That's it.
No npm install. No build step. No account creation. No internet required after the first load (fonts load from Google Fonts on first visit).

📦 Features
🏠 Dashboard

Personalized greeting based on time of day
Daily completion ring showing overall progress
Live summary cards for every module (prayers, gym, sleep, nutrition, money, study, screen time)
Upcoming events preview
Weekly and monthly summary stats at a glance
🔥 Streak counter across all tracked habits


📅 Daily Log
A single unified page to log everything for the day in one sitting:

Sleep (bedtime + wake time with auto-calculated hours)
Gym session (type, duration, notes)
Prayers (5 daily prayers with individual toggles)
Meals (linked to the nutrition system)
Study sessions (topic + hours)
Hadith & Quran reading
App/screen usage
Daily mood
Overall day notes


💪 Gym Tracker

Weekly training schedule — set which days are workout days vs rest days
Log individual sessions with exercise type and duration
Session history with filterable date range
Monthly breakdown by week
Rest day vs workout day visual indicators
Notes per session


🕌 Prayer Tracker

Track all 5 daily prayers (Fajr, Dhuhr, Asr, Maghrib, Isha)
30-day history grid showing daily prayer completion
Streak tracking for perfect prayer days (all 5 prayed)
Weekly averages on the dashboard
Hadith logging — record hadith studied with book, number, and count
Quran reading log — track by Surah, Ayah range, and time spent
Full Quran surah list with ayah counts for reference


📚 Study Tracker
Four dedicated sub-tabs:
Academic — log study sessions by subject, type (lecture, revision, assignment, exam prep), and duration. Filter by subject, view weekly bar chart, subject breakdown with percentages.
Books — track books being read. Log sessions with page range and time spent. See total pages and hours per title.
Skills — track any skill practice (coding, language, instrument, etc.) with time invested. Weekly breakdown by skill.
Overview — combined study goals (daily targets for academic/books/skills), progress bars, all-time stats.

🥗 Nutrition

Build a personal food library with calorie, protein, carb, and fat data
Log meals (breakfast, lunch, dinner, snacks) by selecting from the library
Daily macro totals with visual progress bars against your goals
Set custom calorie and macro targets
Meal history with full item breakdown
Analytics tab with 7-day adherence tracking and macro trends
Built-in TDEE/calorie calculator (age, weight, height, activity level)


📱 Screen Time

Log time spent per app with categories
Set a daily screen time goal (minutes)
Over-limit alert when you exceed your goal
Weekly app usage breakdown
Bar chart of daily usage over the past 7 days
Category-level breakdown (Social, Entertainment, Productivity, etc.)


📆 Calendar

Month-view calendar with colour-coded events
Create events with start/end dates, colour labels, and details
Ongoing events (no end date) supported
Click any day to see events for that date
Upcoming events list on the dashboard


📓 Diary

iPhone Notes-style private journal
Organise entries into notebooks (with custom icons and colours)
Mood logging per entry (Great, Okay, Rough, Productive, Tired, Focused)
Rich text area for freeform writing
Search and filter by notebook
Entries sorted by date, newest first


📊 Analytics
A comprehensive data overview across all modules:

KPI cards (total study hours, prayer rate, gym sessions, money spent, streak)
Gym, sleep, prayer, study, and money charts (7-day bar charts)
Current vs best streak for gym, prayers, study, and overall logging
Full daily log table — every day's data in a scrollable grid
Data completeness overview


💰 Money Manager
Expense Tracking

Log expenses with description, amount, date, category, and notes
Filter by category and month
Daily expense list grouped by date
Monthly category breakdown with percentage bars

Budget Consultant (5-step wizard)

Income — enter monthly take-home pay and any side income
Household — occupation, number of dependents, living situation
Fixed Expenses — rent, utilities, groceries, transport, insurance, loans
Goals & Lifestyle — savings goal (save more / balance / debt / invest / emergency fund), lifestyle style (frugal → lavish)
Fine-Tune — interactive sliders for every budget envelope, pre-set to AI-recommended amounts. Live total + savings tracker. Blocks apply if spending exceeds income.

Budget Envelopes — visual cards showing allocated vs spent per category
Savings Goals — set goals with target amounts and monthly contributions, track progress
Income Waterfall — visual breakdown from income → fixed costs → savings → discretionary
20+ supported currencies (RM, ,£,€,S, £, €, S
,£,€,S, ¥, ₹, ₺, ₦, and more)


✅ Task Manager

Create standalone tasks or organise into Projects (folders)
Per-task: name, description, deadline, priority (Low / Medium / High / Critical), project folder, tag, custom alert timing, and nested checklist steps
Priority colour-coded with pill badges
Collapsible step checklists with mini progress rings
Auto-completes task when all steps are checked
Overdue detection with 🔥 indicator
Urgent task alerts with countdown in the nav badge
Overall completion ring — animated SVG showing % of all tasks done
Project cards with per-project completion rings
Sort by deadline, priority, name, or newest
Filter: All / Open / Completed / Projects view


⚙️ Settings & Customisation
Themes — 8 built-in dark themes:

Midnight Gold (default)
Deep Ocean
Obsidian Rose
Forest Dusk
Slate Ember
Arctic
Carbon
Sakura

Plus a full custom theme builder — pick your own background, surface, border, text, and accent colours with a live preview.
Region & Currency — 20+ regions supported, automatically sets currency symbol throughout the app.
Preferences

Week start (Monday or Sunday)
Streak badge visibility
Auto-backup schedule (every N days)
Auto-delete old data (after N days)

Data Management

Export full backup as .json
Import from backup file
Optional: set a local folder for automatic backups (File System Access API)
Full data reset


🔒 Privacy & Security

100% local — no data ever leaves your device
No accounts, no login, no tracking
All data stored in browser localStorage under the disc_ prefix
XSS protection on all user inputs (esc() HTML encoding before any innerHTML injection)
Input length limits on all fields (maxlength attributes + server-side-style truncation in JS)
Prototype pollution protection in the import system
localStorage quota error handling with user notification
Input values validated and clamped (safeNum(), safeInt(), allowlist validation on select fields)
Non-blocking async confirm dialogs (no window.confirm() or window.alert())
Collision-resistant IDs (genId(): timestamp + random base-36 suffix)

🤝 Contributing
This is a personal project and portfolio piece, but PRs and issues are welcome. If you find a bug or want a feature, open an issue.

📄 License
Use it, fork it, build on it.