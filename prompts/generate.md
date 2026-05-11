# Example prompts — generate a new video

Copy-paste any of these into `claude` running from the repo root.

## From a URL (Vietnamese, 9:16)

```
Create a 30-second 9:16 video in Vietnamese from this article:
https://vnexpress.net/<example>

Aim for 5 segments: 1 title, 3 keypoints, 1 outro. Default voice.
```

## From raw text (English, 16:9)

```
Create a 45-second 16:9 video in English from this text:

<paste your text here>

Use 6 segments and pick a calm, news-style background music.
```

## From a local file

```
Create a 30s 9:16 video in Vietnamese from the contents of
data/inbox/note.txt. Keep narration concise; emphasize the three main points.
```

## Quick test (no external network)

```
Create a tiny test project: 3 segments, 5 seconds each, language English,
9:16. Pick the first available default voice and the first available image
for each keypoint. This is just to verify the render pipeline.
```
