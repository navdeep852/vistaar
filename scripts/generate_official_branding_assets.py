#!/usr/bin/env python3
"""
VISTAAR — Official Branding Asset Generator
Processes the user-supplied 3D brand logo into production-grade assets for:
1. Web & PWA assets (favicon, manifest icons, apple-touch-icon)
2. Android native launcher icons (mipmap adaptive and legacy)
3. Android native splash screens (portrait and landscape drawables)
4. Centralized public assets (vistaar-logo.png, Vistaar_Icon_logo.png)
"""

import os
import shutil
from collections import deque
from PIL import Image, ImageFilter, ImageDraw, ImageFont

SRC_IMG_PATH = r"C:\Users\Navdeep\.gemini\antigravity\brain\423c1909-bce8-42f9-9315-a88782e7ecfb\.user_uploaded\media_1794931725058_b8137dcb.jpg"
PROJECT_DIR = r"D:\Project\vistaar-main\vistaar-main"
PUBLIC_DIR = os.path.join(PROJECT_DIR, "public")
ASSETS_DIR = os.path.join(PUBLIC_DIR, "assets")
ANDROID_RES_DIR = os.path.join(PROJECT_DIR, "android", "app", "src", "main", "res")

os.makedirs(ASSETS_DIR, exist_ok=True)

# 1. Copy original file to public/assets/
shutil.copyfile(SRC_IMG_PATH, os.path.join(ASSETS_DIR, "vistaar-logo.jpg"))
shutil.copyfile(SRC_IMG_PATH, os.path.join(PUBLIC_DIR, "vistaar-logo.jpg"))
print("Copied original JPEG to public/assets/vistaar-logo.jpg")

# 2. Extract anti-aliased RGBA emblem
src = Image.open(SRC_IMG_PATH).convert("RGB")
w, h = src.size

# Floodfill checkerboard background
visited = [[False] * h for _ in range(w)]
is_bg = [[False] * h for _ in range(w)]
q = deque()

for x in range(w):
    q.append((x, 0))
    q.append((x, h - 1))
    visited[x][0] = True
    visited[x][h - 1] = True
for y in range(h):
    q.append((0, y))
    q.append((w - 1, y))
    visited[0][y] = True
    visited[w - 1][y] = True

# Gaps between wings and center structure
for gx, gy in [(300, 270), (724, 270), (330, 310), (694, 310), (280, 250), (744, 250)]:
    if not visited[gx][gy]:
        q.append((gx, gy))
        visited[gx][gy] = True

def is_checker(r, g, b):
    # Neutral light grey/white checkerboard
    if r >= 235 and g >= 235 and b >= 235:
        if abs(r - g) <= 8 and abs(g - b) <= 8 and abs(r - b) <= 8:
            return True
    return False

while q:
    x, y = q.popleft()
    r, g, b = src.getpixel((x, y))
    if is_checker(r, g, b):
        is_bg[x][y] = True
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and not visited[nx][ny]:
                visited[nx][ny] = True
                q.append((nx, ny))

# Build mask
mask = Image.new("L", (w, h), 255)
for y in range(h):
    for x in range(w):
        if is_bg[x][y]:
            mask.putpixel((x, y), 0)

# Smooth anti-aliased edge
mask_smooth = mask.filter(ImageFilter.GaussianBlur(radius=0.9))

rgba = src.convert("RGBA")
rgba.putalpha(mask_smooth)

# Save master transparent PNG
master_png_path = os.path.join(ASSETS_DIR, "vistaar-logo.png")
rgba.save(master_png_path, "PNG", optimize=True)
rgba.save(os.path.join(PUBLIC_DIR, "vistaar-logo.png"), "PNG", optimize=True)
rgba.save(os.path.join(PUBLIC_DIR, "Vistaar_Icon_logo.png"), "PNG", optimize=True)
print("Saved master transparent PNG to public/vistaar-logo.png and public/Vistaar_Icon_logo.png")

# 3. Create cropped emblem centered in square canvas for icons
# Bounding box of emblem:
bbox = rgba.getbbox()
emblem_crop = rgba.crop(bbox)
crop_w, crop_h = emblem_crop.size

def create_square_icon(size, padding_ratio=0.08, bg_color=None):
    """Creates a square icon with centered emblem and optional background color."""
    canvas = Image.new("RGBA", (size, size), bg_color if bg_color else (0, 0, 0, 0))
    target_content_size = int(size * (1 - 2 * padding_ratio))
    
    # Scale emblem maintaining aspect ratio
    scale = min(target_content_size / crop_w, target_content_size / crop_h)
    new_w = max(1, int(crop_w * scale))
    new_h = max(1, int(crop_h * scale))
    
    scaled_emblem = emblem_crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
    offset_x = (size - new_w) // 2
    offset_y = (size - new_h) // 2
    
    canvas.paste(scaled_emblem, (offset_x, offset_y), scaled_emblem)
    return canvas

