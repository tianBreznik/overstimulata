# Polish Notes

## Code Quality: Redundant Variables and Constants

### Problem Summary
The codebase has accumulated many redundant local variables and duplicated logic due to incremental, reactive bug fixes rather than systematic design. This makes the code harder to maintain and creates inconsistencies.

### Specific Issues

#### 1. No Shared Constants
Values like `48px` (padding), `540px` (calculated height), `1.35rem` (font size), and bottom margins (`20`, `24`, `32`) are defined locally in multiple functions instead of as module-level constants:

- `bodyPaddingTop = 48` and `bodyPaddingBottom = 48` appear in at least 3 places (`paginationHelpers.js`, `karaokePagination.js`, inline calculations)
- `BOTTOM_MARGIN_NO_FOOTNOTES` is defined locally in `paginationHelpers.js`, `elementPagination.js`, and `pageCreation.js`
- Font sizes (`1.35rem`, `1.4rem`) are defined as `desktopFontSize` in 4+ different functions
- Line heights (`1.62`, `1.35`) are duplicated similarly

#### 2. Duplicated Calculations
The same calculations are repeated inline instead of extracted into shared helper functions:

- `pageHeight - 48 - 48` appears inline multiple times
- Font size/line height logic (`isDesktop ? '1.35rem' : '1.3rem'`) is duplicated in every function that needs it
- Measurement container creation logic is copied in multiple places (`splitTextAtWordBoundary`, `splitTextAtSentenceBoundary`, etc.)

#### 3. Incremental Patching Pattern
Each bug fix added new local variables without refactoring:

- When `splitTextAtWordBoundary` needed consistent measurement, local variables were added instead of extracting shared helpers
- This creates a pattern where similar logic is duplicated with slight variations

#### 4. Inconsistent Values
Different functions use slightly different values for the same purpose:

- `checkContentWithFootnotesFits` uses `1.4rem` while most other functions use `1.35rem`
- This suggests values were changed in one place but not standardized across the codebase

### Root Cause
The codebase appears to have been modified reactively over time. Each bug fix added local variables, duplicating logic instead of refactoring to shared constants and helpers. This is common in production codebases but leads to:

- **Hard-to-maintain code**: Changing a value requires updates in many places
- **Bug-prone inconsistencies**: Like the `1.4rem` vs `1.35rem` discrepancy
- **Difficulty understanding "source of truth"**: It's unclear which values are canonical

### Recommended Refactoring Approach

1. **Create a constants file/module** with all magic numbers:
   - Page dimensions (`636px`, `540px`, `48px` padding)
   - Font sizes (`1.35rem` desktop, `1.3rem` mobile)
   - Line heights (`1.62` desktop, `1.35` mobile)
   - Bottom margins (`20px` first page, `24px` desktop non-first, `32px` mobile/karaoke)

2. **Extract shared helper functions** for common operations:
   - Measurement container creation
   - Font style application
   - Height calculations

3. **Standardize measurement container creation** to use consistent width/parent container logic

4. **Remove local variable definitions** that duplicate constants

### Files Affected
- `src/utils/paginationHelpers.js` (multiple functions)
- `src/utils/elementPagination.js` (multiple functions)
- `src/utils/karaokePagination.js`
- `src/utils/pageCreation.js`

