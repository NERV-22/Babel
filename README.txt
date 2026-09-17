Babel 
A local and cloud sync PWA for tracking books — logging, timing, review, and pace estimator, per book, per list.

Vanilla JS single page app (no framework), IndexedDB + Supabase storage systems, Google Books API adding books, service worker for offline usage.

Architecture
Local First - all user data lives in IndexedDB, on device, so the app can work fully offline.
Cloud Sync - signing into Supabase will allow IndexedDB data to sync across devices (Last-write wins, fault state for offline merge conflict with online saves).
LocalStorage - small stuff only, settings and theme.
Service Worker (sw.js) allows the app shell to load with no network.

Features
Library - Where books can be added and deleted, manual, barcode, or Google book search (requires connection).
Library sections has many features such as user input summary/thoughts, reviews, reading logs, reading sessions, etc.
Reading timer (Page in -> Page out) - Logs sessions and computes pace (min/page).
ETA Calculator - Calculates (PER BOOK) the user speed and calculates how long it would take to finish each book given pace.
Per-list stats - pages, reading + audiobooks time, streaks, books, genres, and yearly breakdown all calculated per list.
Streak - Streak tracking with freezes that allows users to pause their streak that day.
Export/Import - Per-list export import for sharing lists with other users.

