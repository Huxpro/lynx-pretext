# Preview Videos

This directory contains preview videos for each example project.

## Structure

```
previews/
├── ascii-arts/
│   ├── preview-particles.mp4
│   └── preview-torus.mp4
├── bubble/
│   └── preview.mp4
├── dance/
│   └── preview.mp4
├── dynamic-layout/
│   └── preview.mp4
├── editorial/
│   └── preview.mp4
└── basic/
    └── preview.mp4
```

## How to Add Preview Videos

1. Record a video of your example running in the Lynx app or simulator
2. Save it as an MP4 file in the appropriate subdirectory
3. Name it `preview.mp4` or `preview-{feature}.mp4`
4. The video will be automatically copied to the website during build

## Notes

- These files are tracked in git (`.gitignore` allows `.mp4` files in this directory)
- Keep video files reasonably sized (ideally < 2MB each)
- Videos are copied to `public/examples/{example-name}/` during the build process
