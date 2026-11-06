# Icon Generator for Nexus Tracker
Add-Type -AssemblyName System.Drawing

function Create-NexusIcon {
    param(
        [int]$size,
        [bool]$isRound = $false
    )

    $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $rect = New-Object System.Drawing.RectangleF(0.0, 0.0, [float]$size, [float]$size)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath

    if ($isRound) {
        $path.AddEllipse(1.0, 1.0, [float]($size - 2), [float]($size - 2))
    } else {
        # Squircle / Rounded Rect
        $radius = [float]($size * 0.22)
        $d = [float]($radius * 2.0)
        $s = [float]$size
        $path.AddArc(1.0, 1.0, $d, $d, 180.0, 90.0)
        $path.AddArc([float]($s - $d - 1.0), 1.0, $d, $d, 270.0, 90.0)
        $path.AddArc([float]($s - $d - 1.0), [float]($s - $d - 1.0), $d, $d, 0.0, 90.0)
        $path.AddArc(1.0, [float]($s - $d - 1.0), $d, $d, 90.0, 90.0)
        $path.CloseFigure()
    }

    $g.SetClip($path)

    # Gradient Background: Vibrant Electric Blue to Midnight Navy
    $cTop = [System.Drawing.Color]::FromArgb(255, 37, 99, 235)   # #2563EB
    $cMid = [System.Drawing.Color]::FromArgb(255, 29, 78, 216)   # #1D4ED8
    $cBot = [System.Drawing.Color]::FromArgb(255, 15, 23, 42)    # #0F172A

    $blend = New-Object System.Drawing.Drawing2D.ColorBlend
    $blend.Colors = [System.Drawing.Color[]]@($cTop, $cMid, $cBot)
    $blend.Positions = [float[]]@(0.0, 0.45, 1.0)

    $pStart = New-Object System.Drawing.PointF([float]($size * 0.1), [float]($size * 0.05))
    $pEnd = New-Object System.Drawing.PointF([float]($size * 0.9), [float]($size * 0.95))
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($pStart, $pEnd, $cTop, $cBot)
    $bgBrush.InterpolationColors = $blend
    $g.FillRectangle($bgBrush, $rect)
    $bgBrush.Dispose()

    # Center coordinates
    $cx = [float]($size / 2.0)
    $cy = [float]($size * 0.435)

    # Radar Rings
    $radarPen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 255, 255, 255), [float][Math]::Max(1.0, $size * 0.008))
    $r1 = [float]($size * 0.32)
    $g.DrawEllipse($radarPen1, [float]($cx - $r1), [float]($cy - $r1), [float]($r1 * 2.0), [float]($r1 * 2.0))
    $radarPen1.Dispose()

    $radarPen2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(55, 255, 255, 255), [float][Math]::Max(1.0, $size * 0.009))
    $r2 = [float]($size * 0.23)
    $g.DrawEllipse($radarPen2, [float]($cx - $r2), [float]($cy - $r2), [float]($r2 * 2.0), [float]($r2 * 2.0))
    $radarPen2.Dispose()

    # Ambient Drop Shadow for Pin
    $pinShadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(60, 0, 0, 0))
    $shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $sTipY = [float]($size * 0.765)
    $sHeadR = [float]($size * 0.17)
    $sHeadY = [float]$cy
    $shadowPath.AddArc([float]($cx - $sHeadR), [float]($sHeadY - $sHeadR + ($size * 0.02)), [float]($sHeadR * 2.0), [float]($sHeadR * 2.0), 180.0, 180.0)
    $shadowPath.AddLine([float]($cx + $sHeadR), [float]($sHeadY + ($size * 0.02)), [float]$cx, [float]($sTipY + ($size * 0.02)))
    $shadowPath.AddLine([float]$cx, [float]($sTipY + ($size * 0.02)), [float]($cx - $sHeadR), [float]($sHeadY + ($size * 0.02)))
    $shadowPath.CloseFigure()
    $g.FillPath($pinShadowBrush, $shadowPath)
    $shadowPath.Dispose()
    $pinShadowBrush.Dispose()

    # White Location Pin Body
    $pinBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 255, 255, 255))
    $pinPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tipY = [float]($size * 0.74)
    $headR = [float]($size * 0.165)
    $headY = [float]$cy
    $pinPath.AddArc([float]($cx - $headR), [float]($headY - $headR), [float]($headR * 2.0), [float]($headR * 2.0), 180.0, 180.0)
    $pinPath.AddLine([float]($cx + $headR), [float]$headY, [float]$cx, [float]$tipY)
    $pinPath.AddLine([float]$cx, [float]$tipY, [float]($cx - $headR), [float]$headY)
    $pinPath.CloseFigure()
    $g.FillPath($pinBrush, $pinPath)
    $pinPath.Dispose()
    $pinBrush.Dispose()

    # Pin Inner Core: Deep Blue Circle
    $cCoreBlue = [System.Drawing.Color]::FromArgb(255, 29, 78, 216) # #1D4ED8
    $bCoreBlue = New-Object System.Drawing.SolidBrush($cCoreBlue)
    $rCore1 = [float]($size * 0.095)
    $g.FillEllipse($bCoreBlue, [float]($cx - $rCore1), [float]($cy - $rCore1), [float]($rCore1 * 2.0), [float]($rCore1 * 2.0))
    $bCoreBlue.Dispose()

    # Pin Inner Ring: Pure White Ring
    $bWhite = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $rCore2 = [float]($size * 0.06)
    $g.FillEllipse($bWhite, [float]($cx - $rCore2), [float]($cy - $rCore2), [float]($rCore2 * 2.0), [float]($rCore2 * 2.0))
    $bWhite.Dispose()

    # Pin Live Beacon: Emerald Green Center
    $cGreen = [System.Drawing.Color]::FromArgb(255, 16, 185, 129) # #10B981
    $bGreen = New-Object System.Drawing.SolidBrush($cGreen)
    $rCore3 = [float]($size * 0.032)
    $g.FillEllipse($bGreen, [float]($cx - $rCore3), [float]($cy - $rCore3), [float]($rCore3 * 2.0), [float]($rCore3 * 2.0))
    $bGreen.Dispose()

    # Broadcast Waves Above Pin
    $wavePen1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(170, 255, 255, 255), [float][Math]::Max(1.5, $size * 0.016))
    $wavePen1.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wavePen1.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $wR1 = [float]($size * 0.22)
    $g.DrawArc($wavePen1, [float]($cx - $wR1), [float]($cy - $wR1 - ($size * 0.03)), [float]($wR1 * 2.0), [float]($wR1 * 2.0), 220.0, 100.0)
    $wavePen1.Dispose()

    # Ground Pulse Arc Below Pin Tip
    $groundPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(130, 255, 255, 255), [float][Math]::Max(1.5, $size * 0.014))
    $groundPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $groundPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $gR = [float]($size * 0.12)
    $g.DrawArc($groundPen, [float]($cx - $gR), [float]($tipY - ($size * 0.01)), [float]($gR * 2.0), [float]($size * 0.08), 20.0, 140.0)
    $groundPen.Dispose()

    # Reset clip & dispose
    $g.ResetClip()
    $path.Dispose()
    $g.Dispose()

    return $bitmap
}

