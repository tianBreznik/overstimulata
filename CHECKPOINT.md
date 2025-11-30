# Project Checkpoint - Current State

## Session Snapshot (UI/UX + Editor fixes)

- Chapter header actions reworked and positioned on the LEFT of titles, with layout order: Edit • Add • Del • Drag-handle. Titles remain centered and unaffected.
- Action container anchors flush to the left of the header (`right: 100%` with a small gutter), so actions never overlap long titles.
- Bottom-right global buttons now appear side by side (Editor Mode | + Add New Chapter) instead of stacked; still fixed to bottom-right.
- Isolated inline chapter action buttons now render labels via SVG text to fully decouple font rendering and prevent hover-induced font changes. Width is computed from the actual text (getComputedTextLength) with padding so labels never clip. Size tuned to small/compact: ~13px text, 18px SVG height, minimal padding.
- Subchapter header alignment preserved (counter-acts parent indent) so actions/titles line up consistently for chapters and subchapters.

> Tip: If you want actions on the RIGHT again later, only the container alignment in `Chapter.css` and the JSX order in `Chapter.jsx` need flipping.

## ✅ Completed Features

### Core Functionality
- ✅ Book writing website with table of contents
- ✅ Expandable chapters with inline content display
- ✅ Editor mode (device ID whitelisting)
- ✅ Firestore integration for chapters and subchapters
- ✅ Drag-and-drop reordering for chapters and subchapters
- ✅ Anonymous bookmarking (localStorage) - saves last reading position

### Editor Features
- ✅ Rich text editor with contentEditable
- ✅ Toolbar with formatting buttons:
  - Bold, Italic, Strikethrough, Underline
  - Text color picker (applies immediately)
  - Highlight color picker (H-swatch, click to apply)
  - Align left/center/right
