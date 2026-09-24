Add-Type -AssemblyName System.Drawing
$src = "C:\Users\PC\.zcode\workspace\default\public\icon-512.png"
$img = [System.Drawing.Image]::FromFile($src)
foreach ($s in 192,512) {
  $bmp = New-Object System.Drawing.Bitmap $s, $s
  $gfx = [System.Drawing.Graphics]::FromImage($bmp)
  $gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $gfx.DrawImage($img, 0, 0, $s, $s)
  $out = "C:\Users\PC\.zcode\workspace\default\public\icon-$s.png"
  $bmp.Save($out, [System.Drawing.Imaging.ImageFormat]::Png)
  $gfx.Dispose(); $bmp.Dispose()
  Write-Host "wrote $out"
}
$img.Dispose()
