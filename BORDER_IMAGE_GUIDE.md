# Border-Image Mechanics & Standardization Guide

## Overview
The CSS `border-image` property allows you to use an image as a border instead of a solid color. It divides the image into 9 regions and applies them to the element's border areas.

## The 9-Region Grid System

```
┌─────────┬───────────────┬─────────┐
│ 1 (TL)  │    2 (Top)    │ 3 (TR)  │  ← Sliced from source image
├─────────┼───────────────┼─────────┤
│ 4 (L)   │   5 (Center)  │ 6 (R)   │  ← Regions 1-4, 6-9 become border
├─────────┼───────────────┼─────────┤  ← Region 5 is center (usually ignored)
│ 7 (BL)  │   8 (Bottom)  │ 9 (BR)  │
└─────────┴───────────────┴─────────┘
```

## Border-Image Parameters (Detailed)

### 1. `border-image-source` (Required)
- **What it is**: The URL or path to the image file
- **Example**: `url('smallerborder.png')`
- **How it works**: The source image is divided into 9 regions using `border-image-slice`

### 2. `border-image-slice` (Required)
- **What it is**: Defines how to "slice" the source image into 9 regions
- **Format**: `top right bottom left` (like padding/margin) or `top/bottom left/right` (shorthand)
- **Units**: Can be:
  - **Numbers** (pixels): `32 26` means 32px from top/bottom, 26px from left/right
  - **Percentages**: `25%` means 25% from each edge
  - **`fill` keyword**: Includes the center region (region 5) in the rendered result
  
**Current implementation**: `32 26 fill`
- 32px slices from top and bottom edges (for corners + horizontal borders)
- 26px slices from left and right edges (for corners + vertical borders)
- `fill` includes the center region

**For a 1024x1024px square image**:
```
┌────26px────┬───────────────┬────26px────┐
│            │               │            │
│   32px     │   Center      │   32px     │
│            │   (region 5)  │            │
│            │               │            │
│   32px     │   Center      │   32px     │
│            │   (region 5)  │            │
└────26px────┴───────────────┴────26px────┘
```

### 3. `border-image-width` (Optional)
- **What it is**: Controls how wide the border appears (independent of `border-width`)
- **Default**: Same as `border-width`
- **Format**: `length | number | percentage | auto`
- **Not currently used**: We rely on `border-width` instead

### 4. `border-image-outset` (Optional)
- **What it is**: Extends the border beyond the element's border box
- **Current**: `16px` (when border-width is 8px, outset is 2x)
- **How it works**: The border image is drawn outside the element boundaries
- **Visual effect**: Makes the border appear to "frame" the content with spacing

### 5. `border-image-repeat` (Optional, default: `stretch`)
- **What it is**: Controls how the border segments (regions 2, 4, 6, 8) are scaled/repeated
- **Options**:
  - **`stretch`**: Stretches each segment to fill the entire border edge (distorts on rectangular pages)
  - **`repeat`**: Tiles the segment, potentially cutting off partway
  - **`round`**: Tiles and scales segments to fit evenly (best for maintaining aspect ratio)
  - **`space`**: Tiles with equal spacing between tiles
- **Format**: `horizontal vertical` (e.g., `round stretch`)

**Current issue**: Using `stretch` on rectangular pages (450px × 636px) distorts the square border image.

### 6. `border` (Required)
- **What it is**: Must be set for `border-image` to work
- **Format**: `{width}px solid transparent`
- **Current**: `8px solid transparent`
- **Why transparent**: The actual border comes from the image, not the color

## Current Implementation Analysis

```css
border: 8px solid transparent;
border-image: url(${borderImageUrl}) 32 26 fill stretch;
border-image-outset: 16px;
```

**For a 1024×1024px square image**:
- Top/Bottom borders: 32px tall segments (region 2 and 8)
- Left/Right borders: 26px wide segments (region 4 and 6)
- Corners: 32×26px (regions 1, 3, 7, 9)
- Center: Filled (due to `fill` keyword)

**Problem**: 
- Page is **450px × 636px** (rectangular, ~1.41:1 aspect ratio)
- Border image is **1024×1024px** (square, 1:1 aspect ratio)
- Using `stretch` distorts the border segments on the longer edges (top/bottom)

## Standardization Strategy

To support maximum aesthetic variation while ensuring consistent rendering:

### Approach 1: Percentage-Based Slicing (Recommended)

**Principle**: Use percentages instead of fixed pixels, making it work with any image size.

```javascript
// For any square border image, use 25% slices
borderImage: `url(${borderImageUrl}) 25% fill round`
```

**Benefits**:
- Works with any image dimensions (512px, 1024px, 2048px, etc.)
- Maintains proportional corners regardless of image size
- 25% slices create equal corner regions for square images