- ✅ Real-time formatting (WYSIWYG)
- ✅ Keyboard shortcuts (Cmd/Ctrl+B/I/U/L/E/R)
- ✅ Autosave status indicator
- ✅ Side panel editor layout (doesn't cover content)

### Media Support
- ✅ Image upload (base64, no Firebase Storage billing)
  - Automatic compression/resizing (max 1200x1200px)
  - JPEG conversion with quality 0.8
  - Stored directly in Firestore contentHtml
- ✅ Video embedding (YouTube/Vimeo)
  - YouTube uses `youtube-nocookie.com` for minimal branding
  - Paste URL or embed code
  - Responsive iframe display

### Styling
- ✅ Academic article aesthetic (Times New Roman font)
- ✅ Vintage Windows XP-style toolbar buttons
- ✅ Full-bleed editor design
- ✅ Responsive images and videos

## 📁 Current File Structure

```
src/
├── components/
│   ├── Chapter.jsx              # Chapter display component
│   ├── Chapter.css              # Chapter styling
│   ├── ChapterEditor.jsx         # Main editor component
│   ├── ChapterEditor.css        # Editor styling
│   ├── DraggableChapter.jsx     # Drag wrapper for chapters
│   └── SortableSubchapters.jsx   # Sortable subchapter list
├── pages/
│   └── EditorSetup.jsx          # Device ID setup modal
├── services/
│   ├── firestore.js             # Firestore CRUD operations
│   └── storage.js               # Image base64 conversion (no Firebase Storage)
├── hooks/
│   └── useEditorMode.js         # Editor mode hook
├── utils/
│   ├── deviceAuth.js            # Device ID whitelisting
│   ├── bookmark.js              # Bookmark save/load
│   └── markdown.js              # Custom markdown rendering
├── firebase.js                  # Firebase initialization
└── App.jsx                      # Main app component
```

## 🔧 Configuration

### Environment Variables (.env.local)
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=overstimulata-dc860
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

### Firebase Setup
- Firestore database with nested structure:
  - `/books/{bookId}/chapters/{chapterId}`
  - `/books/{bookId}/chapters/{chapterId}/subchapters/{subchapterId}`
- No Firebase Storage enabled (using base64 for images)
- No Firebase Auth enabled (using device ID whitelisting)

## 🎨 Current Design Notes

- **Editor**: Side panel (620px wide), full-height, no rounded corners
- **Toolbar**: Full-bleed, vintage Windows XP style buttons
- **Buttons**: Semi-transparent with solid borders, darken when pressed
- **Colors**: Background #fafafa for toolbar, white for content area
- **Typography**: Times New Roman throughout

## 🚧 TODO / Future Features

### Known Issues / Needs Polish

#### Karaoke Tapping Interaction (Mobile PageReader)
- **Status**: Partially working, needs polish
- **Issue**: Users sometimes need to tap multiple times on karaoke blocks to start playback
- **Current Implementation**:
  - Breathing animation (fade in/out) indicates karaoke blocks are tappable
  - Touch handlers check for interactive targets to prevent swipe interference
  - `click` listeners on `.karaoke-slice` start/restart playback and stop the breathing animation
  - Slice initialization happens in click handler before playback
- **Needs Work**:
  - Make first tap on a karaoke block reliably start playback (even on small tap targets)
  - Reduce initialization latency so karaoke starts more quickly after a tap
  - Ensure punctuation characters (`, . ? !` etc.) are highlighted in sync even when not part of a marked karaoke word
  - Improve handling of race conditions between slice initialization and playback
  - Keep robust error handling and retry logic around audio playback/startup
- **Location**: `src/components/PageReader.jsx` (karaoke slice click handlers, `playSlice`, swipe/touch handling)

#### Pagination Gap with Footnotes
- **Status**: Minor polish issue
- **Issue**: On page-frames with footnotes, there can be a visible gap between the main content text and the footnotes section
- **Current Behavior**: The pagination algorithm correctly reserves space for footnotes, but may not always fill 100% of the available content space, leaving a small gap
- **Needs Work**:
  - Reduce or eliminate the gap between text and footnotes section on pages with footnotes
  - Ensure maximum content utilization when footnotes are present
- **Location**: `src/components/PageReader.jsx` (pagination algorithm, footnote space reservation)

### Video Hosting (Pending Decision)
- [ ] Decide on video hosting solution:
  - Option 1: Cloudflare R2 (free tier: 10GB storage)
  - Option 2: Firebase Storage (pay per usage)
  - Option 3: Self-hosted solution
- [ ] Implement chosen video hosting solution
- [ ] Custom HTML5 video player for unbranded videos

### Table of Contents (TOC) Hub - Design Phase
- **Status**: Design phase, not yet implemented
- **Concept**: Swipe-down gesture opens a TOC overlay that serves as both a navigation hub and editing interface
- **Trigger**: Swipe down from within the page-frame content area (not from browser chrome)
- **Behavior**:
  - Opens TOC layer (overlay/sheet style) showing full chapter/subchapter structure
  - Indicates current page location (chapter + subchapter + approximate page within subchapter)
  - Tap on chapter/subchapter entry to jump to that location
- **Editor Mode Features** (visible only when editor mode is unlocked):
  - **Chapter-level controls**:
    - `Edit` button (opens ChapterEditor)
    - `Add subchapter` button
    - `Delete` button
    - **Drag handle** for reordering chapters (same behavior as existing inline drag handle)
  - **Subchapter-level controls**:
    - `Edit` button (opens ChapterEditor)
    - `Delete` button
    - *(No "Add" button - adding subchapters is done from parent chapter row)*
- **Reader Mode**: Same TOC layout but **all editing controls hidden** - purely navigational
- **Integration**:
  - Uses existing `ChapterEditor` component and versioning logic
  - Works with bookmark system (jump behavior TBD)
  - Replaces old inline TOC in editor view (no longer expands content inline)
- **Design Decisions (Finalized)**:
  - **Layout**: Full-screen top sheet (covers entire viewport)
  - **Entry Structure**:
    - Chapters expand/collapse to show subchapters on click
    - Click chapter again (when expanded) = jump to chapter's first page
    - Subchapters don't expand, but have tap-jump function
    - Chapters and subchapters show page number (e.g., "Page 3") but no page count
    - No individual page rows (only chapter/subchapter level entries)
  - **Current Location**: Highlight or underscore current chapter/subchapter. TOC is scrollable but does NOT auto-scroll to current entry.
  - **Karaoke Behavior**: Stop karaoke entirely when TOC opens (no resume state)
  - **Swipe Gesture**: Optimal distance/velocity threshold (to be determined during implementation). Close mechanism: X button in top-right.
  - **Close Animation**: Fade out quickly "like smoke" when X is clicked. Ideally a fluid animation effect, but simple fade-out is acceptable for initial implementation.
  - **Visual Styling**:
    - Slide down from top animation
    - Black background, 70% opacity
    - White text with ink shadow effect (same as current ink styling)
    - Same typography (Times New Roman) as rest of page
  - **Editor Controls**: Expandable rows, always visible in editor mode (Edit/Add/Delete buttons)
  - **Drag Handles**: Always visible in editor mode, positioned next to chapter/subchapter titles
- **Location**: New component `src/components/MobileTOC.jsx` (or similar), integrated into `PageReader.jsx`

### Potential Enhancements
- [x] Karaoke MP3 feature (audio sync with text highlighting) - **Implemented but needs polish (see Known Issues)**
- [ ] Custom markdown shortcuts (typing `**bold**` applies formatting)
- [ ] Image drag-and-drop directly into editor
- [ ] Video upload functionality (once hosting decided)
- [ ] Chapter export/import
- [ ] Search functionality

## 📝 Notes

- Images are stored as base64 data URIs in Firestore (no Storage billing)
- Videos currently use YouTube/Vimeo embeds (has platform branding)
- Bookmark uses localStorage (anonymous, no auth required)
- Editor mode requires device ID whitelisting (no Firebase Auth)
- Drag handles only visible in editor mode

## 🔄 Last Updated
Checkpoint created: Current session