# 4. Generate Web & PWA Favicons
fav_512 = create_square_icon(512, padding_ratio=0.06)
fav_512.save(os.path.join(PUBLIC_DIR, "favicon-512x512.png"), "PNG", optimize=True)

fav_192 = create_square_icon(192, padding_ratio=0.06)
fav_192.save(os.path.join(PUBLIC_DIR, "favicon-192x192.png"), "PNG", optimize=True)

fav_96 = create_square_icon(96, padding_ratio=0.06)
fav_96.save(os.path.join(PUBLIC_DIR, "favicon-96x96.png"), "PNG", optimize=True)

fav_48 = create_square_icon(48, padding_ratio=0.06)
fav_48.save(os.path.join(PUBLIC_DIR, "favicon-48x48.png"), "PNG", optimize=True)

# Apple Touch Icon: 180x180 with clean white/dark rounded canvas or transparent
apple_touch = create_square_icon(180, padding_ratio=0.08, bg_color=(255, 255, 255, 255))
apple_touch.save(os.path.join(PUBLIC_DIR, "apple-touch-icon.png"), "PNG", optimize=True)

# Multi-resolution favicon.ico
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
ico_images = [create_square_icon(s[0], padding_ratio=0.05) for s in ico_sizes]
ico_images[0].save(
    os.path.join(PUBLIC_DIR, "favicon.ico"),
    format="ICO",
    sizes=ico_sizes,
    append_images=ico_images[1:]
)
print("Generated PWA & Web icons (512, 192, 96, 48, apple-touch, favicon.ico)")

# 5. Generate Android App Launcher Icons
android_densities = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}

for folder, (legacy_size, fg_size) in android_densities.items():
    folder_path = os.path.join(ANDROID_RES_DIR, folder)
    if not os.path.exists(folder_path):
        os.makedirs(folder_path, exist_ok=True)
    
    # Legacy icon with white rounded background or clean padding
    legacy_icon = create_square_icon(legacy_size, padding_ratio=0.08, bg_color=(255, 255, 255, 255))
    legacy_icon.save(os.path.join(folder_path, "ic_launcher.png"), "PNG", optimize=True)
    
    # Round icon with circular mask
    round_canvas = Image.new("RGBA", (legacy_size, legacy_size), (0, 0, 0, 0))
    round_mask = Image.new("L", (legacy_size, legacy_size), 0)
    draw_round = ImageDraw.Draw(round_mask)
    draw_round.ellipse((0, 0, legacy_size - 1, legacy_size - 1), fill=255)
    round_canvas.paste(legacy_icon, (0, 0), round_mask)
    round_canvas.save(os.path.join(folder_path, "ic_launcher_round.png"), "PNG", optimize=True)
    
    # Adaptive foreground: centered emblem inside the safe zone (66% of canvas)
    fg_icon = create_square_icon(fg_size, padding_ratio=0.22)
    fg_icon.save(os.path.join(folder_path, "ic_launcher_foreground.png"), "PNG", optimize=True)
    print(f"Generated Android launcher icons for {folder} ({legacy_size}x{legacy_size}, fg {fg_size}x{fg_size})")

# 6. Generate Android Splash Screens
splash_configs = {
    "drawable": (480, 800),
    "drawable-port-mdpi": (320, 480),
    "drawable-port-hdpi": (480, 800),
    "drawable-port-xhdpi": (720, 1280),
    "drawable-port-xxhdpi": (960, 1600),
    "drawable-port-xxxhdpi": (1280, 1920),
    "drawable-land-mdpi": (480, 320),
    "drawable-land-hdpi": (800, 480),
    "drawable-land-xhdpi": (1280, 720),
    "drawable-land-xxhdpi": (1600, 960),
    "drawable-land-xxxhdpi": (1920, 1280),
}

for folder, (sw, sh) in splash_configs.items():
    folder_path = os.path.join(ANDROID_RES_DIR, folder)
    if not os.path.exists(folder_path):
        os.makedirs(folder_path, exist_ok=True)
    
    # Splash canvas: clean, pure white background #ffffff
    splash = Image.new("RGBA", (sw, sh), (255, 255, 255, 255))
    
    # Emblem size: 28% of shortest side, max 280px
    target_dim = max(64, min(int(min(sw, sh) * 0.35), 320))
    scale = min(target_dim / crop_w, target_dim / crop_h)
    new_w = int(crop_w * scale)
    new_h = int(crop_h * scale)
    scaled_emblem = emblem_crop.resize((new_w, new_h), Image.Resampling.LANCZOS)
    
    # Place emblem centered (slightly higher than center for optical balance)
    offset_x = (sw - new_w) // 2
    offset_y = (sh - new_h) // 2 - int(sh * 0.03)
    splash.paste(scaled_emblem, (offset_x, offset_y), scaled_emblem)
    
    splash.convert("RGB").save(os.path.join(folder_path, "splash.png"), "PNG", optimize=True)
    print(f"Generated Android splash for {folder} ({sw}x{sh})")

print("\nAll VISTAAR official branding assets generated successfully!")
