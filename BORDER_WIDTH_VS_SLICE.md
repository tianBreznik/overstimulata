# Border-Width vs Slice Percentage Interaction

## Overview

`borderWidth` and `slicePercent` are **independent but related** parameters that work together to render the border.

## The Two Parameters

### 1. `borderWidth` (e.g., 8px, 16px, 24px)
- **What it controls**: The **rendered width** of the border on the page
- **CSS property**: `border-width`
- **Effect**: Determines how thick the border appears visually
- **User can control**: Yes (via dropdown: 4, 6, 8, 10, 12, 16, 20, 24, 32)

### 2. `slicePercent` (4%)
- **What it controls**: How the **source image** is divided into 9 regions
- **CSS property**: `border-image-slice`
- **Effect**: Determines which part of the source image is used for corners/edges
- **User can control**: No (currently fixed at 4% for 1024×1024px images)

## How They Interact

### Step 1: Image Slicing (slicePercent)
```
1024×1024px source image
4% slice = 1024px × 0.04 = ~41px from each edge

Result: ~41×41px corner regions extracted from source image
```

### Step 2: Rendering (borderWidth)
```
The browser takes the ~41×41px corner region
and stretches/compresses it to fit into borderWidth pixels

Example:
- borderWidth = 8px  → 41px source → scaled to 8px rendered
- borderWidth = 16px → 41px source → scaled to 16px rendered
- borderWidth = 32px → 41px source → scaled to 32px rendered
```

## The Relationship

**They are independent but work together:**

1. **`slicePercent`** determines **WHAT** part of the image is used (which pixels from the source)
2. **`borderWidth`** determines **HOW BIG** that part appears when rendered (the visual size)

### Visual Example

```
Source Image (1024×1024px):
┌─────────────────────────────────┐
│  [41px] ──── Pattern ──── [41px] │  4% slice
│    ↑                              │  extracts
│    │                              │  ~41px
│ 41px                             │  from edge
│    │                              │
│  [41px] ──── Pattern ──── [41px] │
└─────────────────────────────────┘

Rendered Border:
┌─────────────────────────────────┐
│  [8px] ──── Pattern ──── [8px]  │  borderWidth = 8px
│    ↑                             │  scales the
│    │                             │  41px slice
│ 8px                             │  down to 8px
│    │                             │
│  [8px] ──── Pattern ──── [8px]  │
└─────────────────────────────────┘
```

## Why This Matters

### If slicePercent is too small relative to borderWidth:
- You're taking a tiny slice from the source image
- The browser scales it up to fit the borderWidth
- **Result**: May look pixelated or lose detail

### If slicePercent is too large relative to borderWidth:
- You're taking a large slice from the source image
- The browser scales it down to fit the borderWidth
- **Result**: May lose detail or appear compressed

### Current Implementation (Optimal)
- **4% slice on 1024×1024px** = ~41px corner regions
- **borderWidth options**: 4px to 32px
- **Scaling range**: 41px source → 4px to 32px rendered
- **This works well because**:
  - 4px border: ~10x downscale (still looks good)
  - 32px border: ~1.3x downscale (preserves all detail)
  - Most common 8px border: ~5x downscale (optimal)

## When to Adjust

### If using a different image size:

**For 512×512px images:**
- 4% slice = 20.5px corners
- Would need ~8% slice to match current behavior (41px corners)

**For 2048×2048px images:**
- 4% slice = 82px corners
- Would need ~2% slice to match current behavior (41px corners)

### If borderWidth needs more detail:
- Increase slicePercent slightly (e.g., 5% or 6%)
- This extracts larger corner regions from source
- Gives more detail when scaled up for larger borderWidths

### If borderWidth is very small:
- Current 4% slice works fine (downscales well)
- No adjustment needed for 4px-8px borders

## Current Optimal Settings

For **1024×1024px border images**:

```javascript
const borderWidth = 8; // default, user can change 4-32
const slicePercent = 4; // optimal for 1024×1024px
```

**Why these work:**
- 4% creates ~41px corner regions (good detail)
- Scales well from 4px (10x down) to 32px (1.3x down)
- Maintains visual quality across all border width options
- Matches original hardcoded `32 26` pixel behavior

## Summary

- **`slicePercent`**: Defines what part of the source image is extracted
- **`borderWidth`**: Defines how large that extracted part appears when rendered
- **They work together**: Browser scales the slice to fit the borderWidth
- **Current values (4% slice, 8px default width)**: Optimal for 1024×1024px images