# 1. Output Web / PWA icons
Write-Host "Generating Web/PWA icons..."
(Create-NexusIcon 192 $false).Save("public\pwa-192x192.png", [System.Drawing.Imaging.ImageFormat]::Png)
(Create-NexusIcon 512 $false).Save("public\pwa-512x512.png", [System.Drawing.Imaging.ImageFormat]::Png)
(Create-NexusIcon 180 $false).Save("public\apple-touch-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)

# 2. Output Android Mipmap densities
$densities = @(
    @{ name = "mipmap-mdpi"; size = 48 },
    @{ name = "mipmap-hdpi"; size = 72 },
    @{ name = "mipmap-xhdpi"; size = 96 },
    @{ name = "mipmap-xxhdpi"; size = 144 },
    @{ name = "mipmap-xxxhdpi"; size = 192 }
)

Write-Host "Generating Android icons..."
foreach ($d in $densities) {
    $dir = "android\app\src\main\res\" + $d.name
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }

    # Remove old webp icons to avoid duplicate resource collisions
    $oldWebp = Join-Path $dir "ic_launcher.webp"
    $oldWebpRound = Join-Path $dir "ic_launcher_round.webp"
    if (Test-Path $oldWebp) { Remove-Item $oldWebp -Force }
    if (Test-Path $oldWebpRound) { Remove-Item $oldWebpRound -Force }

    # Save new crisp PNG icons
    $pngPath = Join-Path $dir "ic_launcher.png"
    $pngRoundPath = Join-Path $dir "ic_launcher_round.png"

    $icon = Create-NexusIcon $d.size $false
    $icon.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $icon.Dispose()

    $roundIcon = Create-NexusIcon $d.size $true
    $roundIcon.Save($pngRoundPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $roundIcon.Dispose()

    Write-Host "Created $($d.name) icons ($($d.size)x$($d.size))"
}

Write-Host "All icons generated successfully!"