**How it works**:
- For 1024×1024px: 25% = 256px from each edge → corners are 256×256px
- For 512×512px: 25% = 128px from each edge → corners are 128×128px
- Corners stay proportional

### Approach 2: User-Configurable Slice Percentage

Allow users to control the slice percentage (15% to 40%):

```javascript
// In ChapterEditor.jsx
const [borderSlicePercent, setBorderSlicePercent] = useState(25); // Default 25%

// In DesktopPageReader.jsx
borderImage: `url(${borderImageUrl}) ${borderSlicePercent}% fill round`
```

**UI Addition**: Add a second dropdown next to border width:
- Border Width: 4, 6, 8, 10, 12, 16, 20, 24, 32
- Slice %: 15, 20, 25, 30, 35, 40

### Approach 3: Aspect Ratio Preservation

**For `border-image-repeat`**:
- Use `round` instead of `stretch` to maintain aspect ratio
- This tiles border segments proportionally

**Current**: `stretch` (distorts)
**Recommended**: `round` (maintains proportions)

### Approach 4: Outset Calculation

Keep proportional outset relative to border width:
```javascript
const borderOutset = (borderWidth / 8) * 16; // 2x multiplier
```

**Rationale**: 
- 8px border → 16px outset (2x)
- 16px border → 32px outset (2x)
- Maintains consistent visual spacing

## Recommended Implementation

### Standardized Format (Optimized for 1024×1024px Images)

```javascript
// 1. Border width (user-controlled): 4-32px
const borderWidth = page?.borderWidth || 8;

// 2. Slice percentage (fixed): 4% works perfectly for 1024×1024px images
//    4% of 1024px = ~41px slices (creates ~41×41px corners, similar to original 32×26px)
const slicePercent = 4;

// 3. Outset (1:1 ratio): equals border width
const borderOutset = borderWidth;

// 4. Repeat mode (fixed): 'round' for aspect ratio preservation
const repeatMode = 'round';

const borderStyle = {
  border: `${borderWidth}px solid transparent`,
  borderImage: `url(${borderImageUrl}) ${slicePercent}% fill ${repeatMode}`,
  borderImageOutset: `${borderOutset}px`,
  borderRadius: 0,
};
```

### Why 4% for 1024×1024px Images?

The original hardcoded values were:
- `border-image-slice: 32 26` (pixels)
- This meant 32px from top/bottom, 26px from left/right

For a 1024×1024px square image:
- **4% slice** = 1024px × 0.04 = **~41px** from each edge
- This creates corners of **~41×41px**, which is close to the original **32×26px** corners
- The percentage approach scales proportionally while maintaining the visual characteristics

**Different image sizes would need different slice percentages:**
- **512×512px**: Would need ~8% slice to get ~41px corners (512 × 0.08 = 41px)
- **2048×2048px**: Would need ~2% slice to get ~41px corners (2048 × 0.02 = 41px)

Since we're standardizing on **1024×1024px** border images, **4% is the optimal value**.

### Why This Works

1. **Percentage slicing**: Works with any image size (512px, 1024px, 2048px, etc.)
2. **Proportional outset**: Maintains consistent frame spacing
3. **`round` repeat**: Prevents distortion on rectangular pages
4. **`fill` keyword**: Ensures center transparency shows through

### Supported Variations

Users can create frames with:
- **Thin borders** (4-8px): Subtle frames
- **Medium borders** (10-16px): Standard frames
- **Thick borders** (20-32px): Heavy, ornate frames
- **Different corner sizes**: Adjust slice percentage (15% = smaller corners, 40% = larger corners)
- **Any image dimensions**: Works with 512px, 1024px, 2048px squares

### Image Guidelines for Users

**Recommended**:
- Square images (1:1 aspect ratio) work best
- Dimensions: 512×512px to 2048×2048px
- PNG with transparency (alpha channel)
- Corner decorations should be within the slice regions (top-left, top-right, bottom-left, bottom-right)
- Border patterns should tile seamlessly along edges

**Example structure**:
```
┌─────────────────────────────────┐
│  [Corner] ─── Pattern ─── [Corner] │  ← Top edge
│      │                  │          │
│ Pattern              Pattern       │  ← Side edges
│      │                  │          │
│  [Corner] ─── Pattern ─── [Corner] │  ← Bottom edge
└─────────────────────────────────┘
```

## Implementation Plan

1. **Change `stretch` to `round`** (already done)
2. **Change pixel slices to percentage** (32 26 → 25%)
3. **Optionally**: Add slice percentage dropdown in editor
4. **Test with various image sizes**: 512px, 1024px, 2048px

This standardization ensures:
- ✅ Works with any image size
- ✅ Maintains aspect ratio on rectangular pages
- ✅ Allows maximum aesthetic variation
- ✅ Consistent rendering across different border widths
