# Process User Uploaded App Icon
Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\kakad\.gemini\antigravity\brain\118b4425-d688-48fe-959e-ce09049ef7b4\.user_uploaded\media_1793984945864_0964aecd.jpg"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}

$rawImg = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "Original Image Dimensions: $($rawImg.Width) x $($rawImg.Height)"

$cornerPixel = $rawImg.GetPixel(5, 5)
$hexColor = "#{0:X2}{1:X2}{2:X2}" -f $cornerPixel.R, $cornerPixel.G, $cornerPixel.B
Write-Host "Sampled Background Corner Color: $hexColor"

# Function to produce a high quality scaled bitmap
function Resize-Image {
    param(
        [System.Drawing.Image]$img,
        [int]$width,
        [int]$height,
        [bool]$clipCircle = $false
    )

    $destBmp = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    if ($clipCircle) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0.0, 0.0, [float]$width, [float]$height)
        $g.SetClip($path)
    }

    $destRect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $g.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $g.Dispose()
    return $destBmp
}

# Function to create an adaptive foreground image:
# In Android adaptive icons, canvas is 108x108 (scaled to 432x432).
# The visible mask is the central 72x72 (scaled to 288x288, center offset 72px).
function Create-AdaptiveForeground {
    param(
        [System.Drawing.Image]$img,
        [int]$canvasSize = 432
    )

    $destBmp = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    # Scale artwork to fit inside the safe zone (74% of total canvas)
    $artSize = [int]($canvasSize * 0.74)
    $offset = [int](($canvasSize - $artSize) / 2)
    $destRect = New-Object System.Drawing.Rectangle($offset, $offset, $artSize, $artSize)
    $g.DrawImage($img, $destRect, 0, 0, $img.Width, $img.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $g.Dispose()
    return $destBmp
}

# 1. Update Web / PWA icons
Write-Host "Updating Web & PWA icons..."
$icon512 = Resize-Image $rawImg 512 512 $false
$icon512.Save("public\pwa-512x512.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon512.Dispose()

$icon192 = Resize-Image $rawImg 192 192 $false
$icon192.Save("public\pwa-192x192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon192.Dispose()

$icon180 = Resize-Image $rawImg 180 180 $false
$icon180.Save("public\apple-touch-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$icon180.Dispose()

# Copy high-res version to public/app-icon.png for web usage
$iconPublic = Resize-Image $rawImg 1024 1024 $false
$iconPublic.Save("public\app-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
$iconPublic.Dispose()

# 2. Update Android Mipmap densities
$densities = @(
    @{ name = "mipmap-mdpi"; size = 48 },
    @{ name = "mipmap-hdpi"; size = 72 },
    @{ name = "mipmap-xhdpi"; size = 96 },
    @{ name = "mipmap-xxhdpi"; size = 144 },
    @{ name = "mipmap-xxxhdpi"; size = 192 }
)

Write-Host "Updating Android Mipmap icons..."
foreach ($d in $densities) {
    $dir = "android\app\src\main\res\" + $d.name
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # Standard launcher icon
    $sqBmp = Resize-Image $rawImg $d.size $d.size $false
    $sqBmp.Save((Join-Path $dir "ic_launcher.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $sqBmp.Dispose()

    # Round launcher icon
    $rndBmp = Resize-Image $rawImg $d.size $d.size $true
    $rndBmp.Save((Join-Path $dir "ic_launcher_round.png"), [System.Drawing.Imaging.ImageFormat]::Png)
    $rndBmp.Dispose()

    Write-Host "Updated $($d.name) icons ($($d.size)x$($d.size))"
}

# 3. Create Adaptive Icon Foreground PNG & Background XML
Write-Host "Creating Android Adaptive Foreground & Background Drawables..."

# Remove old ic_launcher_foreground.xml to prevent AAPT duplicate resource error with PNG
$oldFgXml = "android\app\src\main\res\drawable\ic_launcher_foreground.xml"
if (Test-Path $oldFgXml) {
    Remove-Item $oldFgXml -Force
}

$adaptiveFg = Create-AdaptiveForeground $rawImg 432
$adaptiveFg.Save("android\app\src\main\res\drawable\ic_launcher_foreground.png", [System.Drawing.Imaging.ImageFormat]::Png)
$adaptiveFg.Dispose()

# Update ic_launcher_background.xml with matching background color
$bgXmlContent = @"
<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <path
        android:pathData="M0,0h108v108h-108z"
        android:fillColor="$hexColor" />
</vector>
"@

Set-Content -Path "android\app\src\main\res\drawable\ic_launcher_background.xml" -Value $bgXmlContent -Encoding UTF8

$rawImg.Dispose()
Write-Host "All assets successfully processed and saved!"
